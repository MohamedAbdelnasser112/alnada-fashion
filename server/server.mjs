import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import multer from 'multer';
import { authenticate, clearSessionCookie, currentAdmin, logout, requireAdmin, setSessionCookie } from './auth.mjs';
import { defaultContent, defaultOrderSettings, getDb, initDatabase } from './db.mjs';

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
async function hydrateProductRows(db, rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const [imageRows] = await db.execute(`SELECT id, product_id, image_url, alt_text, sort_order, visible FROM product_images WHERE product_id IN (${placeholders}) AND visible = 1 ORDER BY sort_order, id`, ids);
  const [variantRows] = await db.execute(`SELECT id, product_id, color_name, color_value, size, stock, active FROM product_variants WHERE product_id IN (${placeholders}) ORDER BY id`, ids);
  const imagesByProduct = new Map(); const variantsByProduct = new Map();
  for (const image of imageRows) { if (!imagesByProduct.has(image.product_id)) imagesByProduct.set(image.product_id, []); imagesByProduct.get(image.product_id).push({ ...image, visible: Boolean(image.visible) }); }
  for (const variant of variantRows) { if (!variantsByProduct.has(variant.product_id)) variantsByProduct.set(variant.product_id, []); variantsByProduct.get(variant.product_id).push({ ...variant, stock: Number(variant.stock), active: Boolean(variant.active) }); }
  return rows.map((row) => { const product = mapProduct(row); const images = imagesByProduct.get(row.id) || (row.image_url ? [{ id: `legacy-${row.id}`, product_id: row.id, image_url: row.image_url, alt_text: row.name, sort_order: 0, visible: true }] : []); const variants = variantsByProduct.get(row.id) || []; return { ...product, images, variants, primary_image: images[0]?.image_url || row.image_url || '' }; });
}
async function replaceProductChildren(db, productId, product) {
  if (Array.isArray(product.images)) { await db.execute('DELETE FROM product_images WHERE product_id = ?', [productId]); for (const [index, image] of product.images.filter((item) => item?.image_url).entries()) await db.execute('INSERT INTO product_images (product_id, image_url, alt_text, sort_order, visible) VALUES (?, ?, ?, ?, 1)', [productId, image.image_url, image.alt_text || '', Number(image.sort_order ?? index)]); }
  if (Array.isArray(product.variants)) { await db.execute('DELETE FROM product_variants WHERE product_id = ?', [productId]); for (const variant of product.variants) await db.execute('INSERT IGNORE INTO product_variants (product_id, color_name, color_value, size, stock, active) VALUES (?, ?, ?, ?, ?, ?)', [productId, variant.color_name || '', variant.color_value || '#e7d7cf', variant.size || '', Number(variant.stock || 0), variant.active === false ? 0 : 1]); }
}
const mapOrder = (row) => ({ ...row, total: Number(row.total), items: parseJson(row.items_json), meta: parseJson(row.order_meta_json, {}) });
const normalizeWhatsApp = (value) => { const digits = String(value || '').replace(/\D/g, ''); if (digits.startsWith('20')) return digits; if (digits.startsWith('0')) return `20${digits.slice(1)}`; return `20${digits}`; };
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
    res.json({ content: await publicContent(), products: await hydrateProductRows(db, products), categories: categories.map(mapCategory) });
  } catch (error) { next(error); }
});
app.get('/api/public/products/:id', async (req, res, next) => {
  try { const db = getDb(); const [rows] = await db.execute('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ? AND p.visible = 1', [req.params.id]); if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND', message: 'المنتج غير موجود.' }); const products = await hydrateProductRows(db, rows); res.json({ product: products[0] }); } catch (error) { next(error); }
});

app.get('/api/public/order-config', async (req, res, next) => {
  try {
    const db = getDb();
    const [settingRows] = await db.execute('SELECT content_json FROM site_content WHERE content_key = "order_settings"');
    const [universityRows] = await db.execute('SELECT id, name, logo_url, source_url, active, coming_soon, sort_order FROM universities WHERE active = 1 ORDER BY sort_order, name');
    res.json({ settings: { ...defaultOrderSettings, ...parseJson(settingRows[0]?.content_json, {}) }, universities: universityRows.map((row) => ({ ...row, active: Boolean(row.active), coming_soon: Boolean(row.coming_soon) })) });
  } catch (error) { next(error); }
});

app.post('/api/public/orders', async (req, res, next) => {
  try {
    const { customer = {}, items = [], details = {} } = req.body || {};
    if (!customer.name || !customer.phone || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'INVALID_ORDER', message: 'يرجى إكمال الاسم ورقم الهاتف وإضافة منتج واحد على الأقل.' });
    if (!['university', 'external'].includes(details.deliveryMethod)) return res.status(400).json({ error: 'INVALID_DELIVERY', message: 'اختاري طريقة التوصيل.' });
    if (!['cash', 'prepaid'].includes(details.paymentMethod)) return res.status(400).json({ error: 'INVALID_PAYMENT', message: 'اختاري وسيلة الدفع.' });
    const db = getDb();
    const [settingRows] = await db.execute('SELECT content_json FROM site_content WHERE content_key = "order_settings"');
    const settings = { ...defaultOrderSettings, ...parseJson(settingRows[0]?.content_json, {}) };
    if (details.deliveryMethod === 'university' && !settings.universityDeliveryEnabled) return res.status(400).json({ error: 'DELIVERY_DISABLED', message: 'التوصيل الجامعي غير متاح حالياً.' });
    if (details.deliveryMethod === 'external' && !settings.externalDeliveryEnabled) return res.status(400).json({ error: 'DELIVERY_DISABLED', message: 'التوصيل خارج الجامعة غير متاح حالياً.' });
    let selectedUniversity = null;
    if (details.deliveryMethod === 'university') {
      if (!details.universityId || !details.deliveryDate) return res.status(400).json({ error: 'INVALID_PICKUP', message: 'اختاري الجامعة وموعد الاستلام.' });
      const [universityRows] = await db.execute('SELECT id, name, active, coming_soon FROM universities WHERE id = ?', [details.universityId]);
      selectedUniversity = universityRows[0];
      if (!selectedUniversity || !selectedUniversity.active || selectedUniversity.coming_soon) return res.status(400).json({ error: 'INVALID_UNIVERSITY', message: 'هذه الجامعة غير متاحة للاختيار حالياً.' });
      if (!(settings.deliveryDays || []).some((day) => day.date === details.deliveryDate)) return res.status(400).json({ error: 'INVALID_PICKUP_DATE', message: 'موعد الاستلام غير متاح.' });
    }
    if (details.deliveryMethod === 'external' && !details.address) return res.status(400).json({ error: 'INVALID_ADDRESS', message: 'أضيفي العنوان بالتفصيل.' });
    const normalizedItems = [];
    for (const item of items) {
      const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
      if (item.productId) {
        const [productRows] = await db.execute('SELECT id, name, price, image_url FROM products WHERE id = ? AND visible = 1', [item.productId]);
        const product = productRows[0]; if (!product) return res.status(400).json({ error: 'INVALID_PRODUCT', message: 'أحد المنتجات لم يعد متاحاً.' });
        const [variantRows] = await db.execute('SELECT id, color_name, size, stock, active FROM product_variants WHERE product_id = ? AND color_name = ? AND size = ? LIMIT 1', [item.productId, item.color || '', item.size || '']);
        if (!variantRows[0] || !variantRows[0].active) return res.status(400).json({ error: 'INVALID_VARIANT', message: 'اختيار اللون أو المقاس غير متاح.' });
        if (Number(variantRows[0].stock) < quantity) return res.status(400).json({ error: 'OUT_OF_STOCK', message: 'الكمية المطلوبة غير متاحة حالياً.' });
        normalizedItems.push({ productId: product.id, name: product.name, url: item.url || `/product/${product.id}`, image: item.image || product.image_url, color: variantRows[0].color_name, size: variantRows[0].size, quantity, price: Number(product.price) });
      } else normalizedItems.push({ ...item, quantity });
    }
    const total = normalizedItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
    const orderNumber = `#AN-${Math.floor(1000 + Math.random() * 8999)}`;
    const paymentStatus = details.paymentMethod === 'prepaid' ? 'pending_review' : 'cash_on_delivery';
    const meta = { ...details, universityName: selectedUniversity?.name || '', whatsappNumber: settings.whatsappNumber, orderMessage: settings.orderMessage, digitalWallet: settings.digitalWallet, instapay: settings.instapay, paymentStatus, transferProof: Boolean(details.transferProof), transferProofData: String(details.transferProof || '').slice(0, 1800000), submittedAt: new Date().toISOString() };
    await db.execute('INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, total, status, items_json, order_meta_json) VALUES (?, ?, ?, ?, ?, "new", ?, ?)', [orderNumber, customer.name, customer.email || null, customer.phone, total, JSON.stringify(normalizedItems), JSON.stringify(meta)]);
    const number = normalizeWhatsApp(settings.whatsappNumber || '01008814332');
    const lines = [details.orderMessage || 'مرحباً، أود تأكيد طلبي من الندى.', `رقم الطلب: ${orderNumber}`, `الاسم: ${customer.name}`, `الهاتف: ${customer.phone}`, ...normalizedItems.map((item) => `المنتج: ${item.name} | الرابط: ${item.url || ''} | الكمية: ${item.quantity} | السعر: ${item.price} ر.س`), `التوصيل: ${details.deliveryMethod === 'university' ? 'جامعي' : 'خارج الجامعة'}`, details.universityName ? `الجامعة: ${details.universityName}` : `العنوان: ${details.address}`, details.deliveryDate ? `موعد الاستلام: ${details.deliveryDate}` : '', `الدفع: ${details.paymentMethod === 'prepaid' ? 'دفع مسبق — بانتظار مراجعة الإدارة' : 'نقداً عند الاستلام'}`].filter(Boolean);
    res.status(201).json({ orderNumber, whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}` });
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
  try { const [rows] = await getDb().query('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC'); res.json({ products: await hydrateProductRows(getDb(), rows) }); } catch (error) { next(error); }
});
app.post('/api/admin/products', async (req, res, next) => {
  try {
    const p = req.body || {};
    const slug = slugify(p.slug || p.name);
    const [result] = await getDb().execute('INSERT INTO products (name, slug, description, category_id, price, compare_price, image_url, sizes_json, colors_json, stock, featured, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [p.name, slug, p.description || '', p.category_id || null, Number(p.price || 0), p.compare_price === '' || p.compare_price == null ? null : Number(p.compare_price), p.image_url || '', JSON.stringify(p.sizes || []), JSON.stringify(p.colors || []), Number(p.stock || 0), p.featured ? 1 : 0, p.visible === false ? 0 : 1]);
    await replaceProductChildren(getDb(), result.insertId, p); const [rows] = await getDb().execute('SELECT * FROM products WHERE id = ?', [result.insertId]); res.status(201).json({ product: (await hydrateProductRows(getDb(), rows))[0] });
  } catch (error) { next(error); }
});
app.put('/api/admin/products/:id', async (req, res, next) => {
  try {
    const p = req.body || {};
    const slug = slugify(p.slug || p.name);
    await getDb().execute('UPDATE products SET name=?, slug=?, description=?, category_id=?, price=?, compare_price=?, image_url=?, sizes_json=?, colors_json=?, stock=?, featured=?, visible=? WHERE id=?', [p.name, slug, p.description || '', p.category_id || null, Number(p.price || 0), p.compare_price === '' || p.compare_price == null ? null : Number(p.compare_price), p.image_url || '', JSON.stringify(p.sizes || []), JSON.stringify(p.colors || []), Number(p.stock || 0), p.featured ? 1 : 0, p.visible === false ? 0 : 1, req.params.id]);
    await replaceProductChildren(getDb(), req.params.id, p); const [rows] = await getDb().execute('SELECT * FROM products WHERE id = ?', [req.params.id]); res.json({ product: (await hydrateProductRows(getDb(), rows))[0] });
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

app.get('/api/admin/order-settings', async (req, res, next) => { try { const [rows] = await getDb().execute('SELECT content_json FROM site_content WHERE content_key = "order_settings"'); res.json({ settings: { ...defaultOrderSettings, ...parseJson(rows[0]?.content_json, {}) } }); } catch (error) { next(error); } });
app.put('/api/admin/order-settings', async (req, res, next) => { try { const settings = { ...defaultOrderSettings, ...(req.body || {}) }; await getDb().execute('INSERT INTO site_content (content_key, content_json) VALUES ("order_settings", ?) ON DUPLICATE KEY UPDATE content_json=VALUES(content_json)', [JSON.stringify(settings)]); res.json({ settings }); } catch (error) { next(error); } });
app.get('/api/admin/universities', async (req, res, next) => { try { const [rows] = await getDb().query('SELECT * FROM universities ORDER BY sort_order, name'); res.json({ universities: rows.map((row) => ({ ...row, active: Boolean(row.active), coming_soon: Boolean(row.coming_soon) })) }); } catch (error) { next(error); } });
app.post('/api/admin/universities', async (req, res, next) => { try { const u=req.body||{}; const [result]=await getDb().execute('INSERT INTO universities (name, logo_url, source_url, active, coming_soon, sort_order) VALUES (?, ?, ?, ?, ?, ?)', [u.name, u.logo_url||'', u.source_url||'', u.active===false?0:1, u.coming_soon?1:0, Number(u.sort_order||0)]); const [rows]=await getDb().execute('SELECT * FROM universities WHERE id=?',[result.insertId]); res.status(201).json({ university: rows[0] }); } catch(error){ next(error); } });
app.put('/api/admin/universities/:id', async (req, res, next) => { try { const u=req.body||{}; await getDb().execute('UPDATE universities SET name=?, logo_url=?, source_url=?, active=?, coming_soon=?, sort_order=? WHERE id=?', [u.name, u.logo_url||'', u.source_url||'', u.active===false?0:1, u.coming_soon?1:0, Number(u.sort_order||0), req.params.id]); const [rows]=await getDb().execute('SELECT * FROM universities WHERE id=?',[req.params.id]); res.json({ university: rows[0] }); } catch(error){ next(error); } });
app.delete('/api/admin/universities/:id', async (req, res, next) => { try { await getDb().execute('DELETE FROM universities WHERE id=?',[req.params.id]); res.json({ ok:true }); } catch(error){ next(error); } });
app.patch('/api/admin/orders/:id/payment', async (req, res, next) => { try { const [rows]=await getDb().execute('SELECT order_meta_json FROM orders WHERE id=?',[req.params.id]); if(!rows[0]) return res.status(404).json({error:'NOT_FOUND'}); const meta={...parseJson(rows[0].order_meta_json,{}),paymentStatus:req.body?.paymentStatus||'pending_review'}; await getDb().execute('UPDATE orders SET order_meta_json=? WHERE id=?',[JSON.stringify(meta),req.params.id]); const [updated]=await getDb().execute('SELECT * FROM orders WHERE id=?',[req.params.id]); res.json({order:mapOrder(updated[0])}); } catch(error){ next(error); } });

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
app.get('/product/:id', async (req, res, next) => { try { const html = await readFile(path.join(dist, 'index.html'), 'utf8'); res.type('html').send(html.replaceAll('"./assets/', '"/assets/').replaceAll("'./assets/", "'/assets/")); } catch (error) { next(error); } });
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
