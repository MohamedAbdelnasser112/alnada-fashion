import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from './db.mjs';

const COOKIE = 'alnada_admin_session';
const SESSION_DAYS = 7;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

function isSecureRequest(req) {
  return req.headers['x-forwarded-proto'] === 'https' || req.secure === true || process.env.NODE_ENV === 'production';
}

export function setSessionCookie(req, res, token) {
  const sameSite = isSecureRequest(req) ? 'None' : 'Lax';
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

export function clearSessionCookie(req, res) {
  const sameSite = isSecureRequest(req) ? 'None' : 'Lax';
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`);
}

export async function authenticate(email, password) {
  const db = getDb();
  const [rows] = await db.execute('SELECT id, email, password_hash, role FROM admins WHERE email = ?', [String(email || '').trim().toLowerCase()]);
  const admin = rows[0];
  if (!admin || !(await bcrypt.compare(String(password || ''), admin.password_hash))) return null;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  await db.execute('DELETE FROM admin_sessions WHERE expires_at < NOW()');
  await db.execute('INSERT INTO admin_sessions (admin_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))', [admin.id, tokenHash, SESSION_DAYS]);
  await db.execute('UPDATE admins SET last_login_at = NOW() WHERE id = ?', [admin.id]);
  return { token: rawToken, admin: { id: admin.id, email: admin.email, role: admin.role } };
}

export async function currentAdmin(req) {
  const token = parseCookies(req.headers.cookie || '')[COOKIE];
  if (!token) return null;
  const db = getDb();
  const [rows] = await db.execute('SELECT a.id, a.email, a.role FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ? AND s.expires_at > NOW()', [hashToken(token)]);
  return rows[0] || null;
}

export async function logout(req) {
  const token = parseCookies(req.headers.cookie || '')[COOKIE];
  if (token) await getDb().execute('DELETE FROM admin_sessions WHERE token_hash = ?', [hashToken(token)]);
}

export async function requireAdmin(req, res, next) {
  try {
    const admin = await currentAdmin(req);
    if (!admin) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'يجب تسجيل الدخول أولاً.' });
    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}
