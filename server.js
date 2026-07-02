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
//  Email (Resend) — optional; fires only if RESEND_API_KEY is set
// ---------------------------------------------------------------------------
async function sendEmail(subject, html) {
  const key = process.env.RESEND_API_KEY, to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.FROM_EMAIL || 'onboarding@resend.dev', to, subject, html }),
    });
  } catch (e) { console.warn('[email]', e.message); }
}

// ---------------------------------------------------------------------------
//  Vehicle images — upload (multer+sharp), delete, reorder
// ---------------------------------------------------------------------------
const multer = require('multer');
const sharp  = require('sharp');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.post('/api/vehicles/:id/images', requireAuth, upload.array('images', 20), async (req, res) => {
  const v = db.prepare(`SELECT id FROM vehicles WHERE id=?`).get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Vehicle not found' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No images uploaded' });
  const maxSort = db.prepare(`SELECT COALESCE(MAX(sort_order),-1) m FROM vehicle_images WHERE vehicle_id=?`)
    .get(v.id).m;
  const saved = [];
  for (let i = 0; i < req.files.length; i++) {
    const fname = `${v.id}-${Date.now()}-${i}.jpg`;
    try {
      await sharp(req.files[i].buffer).rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 }).toFile(path.join(UPLOADS_DIR, fname));
      db.prepare(`INSERT INTO vehicle_images (id, vehicle_id, filename, sort_order, created_at)
        VALUES (?,?,?,?,?)`).run(uid(), v.id, fname, maxSort + 1 + i, now());
      saved.push(`/uploads/${fname}`);
    } catch (e) { console.warn('[img]', e.message); }
  }
  res.status(201).json({ images: saved });
});

app.delete('/api/vehicles/:id/images/:filename', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT * FROM vehicle_images WHERE vehicle_id=? AND filename=?`)
    .get(req.params.id, req.params.filename);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare(`DELETE FROM vehicle_images WHERE id=?`).run(row.id);
  try { fs.unlinkSync(path.join(UPLOADS_DIR, row.filename)); } catch {}
  res.json({ ok: true });
});

app.put('/api/vehicles/:id/images/reorder', requireAuth, (req, res) => {
  const order = req.body && req.body.order;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
  const stmt = db.prepare(`UPDATE vehicle_images SET sort_order=? WHERE vehicle_id=? AND filename=?`);
  order.forEach((fname, i) => stmt.run(i, req.params.id, fname.replace('/uploads/', '')));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
//  Financing applications
// ---------------------------------------------------------------------------
const FIN_FIELDS = ['first_name','last_name','email','phone','date_of_birth','sin','marital_status',
 'street_address','city','province','postal_code','housing_status','monthly_housing_payment',
 'years_at_address','months_at_address','prev_street_address','prev_city','prev_province','prev_postal_code',
 'employment_status','employer_name','job_title','employer_phone','years_employed','months_employed',
 'gross_monthly_income','other_income','other_income_source','vehicle_of_interest','vehicle_id','down_payment',
 'has_trade_in','trade_in_details','has_co_applicant','co_applicant_name','co_applicant_relationship',
 'co_applicant_phone','consent_credit_check','notes'];

app.post('/api/financing', (req, res) => {
  const b = req.body || {};
  if (!b.first_name || !b.last_name || !b.email || !b.phone)
    return res.status(400).json({ error: 'Name, email, and phone are required' });
  if (!b.consent_credit_check)
    return res.status(400).json({ error: 'Credit check consent is required' });
  const t = now(), id = uid();
  db.prepare(`INSERT INTO financing_applications (id, ${FIN_FIELDS.join(',')}, status, created_at, updated_at)
    VALUES (?, ${FIN_FIELDS.map(()=>'?').join(',')}, 'new', ?, ?)`)
    .run(id, ...FIN_FIELDS.map(f => b[f] !== undefined ? b[f] : null), t, t);
  sendEmail(`New financing application — ${b.first_name} ${b.last_name}`,
    `<p>${b.first_name} ${b.last_name} · ${b.phone} · ${b.email}</p>
     <p>Vehicle: ${b.vehicle_of_interest || '—'}</p><p>Log in to the admin dashboard to review.</p>`);
  res.status(201).json({ ok: true });
});

app.get('/api/financing', requireAuth, (req, res) => {
  const { status } = req.query;
  let sql = `SELECT * FROM financing_applications`; const p = [];
  if (status && status !== 'all') { sql += ` WHERE status=?`; p.push(status); }
  sql += ` ORDER BY created_at DESC`;
  res.json(db.prepare(sql).all(...p));
});
app.get('/api/financing/:id', requireAuth, (req, res) => {
  const r = db.prepare(`SELECT * FROM financing_applications WHERE id=?`).get(req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'Not found' });
});
app.put('/api/financing/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const allowed = ['status','admin_notes'].filter(f => b[f] !== undefined);
  if (allowed.length)
    db.prepare(`UPDATE financing_applications SET ${allowed.map(f=>`${f}=?`).join(',')}, updated_at=? WHERE id=?`)
      .run(...allowed.map(f=>b[f]), now(), req.params.id);
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

app.get('/api/contact', requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT * FROM contact_messages ORDER BY created_at DESC`).all());
});
app.put('/api/contact/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const allowed = ['status','admin_notes'].filter(f => b[f] !== undefined);
  if (allowed.length)
    db.prepare(`UPDATE contact_messages SET ${allowed.map(f=>`${f}=?`).join(',')}, updated_at=? WHERE id=?`)
      .run(...allowed.map(f=>b[f]), now(), req.params.id);
  res.json({ ok: true });
});
app.delete('/api/contact/:id', requireAuth, (req, res) => {
  db.prepare(`DELETE FROM contact_messages WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
//  CRM — production data (costs owner-only; staff sees dealership cars, no $)
// ---------------------------------------------------------------------------
const COST_FIELDS = ['purchase_price','icbc','detailing','transport','boost','tire','repair',
  'windshield','afc_extra','misc_cost','sales_cost','gst_paid','source_type','source_name',
  'acquisition_price','buyer_name','buyer_phone','buyer_email'];
const STAFF_COST_FIELDS = ['registration_done','inspection_done','inspection_data'];

function getCosts(vehicleId) {
  let c = db.prepare(`SELECT * FROM vehicle_costs WHERE vehicle_id=?`).get(vehicleId);
  if (!c) {
    db.prepare(`INSERT INTO vehicle_costs (vehicle_id, updated_at) VALUES (?,?)`).run(vehicleId, now());
    c = db.prepare(`SELECT * FROM vehicle_costs WHERE vehicle_id=?`).get(vehicleId);
  }
  return c;
}

app.get('/api/crm/vehicles', requireAuth, (req, res) => {
  const isOwner = req.user.role === 'owner';
  let vehicles = db.prepare(`SELECT * FROM vehicles WHERE status != 'sold' ORDER BY created_at DESC`).all();
  const rows = vehicles.map(v => {
    const c = getCosts(v.id);
    if (!isOwner && c.location !== 'Dealership') return null;          // staff: dealership only
    const base = { ...attachImages(v),
      location: c.location, registration_done: c.registration_done,
      inspection_done: c.inspection_done, inspection_data: c.inspection_data };
    if (isOwner) COST_FIELDS.forEach(f => base[f] = c[f]);             // costs: owner only
    return base;
  }).filter(Boolean);
  res.json(rows);
});

app.put('/api/crm/vehicles/:id/location', requireAuth, requireOwner, (req, res) => {
  const loc = req.body && req.body.location;
  const LOCS = ['Auction','Mechanic Shop','Dealership','Detail Shop','Body Shop','With Customer',"Owner's Home"];
  if (!LOCS.includes(loc)) return res.status(400).json({ error: 'Invalid location' });
  getCosts(req.params.id);
  db.prepare(`UPDATE vehicle_costs SET location=?, updated_at=? WHERE vehicle_id=?`).run(loc, now(), req.params.id);
  // at_dealership sync: Dealership => visible on website; anything else hidden
  db.prepare(`UPDATE vehicles SET at_dealership=?, updated_at=? WHERE id=?`)
    .run(loc === 'Dealership' ? 1 : 0, now(), req.params.id);
  res.json({ ok: true });
});

app.put('/api/crm/vehicles/:id/costs', requireAuth, (req, res) => {
  const b = req.body || {};
  const isOwner = req.user.role === 'owner';
  const fields = (isOwner ? [...COST_FIELDS, ...STAFF_COST_FIELDS] : STAFF_COST_FIELDS)
    .filter(f => b[f] !== undefined);
  const attempted = Object.keys(b);
  if (!isOwner && attempted.some(f => COST_FIELDS.includes(f)))
    return res.status(403).json({ error: 'Owner access required for cost fields' });
  if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
  getCosts(req.params.id);
  db.prepare(`UPDATE vehicle_costs SET ${fields.map(f=>`${f}=?`).join(',')}, updated_at=? WHERE vehicle_id=?`)
    .run(...fields.map(f=>b[f]), now(), req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
//  Sold ledger (owner only)
// ---------------------------------------------------------------------------
app.get('/api/crm/sold', requireAuth, requireOwner, (req, res) => {
  res.json(db.prepare(`SELECT * FROM sold_records ORDER BY created_at DESC`).all());
});

app.post('/api/crm/sold', requireAuth, requireOwner, (req, res) => {
  const b = req.body || {};
  if (!b.vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const v = db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(b.vehicle_id);
  if (!v) return res.status(404).json({ error: 'Vehicle not found' });
  const c = getCosts(v.id);
  const id = uid();
  db.prepare(`INSERT INTO sold_records (id, vehicle_id, stock_number, year, make, model,
    purchase_price, gst_paid, seller_name, sale_date, selling_price, reserve_non_gst,
    gst_collected, pst_collected, buyer_name, buyer_phone, buyer_email, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, v.id, v.stock_number, v.year, v.make, v.model,
      b.purchase_price ?? c.purchase_price, b.gst_paid ?? c.gst_paid,
      b.seller_name ?? c.source_name, b.sale_date || new Date().toISOString().slice(0,10),
      b.selling_price ?? null, b.reserve_non_gst ?? null,
      b.gst_collected ?? null, b.pst_collected ?? null,
      b.buyer_name ?? c.buyer_name, b.buyer_phone ?? c.buyer_phone, b.buyer_email ?? c.buyer_email, now());
  db.prepare(`UPDATE vehicles SET status='sold', at_dealership=0, updated_at=? WHERE id=?`).run(now(), v.id);
  res.status(201).json({ id });
});

// Return to inventory (fallen-through sale)
app.delete('/api/crm/sold/:id', requireAuth, requireOwner, (req, res) => {
  const r = db.prepare(`SELECT * FROM sold_records WHERE id=?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.vehicle_id) {
    db.prepare(`UPDATE vehicles SET status='available', at_dealership=1, updated_at=? WHERE id=?`)
      .run(now(), r.vehicle_id);
    db.prepare(`UPDATE vehicle_costs SET location='Dealership', updated_at=? WHERE vehicle_id=?`)
      .run(now(), r.vehicle_id);
  }
  db.prepare(`DELETE FROM sold_records WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
//  Backup — owner-only JSON download + restore (merge/replace)
// ---------------------------------------------------------------------------
const BACKUP_TABLES = ['users','vehicles','vehicle_images','vehicle_costs','sold_records',
  'financing_applications','contact_messages'];

app.get('/api/backup', requireAuth, requireOwner, (req, res) => {
  const data = { exported_at: new Date().toISOString() };
  BACKUP_TABLES.forEach(t => data[t] = db.prepare(`SELECT * FROM ${t}`).all());
  if (data.users) data.users = data.users.map(({password_hash, ...u}) => u); // never export hashes
  res.setHeader('Content-Disposition',
    `attachment; filename="amc-backup-${new Date().toISOString().slice(0,10)}.json"`);
  res.json(data);
});

app.post('/api/restore', requireAuth, requireOwner, (req, res) => {
  const { mode, data } = req.body || {};
  if (!data || !['merge','replace'].includes(mode))
    return res.status(400).json({ error: 'mode (merge|replace) and data required' });
  const tables = BACKUP_TABLES.filter(t => t !== 'users' && Array.isArray(data[t]));
  const tx = db.transaction(() => {
    for (const t of tables) {
      if (mode === 'replace') db.prepare(`DELETE FROM ${t}`).run();
      const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
      const pk = t === 'vehicle_costs' ? 'vehicle_id' : 'id';
      for (const row of data[t]) {
        if (mode === 'merge' && row[pk] != null &&
            db.prepare(`SELECT 1 FROM ${t} WHERE ${pk}=?`).get(row[pk])) continue;
        const keys = cols.filter(c => row[c] !== undefined);
        db.prepare(`INSERT OR REPLACE INTO ${t} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`)
          .run(...keys.map(k => row[k]));
      }
    }
  });
  try { tx(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Restore failed: ' + e.message }); }
});

// ---------------------------------------------------------------------------
//  Admin + CRM pages
// ---------------------------------------------------------------------------
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/crm',   (_req, res) => res.sendFile(path.join(__dirname, 'public', 'crm.html')));
app.get('/financing', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'financing.html')));

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
