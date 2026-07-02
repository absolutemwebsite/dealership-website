/* ============================================================================
   Absolute Motor Cars — Public Site JavaScript
   Dynamic inventory, detail modal, contact form, animations
   ============================================================================ */

// --- Scroll header ---
const head = document.getElementById('head');
addEventListener('scroll', () => head.classList.toggle('scrolled', scrollY > 40));

// --- Mobile menu ---
const burger = document.getElementById('burger'), nl = document.getElementById('navlinks');
burger.addEventListener('click', () => nl.classList.toggle('open'));
nl.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nl.classList.remove('open')));

// --- Reveal animations ---
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .15 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// ============================================================================
//  INVENTORY — loaded from /api/vehicles
// ============================================================================
let ALL_VEHICLES = [];

async function loadInventory() {
  try {
    const r = await fetch('/api/vehicles');
    ALL_VEHICLES = await r.json();
    renderCards(ALL_VEHICLES);
    renderMakes(ALL_VEHICLES);
    document.getElementById('hero-count').textContent = ALL_VEHICLES.length;
  } catch (e) {
    document.getElementById('inv-grid').innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">Unable to load inventory. Please try again.</div>';
  }
}

function renderCards(vehicles) {
  const grid = document.getElementById('inv-grid');
  if (!vehicles.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">No vehicles currently available. Check back soon.</div>';
    return;
  }
  grid.innerHTML = vehicles.map(v => {
    const img = (v.images && v.images.length) ? v.images[0] : 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=800&auto=format&fit=crop';
    const tag = v.status === 'available' ? (v.trim || v.make) : v.status;
    const km = v.mileage ? `${v.mileage.toLocaleString()} km` : '';
    const color = v.exterior || '';
    const price = v.price ? `$${v.price.toLocaleString()}` : 'Call';
    return `
    <article class="card" data-id="${v.id}">
      <div class="card-img">
        <span class="tag">${esc(tag)}</span>
        <img src="${esc(img)}" alt="${v.year} ${v.make} ${v.model}" loading="lazy">
      </div>
      <div class="card-body">
        <div class="yr">${v.year}</div>
        <h3>${esc(v.make)} ${esc(v.model)} ${v.trim ? esc(v.trim) : ''}</h3>
        <div class="card-specs">
          ${km ? `<span>◷ ${esc(km)}</span>` : ''}
          ${color ? `<span>● ${esc(color)}</span>` : ''}
        </div>
        <div class="card-foot">
          <span class="price">${price}</span>
          <a href="#" class="detail-link">View Details →</a>
        </div>
      </div>
    </article>`;
  }).join('');

  // Click handlers
  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.detail-link')) { e.preventDefault(); }
      openDetail(card.dataset.id);
    });
  });
}

function renderMakes(vehicles) {
  const makes = [...new Set(vehicles.map(v => v.make).filter(Boolean))].sort();
  document.getElementById('makes-row').innerHTML = makes.map(m =>
    `<span class="make-pill" data-make="${esc(m)}">${esc(m)}</span>`
  ).join('');

  document.querySelectorAll('.make-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const make = pill.dataset.make;
      const filtered = ALL_VEHICLES.filter(v => v.make === make);
      renderCards(filtered);
      document.getElementById('inventory').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// Reset filter
document.getElementById('see-all-btn').addEventListener('click', e => {
  e.preventDefault();
  renderCards(ALL_VEHICLES);
});

// ============================================================================
//  VEHICLE DETAIL MODAL
// ============================================================================
let detailIdx = 0, detailImgs = [];

function openDetail(id) {
  const v = ALL_VEHICLES.find(x => x.id === id);
  if (!v) return;
  detailImgs = v.images && v.images.length ? v.images : [];
  detailIdx = 0;
  renderDetail(v);
  document.getElementById('detail-modal').classList.remove('hidden');
}

function renderDetail(v) {
  const modal = document.getElementById('detail-inner');
  const badge = v.status === 'available' ? '<span class="status-badge status-available">Available</span>'
              : v.status === 'reserved' ? '<span class="status-badge status-reserved">Reserved</span>'
              : '<span class="status-badge status-sold">Sold</span>';

  const specs = [
    ['Year', v.year], ['Make', v.make], ['Model', v.model],
    ['Trim', v.trim], ['Mileage', v.mileage ? `${v.mileage.toLocaleString()} km` : ''],
    ['Exterior', v.exterior], ['Interior', v.interior],
    ['Engine', v.engine], ['Transmission', v.transmission],
    ['Drivetrain', v.drivetrain], ['Fuel', v.fuel],
    ['VIN', v.vin], ['Stock #', v.stock_number],
  ].filter(([,val]) => val);

  modal.innerHTML = `
    <div class="gallery-wrap" style="position:relative">
      ${detailImgs.length
        ? `<img src="${esc(detailImgs[detailIdx])}" class="gallery-main" id="gallery-img">`
        : `<div style="width:100%;height:400px;background:#000;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:3rem">🚗</div>`}
      ${detailImgs.length > 1 ? `
        <button class="gallery-arrow gallery-left" id="gallery-prev">◀</button>
        <button class="gallery-arrow gallery-right" id="gallery-next">▶</button>
        <div class="gallery-counter">${detailIdx + 1} / ${detailImgs.length}</div>
      ` : ''}
      <button class="modal-close" id="modal-close-btn">&times;</button>
    </div>
    <div class="modal-body">
      ${badge}
      <div class="modal-title">${v.year} ${esc(v.make)} ${esc(v.model)} ${v.trim ? esc(v.trim) : ''}</div>
      <div class="modal-price">$${v.price.toLocaleString()}</div>
      <div class="spec-grid">${specs.map(([l,val]) => `
        <div class="spec-item"><div class="spec-label">${l}</div><div class="spec-value">${esc(String(val))}</div></div>
      `).join('')}</div>
      ${v.description ? `<p style="color:var(--muted);line-height:1.7;margin-bottom:20px;font-family:'Inter'">${esc(v.description)}</p>` : ''}
      <div class="modal-actions">
        <button class="btn btn-solid" id="detail-financing">Apply for Financing</button>
        <a href="#contact" class="btn btn-ghost">Contact Us</a>
      </div>
    </div>`;

  // Close
  document.getElementById('modal-close-btn').addEventListener('click', closeDetail);

  // Financing button opens financing modal
  document.getElementById('detail-financing').addEventListener('click', () => {
    closeDetail();
    openFinancing(v);
  });

  // Gallery nav
  if (detailImgs.length > 1) {
    document.getElementById('gallery-prev').addEventListener('click', () => {
      detailIdx = (detailIdx - 1 + detailImgs.length) % detailImgs.length;
      document.getElementById('gallery-img').src = detailImgs[detailIdx];
      document.querySelector('.gallery-counter').textContent = `${detailIdx + 1} / ${detailImgs.length}`;
    });
    document.getElementById('gallery-next').addEventListener('click', () => {
      detailIdx = (detailIdx + 1) % detailImgs.length;
      document.getElementById('gallery-img').src = detailImgs[detailIdx];
      document.querySelector('.gallery-counter').textContent = `${detailIdx + 1} / ${detailImgs.length}`;
    });
  }
}

function closeDetail() {
  document.getElementById('detail-modal').classList.add('hidden');
}

// Close on overlay click + escape
document.getElementById('detail-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('detail-modal')) closeDetail();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDetail();
});

// Keyboard gallery nav
document.addEventListener('keydown', e => {
  if (document.getElementById('detail-modal').classList.contains('hidden')) return;
  if (e.key === 'ArrowLeft' && detailImgs.length > 1) {
    detailIdx = (detailIdx - 1 + detailImgs.length) % detailImgs.length;
    document.getElementById('gallery-img').src = detailImgs[detailIdx];
    document.querySelector('.gallery-counter').textContent = `${detailIdx + 1} / ${detailImgs.length}`;
  }
  if (e.key === 'ArrowRight' && detailImgs.length > 1) {
    detailIdx = (detailIdx + 1) % detailImgs.length;
    document.getElementById('gallery-img').src = detailImgs[detailIdx];
    document.querySelector('.gallery-counter').textContent = `${detailIdx + 1} / ${detailImgs.length}`;
  }
});

// ============================================================================
//  CONTACT FORM
// ============================================================================
document.getElementById('lead').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const status = document.getElementById('form-status');
  btn.textContent = 'Sending…'; btn.disabled = true;
  status.textContent = '';

  const fd = new FormData(e.target);
  const data = {
    type: 'general',
    name: `${fd.get('first_name')} ${fd.get('last_name')}`,
    email: fd.get('email'),
    phone: fd.get('phone'),
    message: fd.get('message') || '',
  };

  try {
    const r = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to send');
    status.style.color = '#22c55e';
    status.textContent = 'Thank you — we\'ll be in touch shortly.';
    e.target.reset();
  } catch (err) {
    status.style.color = '#ef4444';
    status.textContent = 'Something went wrong. Please try again or call us.';
  }

  btn.textContent = 'Send Request'; btn.disabled = false;
  setTimeout(() => { status.textContent = ''; }, 5000);
});

// ============================================================================
//  FINANCING APPLICATION
// ============================================================================
function openFinancing(v) {
  const modal = document.getElementById('fin-modal');
  if (v) {
    document.getElementById('fin-vehicle-field').value = `${v.year} ${v.make} ${v.model} ${v.trim||''}`;
    document.getElementById('fin-vehicle-id').value = v.id;
  } else {
    document.getElementById('fin-vehicle-field').value = '';
    document.getElementById('fin-vehicle-id').value = '';
  }
  document.getElementById('fin-form').reset();
  document.getElementById('fin-status').textContent = '';
  document.getElementById('fin-trade-details').style.display = 'none';
  document.getElementById('fin-co-fields').style.display = 'none';
  modal.classList.remove('hidden');
}

document.getElementById('fin-has-trade').addEventListener('change', function() {
  document.getElementById('fin-trade-details').style.display = this.checked ? '' : 'none';
});
document.getElementById('fin-has-co').addEventListener('change', function() {
  document.getElementById('fin-co-fields').style.display = this.checked ? '' : 'none';
});

document.getElementById('fin-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const status = document.getElementById('fin-status');
  btn.disabled = true; btn.textContent = 'Submitting…';
  status.textContent = '';

  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);
  data.has_trade_in = data.has_trade_in ? 1 : 0;
  data.has_co_applicant = data.has_co_applicant ? 1 : 0;
  data.consent_credit_check = data.consent_credit_check ? 1 : 0;
  for (const k of ['monthly_housing_payment','years_at_address','months_at_address','years_employed','months_employed','gross_monthly_income','other_income','down_payment']) {
    if (data[k]) data[k] = parseInt(data[k],10) || 0;
  }

  try {
    const r = await fetch('/api/financing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to submit');
    status.style.color = '#22c55e';
    status.textContent = 'Application submitted! We\'ll be in touch within 24 hours.';
    e.target.reset();
    setTimeout(() => document.getElementById('fin-modal').classList.add('hidden'), 2500);
  } catch (err) {
    status.style.color = '#ef4444';
    status.textContent = 'Something went wrong. Please try again or call us directly.';
  }
  btn.disabled = false; btn.textContent = 'Submit Application';
});

// Wire nav CTA to financing modal
document.querySelector('.nav-cta').addEventListener('click', e => {
  e.preventDefault();
  openFinancing();
});

// Close fin-modal on overlay click
document.getElementById('fin-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

// ============================================================================
//  INIT
// ============================================================================
loadInventory();

// ============================================================================
//  HELPERS
// ============================================================================
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
