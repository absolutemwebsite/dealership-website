/* ============================================================================
   Absolute Motor Cars — Public Website Frontend
   Phase 1 · Steps 2-9
   ============================================================================ */

// ---------------------------------------------------------------------------
//  Config (fetched from /api/config on load)
// ---------------------------------------------------------------------------
let CFG = {};
let VEHICLES = [];

// ---------------------------------------------------------------------------
//  Bootstrap
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const r = await fetch('/api/config');
    CFG = await r.json();
  } catch { /* fallback to defaults */ }
  applyConfig();
  loadVehicles();
  setupEventListeners();
  setupMobileMenu();
});

function applyConfig() {
  const p = el => document.getElementById(el);

  // Hero tagline
  if (CFG.tagline) p('hero-tagline').textContent = CFG.tagline;
  else p('hero-tagline').textContent = 'Premium used vehicles in Surrey, BC';

  // Hours
  if (CFG.hours) {
    p('hero-hours').textContent = CFG.hours;
    p('footer-hours').textContent = CFG.hours;
  }

  // Phone
  if (CFG.phone) {
    p('header-phone').textContent = CFG.phone;
    p('header-phone').href = `tel:${CFG.phoneE164 || CFG.phone}`;
    p('footer-phone').textContent = CFG.phone;
  }

  // Address
  if (CFG.address) {
    p('footer-address').textContent = `${CFG.address}, ${CFG.city || ''}, ${CFG.province || ''} ${CFG.postalCode || ''}`;
  }

  // Email
  const em = p('footer-email');
  if (CFG.email) { em.textContent = CFG.email; em.href = `mailto:${CFG.email}`; }
  else em.style.display = 'none';

  // Instagram
  const ig = p('footer-instagram');
  if (CFG.instagram) {
    ig.textContent = CFG.instagram;
    ig.href = `https://instagram.com/${CFG.instagram.replace('@','')}`;
  } else ig.style.display = 'none';

  // WhatsApp
  if (CFG.phoneE164) {
    p('whatsapp-btn').href = `https://wa.me/${CFG.phoneE164}?text=Hi%2C+I%27m+interested+in+a+vehicle+at+Absolute+Motor+Cars.`;
  }

  // Footer year
  p('footer-year').textContent = new Date().getFullYear();
}

// ---------------------------------------------------------------------------
//  Mobile menu
// ---------------------------------------------------------------------------
function setupMobileMenu() {
  const btn = document.getElementById('mobile-menu-btn');
  const nav = document.getElementById('header-nav');
  btn.addEventListener('click', () => nav.classList.toggle('open'));
  // Close on nav click
  nav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => nav.classList.remove('open'));
  });
}

// ---------------------------------------------------------------------------
//  Event Listeners
// ---------------------------------------------------------------------------
function setupEventListeners() {
  // Search
  const search = document.getElementById('search-input');
  search.addEventListener('input', () => renderInventory(VEHICLES));

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderInventory(VEHICLES);
    });
  });

  // Modal triggers
  document.querySelectorAll('[data-modal]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const modal = el.dataset.modal;
      const type = el.dataset.type;
      if (modal === 'contact') openContactModal(type);
      if (modal === 'financing') openFinancingModal();
    });
  });

  // Contact form
  document.getElementById('contact-form').addEventListener('submit', submitContact);

  // Financing form
  document.getElementById('financing-form').addEventListener('submit', submitFinancing);
  document.getElementById('financing-has-trade').addEventListener('change', function() {
    document.getElementById('financing-trade-details').style.display = this.checked ? '' : 'none';
  });
  document.getElementById('financing-has-co').addEventListener('change', function() {
    document.getElementById('financing-co-fields').style.display = this.checked ? '' : 'none';
  });

  // Modal close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.add('hidden'); });
    ov.querySelector('.modal-close')?.addEventListener('click', () => ov.classList.add('hidden'));
  });

  // Escape to close modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
    }
  });
}

// ============================================================================
//  INVENTORY
// ============================================================================
async function loadVehicles() {
  try {
    const r = await fetch('/api/vehicles');
    VEHICLES = await r.json();
    renderInventory(VEHICLES);
    document.getElementById('hero-count').textContent = VEHICLES.length;
  } catch (e) {
    document.getElementById('inventory-grid').innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">🚗</div><p>Unable to load inventory. Please try again.</p></div>';
  }
}

function renderInventory(vehicles) {
  const grid = document.getElementById('inventory-grid');
  const search = document.getElementById('search-input').value.toLowerCase();
  const filter = document.querySelector('.filter-chip.active')?.dataset.filter || 'all';

  let filtered = vehicles;

  // Status filter (note: public API only returns at_dealership + non-sold)
  if (filter === 'available') filtered = filtered.filter(v => v.status === 'available');
  if (filter === 'reserved') filtered = filtered.filter(v => v.status === 'reserved');
  // 'all' shows everything (already filtered by backend)

  // Search
  if (search) {
    filtered = filtered.filter(v =>
      String(v.year).includes(search) ||
      (v.make || '').toLowerCase().includes(search) ||
      (v.model || '').toLowerCase().includes(search) ||
      (v.trim || '').toLowerCase().includes(search)
    );
  }

  document.getElementById('inventory-count').textContent =
    filtered.length === vehicles.length && !filter ? `(${vehicles.length})` : `(${filtered.length})`;

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>No vehicles match your criteria.</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(v => {
    const img = v.images && v.images.length > 0
      ? `<img src="${esc(v.images[0])}" alt="${esc(v.year + ' ' + v.make + ' ' + v.model)}" class="vehicle-card-img">`
      : `<div class="vehicle-card-img-placeholder">🚗</div>`;
    const badge = v.status === 'available' ? '<span class="badge badge-available">Available</span>'
                : v.status === 'reserved'  ? '<span class="badge badge-reserved">Reserved</span>'
                : '';
    const miles = v.mileage ? `${v.mileage.toLocaleString()} km` : '';
    const detail = [miles, v.engine, v.transmission].filter(Boolean).join(' · ');
    return `
      <div class="vehicle-card" data-id="${v.id}">
        ${img}
        <div class="vehicle-card-body">
          <div class="vehicle-card-badge">${badge}</div>
          <div class="vehicle-card-title">${esc(v.year)} ${esc(v.make)} ${esc(v.model)} ${v.trim ? esc(v.trim) : ''}</div>
          <div class="vehicle-card-detail">${esc(detail)}</div>
          <div class="vehicle-card-price">$${v.price.toLocaleString()}</div>
        </div>
      </div>`;
  }).join('');

  // Click handlers
  grid.querySelectorAll('.vehicle-card').forEach(card => {
    card.addEventListener('click', () => openDetailModal(card.dataset.id));
  });
}

// ============================================================================
//  DETAIL MODAL + GALLERY
// ============================================================================
function openDetailModal(id) {
  const v = VEHICLES.find(x => x.id === id);
  if (!v) return;

  const modal = document.getElementById('detail-modal');
  const gallery = document.getElementById('detail-gallery');
  const body = document.getElementById('detail-body');

  // Gallery
  const imgs = v.images || [];
  let currentIdx = 0;
  const updateGallery = () => {
    gallery.innerHTML = `
      <div class="gallery-main-wrap" style="position:relative">
        ${imgs.length ? `<img src="${esc(imgs[currentIdx])}" class="gallery-main" id="gallery-main-img">`
          : `<div style="width:100%;height:400px;background:#111;display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:3rem">🚗</div>`}
        ${imgs.length > 1 ? `
        <div class="gallery-controls">
          <button class="gallery-arrow" id="gallery-prev">◀</button>
          <button class="gallery-arrow" id="gallery-next">▶</button>
        </div>
        <div class="gallery-counter">${currentIdx + 1} / ${imgs.length}</div>` : ''}
      </div>
      ${imgs.length > 1 ? `<div class="gallery-thumbs">${imgs.map((src, i) =>
        `<img src="${esc(src)}" class="gallery-thumb${i === currentIdx ? ' active' : ''}" data-idx="${i}">`
      ).join('')}</div>` : ''}
    `;

    if (imgs.length > 1) {
      document.getElementById('gallery-prev').addEventListener('click', () => {
        currentIdx = (currentIdx - 1 + imgs.length) % imgs.length; updateGallery();
      });
      document.getElementById('gallery-next').addEventListener('click', () => {
        currentIdx = (currentIdx + 1) % imgs.length; updateGallery();
      });
      gallery.querySelectorAll('.gallery-thumb').forEach(t => {
        t.addEventListener('click', () => { currentIdx = parseInt(t.dataset.idx); updateGallery(); });
      });
    }

    // Keyboard nav
    document.addEventListener('keydown', function onKey(e) {
      if (modal.classList.contains('hidden')) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'ArrowLeft') { currentIdx = (currentIdx - 1 + imgs.length) % imgs.length; updateGallery(); }
      if (e.key === 'ArrowRight') { currentIdx = (currentIdx + 1) % imgs.length; updateGallery(); }
    });

    // Touch swipe
    let touchStartX = 0;
    const mainWrap = gallery.querySelector('.gallery-main-wrap');
    if (mainWrap && imgs.length > 1) {
      mainWrap.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
      mainWrap.addEventListener('touchend', e => {
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (diff > 50) { currentIdx = (currentIdx - 1 + imgs.length) % imgs.length; updateGallery(); }
        if (diff < -50) { currentIdx = (currentIdx + 1) % imgs.length; updateGallery(); }
      });
    }
  };
  updateGallery();

  // Specs
  const specs = [
    ['Year', v.year], ['Make', v.make], ['Model', v.model],
    ['Trim', v.trim], ['Mileage', v.mileage ? `${v.mileage.toLocaleString()} km` : ''],
    ['Exterior', v.exterior], ['Interior', v.interior],
    ['Engine', v.engine], ['Transmission', v.transmission],
    ['Drivetrain', v.drivetrain], ['Fuel', v.fuel],
    ['VIN', v.vin], ['Stock #', v.stock_number],
  ].filter(([,val]) => val);
  const badge = v.status === 'available' ? '<span class="badge badge-available">Available</span>'
              : v.status === 'reserved'  ? '<span class="badge badge-reserved">Reserved</span>'
              : '';

  body.innerHTML = `
    <div style="margin-bottom:8px">${badge}</div>
    <div class="modal-title">${esc(v.year)} ${esc(v.make)} ${esc(v.model)} ${v.trim ? esc(v.trim) : ''}</div>
    <div class="modal-price">$${v.price.toLocaleString()}</div>
    <div class="modal-specs">${specs.map(([l,val]) =>
      `<div class="spec-item"><div class="spec-label">${l}</div><div class="spec-value">${esc(String(val))}</div></div>`
    ).join('')}</div>
    ${v.description ? `<div class="modal-description">${esc(v.description)}</div>` : ''}
    <div class="modal-actions">
      <button class="btn btn-primary" id="detail-financing">Get Financing</button>
      <button class="btn" id="detail-contact">Contact Us</button>
    </div>
  `;

  document.getElementById('detail-financing').addEventListener('click', () => {
    modal.classList.add('hidden');
    openFinancingModal(v);
  });
  document.getElementById('detail-contact').addEventListener('click', () => {
    modal.classList.add('hidden');
    openContactModal('general');
  });

  // Detail close
  document.getElementById('detail-close').addEventListener('click', () => modal.classList.add('hidden'));

  modal.classList.remove('hidden');
}

// ============================================================================
//  CONTACT MODAL
// ============================================================================
function openContactModal(type) {
  const modal = document.getElementById('contact-modal');
  document.getElementById('contact-type').value = type || 'general';

  const titles = { 'trade-in': 'Trade-In Appraisal', 'sourcing': 'Vehicle Sourcing', 'general': 'Contact Us' };
  document.getElementById('contact-title').textContent = titles[type] || 'Contact Us';

  const vehicleGroup = document.getElementById('contact-vehicle-group');
  vehicleGroup.style.display = (type === 'trade-in' || type === 'sourcing') ? '' : 'none';

  document.getElementById('contact-alert').classList.add('hidden');
  document.getElementById('contact-form').reset();
  modal.classList.remove('hidden');
}

async function submitContact(e) {
  e.preventDefault();
  const form = e.target;
  const alert = document.getElementById('contact-alert');
  const btn = document.getElementById('contact-submit');

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending...';
  alert.classList.add('hidden');

  const data = Object.fromEntries(new FormData(form));
  try {
    const r = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Failed');
    alert.className = 'alert alert-success'; alert.textContent = 'Thank you! We\'ll get back to you shortly.';
    alert.classList.remove('hidden');
    form.reset();
    setTimeout(() => document.getElementById('contact-modal').classList.add('hidden'), 2000);
  } catch (err) {
    alert.className = 'alert alert-error'; alert.textContent = err.message;
    alert.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.innerHTML = 'Send Message';
  }
}

// ============================================================================
//  FINANCING MODAL
// ============================================================================
function openFinancingModal(vehicle) {
  const modal = document.getElementById('financing-modal');
  if (vehicle) {
    document.getElementById('financing-vehicle').value = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}`;
    document.getElementById('financing-vehicle-id').value = vehicle.id;
  } else {
    document.getElementById('financing-vehicle').value = '';
    document.getElementById('financing-vehicle-id').value = '';
  }
  document.getElementById('financing-alert').classList.add('hidden');
  document.getElementById('financing-form').reset();
  document.getElementById('financing-trade-details').style.display = 'none';
  document.getElementById('financing-co-fields').style.display = 'none';
  modal.classList.remove('hidden');
}

async function submitFinancing(e) {
  e.preventDefault();
  const form = e.target;
  const alert = document.getElementById('financing-alert');
  const btn = form.querySelector('button[type="submit"]');

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Submitting...';
  alert.classList.add('hidden');

  const data = Object.fromEntries(new FormData(form));
  // Convert checkboxes
  data.has_trade_in = data.has_trade_in ? 1 : 0;
  data.has_co_applicant = data.has_co_applicant ? 1 : 0;
  data.consent_credit_check = data.consent_credit_check ? 1 : 0;
  // Convert number fields
  for (const k of ['monthly_housing_payment','years_at_address','months_at_address','years_employed','months_employed','gross_monthly_income','other_income','down_payment']) {
    if (data[k]) data[k] = parseInt(data[k], 10) || 0;
  }

  try {
    const r = await fetch('/api/financing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Failed');
    alert.className = 'alert alert-success'; alert.textContent = 'Application submitted! We\'ll be in touch soon.';
    alert.classList.remove('hidden');
    setTimeout(() => document.getElementById('financing-modal').classList.add('hidden'), 2500);
  } catch (err) {
    alert.className = 'alert alert-error'; alert.textContent = err.message;
    alert.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.innerHTML = 'Submit Application';
  }
}

// ============================================================================
//  HELPERS
// ============================================================================
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
