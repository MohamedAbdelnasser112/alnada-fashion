import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

let pool;

export function getDb() {
  if (!pool) {
    const uri = process.env.DATABASE_URL || process.env.DRIZZLE_DATABASE_URL;
    if (!uri) throw new Error('DATABASE_URL is not configured');
    pool = mysql.createPool({
      uri,
      waitForConnections: true,
      connectionLimit: 8,
      queueLimit: 0,
      ssl: uri.includes('ssl-mode=DISABLED') ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function initDatabase() {
  const db = getDb();
  const statements = [
    `CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(40) NOT NULL DEFAULT 'admin',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_session_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(190) NOT NULL,
      image_url TEXT,
      visible TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(190) NOT NULL,
      slug VARCHAR(190) NOT NULL UNIQUE,
      description TEXT,
      category_id INT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      compare_price DECIMAL(10,2) NULL,
      image_url TEXT,
      sizes_json TEXT,
      colors_json TEXT,
      stock INT NOT NULL DEFAULT 0,
      featured TINYINT(1) NOT NULL DEFAULT 0,
      visible TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(190) NOT NULL,
      email VARCHAR(190),
      phone VARCHAR(60),
      orders_count INT NOT NULL DEFAULT 0,
      total_spend DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_number VARCHAR(40) NOT NULL UNIQUE,
      customer_id INT NULL,
      customer_name VARCHAR(190) NOT NULL,
      customer_email VARCHAR(190),
      customer_phone VARCHAR(60),
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'new',
      items_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS site_content (
      id INT AUTO_INCREMENT PRIMARY KEY,
      content_key VARCHAR(100) NOT NULL UNIQUE,
      content_json LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS universities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(190) NOT NULL,
      logo_url TEXT,
      source_url TEXT,
      active TINYINT(1) NOT NULL DEFAULT 1,
      coming_soon TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS product_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      image_url TEXT NOT NULL,
      alt_text VARCHAR(190) DEFAULT '',
      sort_order INT NOT NULL DEFAULT 0,
      visible TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_product_image_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS product_variants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      color_name VARCHAR(100) DEFAULT '',
      color_value VARCHAR(40) DEFAULT '#e7d7cf',
      size VARCHAR(30) DEFAULT '',
      stock INT NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY product_variant_unique (product_id, color_name, size),
      CONSTRAINT fk_product_variant_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];
  for (const statement of statements) await db.query(statement);
  try { await db.query('ALTER TABLE orders ADD COLUMN order_meta_json LONGTEXT NULL'); } catch (error) { if (!String(error.message).includes('Duplicate column')) throw error; }
  await seedDefaults(db);
  await ensureLegacyProductChildren(db);
  await syncAdmin(db);
}

const imageRoot = '/manus-storage/async-images/';
const defaultContent = {
  announcement: 'شحن مجاني للطلبات فوق ٣٥٠ ر.س · تسوّقي مجموعتنا الجديدة الآن',
  heroEyebrow: 'مجموعة خريف ٢٠٢٦',
  heroTitle: 'مساحتكِ',
  heroTitleAccent: 'من الهدوء.',
  heroCopy: 'قطع تُشبهكِ، وترافق يومكِ بخفة وأناقة لا تحتاج إلى شرح.',
  heroVideo: './assets/alnada-hero.mp4',
  aboutKicker: 'قصة الندى',
  aboutTitle: 'أناقة تشبه',
  aboutTitleAccent: 'نسختكِ الأهدأ.',
  aboutText: 'في الندى، نؤمن أن القطعة الجميلة لا تسرق حضوركِ؛ بل تمنحكِ مساحة أكبر لتكوني أنتِ. تصاميم أنثوية، خامات محببة، وتفاصيل صُممت لتعيش معكِ لأكثر من موسم.',
  campaignEyebrow: 'عرض الموسم',
  campaignTitle: 'دفءٌ يليق',
  campaignTitleAccent: 'بشتائكِ.',
  campaignText: 'اختاري قطعتكِ المفضلة من مجموعة الشتاء واحصلي على خصم ٢٠٪ لفترة محدودة.',
  campaignImage: `${imageRoot}ke0F8neCfZf4pY3t7t0Z9Q/image-5.webp`,
  newsletterEyebrow: 'رسائل من الندى',
  newsletterTitle: 'كوني أول من',
  newsletterTitleAccent: 'يعرف الجديد.',
  newsletterText: 'اشتركي ليصلكِ جديدنا وعروضنا الهادئة',
  contactEmail: 'hello@alnada.sa',
  contactPhone: '+966 11 234 5678',
  contactAddress: 'الرياض، المملكة العربية السعودية',
  instagram: '#contact',
  tiktok: '#contact',
  pinterest: '#contact',
};

const defaultOrderSettings = {
  universityDeliveryEnabled: true,
  externalDeliveryEnabled: true,
  quickCartEnabled: true,
  cartIconVisible: true,
  whatsappNumber: '01008814332',
  digitalWallet: '01008814332',
  instapay: '01061081756',
  orderMessage: 'مرحباً، أود تأكيد طلبي من الندى. برجاء مراجعة البيانات التالية:',
  explanationVideo: '',
  explanationTitle: 'طريقة الدفع المسبق',
  explanationDescription: 'بعد التحويل، أرسلي صورة التحويل مع اسمكِ ورقم الطلب على واتساب حتى نراجع الدفع ونؤكد الطلب.',
  deliveryDays: Array.from({ length: 14 }, (_, index) => { const d = new Date(Date.now() + (index + 1) * 86400000); return { date: d.toISOString().slice(0, 10), label: d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }) }; }),
};

const defaultUniversities = [
  ['جامعة الدلتا', 'https://new.deltauniv.edu.eg/assets/images/logohead.png', 'https://new.deltauniv.edu.eg/en/home/index', 1, 0, 1],
  ['جامعة المنصورة الأهلية', '/assets/mansoura-national-logo.svg', 'https://www.mansnu.edu.eg/', 1, 0, 2],
  ['جامعة المنصورة الجديدة', 'https://www.nmu.edu.eg/frontend/assets/img/logo2.png', 'https://www.nmu.edu.eg/', 1, 0, 3],
  ['جامعة حورس', 'https://horus.edu.eg/wp-content/uploads/2024/06/Logo-blue.png', 'https://horus.edu.eg/', 1, 1, 4],
];

const defaultCategories = [
  ['ملابس حريمي', `${imageRoot}ke0F8neCfZf4pY3t7t0Z9Q/image-1.webp`, 1],
  ['فساتين', `${imageRoot}ke0F8neCfZf4pY3t7t0Z9Q/image-2.webp`, 2],
  ['أطقم', `${imageRoot}ke0F8neCfZf4pY3t7t0Z9Q/image-3.webp`, 3],
  ['كاجوال', `${imageRoot}ke0F8neCfZf4pY3t7t0Z9Q/image-4.webp`, 4],
  ['ملابس خروج', `${imageRoot}ke0F8neCfZf4pY3t7t0Z9Q/image-5.webp`, 5],
];

const defaultProducts = [
  ['طقم لينن هادئ', 'طقم-لينن-هادئ', 'قميص واسع وبنطلون مستقيم من لينن خفيف، مصمم ليتحرك مع يومكِ بسهولة وأناقة.', 3, 290, 390, `${imageRoot}XuqnR6s4huHdPuEZdrz6ow/image-1.webp`, ['S','M','L','XL'], ['كريمي','رملي'], 18, 1],
  ['فستان سُهاد', 'فستان-سهاد', 'فستان ساتان مطفي بقصة ميدي ناعمة، ينساب بخفة من الصباح إلى الموعد المسائي.', 2, 345, null, `${imageRoot}XuqnR6s4huHdPuEZdrz6ow/image-2.webp`, ['S','M','L'], ['وردي باهت','أسود'], 12, 1],
  ['معطف غيمة', 'معطف-غيمة', 'معطف صوف ناعم بقصة ملفوفة وحزام يحدد الخصر، لدفء أنيق لا يثقل إطلالتكِ.', 4, 420, 520, `${imageRoot}XuqnR6s4huHdPuEZdrz6ow/image-3.webp`, ['S','M','L','XL'], ['كاكاو','عاجي'], 9, 1],
  ['تنورة نُور', 'تنورة-نور', 'تنورة بكسرات ناعمة وخصر عالٍ، قطعة مرنة تضيف حركة خفيفة لأي إطلالة.', 4, 265, null, `${imageRoot}XuqnR6s4huHdPuEZdrz6ow/image-4.webp`, ['S','M','L'], ['شامبانيا','أسود'], 23, 0],
  ['بليزر ليان', 'بليزر-ليان', 'بليزر مفصل بعناية، بقصة نظيفة وتفاصيل تمنحكِ حضوراً هادئاً وواثقاً.', 5, 380, null, `${imageRoot}XuqnR6s4huHdPuEZdrz6ow/image-5.webp`, ['S','M','L'], ['أسود','بني داكن'], 14, 1],
];

async function seedDefaults(db) {
  const [[categoryCount]] = await db.query('SELECT COUNT(*) AS count FROM categories');
  if (Number(categoryCount.count) === 0) {
    for (const [name, image, sortOrder] of defaultCategories) {
      await db.execute('INSERT INTO categories (name, image_url, visible, sort_order) VALUES (?, ?, 1, ?)', [name, image, sortOrder]);
    }
  }
  const [[productCount]] = await db.query('SELECT COUNT(*) AS count FROM products');
  if (Number(productCount.count) === 0) {
    for (const [name, slug, description, categoryId, price, comparePrice, image, sizes, colors, stock, featured] of defaultProducts) {
      await db.execute('INSERT INTO products (name, slug, description, category_id, price, compare_price, image_url, sizes_json, colors_json, stock, featured, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)', [name, slug, description, categoryId, price, comparePrice, image, JSON.stringify(sizes), JSON.stringify(colors), stock, featured]);
    }
  }
  const [[contentCount]] = await db.query('SELECT COUNT(*) AS count FROM site_content WHERE content_key = "homepage"');
  if (Number(contentCount.count) === 0) {
    await db.execute('INSERT INTO site_content (content_key, content_json) VALUES (?, ?)', ['homepage', JSON.stringify(defaultContent)]);
  }
  const [[orderSettingsCount]] = await db.query('SELECT COUNT(*) AS count FROM site_content WHERE content_key = "order_settings"');
  if (Number(orderSettingsCount.count) === 0) await db.execute('INSERT INTO site_content (content_key, content_json) VALUES (?, ?)', ['order_settings', JSON.stringify(defaultOrderSettings)]);
  const [[universityCount]] = await db.query('SELECT COUNT(*) AS count FROM universities');
  if (Number(universityCount.count) === 0) {
    for (const [name, logo, source, active, comingSoon, sortOrder] of defaultUniversities) await db.execute('INSERT INTO universities (name, logo_url, source_url, active, coming_soon, sort_order) VALUES (?, ?, ?, ?, ?, ?)', [name, logo, source, active, comingSoon, sortOrder]);
  }
  const [[orderCount]] = await db.query('SELECT COUNT(*) AS count FROM orders');
  if (Number(orderCount.count) === 0) {
    const demoOrders = [
      ['#AN-1048', 'سارة محمد', 'sara@example.com', '+966500000001', 690, 'processing', [{ name: 'طقم لينن هادئ', quantity: 1, price: 290 }, { name: 'بليزر ليان', quantity: 1, price: 380 }]],
      ['#AN-1047', 'نورة أحمد', 'noura@example.com', '+966500000002', 345, 'new', [{ name: 'فستان سُهاد', quantity: 1, price: 345 }]],
      ['#AN-1046', 'ريم خالد', 'reem@example.com', '+966500000003', 420, 'shipped', [{ name: 'معطف غيمة', quantity: 1, price: 420 }]],
      ['#AN-1045', 'ليان علي', 'layan@example.com', '+966500000004', 645, 'delivered', [{ name: 'تنورة نُور', quantity: 1, price: 265 }, { name: 'فستان سُهاد', quantity: 1, price: 380 }]],
      ['#AN-1044', 'هند عبدالله', 'hind@example.com', '+966500000005', 760, 'delivered', [{ name: 'بليزر ليان', quantity: 2, price: 380 }]],
    ];
    for (const order of demoOrders) await db.execute('INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, total, status, items_json) VALUES (?, ?, ?, ?, ?, ?, ?)', [...order.slice(0, 6), JSON.stringify(order[6])]);
  }
}

async function ensureLegacyProductChildren(db) {
  await db.execute("UPDATE universities SET logo_url = '/assets/mansoura-national-logo.svg' WHERE name = 'جامعة المنصورة الأهلية' AND (logo_url IS NULL OR logo_url = '' OR logo_url = 'https://www.mansnu.edu.eg/favicon.ico' OR logo_url LIKE 'https://www.instagram.%')");
  const [products] = await db.query('SELECT id, image_url, sizes_json, colors_json, stock FROM products');
  for (const product of products) {
    const [[imageCount]] = await db.query('SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?', [product.id]);
    if (Number(imageCount.count) === 0 && product.image_url) await db.execute('INSERT INTO product_images (product_id, image_url, sort_order, visible) VALUES (?, ?, 0, 1)', [product.id, product.image_url]);
    const [[variantCount]] = await db.query('SELECT COUNT(*) AS count FROM product_variants WHERE product_id = ?', [product.id]);
    if (Number(variantCount.count) > 0) continue;
    const sizes = (() => { try { return JSON.parse(product.sizes_json || '[]'); } catch { return []; } })();
    const colors = (() => { try { return JSON.parse(product.colors_json || '[]'); } catch { return []; } })();
    const normalizedSizes = sizes.length ? sizes : [''];
    const normalizedColors = colors.length ? colors : [['الأساسي', '#e7d7cf']];
    let order = 0;
    for (const color of normalizedColors) { const colorName = Array.isArray(color) ? color[0] : color; const colorValue = Array.isArray(color) ? color[1] : '#e7d7cf'; for (const size of normalizedSizes) { await db.execute('INSERT IGNORE INTO product_variants (product_id, color_name, color_value, size, stock, active) VALUES (?, ?, ?, ?, ?, 1)', [product.id, colorName || '', colorValue || '#e7d7cf', size || '', Number(product.stock || 0)]); order += 1; } }
  }
}

async function syncAdmin(db) {
  const email = String(process.env.ALNADA_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ALNADA_ADMIN_PASSWORD || '');
  if (!email || !password) return;
  const [rows] = await db.execute('SELECT id FROM admins WHERE email = ?', [email]);
  if (!rows.length) {
    const hash = await bcrypt.hash(password, 12);
    await db.execute('INSERT INTO admins (email, password_hash, role) VALUES (?, ?, "admin")', [email, hash]);
  }
}

export { defaultContent, defaultOrderSettings };
