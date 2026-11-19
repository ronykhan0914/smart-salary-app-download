import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import webpush from 'web-push';
import { timingSafeEqual } from 'node:crypto';

const { Pool } = pg;

// Required Render environment variables. Never put real secrets in this file.
const required = ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'APP_ORIGIN'];
for (const key of required) {
  if (!process.env[key]?.trim()) throw new Error(`Missing environment variable: ${key}`);
}
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

// Keep the production Netlify origin explicitly allowed as well as any configured origins.
// This prevents browser 'Failed to fetch' errors when APP_ORIGIN was entered with a stale URL.
const allowedOrigins = new Set([
  ...process.env.APP_ORIGIN.split(',').map(v => v.trim()).filter(Boolean),
  'https://khanronysalaryapp.netlify.app',
  'https://smart-salary-frontend-914.onrender.com',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost'
]);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});
pool.on('error', err => console.error('POSTGRES_POOL_ERROR:', { code: err.code || 'UNKNOWN', message: err.message }));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use((req, res, next) => {
  // API responses can contain salary and identity data: never let shared caches retain them.
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(express.json({ limit: '2mb', strict: true, type: 'application/json' }));

// A global ceiling protects database-backed endpoints; authentication endpoints
// additionally have their own stricter failure-focused limiter below.
const apiLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimit);

// Return a readable API error for rejected origins and malformed requests.
app.use((err, _req, res, next) => {
  if (err && /Origin not allowed by CORS/.test(err.message || '')) {
    return res.status(403).json({ error: 'এই সাইট থেকে API ব্যবহারের অনুমতি নেই (CORS)।' });
  }
  return next(err);
});

// Safe, idempotent schema bootstrap: schema.sql only creates missing tables,
// adds missing columns/indexes and backfills email; it never drops user data.
let schemaReady = false;
let schemaInitPromise = null;
async function ensureSchema() {
  if (schemaReady) return true;
  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      try {
        const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
        await pool.query(sql);
        await pool.query(
          `INSERT INTO admin_accounts(username,password_hash,is_active,is_superadmin)
           VALUES($1,$2,TRUE,TRUE) ON CONFLICT(username) DO NOTHING`,
          [String(process.env.ADMIN_USERNAME).trim().toLowerCase(), process.env.ADMIN_PASSWORD_HASH]
        );
        schemaReady = true;
        console.log('DATABASE_SCHEMA_READY');
        return true;
      } catch (err) {
        logDbError('SCHEMA_BOOTSTRAP_ERROR', err);
        return false;
      } finally {
        schemaInitPromise = null;
      }
    })();
  }
  return schemaInitPromise;
}
// All API operations except health wait until the safe migration has completed.
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
  if (!(await ensureSchema())) return res.status(503).json({ error: 'ডাটাবেস প্রস্তুত করা যাচ্ছে না; কিছুক্ষণ পর আবার চেষ্টা করুন' });
  return next();
});

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });
// Allow normal workplace groups to register without a tiny shared-IP signup ceiling.
const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });
const sign = (claims, expiresIn = '12h') => jwt.sign(claims, process.env.JWT_SECRET, { expiresIn });
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

async function bearer(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'অনুমোদন প্রয়োজন' });
    req.claims = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (req.claims.role === 'user') {
      const q = await pool.query('SELECT is_active FROM app_users WHERE id = $1', [req.claims.sub]);
      if (!q.rowCount || !q.rows[0].is_active) {
        return res.status(403).json({ error: 'এই অ্যাকাউন্টটি নিষ্ক্রিয়। Admin-এর সঙ্গে যোগাযোগ করুন।' });
      }
    } else if (req.claims.role === 'admin') {
      const q = await pool.query('SELECT is_active FROM admin_accounts WHERE id = $1', [req.claims.sub]);
      if (!q.rowCount || !q.rows[0].is_active) return res.status(403).json({ error: 'এই Admin অ্যাকাউন্টটি নিষ্ক্রিয়' });
    }
    return next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'অনুমোদন প্রয়োজন' });
    }
    console.error('AUTH_CHECK_ERROR:', { code: err.code || 'UNKNOWN', message: err.message });
    return res.status(503).json({ error: 'অনুমোদন যাচাই করা যাচ্ছে না' });
  }
}
function adminOnly(req, res, next) {
  if (req.claims?.role !== 'admin') return res.status(403).json({ error: 'অনুমতি নেই' });
  return next();
}
function logDbError(label, err) {
  // Do not log passwords, tokens, SQL parameters, or DATABASE_URL.
  console.error(`${label}:`, {
    code: err.code || 'UNKNOWN', constraint: err.constraint || null,
    table: err.table || null, column: err.column || null,
    message: err.message || 'Unknown database error'
  });
}
function dbErrorResponse(res, err, fallback) {
  if (err.code === '23505') return res.status(409).json({ error: 'ইউজারনেম, কর্মী কোড বা ইমেইল আগে থেকেই ব্যবহৃত হচ্ছে' });
  if (err.code === '23503') return res.status(400).json({ error: 'সংশ্লিষ্ট অ্যাকাউন্ট পাওয়া যায়নি' });
  if (err.code === '42P01' || err.code === '42703') return res.status(503).json({ error: 'ডাটাবেসের Schema প্রস্তুত নেই। schema.sql প্রয়োগ করতে হবে।' });
  return res.status(500).json({ error: fallback });
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  try {
    if (!(await ensureSchema())) return res.status(503).json({ ok: false, service: 'smart-salary-api', database: 'schema_not_ready' });
    await pool.query('SELECT id, username, employee_code, password_hash, profile, email, is_active, created_at, updated_at FROM app_users LIMIT 0');
    await pool.query('SELECT user_id, payload, updated_at FROM user_data LIMIT 0');
    // Verify notification schema too; ensureSchema applies these additive tables safely.
    await pool.query('SELECT id, user_id, endpoint, subscription FROM push_subscriptions LIMIT 0');
    await pool.query('SELECT id, kind, content_date, content_key, title, arabic, translation, reference, source_url, source_name FROM daily_notifications LIMIT 0');
    await pool.query('SELECT daily_id, endpoint, sent_at FROM push_delivery_log LIMIT 0');
    return res.json({ ok: true, service: 'smart-salary-api', database: 'ready', notifications: 'ready' });
  } catch (err) {
    logDbError('HEALTH_CHECK_ERROR', err);
    return res.status(503).json({ ok: false, service: 'smart-salary-api', database: 'schema_not_ready' });
  }
}));

// Registration is atomic: either both account and empty backup row are saved, or neither is.
app.post('/api/auth/register', registerLimit, asyncRoute(async (req, res) => {
  const body = asObject(req.body);
  const username = String(body.username || '').trim().toLowerCase();
  const employeeCode = String(body.employeeCode || '').trim();
  const password = String(body.password || '');
  const profile = asObject(body.profile);
  const email = String(body.email || profile.email || '').trim().toLowerCase();

  if ((email && (!isEmail(email) || email.length > 254)) || !/^[a-z0-9._-]{3,80}$/.test(username) ||
      !employeeCode || employeeCode.length > 80 || password.length < 8 || password.length > 200 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'সঠিক ইমেইল (ঐচ্ছিক), ৩–৮০ অক্ষরের ইউজারনেম, সর্বোচ্চ ৮০ অক্ষরের কর্মী কোড ও ৮–৭২ বাইটের পাসওয়ার্ড দিন' });
  }

  let client;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    client = await pool.connect();
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO app_users (username, employee_code, password_hash, profile, email)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, username, employee_code, profile`,
      [username, employeeCode, passwordHash, JSON.stringify({ ...profile, email: email || null }), email || null]
    );
    const user = inserted.rows[0];
    await client.query('INSERT INTO user_data (user_id, payload) VALUES ($1, $2::jsonb)', [user.id, '{}']);
    await client.query('COMMIT');
    return res.status(201).json({
      token: sign({ sub: user.id, role: 'user' }),
      user: { id: user.id, username: user.username, employeeCode: user.employee_code, profile: user.profile }
    });
  } catch (err) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    // Idempotent retry protection: if the first request committed but its response
    // was lost (mobile network/app closed), a retry with the same username,
    // employee code and password returns the already-created account instead
    // of making the user believe registration failed or creating duplicates.
    if (err.code === '23505') {
      try {
        const existing = await pool.query(
          'SELECT id, username, employee_code, password_hash, profile, is_active FROM app_users WHERE username = $1',
          [username]
        );
        if (existing.rowCount && existing.rows[0].employee_code === employeeCode &&
            existing.rows[0].is_active && await bcrypt.compare(password, existing.rows[0].password_hash)) {
          const user = existing.rows[0];
          return res.status(200).json({
            recovered: true,
            token: sign({ sub: user.id, role: 'user' }),
            user: { id: user.id, username: user.username, employeeCode: user.employee_code, profile: user.profile }
          });
        }
      } catch (recoveryError) {
        logDbError('REGISTER_RETRY_RECOVERY_ERROR', recoveryError);
      }
    }
    logDbError('REGISTER_ERROR', err);
    return dbErrorResponse(res, err, 'সার্ভারে হিসাব তৈরি করা যায়নি');
  } finally {
    if (client) client.release();
  }
}));

app.post('/api/auth/login', authLimit, asyncRoute(async (req, res) => {
  const body = asObject(req.body);
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!username || username.length > 80 || !password || password.length > 200) return res.status(400).json({ error: 'সঠিক ইউজারনেম ও পাসওয়ার্ড দিন' });
  const q = await pool.query('SELECT id, username, employee_code, password_hash, profile, is_active FROM app_users WHERE username = $1', [username]);
  if (!q.rowCount || !q.rows[0].is_active || !(await bcrypt.compare(password, q.rows[0].password_hash))) {
    return res.status(401).json({ error: 'ইউজারনেম বা পাসওয়ার্ড সঠিক নয়' });
  }
  const user = q.rows[0];
  return res.json({ token: sign({ sub: user.id, role: 'user' }), user: { id: user.id, username: user.username, employeeCode: user.employee_code, profile: user.profile } });
}));

app.post('/api/auth/change-password', bearer, authLimit, asyncRoute(async (req, res) => {
  if (req.claims.role !== 'user') return res.status(403).json({ error: 'ব্যবহারকারী অনুমোদন প্রয়োজন' });
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!currentPassword || currentPassword.length > 200 || newPassword.length < 8 ||
      newPassword.length > 200 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ error: 'বর্তমান পাসওয়ার্ড এবং ৮–৭২ বাইটের নতুন পাসওয়ার্ড দিন' });
  }
  const q = await pool.query('SELECT password_hash FROM app_users WHERE id = $1 AND is_active = TRUE', [req.claims.sub]);
  if (!q.rowCount || !(await bcrypt.compare(currentPassword, q.rows[0].password_hash))) {
    return res.status(401).json({ error: 'বর্তমান পাসওয়ার্ড সঠিক নয়' });
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updated = await pool.query('UPDATE app_users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND is_active = TRUE RETURNING id', [passwordHash, req.claims.sub]);
  if (!updated.rowCount) return res.status(404).json({ error: 'অ্যাকাউন্ট পাওয়া যায়নি' });
  return res.json({ ok: true, message: 'পাসওয়ার্ড পরিবর্তন হয়েছে' });
}));

app.get('/api/me', bearer, asyncRoute(async (req, res) => {
  if (req.claims.role !== 'user') return res.status(403).json({ error: 'ব্যবহারকারী অনুমোদন প্রয়োজন' });
  const q = await pool.query('SELECT id, username, employee_code, profile, email, created_at FROM app_users WHERE id = $1', [req.claims.sub]);
  if (!q.rowCount) return res.status(404).json({ error: 'হিসাব পাওয়া যায়নি' });
  return res.json(q.rows[0]);
}));

app.patch('/api/profile', bearer, asyncRoute(async (req, res) => {
  if (req.claims.role !== 'user') return res.status(403).json({ error: 'ব্যবহারকারী অনুমোদন প্রয়োজন' });
  const incoming = asObject(req.body?.profile);
  const allowedProfileKeys = new Set(['email', 'name', 'ename', 'desig', 'employeeCode']);
  const profile = Object.fromEntries(Object.entries(incoming).filter(([key]) => allowedProfileKeys.has(key)));
  if (Object.keys(profile).length !== Object.keys(incoming).length) return res.status(400).json({ error: 'প্রোফাইলের কিছু তথ্য পরিবর্তনের অনুমতি নেই' });
  for (const [key, value] of Object.entries(profile)) {
    if (typeof value !== 'string' || value.length > (key === 'email' ? 254 : 160)) return res.status(400).json({ error: 'প্রোফাইলের তথ্য সঠিক নয়' });
  }
  const email = String(profile.email || '').trim().toLowerCase();
  const employeeCode = String(profile.employeeCode || '').trim();
  if (!isEmail(email) || email.length > 254) return res.status(400).json({ error: 'সঠিক ইমেইল প্রয়োজন' });
  if (employeeCode.length > 80) return res.status(400).json({ error: 'কর্মী কোড সর্বোচ্চ ৮০ অক্ষরের হতে পারে' });
  try {
    const q = await pool.query(
      `UPDATE app_users SET email = $1,
       employee_code = COALESCE(NULLIF($2, ''), employee_code),
       profile = profile || $3::jsonb, updated_at = NOW()
       WHERE id = $4 RETURNING id`,
      [email, employeeCode, JSON.stringify({ ...profile, email }), req.claims.sub]
    );
    if (!q.rowCount) return res.status(404).json({ error: 'হিসাব পাওয়া যায়নি' });
    return res.json({ ok: true });
  } catch (err) {
    logDbError('PROFILE_UPDATE_ERROR', err);
    return dbErrorResponse(res, err, 'প্রোফাইল আপডেট করা যায়নি');
  }
}));

app.put('/api/sync', bearer, asyncRoute(async (req, res) => {
  if (req.claims.role !== 'user') return res.status(403).json({ error: 'ব্যবহারকারী অনুমোদন প্রয়োজন' });
  const payload = req.body?.payload;
  let serialized;
  try { serialized = JSON.stringify(payload); } catch { serialized = ''; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !serialized || Buffer.byteLength(serialized, 'utf8') > 1500000) {
    return res.status(400).json({ error: 'ব্যাকআপ ডেটা সঠিক নয় বা খুব বড়' });
  }
  await pool.query(
    `INSERT INTO user_data (user_id, payload, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [req.claims.sub, serialized]
  );
  return res.json({ ok: true, updatedAt: new Date().toISOString() });
}));

app.get('/api/restore', bearer, asyncRoute(async (req, res) => {
  if (req.claims.role !== 'user') return res.status(403).json({ error: 'অনুমতি নেই' });
  const q = await pool.query('SELECT payload, updated_at FROM user_data WHERE user_id = $1', [req.claims.sub]);
  return res.json(q.rows[0] || { payload: {} });
}));

app.post('/api/admin/login', authLimit, asyncRoute(async (req, res) => {
  const body = asObject(req.body);
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[a-z0-9._@-]{3,80}$/.test(username) || !password || password.length > 200) return res.status(400).json({ error: 'Admin পরিচয় সঠিক নয়' });
  const q = await pool.query('SELECT id,username,password_hash,is_active,is_superadmin FROM admin_accounts WHERE username=$1', [username]);
  if (!q.rowCount || !q.rows[0].is_active || !(await bcrypt.compare(password, q.rows[0].password_hash))) return res.status(401).json({ error: 'Admin পরিচয় সঠিক নয়' });
  const a = q.rows[0];
  return res.json({ token: sign({ sub: a.id, role: 'admin', superadmin: a.is_superadmin }, '30m'), expiresIn: 1800, admin: { id: a.id, username: a.username, isSuperadmin: a.is_superadmin } });
}));

app.get('/api/admin/me', bearer, adminOnly, asyncRoute(async (req, res) => {
  const q = await pool.query('SELECT id,username,is_superadmin,is_active FROM admin_accounts WHERE id=$1', [req.claims.sub]);
  if (!q.rowCount) return res.status(404).json({error:'Admin পাওয়া যায়নি'});
  return res.json({admin:{id:q.rows[0].id,username:q.rows[0].username,isSuperadmin:q.rows[0].is_superadmin,isActive:q.rows[0].is_active}});
}));

app.get('/api/admin/users', bearer, adminOnly, asyncRoute(async (req, res) => {
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page,10)||1));
  const limit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit,10)||20));
  const qtext = String(req.query.q||'').trim().slice(0,100);
  const status = ['active','disabled'].includes(req.query.status) ? req.query.status : 'all';
  const pattern = '%' + qtext + '%';
  const where = `WHERE ($1='' OR username ILIKE $2 OR employee_code ILIKE $2 OR COALESCE(email,'') ILIKE $2 OR id::text ILIKE $2) AND ($3='all' OR ($3='active' AND is_active=TRUE) OR ($3='disabled' AND is_active=FALSE))`;
  const args=[qtext,pattern,status];
  const count=await pool.query(`SELECT COUNT(*)::int AS total FROM app_users ${where}`,args);
  const rows=await pool.query(`SELECT id,username,employee_code,email,is_active,created_at FROM app_users ${where} ORDER BY created_at DESC,id DESC LIMIT $4 OFFSET $5`,[...args,limit,(page-1)*limit]);
  return res.json({users:rows.rows,total:count.rows[0].total,page,limit,totalPages:Math.max(1,Math.ceil(count.rows[0].total/limit))});
}));

app.get('/api/admin/admins', bearer, adminOnly, asyncRoute(async (req,res)=>{
  if(!req.claims.superadmin) return res.status(403).json({error:'শুধু Super Admin এই অংশ ব্যবহার করতে পারবেন'});
  const q=await pool.query('SELECT id,username,is_active,is_superadmin,created_at FROM admin_accounts ORDER BY is_superadmin DESC,created_at ASC');
  return res.json({admins:q.rows});
}));
app.post('/api/admin/admins', bearer, adminOnly, asyncRoute(async (req,res)=>{
  if(!req.claims.superadmin) return res.status(403).json({error:'শুধু Super Admin নতুন Admin তৈরি করতে পারবেন'});
  const username=String(req.body?.username||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  if(!/^[a-z0-9._-]{3,80}$/.test(username)||password.length<10||password.length>200||Buffer.byteLength(password,'utf8')>72)
    return res.status(400).json({error:'ইউজারনেম ৩–৮০ অক্ষর এবং পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের দিন'});
  try{
    const hash=await bcrypt.hash(password,12);
    const q=await pool.query('INSERT INTO admin_accounts(username,password_hash,is_active,is_superadmin) VALUES($1,$2,TRUE,FALSE) RETURNING id,username,is_active,created_at',[username,hash]);
    return res.status(201).json({admin:q.rows[0]});
  }catch(err){if(err.code==='23505')return res.status(409).json({error:'এই Admin ইউজারনেম আগে থেকেই আছে'});throw err;}
}));
app.patch('/api/admin/admins/:id/status', bearer, adminOnly, asyncRoute(async (req,res)=>{
  if(!req.claims.superadmin) return res.status(403).json({error:'শুধু Super Admin এই পরিবর্তন করতে পারবেন'});
  if(!/^\\d+$/.test(req.params.id)||typeof req.body?.active!=='boolean')return res.status(400).json({error:'তথ্য সঠিক নয়'});
  if(String(req.claims.sub)===req.params.id&&req.body.active===false)return res.status(400).json({error:'নিজের Admin অ্যাকাউন্ট বন্ধ করা যাবে না'});
  const q=await pool.query('UPDATE admin_accounts SET is_active=$1,updated_at=NOW() WHERE id=$2 AND is_superadmin=FALSE RETURNING id,username,is_active',[req.body.active,req.params.id]);
  if(!q.rowCount)return res.status(404).json({error:'সাধারণ Admin পাওয়া যায়নি'});
  return res.json({admin:q.rows[0]});
}));
app.post('/api/admin/change-password', bearer, adminOnly, authLimit, asyncRoute(async(req,res)=>{
  const current=String(req.body?.currentPassword||''), next=String(req.body?.newPassword||'');
  if(!current||current.length>200||next.length<10||next.length>200||Buffer.byteLength(next,'utf8')>72)
    return res.status(400).json({error:'বর্তমান পাসওয়ার্ড এবং কমপক্ষে ১০ অক্ষরের নতুন পাসওয়ার্ড দিন'});
  const q=await pool.query('SELECT password_hash FROM admin_accounts WHERE id=$1 AND is_active=TRUE',[req.claims.sub]);
  if(!q.rowCount||!(await bcrypt.compare(current,q.rows[0].password_hash)))return res.status(401).json({error:'বর্তমান পাসওয়ার্ড সঠিক নয়'});
  const hash=await bcrypt.hash(next,12);
  await pool.query('UPDATE admin_accounts SET password_hash=$1,updated_at=NOW() WHERE id=$2',[hash,req.claims.sub]);
  return res.json({ok:true,message:'Admin পাসওয়ার্ড পরিবর্তন হয়েছে; আবার লগইন করুন'});
}));

app.get('/api/admin/stats', bearer, adminOnly, asyncRoute(async (_req, res) => {
  const counts = await pool.query(
    `SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_active)::int AS active,
      COUNT(*) FILTER (WHERE NOT is_active)::int AS disabled,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS this_month
     FROM app_users`
  );
  const recent = await pool.query('SELECT id, username, employee_code, email, is_active, created_at FROM app_users ORDER BY created_at DESC LIMIT 100');
  return res.json({ counts: counts.rows[0], recentUsers: recent.rows });
}));

app.patch('/api/admin/users/:id/status', bearer, adminOnly, asyncRoute(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'সঠিক user ID প্রয়োজন' });
  if (typeof req.body?.active !== 'boolean') return res.status(400).json({ error: 'active true/false দিতে হবে' });
  const q = await pool.query('UPDATE app_users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_active', [req.body.active, req.params.id]);
  if (!q.rowCount) return res.status(404).json({ error: 'ব্যবহারকারী পাওয়া যায়নি' });
  return res.json({ ok: true, user: q.rows[0] });
}));

app.post('/api/admin/users/:id/reset', bearer, adminOnly, asyncRoute(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'সঠিক user ID প্রয়োজন' });
  if (req.body?.confirm !== 'RESET_USER_DATA') return res.status(400).json({ error: 'নিশ্চিতকরণ টোকেন মেলেনি' });
  await pool.query('DELETE FROM user_data WHERE user_id = $1', [req.params.id]);
  return res.json({ ok: true, message: 'ব্যবহারকারীর সার্ভার ব্যাকআপ মুছে দেওয়া হয়েছে; অ্যাকাউন্ট রাখা হয়েছে' });
}));

app.post('/api/admin/users/:id/delete', bearer, adminOnly, asyncRoute(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'সঠিক user ID প্রয়োজন' });
  if (req.body?.confirm !== 'DELETE_USER_ACCOUNT') return res.status(400).json({ error: 'নিশ্চিতকরণ টোকেন মেলেনি' });
  const q = await pool.query('DELETE FROM app_users WHERE id = $1 RETURNING id', [req.params.id]);
  if (!q.rowCount) return res.status(404).json({ error: 'ব্যবহারকারী পাওয়া যায়নি' });
  return res.json({ ok: true, message: 'সার্ভার অ্যাকাউন্ট ও তার ডেটা মুছে দেওয়া হয়েছে' });
}));


// ===== Daily Quran and Sahih Hadith Web Push =====
const vapidReady = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
if (vapidReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

app.get('/api/push/public-key', (_req, res) => {
  if (!vapidReady) return res.status(503).json({ error: 'নোটিফিকেশন সার্ভার প্রস্তুত নয়' });
  return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', bearer, asyncRoute(async (req, res) => {
  if (req.claims.role !== 'user') return res.status(403).json({ error: 'ব্যবহারকারী অনুমোদন প্রয়োজন' });
  const sub = asObject(req.body?.subscription), keys = asObject(sub.keys), endpoint = String(sub.endpoint || '');
  if (!endpoint.startsWith('https://') || endpoint.length > 2048 || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 256 || keys.auth.length > 256)
    return res.status(400).json({ error: 'Push subscription সঠিক নয়' });
  await pool.query("INSERT INTO push_subscriptions(user_id,endpoint,subscription,updated_at) VALUES($1,$2,$3::jsonb,NOW()) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,subscription=EXCLUDED.subscription,updated_at=NOW()",
    [req.claims.sub, endpoint, JSON.stringify({endpoint,keys,expirationTime:sub.expirationTime ?? null})]);
  return res.status(201).json({ok:true});
}));

app.delete('/api/push/subscribe', bearer, asyncRoute(async (req,res) => {
  if(req.claims.role!=='user') return res.status(403).json({error:'ব্যবহারকারী অনুমোদন প্রয়োজন'});
  const endpoint=String(req.body?.endpoint||'');
  if(!endpoint.startsWith('https://')||endpoint.length>2048) return res.status(400).json({error:'Endpoint সঠিক নয়'});
  await pool.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',[req.claims.sub,endpoint]);
  return res.json({ok:true});
}));

const adminPushTestLimit=rateLimit({windowMs:5*60*1000,limit:1,standardHeaders:true,legacyHeaders:false});
app.post('/api/admin/push/test',bearer,adminOnly,adminPushTestLimit,asyncRoute(async(req,res)=>{
  if(!vapidReady) return res.status(503).json({error:'নোটিফিকেশন সার্ভার প্রস্তুত নয়'});
  const subs=await pool.query('SELECT endpoint,subscription FROM push_subscriptions');
  let sent=0,failed=0,expired=0;
  const payload=JSON.stringify({title:'Smart Salary App · Test Notification',body:'নোটিফিকেশন সংযোগ পরীক্ষা সফল হলে এই বার্তাটি দেখবেন।',url:'/',kind:'test',tag:'smart-salary-test-'+Date.now()});
  for(const row of subs.rows){
    try{await webpush.sendNotification(row.subscription,payload,{TTL:60});sent++;}
    catch(err){failed++;if(err.statusCode===404||err.statusCode===410){expired++;await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1',[row.endpoint]);}}
  }
  return res.json({ok:true,subscribers:subs.rowCount,sent,failed,expired});
}));


function dhakaDate(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return v.year+'-'+v.month+'-'+v.day;
}
async function fetchDailyJson(url){
  const r=await fetch(url,{headers:{'User-Agent':'SmartSalaryApp/9.14'},signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error('Content provider HTTP '+r.status);
  return r.json();
}
const QURAN_COUNTS=[7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
async function makeQuranItem(date){
  const day=Math.floor(Date.parse(date+'T00:00:00Z')/86400000);
  const list=await fetchDailyJson('https://quranenc.com/api/v1/translations/list/bn?localization=bn');
  const arr=Array.isArray(list)?list:(list.translations||[]);
  const tr=arr.find(x=>x.language_iso_code==='bn'&&x.key&&x.version)||arr.find(x=>x.key);
  if(!tr) throw new Error('QuranEnc Bengali translation not found');
  const total=QURAN_COUNTS.reduce((a,b)=>a+b,0);
  for(let offset=0;offset<total;offset++){
    let n=(day+offset)%total,sura=1;
    while(n>=QURAN_COUNTS[sura-1]){n-=QURAN_COUNTS[sura-1];sura++;}
    const aya=n+1,key=sura+':'+aya;
    const old=await pool.query("SELECT 1 FROM daily_notifications WHERE kind='quran' AND content_key=$1 LIMIT 1",[key]);
    if(old.rowCount) continue;
    const data=await fetchDailyJson('https://quranenc.com/api/v1/translation/aya/'+encodeURIComponent(tr.key)+'/'+sura+'/'+aya);
    const v=data.result||data;
    if(!v.arabic_text||!v.translation) continue;
    return {kind:'quran',date,contentKey:key,title:'আজকের কোরআনের আয়াত',arabic:v.arabic_text,translation:v.translation,reference:'সূরা '+sura+', আয়াত '+aya,sourceUrl:'https://quranenc.com',sourceName:'QuranEnc.com · '+(tr.title||tr.key)+' · সংস্করণ '+tr.version};
  }
  throw new Error('No unused Quran verse remains');
}
const hadithSectionCache=new Map();
async function fetchHadithSection(book,edition,section){
  const cacheKey=book+':'+edition+':'+section;
  if(hadithSectionCache.has(cacheKey)) return hadithSectionCache.get(cacheKey);
  const paths=[
    'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/'+edition+'/sections/'+section+'.min.json',
    'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/'+edition+'/sections/'+section+'.json',
    'https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions/'+edition+'/sections/'+section+'.json'
  ];
  let lastError;
  for(const url of paths){
    try{
      const r=await fetch(url,{headers:{'User-Agent':'SmartSalaryApp/9.14'},signal:AbortSignal.timeout(12000)});
      if(!r.ok) throw new Error('Hadith CDN HTTP '+r.status);
      const data=await r.json();
      if(!Array.isArray(data.hadiths)) throw new Error('Hadith section format invalid');
      hadithSectionCache.set(cacheKey,data);
      return data;
    }catch(err){lastError=err}
  }
  throw lastError||new Error('Hadith provider unavailable');
}
async function makeHadithItem(date){
  const day=Math.floor(Date.parse(date+'T00:00:00Z')/86400000);
  const books=day%2===0?['bukhari','muslim']:['muslim','bukhari'];
  for(const book of books){
    const sectionCount=book==='bukhari'?97:56;
    const start=Math.floor(day/2)%sectionCount;
    for(let offset=0;offset<sectionCount;offset++){
      const section=((start+offset)%sectionCount)+1;
      const [bn,ar]=await Promise.all([
        fetchHadithSection(book,'ben-'+book,section),
        fetchHadithSection(book,'ara-'+book,section)
      ]);
      const arabicByNumber=new Map(ar.hadiths.map(h=>[String(h.hadithnumber),h.text]));
      const records=bn.hadiths||[];
      const recordStart=Math.abs(day+section)%Math.max(1,records.length);
      for(let n=0;n<records.length;n++){
        const h=records[(recordStart+n)%records.length];
        const arabic=arabicByNumber.get(String(h.hadithnumber));
        const translation=String(h.text||'').trim();
        if(!arabic||!translation||!String(arabic).trim()) continue;
        const key=book+':'+h.hadithnumber;
        const old=await pool.query("SELECT 1 FROM daily_notifications WHERE kind='hadith' AND content_key=$1 LIMIT 1",[key]);
        if(old.rowCount) continue;
        const name=book==='bukhari'?'সহিহ বুখারি':'সহিহ মুসলিম';
        return {kind:'hadith',date,contentKey:key,title:'আজকের সহিহ হাদিস',arabic,translation,reference:name+', হাদিস '+h.hadithnumber,sourceUrl:'https://github.com/fawazahmed0/hadith-api/tree/1/editions/'+('ben-'+book),sourceName:'Hadith API · Bengali ben-'+book+' ও Arabic ara-'+book+' edition; collection '+name};
      }
    }
  }
  throw new Error('No unused Bengali/Arabic hadith record available in Sahih collections');
}

app.post('/api/push/dispatch/:kind', asyncRoute(async(req,res)=>{
  const supplied=Buffer.from(String(req.get('x-push-secret')||'')), expected=Buffer.from(String(process.env.PUSH_CRON_SECRET||''));
  if(!expected.length||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)) return res.status(401).json({error:'অনুমোদন নেই'});
  if(!vapidReady) return res.status(503).json({error:'VAPID প্রস্তুত নয়'});
  const kind=req.params.kind;
  if(kind!=='quran'&&kind!=='hadith') return res.status(400).json({error:'kind quran অথবা hadith হতে হবে'});
  const date=dhakaDate();
  let result=await pool.query('SELECT * FROM daily_notifications WHERE kind=$1 AND content_date=$2',[kind,date]);
  if(!result.rowCount){
    let item;
    if(kind==='quran'){
      item=await makeQuranItem(date);
    }else{
      try{
        item=await makeHadithItem(date);
      }catch(providerError){
        // Reuse a previously stored, already-validated Sahih Bukhari/Muslim entry
        // when the live content provider is unavailable. Never invent or translate text.
        const cached=await pool.query("SELECT content_key,title,arabic,translation,reference,source_url,source_name FROM daily_notifications WHERE kind='hadith' AND arabic IS NOT NULL AND translation IS NOT NULL ORDER BY content_date DESC LIMIT 1");
        if(!cached.rowCount) throw providerError;
        const c=cached.rows[0];
        item={kind:'hadith',date,contentKey:c.content_key,title:c.title,arabic:c.arabic,translation:c.translation,reference:c.reference,sourceUrl:c.source_url,sourceName:c.source_name+' · পূর্বে যাচাইকৃত সংরক্ষিত কপি'};
        console.warn('Hadith provider unavailable; using previously stored verified item:',providerError.message);
      }
    }
    const inserted=await pool.query("INSERT INTO daily_notifications(kind,content_date,content_key,title,arabic,translation,reference,source_url,source_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(kind,content_date) DO NOTHING RETURNING *",
      [item.kind,item.date,item.contentKey,item.title,item.arabic,item.translation,item.reference,item.sourceUrl,item.sourceName]);
    result=inserted.rowCount?inserted:await pool.query('SELECT * FROM daily_notifications WHERE kind=$1 AND content_date=$2',[kind,date]);
  }
  const item=result.rows[0], subs=await pool.query('SELECT endpoint,subscription FROM push_subscriptions');
  let sent=0,failed=0,skipped=0;
  for(const row of subs.rows){
    const claim=await pool.query('INSERT INTO push_delivery_log(daily_id,endpoint) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING daily_id',[item.id,row.endpoint]);
    if(!claim.rowCount){skipped++;continue;}
    const payload=JSON.stringify({title:item.title,body:item.reference+' — '+String(item.translation).slice(0,180),url:'/daily.html?kind='+kind+'&date='+date,kind,date,tag:'daily-'+kind+'-'+date});
    try{await webpush.sendNotification(row.subscription,payload,{TTL:86400});sent++;}
    catch(err){
      await pool.query('DELETE FROM push_delivery_log WHERE daily_id=$1 AND endpoint=$2',[item.id,row.endpoint]);
      if(err.statusCode===404||err.statusCode===410) await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1',[row.endpoint]);
      failed++;
    }
  }
  return res.json({ok:true,kind,date,sent,failed,skipped,subscribers:subs.rowCount});
}));

app.get('/api/daily/:kind/:date',asyncRoute(async(req,res)=>{
  if(!['quran','hadith'].includes(req.params.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({error:'তারিখ বা ধরন সঠিক নয়'});
  const q=await pool.query('SELECT kind,content_date,title,arabic,translation,reference,source_url,source_name FROM daily_notifications WHERE kind=$1 AND content_date=$2',[req.params.kind,req.params.date]);
  if(!q.rowCount) return res.status(404).json({error:'এই দিনের পাঠ এখনো তৈরি হয়নি'});
  return res.json(q.rows[0]);
}));


app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON তথ্য সঠিক নয়' });
  if (err.message === 'Origin not allowed by CORS') return res.status(403).json({ error: 'এই ওয়েবসাইট থেকে অনুরোধ অনুমোদিত নয়' });
  console.error('UNHANDLED_API_ERROR:', { message: err.message || 'Unknown error', code: err.code || null });
  return res.status(500).json({ error: 'সার্ভারে সমস্যা হয়েছে' });
});

const port = Number(process.env.PORT || 8080);
const server = app.listen(port, () => console.log(`Smart Salary API listening on ${port}`));
async function shutdown(signal) {
  console.log(`${signal} received; closing server`);
  server.close(async () => {
    try { await pool.end(); } catch (err) { console.error('POOL_CLOSE_ERROR:', err.message); }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
