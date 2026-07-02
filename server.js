// ============================================================================
//  Absolute Motor Cars — Dealership Platform  (all-on-Railway build)
//  System A backend + shared auth + data store for the CRM (System B).
//  Phase 1 · Step 1 — server skeleton, schema, two-role auth, vehicle CRUD.
// ============================================================================

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const crypto       = require('crypto');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const multer       = require('multer');
const sharp        = require('sharp');
const Database     = require('better-sqlite3');
const { DEALERSHIP } = require('./config');

// ---------------------------------------------------------------------------
//  Paths & storage (Railway persistent volume mounts at /app/storage)
// ---------------------------------------------------------------------------
const DATA_DIR    = process.env.DATA_DIR    || path.join(__dirname, 'storage', 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'storage', 'uploads');
for (const d of [DATA_DIR, UPLOADS_DIR]) fs.mkdirSync(d, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'dealership.db');

// ---------------------------------------------------------------------------
//  Auto-recovery: if configured DB is empty/missing, adopt the richest DB
//  found at known alternate locations (protects against volume path changes).
// ---------------------------------------------------------------------------
function countVehicles(dbFile) {
  try {
    const t = new Database(dbFile, { readonly: true });
    const row = t.prepare(`SELECT COUNT(*) c FROM vehicles`).get();
    t.close();
    return row ? row.c : 0;
  } catch { return -1; }
}

function autoRecoverDatabase() {
  const here = countVehicles(DB_PATH);
  if (here > 0) return; // already have data

  const candidates = [
    ...globSafe('/app/storage/data'),
    ...globSafe('/app/storage'),
    ...globSafe('/app/data'),
    ...globSafe(path.join(__dirname, 'storage', 'data')),
  ].filter(f => f !== DB_PATH);

  let best = null, bestCount = 0;
  for (const f of candidates) {
    const c = countVehicles(f);
    if (c > bestCount) { best = f; bestCount = c; }
  }
  if (best && bestCount > 0) {
    try {
      // checkpoint source WAL, then copy in
      const src = new Database(best);
      src.pragma('wal_checkpoint(TRUNCATE)');
      src.close();
      fs.copyFileSync(best, DB_PATH);
      console.log(`[recovery] adopted ${best} (${bestCount} vehicles) -> ${DB_PATH}`);
    } catch (e) { console.warn('[recovery] failed:', e.message); }
  }
}
function globSafe(dir) {
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.db')).map(f => path.join(dir, f)); }
  catch { return []; }
}
autoRecoverDatabase();

// ---------------------------------------------------------------------------
//  Database + schema
// ---------------------------------------------------------------------------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  full_name TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  stock_number TEXT,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  price INTEGER NOT NULL,
  mileage INTEGER,
  exterior TEXT,
  interior TEXT,
  engine TEXT,
  transmission TEXT,
  drivetrain TEXT,
  fuel TEXT,
  vin TEXT,
  status TEXT DEFAULT 'available',
  description TEXT,
  at_dealership INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_images (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS financing_applications (
  id TEXT PRIMARY KEY,
  first_name TEXT, last_name TEXT, email TEXT, phone TEXT,
  date_of_birth TEXT, sin TEXT, marital_status TEXT,
  street_address TEXT, city TEXT, province TEXT, postal_code TEXT,
  housing_status TEXT, monthly_housing_payment INTEGER,
  years_at_address INTEGER, months_at_address INTEGER,
  prev_street_address TEXT, prev_city TEXT, prev_province TEXT, prev_postal_code TEXT,
  employment_status TEXT, employer_name TEXT, job_title TEXT, employer_phone TEXT,
  years_employed INTEGER, months_employed INTEGER,
  gross_monthly_income INTEGER, other_income INTEGER, other_income_source TEXT,
  vehicle_of_interest TEXT, vehicle_id TEXT, down_payment INTEGER,
  has_trade_in INTEGER DEFAULT 0, trade_in_details TEXT,
  has_co_applicant INTEGER DEFAULT 0,
  co_applicant_name TEXT, co_applicant_relationship TEXT, co_applicant_phone TEXT,
  consent_credit_check INTEGER DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'new',
  admin_notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
  vehicle_details TEXT, message TEXT,
  status TEXT DEFAULT 'new',
  admin_notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- CRM (System B) data lives in the SAME database (all-on-Railway).
-- production/cost/sold tables are added in Phase 2; kept here so the
-- volume already has them and backups are complete from day one.
CREATE TABLE IF NOT EXISTS vehicle_costs (
  vehicle_id TEXT PRIMARY KEY,
  purchase_price INTEGER DEFAULT 0,
  icbc INTEGER DEFAULT 0,
  detailing INTEGER DEFAULT 0,
  transport INTEGER DEFAULT 0,
  boost INTEGER DEFAULT 0,
  tire INTEGER DEFAULT 0,
  repair INTEGER DEFAULT 0,
  windshield INTEGER DEFAULT 0,
  afc_extra INTEGER DEFAULT 0,
  misc_cost INTEGER DEFAULT 0,
  sales_cost INTEGER DEFAULT 0,
  gst_paid INTEGER DEFAULT 0,
  location TEXT DEFAULT 'Dealership',
  source_type TEXT, source_name TEXT, acquisition_price INTEGER,
  buyer_name TEXT, buyer_phone TEXT, buyer_email TEXT,
  registration_done INTEGER DEFAULT 0,
  inspection_done INTEGER DEFAULT 0,
  inspection_data TEXT,          -- JSON: checklist + odometer + comments
  updated_at INTEGER,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sold_records (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT,
  stock_number TEXT, year INTEGER, make TEXT, model TEXT,
  purchase_price INTEGER, gst_paid INTEGER,
  seller_name TEXT, sale_date TEXT,
  selling_price INTEGER, reserve_non_gst INTEGER,
  gst_collected INTEGER, pst_collected INTEGER,
  buyer_name TEXT, buyer_phone TEXT, buyer_email TEXT,
  created_at INTEGER NOT NULL
);
`);

// Safe migration helper for future ALTERs on existing databases
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[migrate] ${table}.${column} added`);
  }
}
// (no-op today; kept ready for schema evolution)

// ---------------------------------------------------------------------------
//  Seed two users (owner + staff) from env vars on first run
// ---------------------------------------------------------------------------
function seedUsers() {
  const now = Date.now();
  const ensure = (envUser, envPass, role, fallbackUser) => {
    const username = process.env[envUser] || fallbackUser;
    const password = process.env[envPass];
    const existing = db.prepare(`SELECT id FROM users WHERE role = ?`).get(role);
    if (existing) return;
    if (!password) {
      console.warn(`[seed] ${role} not created — set ${envUser} and ${envPass} env vars, then restart.`);
      return;
    }
    const hash = bcrypt.hashSync(password, 12);
    db.prepare(`INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?,?,?,?,?)`)
      .run(crypto.randomUUID(), username, hash, role, now);
    console.log(`[seed] ${role} user created: username="${username}" (password set via ${envPass})`);
  };
  ensure('OWNER_USERNAME', 'OWNER_PASSWORD', 'owner', 'owner');
  ensure('STAFF_USERNAME', 'STAFF_PASSWORD', 'staff', 'staff');
}
seedUsers();

// ---------------------------------------------------------------------------
//  App + middleware
// ---------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[fatal] JWT_SECRET env var is required. Set it and restart.');
  process.exit(1);
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);   // { sub, username, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'owner')
    return res.status(403).json({ error: 'Owner access required' });
  next();
}

const uid = () => crypto.randomUUID();
const now = () => Date.now();

// ---------------------------------------------------------------------------
//  Auth
// ---------------------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET, { expiresIn: '12h' }
  );
  res.json({ token, user: { username: user.username, role: user.role, fullName: user.full_name } });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// ---------------------------------------------------------------------------
//  Vehicles
// ---------------------------------------------------------------------------
function attachImages(vehicle) {
  if (!vehicle) return vehicle;
  const imgs = db.prepare(
    `SELECT filename FROM vehicle_images WHERE vehicle_id = ? ORDER BY sort_order ASC, created_at ASC`
  ).all(vehicle.id).map(r => `/uploads/${r.filename}`);
  return { ...vehicle, images: imgs };
}

// Public list — only cars at the dealership and not sold
app.get('/api/vehicles', (req, res) => {
  const { status, search } = req.query;
  // Check for admin token to allow full view
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  let isAdmin = false;
  if (token) { try { const u = jwt.verify(token, JWT_SECRET); isAdmin = !!u; } catch {} }

  let sql, params;
  if (isAdmin) {
    sql = `SELECT * FROM vehicles WHERE 1=1`;
    params = [];
  } else {
    sql = `SELECT * FROM vehicles WHERE at_dealership = 1 AND status != 'sold'`;
    params = [];
  }
  if (status && status !== 'all') { sql += ` AND status = ?`; params.push(status); }
  if (search) {
    sql += ` AND (CAST(year AS TEXT) LIKE ? OR make LIKE ? OR model LIKE ? OR trim LIKE ?)`;
    const s = `%${search}%`; params.push(s, s, s, s);
  }
  sql += ` ORDER BY year DESC, created_at DESC`;
  const rows = db.prepare(sql).all(...params).map(attachImages);
  res.json(rows);
});

app.get('/api/vehicles/:id', (req, res) => {
  const v = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(attachImages(v));
});

const VEHICLE_FIELDS = ['stock_number','year','make','model','trim','price','mileage',
  'exterior','interior','engine','transmission','drivetrain','fuel','vin','status',
  'description','at_dealership'];

app.post('/api/vehicles', requireAuth, (req, res) => {
  const b = req.body || {};
  if (b.year == null || !b.make || !b.model || b.price == null)
    return res.status(400).json({ error: 'year, make, model, and price are required' });
  const id = uid(), t = now();
  const vals = VEHICLE_FIELDS.map(f => b[f] !== undefined ? b[f] : null);
  db.prepare(`INSERT INTO vehicles
    (id, ${VEHICLE_FIELDS.join(',')}, created_at, updated_at)
    VALUES (?, ${VEHICLE_FIELDS.map(()=>'?').join(',')}, ?, ?)`
  ).run(id, ...vals, t, t);
  res.status(201).json(attachImages(db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(id)));
});

app.put('/api/vehicles/:id', requireAuth, (req, res) => {
  const v = db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const updates = VEHICLE_FIELDS.filter(f => b[f] !== undefined);
  if (updates.length) {
    db.prepare(`UPDATE vehicles SET ${updates.map(f=>`${f}=?`).join(',')}, updated_at=? WHERE id=?`)
      .run(...updates.map(f => b[f]), now(), req.params.id);
  }
  res.json(attachImages(db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(req.params.id)));
});

app.delete('/api/vehicles/:id', requireAuth, (req, res) => {
  const info = db.prepare(`DELETE FROM vehicles WHERE id=?`).run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
//  Image upload (multer + sharp)
// ---------------------------------------------------------------------------
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  },
});

app.post('/api/vehicles/:id/images', requireAuth, upload.array('images', 20), async (req, res) => {
  const v = db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No images provided' });
  const results = [];
  const t = now();
  for (const file of req.files) {
    const ext = path.extname(file.originalname) || '.jpg';
    const fname = `${uid()}${ext}`;
    const dest = path.join(UPLOADS_DIR, fname);
    await sharp(file.buffer).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 }).toFile(dest);
    const sort = db.prepare(`SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM vehicle_images WHERE vehicle_id=?`).get(req.params.id);
    db.prepare(`INSERT INTO vehicle_images (id, vehicle_id, filename, sort_order, created_at) VALUES (?,?,?,?,?)`)
      .run(uid(), req.params.id, fname, sort.n, t);
    results.push({ filename: fname, url: `/uploads/${fname}` });
  }
  db.prepare(`UPDATE vehicles SET updated_at=? WHERE id=?`).run(t, req.params.id);
  res.status(201).json(results);
});

app.delete('/api/vehicles/:id/images/:filename', requireAuth, (req, res) => {
  const img = db.prepare(`SELECT * FROM vehicle_images WHERE vehicle_id=? AND filename=?`).get(req.params.id, req.params.filename);
  if (!img) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(path.join(UPLOADS_DIR, img.filename)); } catch {}
  db.prepare(`DELETE FROM vehicle_images WHERE id=?`).run(img.id);
  res.json({ ok: true });
});

app.put('/api/vehicles/:id/images/reorder', requireAuth, (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
  const stmt = db.prepare(`UPDATE vehicle_images SET sort_order=? WHERE vehicle_id=? AND filename=?`);
  order.forEach((fname, i) => stmt.run(i, req.params.id, fname));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
//  Email helper (Resend HTTP API)
// ---------------------------------------------------------------------------
async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping email');
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
        to: to || process.env.NOTIFY_EMAIL || DEALERSHIP.email,
        subject,
        html,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    return true;
  } catch (e) {
    console.warn('[email] failed:', e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
//  Financing applications
// ---------------------------------------------------------------------------
app.post('/api/financing', (req, res) => {
  const b = req.body || {};
  if (!b.first_name || !b.last_name || !b.email || !b.phone || !b.consent_credit_check)
    return res.status(400).json({ error: 'Name, email, phone, and consent are required' });
  const id = uid(), t = now();
  const fields = [
    'first_name','last_name','email','phone','date_of_birth','sin','marital_status',
    'street_address','city','province','postal_code','housing_status','monthly_housing_payment',
    'years_at_address','months_at_address','prev_street_address','prev_city','prev_province','prev_postal_code',
    'employment_status','employer_name','job_title','employer_phone','years_employed','months_employed',
    'gross_monthly_income','other_income','other_income_source',
    'vehicle_of_interest','vehicle_id','down_payment','has_trade_in','trade_in_details',
    'has_co_applicant','co_applicant_name','co_applicant_relationship','co_applicant_phone',
    'consent_credit_check','notes',
  ];
  const vals = fields.map(f => b[f] !== undefined ? b[f] : null);
  db.prepare(`INSERT INTO financing_applications
    (id, ${fields.join(',')}, created_at, updated_at)
    VALUES (?, ${fields.map(()=>'?').join(',')}, ?, ?)`)
    .run(id, ...vals, t, t);

  const notifyTo = process.env.NOTIFY_EMAIL || DEALERSHIP.email;
  sendEmail({
    to: notifyTo,
    subject: `New Financing App: ${b.first_name} ${b.last_name}`,
    html: `<h2>New Financing Application</h2>
      <p><strong>Name:</strong> ${b.first_name} ${b.last_name}</p>
      <p><strong>Email:</strong> ${b.email} | <strong>Phone:</strong> ${b.phone}</p>
      <p><strong>Vehicle:</strong> ${b.vehicle_of_interest || 'N/A'}</p>
      <p><strong>Income:</strong> $${(b.gross_monthly_income || 0).toLocaleString()}</p>
      <p><a href="${process.env.PUBLIC_URL || ''}/admin">View in Admin</a></p>`,
  }).catch(() => {});

  res.status(201).json({ id, ok: true });
});

app.get('/api/financing', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM financing_applications ORDER BY created_at DESC`).all();
  res.json(rows);
});

app.get('/api/financing/:id', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT * FROM financing_applications WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.put('/api/financing/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const app = db.prepare(`SELECT * FROM financing_applications WHERE id=?`).get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Not found' });
  if (b.status) db.prepare(`UPDATE financing_applications SET status=?, updated_at=? WHERE id=?`).run(b.status, now(), req.params.id);
  if (b.admin_notes !== undefined) db.prepare(`UPDATE financing_applications SET admin_notes=?, updated_at=? WHERE id=?`).run(b.admin_notes, now(), req.params.id);
  res.json(db.prepare(`SELECT * FROM financing_applications WHERE id=?`).get(req.params.id));
});

// ---------------------------------------------------------------------------
//  Contact messages
// ---------------------------------------------------------------------------
app.post('/api/contact', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.email || !b.phone) return res.status(400).json({ error: 'Name, email, and phone are required' });
  const id = uid(), t = now();
  db.prepare(`INSERT INTO contact_messages (id, type, name, email, phone, vehicle_details, message, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, b.type || 'general', b.name, b.email, b.phone, b.vehicle_details || null, b.message || null, t, t);

  const notifyTo = process.env.NOTIFY_EMAIL || DEALERSHIP.email;
  sendEmail({
    to: notifyTo,
    subject: `New ${b.type || 'Contact'} Inquiry: ${b.name}`,
    html: `<h2>New Contact Inquiry</h2>
      <p><strong>Type:</strong> ${b.type || 'General'}</p>
      <p><strong>Name:</strong> ${b.name}</p>
      <p><strong>Email:</strong> ${b.email} | <strong>Phone:</strong> ${b.phone}</p>
      ${b.vehicle_details ? `<p><strong>Vehicle:</strong> ${b.vehicle_details}</p>` : ''}
      ${b.message ? `<p><strong>Message:</strong> ${b.message}</p>` : ''}
      <p><a href="${process.env.PUBLIC_URL || ''}/admin">View in Admin</a></p>`,
  }).catch(() => {});

  res.status(201).json({ id, ok: true });
});

app.get('/api/contact', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM contact_messages ORDER BY created_at DESC`).all();
  res.json(rows);
});

app.put('/api/contact/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const row = db.prepare(`SELECT * FROM contact_messages WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (b.status) db.prepare(`UPDATE contact_messages SET status=?, updated_at=? WHERE id=?`).run(b.status, now(), req.params.id);
  if (b.admin_notes !== undefined) db.prepare(`UPDATE contact_messages SET admin_notes=?, updated_at=? WHERE id=?`).run(b.admin_notes, now(), req.params.id);
  res.json(db.prepare(`SELECT * FROM contact_messages WHERE id=?`).get(req.params.id));
});

app.delete('/api/contact/:id', requireAuth, (req, res) => {
  const info = db.prepare(`DELETE FROM contact_messages WHERE id=?`).run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
//  CRM Data Layer — GitHub-as-database
//  Stores crmVehicles + soldRecords in a private GitHub repo as data.json.
//  Every write is a Git commit = automatic version history + off-platform backup.
// ---------------------------------------------------------------------------

const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_OWNER   = process.env.GITHUB_OWNER;
const GITHUB_REPO    = process.env.GITHUB_REPO;
const GITHUB_BRANCH  = process.env.GITHUB_BRANCH || 'main';
const DATA_PATH      = process.env.DATA_PATH || 'data.json';
const GITHUB_API     = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_PATH}`;

let _dataCache = null;  // in-memory cache, refreshed on GET

async function readGitHubData() {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    // Fallback: use in-memory cache or empty state
    return _dataCache || { crmVehicles: [], soldRecords: [], _version: 0 };
  }
  try {
    const r = await fetch(`${GITHUB_API}?ref=${GITHUB_BRANCH}`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'dealership-crm' },
    });
    if (r.status === 404) {
      // File doesn't exist yet — return empty
      const empty = { crmVehicles: [], soldRecords: [], _version: 0 };
      _dataCache = empty;
      return empty;
    }
    if (!r.ok) throw new Error(`GitHub read failed: ${r.status} ${await r.text()}`);
    const body = await r.json();
    const content = Buffer.from(body.content, 'base64').toString('utf-8');
    const data = JSON.parse(content);
    // Attach sha for subsequent writes
    data._sha = body.sha;
    _dataCache = data;
    return data;
  } catch (e) {
    console.warn('[github-data] read failed:', e.message, '— using cache');
    return _dataCache || { crmVehicles: [], soldRecords: [], _version: 0 };
  }
}

async function writeGitHubData(data) {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    _dataCache = data;
    console.warn('[github-data] GITHUB_TOKEN not configured — data saved to memory only');
    return data;
  }
  const _version = (data._version || 0) + 1;
  data._version = _version;
  data._updatedAt = new Date().toISOString();

  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const body = {
    message: `Update CRM data (v${_version})`,
    content,
    branch: GITHUB_BRANCH,
  };
  if (data._sha) body.sha = data._sha;

  try {
    const r = await fetch(GITHUB_API, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'dealership-crm', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`GitHub write failed: ${r.status} ${await r.text()}`);
    const resp = await r.json();
    data._sha = resp.content.sha;  // update sha for next write
    _dataCache = data;
    return data;
  } catch (e) {
    _dataCache = data;
    console.warn('[github-data] write failed:', e.message, '— saved to cache only');
    return data;
  }
}

// ---- /api/data — full CRM state (GitHub-backed) ----
// GET: returns { crmVehicles, soldRecords, _version, _updatedAt }
app.get('/api/data', requireAuth, async (req, res) => {
  const data = await readGitHubData();
  const isOwner = req.user.role === 'owner';
  const crmVehicles = data.crmVehicles || [];
  const soldRecords = data.soldRecords || [];

  // Merge with SQLite vehicle data for display info (year, make, model, VIN, images, etc.)
  const vehicleMap = {};
  db.prepare(`SELECT * FROM vehicles`).all().forEach(v => {
    const imgs = db.prepare(`SELECT filename FROM vehicle_images WHERE vehicle_id=? ORDER BY sort_order, created_at`).all(v.id).map(im => `/uploads/${im.filename}`);
    vehicleMap[v.id] = { ...v, images: imgs };
  });

  const enrichedVehicles = crmVehicles.map(cv => {
    const v = vehicleMap[cv.vehicle_id] || {};
    const costs = cv.costs || {};
    const totalCost = (costs.purchase_price||0)+(costs.icbc||0)+(costs.detailing||0)+(costs.transport||0)+(costs.boost||0)+(costs.tire||0)+(costs.repair||0)+(costs.windshield||0)+(costs.afc_extra||0)+(costs.misc_cost||0)+(costs.sales_cost||0);
    const merged = { ...v, ...cv, total_cost: totalCost, images: v.images || [] };
    // Staff: strip costs
    if (!isOwner) {
      delete merged.purchase_price; delete merged.icbc; delete merged.detailing; delete merged.transport;
      delete merged.boost; delete merged.tire; delete merged.repair; delete merged.windshield;
      delete merged.afc_extra; delete merged.misc_cost; delete merged.sales_cost;
      delete merged.gst_paid; delete merged.source_type; delete merged.source_name;
      delete merged.acquisition_price; delete merged.buyer_name; delete merged.buyer_phone;
      delete merged.buyer_email; delete merged.total_cost;
    }
    return merged;
  });

  // Staff: filter to dealership-only
  const filteredVehicles = isOwner ? enrichedVehicles
    : enrichedVehicles.filter(v => v.location === 'Dealership' || v.location == null || !v.location);

  res.json({
    crmVehicles: filteredVehicles,
    soldRecords: isOwner ? soldRecords : [],
    _version: data._version,
  });
});

// PUT: save full CRM state. Requires owner.
app.put('/api/data', requireAuth, requireOwner, async (req, res) => {
  const b = req.body || {};
  const data = await readGitHubData();
  if (b.crmVehicles !== undefined) data.crmVehicles = b.crmVehicles;
  if (b.soldRecords !== undefined) data.soldRecords = b.soldRecords;

  // Sync location changes to SQLite (for website visibility)
  if (b.crmVehicles) {
    const t = now();
    for (const cv of b.crmVehicles) {
      if (cv.vehicle_id && cv.location !== undefined) {
        const atDeal = cv.location === 'Dealership' ? 1 : 0;
        db.prepare(`UPDATE vehicles SET at_dealership=?, updated_at=? WHERE id=?`).run(atDeal, t, cv.vehicle_id);
      }
    }
  }

  // If a vehicle was marked sold (removed from crmVehicles), also remove from SQLite
  // This is handled by crmVehicles array no longer containing that vehicle_id

  const saved = await writeGitHubData(data);
  res.json({ ok: true, _version: saved._version });
});

// ---- Sold operations (thin wrappers over /api/data) ----
app.post('/api/crm/sold', requireAuth, requireOwner, async (req, res) => {
  const b = req.body || {};
  if (!b.vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const data = await readGitHubData();
  const vehicles = data.crmVehicles || [];

  // Find and remove from CRM vehicles
  const idx = vehicles.findIndex(cv => cv.vehicle_id === b.vehicle_id);
  const crmVeh = idx >= 0 ? vehicles[idx] : { costs: {} };

  // Build sold record
  const soldRecord = {
    id: uid(),
    vehicle_id: b.vehicle_id,
    stock_number: b.stock_number || crmVeh.stock_number || '',
    year: b.year, make: b.make, model: b.model,
    purchase_price: b.purchase_price || (crmVeh.costs && crmVeh.costs.purchase_price) || 0,
    gst_paid: b.gst_paid || (crmVeh.costs && crmVeh.costs.gst_paid) || 0,
    seller_name: b.seller_name || '',
    sale_date: b.sale_date || '',
    selling_price: b.selling_price || 0,
    reserve_non_gst: b.reserve_non_gst || 0,
    gst_collected: b.gst_collected || 0,
    pst_collected: b.pst_collected || 0,
    buyer_name: b.buyer_name || '',
    buyer_phone: b.buyer_phone || '',
    buyer_email: b.buyer_email || '',
    created_at: now(),
  };

  if (idx >= 0) vehicles.splice(idx, 1);
  data.crmVehicles = vehicles;
  data.soldRecords = [soldRecord, ...(data.soldRecords || [])];

  // Remove from SQLite (website)
  db.prepare(`DELETE FROM vehicles WHERE id=?`).run(b.vehicle_id);

  await writeGitHubData(data);
  res.status(201).json({ id: soldRecord.id, ok: true });
});

// Return to inventory — undo a sold record
app.post('/api/crm/sold/:id/return', requireAuth, requireOwner, async (req, res) => {
  const data = await readGitHubData();
  const soldRecords = data.soldRecords || [];
  const idx = soldRecords.findIndex(s => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });

  const record = soldRecords[idx];
  soldRecords.splice(idx, 1);

  // Re-create vehicle in SQLite
  const vid = uid(), t = now();
  db.prepare(`INSERT INTO vehicles (id, stock_number, year, make, model, price, status, at_dealership, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    vid, record.stock_number, record.year, record.make, record.model,
    record.purchase_price || 0, 'available', 1, t, t
  );

  // Add to CRM vehicles
  const crmVehicle = {
    vehicle_id: vid,
    stock_number: record.stock_number,
    costs: { purchase_price: record.purchase_price || 0, gst_paid: record.gst_paid || 0 },
    location: 'Dealership',
    registration_done: 0, inspection_done: 0, inspection_data: null,
  };
  data.soldRecords = soldRecords;
  data.crmVehicles = [...(data.crmVehicles || []), crmVehicle];

  await writeGitHubData(data);
  res.json({ ok: true, vehicle_id: vid });
});

// ---- Backup (now GitHub IS the backup, but keep download for offline copies) ----
app.get('/api/crm/backup', requireAuth, requireOwner, async (req, res) => {
  const data = await readGitHubData();
  const { _sha, ...backup } = data;
  backup.exportedAt = new Date().toISOString();
  backup.source = 'github-data-repo';
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="dealership-backup-${new Date().toISOString().slice(0,10)}.json"`);
  res.json(backup);
});

app.post('/api/crm/backup/restore', requireAuth, requireOwner, async (req, res) => {
  const { data: incoming, mode } = req.body || {};
  if (!incoming) return res.status(400).json({ error: 'Backup data required' });

  if (mode === 'replace') {
    await writeGitHubData({ crmVehicles: incoming.crmVehicles || [], soldRecords: incoming.soldRecords || [], _version: 0 });
    return res.json({ ok: true, mode: 'replace' });
  }

  // Merge — add only records with new IDs
  const current = await readGitHubData();
  const existingVehicleIds = new Set((current.crmVehicles || []).map(v => v.vehicle_id));
  const existingSoldIds = new Set((current.soldRecords || []).map(s => s.id));

  let added = 0;
  for (const cv of (incoming.crmVehicles || [])) {
    if (!existingVehicleIds.has(cv.vehicle_id)) {
      current.crmVehicles.push(cv);
      added++;
    }
  }
  for (const sr of (incoming.soldRecords || [])) {
    if (!existingSoldIds.has(sr.id)) {
      current.soldRecords.push(sr);
      added++;
    }
  }

  await writeGitHubData(current);
  res.json({ ok: true, added, mode: 'merge' });
});

// --------------------------------------------------------------------------- (public, non-sensitive branding for the frontend)
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ ok: true, time: now() }));
app.get('/api/config', (_req, res) => {
  const { gstRate, pstRate, ...rest } = DEALERSHIP;
  res.json({
    brandName: rest.brandName, legalName: rest.legalName, tagline: rest.tagline,
    address: rest.address, city: rest.city, province: rest.province, postalCode: rest.postalCode,
    phone: rest.phone, phoneE164: rest.phoneE164, email: rest.email,
    instagram: rest.instagram, hours: rest.hours, websites: rest.websites,
    dealerReg: rest.dealerReg, gstNumber: rest.gstNumber, pstNumber: rest.pstNumber,
    accentColor: rest.accentColor, gstRate, pstRate,
  });
});

// SPA-ish fallback for public site + admin + CRM
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  if (req.path === '/admin' || req.path.startsWith('/admin/')) return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  if (req.path === '/crm' || req.path.startsWith('/crm/')) return res.sendFile(path.join(__dirname, 'public', 'crm.html'));
  // Check if requested file exists in public/
  const filePath = path.join(__dirname, 'public', req.path);
  try { if (fs.statSync(filePath).isFile()) return res.sendFile(filePath); } catch {}
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ${DEALERSHIP.brandName} platform running on :${PORT}`);
  console.log(`  DB: ${DB_PATH}`);
  console.log(`  Uploads: ${UPLOADS_DIR}\n`);
});
