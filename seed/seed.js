/* ==========================================================================
 *  Seed script — populates the database with all 51 vehicles and downloads
 *  their images from the original CDN in the exact website order.
 *
 *  Each image gets a UNIQUE filename: <vehicleIdPrefix>-<sortOrder>.jpg
 *  so vehicles never share or overwrite each other's images.
 *
 *  Idempotent: skips vehicles that already have images downloaded.
 * ========================================================================== */

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const http   = require('http');

const SEED_DATA = require('./vehicles.json');
const uid = () => crypto.randomUUID();

/**
 * Download a single image, returning the filename on success.
 * Filename format: <vehiclePrefix>-<sortIndex>.jpg  (unique per vehicle)
 */
function downloadImage(url, destDir, prefix, index) {
  return new Promise((resolve) => {
    const fname = `${prefix}-${String(index).padStart(4, '0')}.jpg`;
    const dest = path.join(destDir, fname);

    if (fs.existsSync(dest) && fs.statSync(dest).size > 5000) {
      return resolve(fname); // already present
    }

    const client = url.startsWith('https') ? https : http;
    client.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://absolutemotorcars.ca/' },
      timeout: 20000,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        return downloadImage(res.headers.location, destDir, prefix, index).then(resolve);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length > 5000) {
          fs.writeFileSync(dest, buf);
          resolve(fname);
        } else {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null))
      .on('timeout', function () { this.destroy(); resolve(null); });
  });
}

/**
 * Seed the database and download images into the uploads directory.
 *
 * @param {Database} db       — better-sqlite3 instance (already open, schema created)
 * @param {string} uploadsDir — absolute path to the uploads directory
 */
async function seedDatabase(db, uploadsDir) {
  const now = Date.now();
  const bcrypt = require('bcryptjs');

  // -----------------------------------------------------------------------
  //  Preparations
  // -----------------------------------------------------------------------
  fs.mkdirSync(uploadsDir, { recursive: true });

  const insertVeh = db.prepare(`INSERT OR REPLACE INTO vehicles 
    (id, stock_number, year, make, model, trim, price, mileage, exterior, interior, 
     engine, transmission, drivetrain, fuel, vin, status, description, at_dealership, 
     created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const insertImg = db.prepare(`INSERT OR REPLACE INTO vehicle_images 
    (id, vehicle_id, filename, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`);

  const insertCosts = db.prepare(`INSERT OR REPLACE INTO vehicle_costs 
    (vehicle_id, location, updated_at) VALUES (?, 'Dealership', ?)`);

  const upsertUser = db.prepare(`INSERT OR IGNORE INTO users 
    (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`);

  // Map vin → uuid so we reuse the same vehicle ID across re-seeds
  const getVehicleId = db.prepare(`SELECT id FROM vehicles WHERE vin = ?`);

  console.log(`[seed] Populating database with ${SEED_DATA.length} vehicles...`);

  // -----------------------------------------------------------------------
  //  Phase 1 — Insert vehicle records (transaction)
  // Insert vehicle records with VIN-based stock numbers
  const vehicleIds = []; // [ { id, vin, prefix, images[] }, ... ]

  const insertTx = db.transaction(() => {
    for (const v of SEED_DATA) {
      const vin = v.vin || '';
      const existing = vin ? getVehicleId.get(vin) : null;
      const vid = existing ? existing.id : uid();
      const mileageKm = v.mileage || null;
      // Stock number = last 6 of VIN (uppercase)
      const stockNumber = (v.stock_number || (vin.length >= 6 ? vin.slice(-6).toUpperCase() : '')) || null;
      const prefix = vid.split('-')[0] || vid.slice(0, 8);

      insertVeh.run(
        vid, stockNumber, v.year, v.make, v.model,
        v.trim || null, v.price, mileageKm,
        v.exterior || null, v.interior || null,
        v.engine || null, v.transmission || null,
        v.drivetrain || null, v.fuel || null,
        vin || null, v.status || 'available',
        v.description || null,
        v.at_dealership != null ? v.at_dealership : 1,
        now, now
      );

      insertCosts.run(vid, now);

      // Insert image records with UNIQUE filenames
      const urls = Array.isArray(v.images) ? v.images : [];
      urls.forEach((url, i) => {
        const fname = `${prefix}-${String(i).padStart(4, '0')}.jpg`;
        insertImg.run(uid(), vid, fname, i, now);
      });

      vehicleIds.push({ id: vid, vin, prefix, urls });
    }
  });

  insertTx();

  // Count what we have
  const dbCount = db.prepare('SELECT COUNT(*) c FROM vehicles').get().c;
  console.log(`[seed] ${dbCount} vehicles in database.`);

  // Create admin users
  const pwHash = bcrypt.hashSync('admin123', 12);
  const userTx = db.transaction(() => {
    upsertUser.run(uid(), 'owner', pwHash, 'owner', now);
    upsertUser.run(uid(), 'staff', pwHash, 'staff', now);
  });
  userTx();
  console.log('[seed] Admin users created (owner/admin123, staff/admin123).');

  // -----------------------------------------------------------------------
  //  Phase 2 — Download images (one vehicle at a time to name correctly)
  //  Each vehicle's images are downloaded sequentially (not parallel) to
  //  avoid overwhelming the CDN and to ensure correct ordering.
  // -----------------------------------------------------------------------
  console.log('[seed] Downloading vehicle images from CDN...');

  let totalOk = 0;
  let totalFail = 0;

  for (let vi = 0; vi < vehicleIds.length; vi++) {
    const { prefix, urls } = vehicleIds[vi];
    if (!urls.length) continue;

    for (let i = 0; i < urls.length; i++) {
      const result = await downloadImage(urls[i], uploadsDir, prefix, i);
      if (result) totalOk++;
      else totalFail++;
    }

    if (vi % 10 === 0 || vi === vehicleIds.length - 1) {
      console.log(`[seed]  ${vi + 1}/${vehicleIds.length} vehicles (${totalOk} OK, ${totalFail} failed)`);
    }
  }

  console.log(`[seed] Image download complete: ${totalOk} OK, ${totalFail} failed`);
}

module.exports = { seedDatabase };
