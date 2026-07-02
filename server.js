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
  let sql = `SELECT * FROM vehicles WHERE at_dealership = 1 AND status != 'sold'`;
  const params = [];
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
//  Contact messages (public submit; admin views come with the admin step)
// ---------------------------------------------------------------------------
app.post('/api/contact', (req, res) => {
  const b = req.body || {};
  const type = ['general', 'trade-in', 'sourcing'].includes(b.type) ? b.type : 'general';
  if (!b.name || !b.email || !b.phone)
    return res.status(400).json({ error: 'name, email, and phone are required' });
  if ((type === 'trade-in' || type === 'sourcing') && !b.vehicle_details)
    return res.status(400).json({ error: 'vehicle_details required for this inquiry type' });
  const t = now();
  db.prepare(`INSERT INTO contact_messages
    (id, type, name, email, phone, vehicle_details, message, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(uid(), type, String(b.name).slice(0, 200), String(b.email).slice(0, 200),
         String(b.phone).slice(0, 50), b.vehicle_details || null, b.message || null, t, t);
  // Email notification is wired in a later step (Resend); saved to DB for now.
  res.status(201).json({ ok: true });
});

// ---------------------------------------------------------------------------
//  Health + config (public, non-sensitive branding for the frontend)
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

// SPA-ish fallback for the public site
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ${DEALERSHIP.brandName} platform running on :${PORT}`);
  console.log(`  DB: ${DB_PATH}`);
  console.log(`  Uploads: ${UPLOADS_DIR}\n`);
});
