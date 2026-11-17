import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { authenticate, clearSessionCookie, currentAdmin, logout, requireAdmin, setSessionCookie } from './auth.mjs';
import { defaultContent, getDb, initDatabase } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

const parseJson = (value, fallback = []) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const slugify = (value) => String(value || '').trim().toLowerCase().replace(/[^\u0600-\u06ff\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-') || `product-${Date.now()}`;
const mapProduct = (row) => ({ ...row, price: Number(row.price), compare_price: row.compare_price == null ? null : Number(row.compare_price), stock: Number(row.stock), featured: Boolean(row.featured), visible: Boolean(row.visible), sizes: parseJson(row.sizes_json), colors: parseJson(row.colors_json) });
const mapCategory = (row) => ({ ...row, visible: Boolean(row.visible) });
const mapOrder = (row) => ({ ...row, total: Number(row.total), items: parseJson(row.items_json) });
const publicContent = async () => {
  const db = getDb();
  const [contentRows] = await db.execute('SELECT content_json FROM site_content WHERE content_key = "homepage"');
  return contentRows[0] ? { ...defaultContent, ...parseJson(contentRows[0].content_json, {}) } : defaultContent;
};

app.get('/_app/health', (req, res) => res.status(200).json({ ok: true, service: 'alnada' }));
app.get('/api/public/site', async (req, res, next) => {
  try {
    const db = getDb();
    const [products] = await db.execute('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.visible = 1 ORDER BY p.featured DESC, p.created_at DESC');
    const [categories] = await db.execute('SELECT * FROM categories WHERE visible = 1 ORDER BY sort_order, name');
    res.json({ content: await publicContent(), products: products.map(mapProduct), categories: categories.map(mapCategory) });
  } catch (error) { next(error); }
});
app.post('/api/public/orders', async (req, res, next) => {
  try {
    const { customer = {}, items = [] } = req.body || {};
    if (!customer.name || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'INVALID_ORDER', message: 'بيانات الطلب غير مكتملة.' });
    const db = getDb();
    const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
    const orderNumber = `#AN-${Math.floor(1000 + Math.random() * 8999)}`;
    await db.execute('INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, total, status, items_json) VALUES (?, ?, ?, ?, ?, "new", ?)', [orderNumber, customer.name, customer.email || null, customer.phone || null, total, JSON.stringify(items)]);
    res.status(201).json({ orderNumber });
  } catch (error) { next(error); }
});

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const result = await authenticate(req.body?.email, req.body?.password);
    if (!result) return res.status(401).json({ error: 'INVALID_LOGIN', message: 'بيانات الدخول غير صحيحة.' });
    setSessionCookie(req, res, result.token);
    res.json({ admin: result.admin });
  } catch (error) { next(error); }
});
app.post('/api/admin/logout', async (req, res, next) => {
  try { await logout(req); clearSessionCookie(req, res); res.json({ ok: true }); } catch (error) { next(error); }
});
app.get('/api/admin/me', async (req, res, next) => {
  try { const admin = await currentAdmin(req); if (!admin) return res.status(401).json({ error: 'UNAUTHORIZED' }); res.json({ admin }); } catch (error) { next(error); }
});

app.use('/api/admin', requireAdmin);
app.get('/api/admin/overview', async (req, res, next) => {
  try {
    const db = getDb();
    const [[products]] = await db.query('SELECT COUNT(*) AS count FROM products');
    const [[orders]] = await db.query('SELECT COUNT(*) AS count FROM orders');
    const [[sales]] = await db.query('SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE status <> "cancelled"');
    const [[customers]] = await db.query('SELECT COUNT(DISTINCT customer_email) AS count FROM orders WHERE customer_email IS NOT NULL AND customer_email <> ""');
    const [recentRows] = await db.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 6');
    const [bestRows] = await db.query('SELECT p.id, p.name, p.image_url, p.price, p.stock, p.featured, COUNT(oi.id) AS sold FROM products p LEFT JOIN (SELECT JSON_UNQUOTE(JSON_EXTRACT(items_json, CONCAT("$[", idx.n, "] .name"))) AS item_name FROM orders o JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) idx ON 1=1 WHERE o.status <> "cancelled") x ON x.item_name = p.name LEFT JOIN orders oi ON oi.status <> "cancelled" AND oi.items_json LIKE CONCAT("%", p.name, "%") GROUP BY p.id ORDER BY sold DESC, p.featured DESC LIMIT 5');
    const [monthly] = await db.query('SELECT DATE_FORMAT(created_at, "%Y-%m") AS month, COALESCE(SUM(total),0) AS total, COUNT(*) AS orders_count FROM orders WHERE status <> "cancelled" GROUP BY month ORDER BY month DESC LIMIT 6');
    res.json({ metrics: { products: Number(products.count), orders: Number(orders.count), sales: Number(sales.total), customers: Number(customers.count) }, recentOrders: recentRows.map(mapOrder), bestSellers: bestRows.map((row) => ({ ...row, sold: Number(row.sold), price: Number(row.price), stock: Number(row.stock), featured: Boolean(row.featured) })), monthly: monthly.reverse().map((row) => ({ month: row.month, total: Number(row.total), orders: Number(row.orders_count) })) });
  } catch (error) { next(error); }
});

app.get('/api/admin/products', async (req, res, next) => {
  try { const [rows] = await getDb().query('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC'); res.json({ products: rows.map(mapProduct) }); } catch (error) { next(error); }
});
app.post('/api/admin/products', async (req, res, next) => {
  try {
    const p = req.body || {};
    const slug = slugify(p.slug || p.name);
    const [result] = await getDb().execute('INSERT INTO products (name, slug, description, category_id, price, compare_price, image_url, sizes_json, colors_json, stock, featured, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [p.name, slug, p.description || '', p.category_id || null, Number(p.price || 0), p.compare_price === '' || p.compare_price == null ? null : Number(p.compare_price), p.image_url || '', JSON.stringify(p.sizes || []), JSON.stringify(p.colors || []), Number(p.stock || 0), p.featured ? 1 : 0, p.visible === false ? 0 : 1]);
    const [rows] = await getDb().execute('SELECT * FROM products WHERE id = ?', [result.insertId]); res.status(201).json({ product: mapProduct(rows[0]) });
  } catch (error) { next(error); }
});
app.put('/api/admin/products/:id', async (req, res, next) => {
  try {
    const p = req.body || {};
    const slug = slugify(p.slug || p.name);
    await getDb().execute('UPDATE products SET name=?, slug=?, description=?, category_id=?, price=?, compare_price=?, image_url=?, sizes_json=?, colors_json=?, stock=?, featured=?, visible=? WHERE id=?', [p.name, slug, p.description || '', p.category_id || null, Number(p.price || 0), p.compare_price === '' || p.compare_price == null ? null : Number(p.compare_price), p.image_url || '', JSON.stringify(p.sizes || []), JSON.stringify(p.colors || []), Number(p.stock || 0), p.featured ? 1 : 0, p.visible === false ? 0 : 1, req.params.id]);
    const [rows] = await getDb().execute('SELECT * FROM products WHERE id = ?', [req.params.id]); res.json({ product: mapProduct(rows[0]) });
  } catch (error) { next(error); }
});
app.delete('/api/admin/products/:id', async (req, res, next) => { try { await getDb().execute('DELETE FROM products WHERE id = ?', [req.params.id]); res.json({ ok: true }); } catch (error) { next(error); } });

app.get('/api/admin/categories', async (req, res, next) => { try { const [rows] = await getDb().query('SELECT * FROM categories ORDER BY sort_order, name'); res.json({ categories: rows.map(mapCategory) }); } catch (error) { next(error); } });
app.post('/api/admin/categories', async (req, res, next) => { try { const c = req.body || {}; const [result] = await getDb().execute('INSERT INTO categories (name, image_url, visible, sort_order) VALUES (?, ?, ?, ?)', [c.name, c.image_url || '', c.visible === false ? 0 : 1, Number(c.sort_order || 0)]); const [rows] = await getDb().execute('SELECT * FROM categories WHERE id = ?', [result.insertId]); res.status(201).json({ category: mapCategory(rows[0]) }); } catch (error) { next(error); } });
app.put('/api/admin/categories/:id', async (req, res, next) => { try { const c = req.body || {}; await getDb().execute('UPDATE categories SET name=?, image_url=?, visible=?, sort_order=? WHERE id=?', [c.name, c.image_url || '', c.visible === false ? 0 : 1, Number(c.sort_order || 0), req.params.id]); const [rows] = await getDb().execute('SELECT * FROM categories WHERE id = ?', [req.params.id]); res.json({ category: mapCategory(rows[0]) }); } catch (error) { next(error); } });
app.delete('/api/admin/categories/:id', async (req, res, next) => { try { await getDb().execute('DELETE FROM categories WHERE id = ?', [req.params.id]); res.json({ ok: true }); } catch (error) { next(error); } });

app.get('/api/admin/content', async (req, res, next) => { try { res.json({ content: await publicContent() }); } catch (error) { next(error); } });
app.put('/api/admin/content', async (req, res, next) => { try { const content = { ...defaultContent, ...(req.body || {}) }; await getDb().execute('INSERT INTO site_content (content_key, content_json) VALUES ("homepage", ?) ON DUPLICATE KEY UPDATE content_json=VALUES(content_json)', [JSON.stringify(content)]); res.json({ content }); } catch (error) { next(error); } });

app.get('/api/admin/orders', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const clauses = []; const values = [];
    if (search) { clauses.push('(order_number LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)'); values.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { clauses.push('status = ?'); values.push(status); }
    const sql = `SELECT * FROM orders ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at DESC`;
    const [rows] = await getDb().execute(sql, values); res.json({ orders: rows.map(mapOrder) });
  } catch (error) { next(error); }
});
app.get('/api/admin/orders/:id', async (req, res, next) => { try { const [rows] = await getDb().execute('SELECT * FROM orders WHERE id = ?', [req.params.id]); if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' }); res.json({ order: mapOrder(rows[0]) }); } catch (error) { next(error); } });
app.patch('/api/admin/orders/:id/status', async (req, res, next) => { try { await getDb().execute('UPDATE orders SET status=? WHERE id=?', [req.body?.status || 'new', req.params.id]); const [rows] = await getDb().execute('SELECT * FROM orders WHERE id = ?', [req.params.id]); res.json({ order: mapOrder(rows[0]) }); } catch (error) { next(error); } });
app.delete('/api/admin/orders/:id', async (req, res, next) => { try { await getDb().execute('DELETE FROM orders WHERE id = ?', [req.params.id]); res.json({ ok: true }); } catch (error) { next(error); } });

app.post('/api/admin/uploads', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'اختاري ملفاً أولاً.' });
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(req.file.mimetype)) return res.status(400).json({ error: 'INVALID_TYPE', message: 'الملف يجب أن يكون صورة أو فيديو MP4.' });
    const apiBase = process.env.MANUS_API_URL;
    const apiKey = process.env.MANUS_API_KEY;
    if (!apiBase || !apiKey) return res.status(503).json({ error: 'STORAGE_UNAVAILABLE', message: 'التخزين غير متاح في هذه البيئة. يمكنكِ استخدام رابط صورة مباشر.' });
    const extension = req.file.mimetype === 'video/mp4' ? 'mp4' : req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
    const key = `alnada/uploads/${crypto.randomUUID()}.${extension}`;
    const presignResponse = await fetch(`${apiBase}/v1/storage/presign/put?path=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const presign = await presignResponse.json();
    if (!presign.url) return res.status(502).json({ error: 'PRESIGN_FAILED', message: 'تعذر تجهيز التخزين.' });
    const putResponse = await fetch(presign.url, { method: 'PUT', headers: { 'Content-Type': req.file.mimetype }, body: req.file.buffer });
    if (!putResponse.ok) return res.status(502).json({ error: 'UPLOAD_FAILED', message: 'تعذر رفع الملف.' });
    res.status(201).json({ url: `/manus-storage/${key}`, key });
  } catch (error) { next(error); }
});

app.use(express.static(dist, { index: 'index.html' }));
app.get(['/admin', '/admin/', '/admin/login'], (req, res) => res.sendFile(path.join(dist, 'admin', 'index.html')));
app.get('/', (req, res) => res.sendFile(path.join(dist, 'index.html')));
app.get('/manus-routes.json', (req, res) => res.sendFile(path.join(root, 'public', 'manus-routes.json')));
app.use((error, req, res, next) => { console.error(error); if (res.headersSent) return next(error); res.status(500).json({ error: 'SERVER_ERROR', message: 'حدث خطأ غير متوقع.' }); });

try {
  await initDatabase();
  app.listen(port, '0.0.0.0', () => console.log(`Al Nada server listening on ${port}`));
} catch (error) {
  console.error('Database initialization failed:', error.message);
  process.exit(1);
}
