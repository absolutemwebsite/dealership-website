/* ==========================================================================
 *  Seed script — populates an empty database with all 51 vehicles.
 *  Images are downloaded from the original CDN URLs in website order.
 *  Run by server.js on startup when the vehicles table is empty.
 * ========================================================================== */

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');
const https  = require('https');

const SEED_DATA = require('./vehicles.json');

const uid = () => crypto.randomUUID();

/**
 * Download an image from a thumbor CDN URL to the uploads directory.
 * Returns the filename on success, null on failure.
 */
function downloadImage(url, destDir, index) {
  return new Promise((resolve) => {
    // Build a clean filename: sort-order based filename for ordering
    const ext = '.jpg';
    const fname = `${String(index).padStart(4, '0')}${ext}`;
    const dest = path.join(destDir, fname);

    if (fs.existsSync(dest) && fs.statSync(dest).size > 5000) {
      return resolve(fname); // already downloaded
    }

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://absolutemotorcars.ca/' } }, (res) => {
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
    }).on('error', () => resolve(null));
  });
}

/**
 * Seed the database with all 51 vehicles and their images.
 * Called by server.js on startup when vehicles table is empty.
 */
async function seedDatabase(db, uploadsDir) {
  const now = Date.now();
  const insertVeh = db.prepare(`INSERT INTO vehicles 
    (id, stock_number, year, make, model, trim, price, mileage, exterior, interior, 
     engine, transmission, drivetrain, fuel, vin, status, description, at_dealership, 
     created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const insertImg = db.prepare(`INSERT INTO vehicle_images 
    (id, vehicle_id, filename, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`);

  const insertCosts = db.prepare(`INSERT INTO vehicle_costs 
    (vehicle_id, location, updated_at) VALUES (?, 'Dealership', ?)`);

  const upsertUser = db.prepare(`INSERT OR IGNORE INTO users 
    (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`);

  console.log(`[seed] Populating database with ${SEED_DATA.length} vehicles...`);

  const tx = db.transaction(() => {
    for (const v of SEED_DATA) {
      const vid = uid();
      
      // Convert miles to km
      const mileageKm = v.mileage ? Math.round(v.mileage * 1.609) : null;

      insertVeh.run(
        vid,
        v.stock_number || null,
        v.year,
        v.make,
        v.model,
        v.trim || null,
        v.price,
        mileageKm,
        v.exterior || null,
        v.interior || null,
        v.engine || null,
        v.transmission || null,
        v.drivetrain || null,
        v.fuel || null,
        v.vin || null,
        v.status || 'available',
        v.description || null,
        v.at_dealership != null ? v.at_dealership : 1,
        now, now
      );

      insertCosts.run(vid, now);

      // Insert image records with correct sort order
      const urls = Array.isArray(v.images) ? v.images : [];
      urls.forEach((url, i) => {
        insertImg.run(uid(), vid, String(i).padStart(4, '0') + '.jpg', i, now);
      });
    }
  });

  tx();
  console.log(`[seed] ${SEED_DATA.length} vehicles inserted.`);

  // Create default admin users (so env vars don't need to be set for migration)
  // These are overwritten server.js seedUsers() if env vars are present
  const bcrypt = require('bcryptjs');
  const pwHash = bcrypt.hashSync('admin123', 12);
  
  const userTx = db.transaction(() => {
    upsertUser.run(uid(), 'owner', pwHash, 'owner', now);
    upsertUser.run(uid(), 'staff', pwHash, 'staff', now);
  });
  userTx();
  console.log('[seed] Admin users created (owner/admin123, staff/admin123).');

  // Download images from CDN (async, with concurrency)
  console.log('[seed] Downloading vehicle images from CDN...');
  fs.mkdirSync(uploadsDir, { recursive: true });

  let totalDownloaded = 0;
  let totalFailed = 0;

  for (let vi = 0; vi < SEED_DATA.length; vi++) {
    const v = SEED_DATA[vi];
    if (!Array.isArray(v.images) || v.images.length === 0) continue;

    const results = await Promise.allSettled(
      v.images.map((url, i) => downloadImage(url, uploadsDir, i))
    );

    const ok = results.filter(r => r.status === 'fulfilled' && r.value).length;
    totalDownloaded += ok;
    totalFailed += v.images.length - ok;

    if (vi % 10 === 0 || vi === SEED_DATA.length - 1) {
      console.log(`[seed]  ${vi + 1}/${SEED_DATA.length} vehicles processed (${totalDownloaded} images OK, ${totalFailed} failed)`);
    }
  }

  console.log(`[seed] Image download complete: ${totalDownloaded} OK, ${totalFailed} failed`);
}

module.exports = { seedDatabase };
