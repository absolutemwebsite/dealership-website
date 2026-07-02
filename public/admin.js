/* ============================================================================
   Absolute Motor Cars — Admin Dashboard
   Phase 1 · Steps 3-9
   ============================================================================ */

let TOKEN = localStorage.getItem('amc_token') || '';
let USER = null;
let ALL_VEHICLES = [];
let EDITING_ID = null;

// ---------------------------------------------------------------------------
//  Bootstrap
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (TOKEN) tryAutoLogin();

  // Login form
  document.getElementById('login-form').addEventListener('submit', doLogin);

  // Tab navigation
  document.querySelectorAll('[data-tab]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      switchTab(a.dataset.tab);
    });
  });

  // Add vehicle
  document.getElementById('add-vehicle-btn').addEventListener('click', showVehicleForm);

  // Vehicle form
  document.getElementById('veh-form').addEventListener('submit', saveVehicle);
  document.getElementById('veh-cancel-btn').addEventListener('click', hideVehicleForm);

  // Image upload
  document.getElementById('images-upload-area').addEventListener('click', () => document.getElementById('images-input').click());
  document.getElementById('images-input').addEventListener('change', handleImageUpload);
  // Drag & drop
  const dropArea = document.getElementById('images-upload-area');
  dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.style.borderColor = 'var(--accent)'; });
  dropArea.addEventListener('dragleave', () => { dropArea.style.borderColor = 'var(--border)'; });
  dropArea.addEventListener('drop', e => {
    e.preventDefault(); dropArea.style.borderColor = 'var(--border)';
    const files = e.dataTransfer.files;
    if (files.length && EDITING_ID) uploadImages(files);
  });

  // VIN decode
  const vinInput = document.getElementById('admin-vin');
  vinInput.addEventListener('input', () => {
    const len = vinInput.value.replace(/\s/g, '').length;
    document.getElementById('admin-vin-counter').textContent = `${len}/17`;
    document.getElementById('admin-vin-decode').disabled = len !== 17;
  });
  document.getElementById('admin-vin-decode').addEventListener('click', decodeVIN);

  // Financing filter
  document.getElementById('financing-filter').addEventListener('change', loadFinancing);

  // Logout
  document.getElementById('logout-btn').addEventListener('click', doLogout);
});

// ---------------------------------------------------------------------------
//  Auth
// ---------------------------------------------------------------------------
async function doLogin(e) {
  e.preventDefault();
  const alert = document.getElementById('login-alert');
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Logging in...';

  const fd = new FormData(e.target);
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Invalid credentials');
    const data = await r.json();
    TOKEN = data.token;
    USER = data.user;
    localStorage.setItem('amc_token', TOKEN);
    showAdmin();
  } catch (err) {
    alert.className = 'alert alert-error'; alert.textContent = err.message; alert.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Log In';
  }
}

async function tryAutoLogin() {
  try {
    const r = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    if (r.ok) { USER = await r.json(); showAdmin(); return; }
  } catch {}
  localStorage.removeItem('amc_token');
  TOKEN = '';
}

function doLogout() {
  localStorage.removeItem('amc_token');
  TOKEN = ''; USER = null;
  document.getElementById('admin-login').style.display = '';
  document.getElementById('admin-shell').style.display = 'none';
}

function showAdmin() {
  document.getElementById('admin-login').style.display = 'none';
  document.getElementById('admin-shell').style.display = 'flex';
  document.getElementById('sidebar-user').textContent = `${USER.username} (${USER.role})`;
  loadInventory();
  loadFinancing();
  loadContacts();
}

// ---------------------------------------------------------------------------
//  Tabs
// ---------------------------------------------------------------------------
function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('[data-tab]').forEach(a => a.classList.remove('active'));
  const tab = document.getElementById(`tab-${name}`);
  if (tab) tab.classList.add('active');
  const link = document.querySelector(`[data-tab="${name}"]`);
  if (link) link.classList.add('active');
}

// ---------------------------------------------------------------------------
//  API helper
// ---------------------------------------------------------------------------
async function api(url, options = {}) {
  if (!options.headers) options.headers = {};
  if (TOKEN) options.headers['Authorization'] = `Bearer ${TOKEN}`;
  const r = await fetch(url, options);
  if (r.status === 401) { doLogout(); throw new Error('Session expired'); }
  return r;
}

// ---------------------------------------------------------------------------
//  Inventory
// ---------------------------------------------------------------------------
async function loadInventory() {
  try {
    const r = await api('/api/vehicles');
    ALL_VEHICLES = await r.json();
    renderInventoryTable();
  } catch {}
}

function renderInventoryTable() {
  const tbody = document.getElementById('inventory-tbody');
  tbody.innerHTML = ALL_VEHICLES.map(v => `
    <tr>
      <td>${esc(v.stock_number || '—')}</td>
      <td>${v.year}</td>
      <td>${esc(v.make)}</td>
      <td>${esc(v.model)} ${esc(v.trim || '')}</td>
      <td>$${v.price.toLocaleString()}</td>
      <td><span class="badge badge-${v.status}">${v.status}</span></td>
      <td>${(v.images || []).length}</td>
      <td class="actions">
        <button class="btn btn-sm" onclick="editVehicle('${v.id}')">Edit</button>
        <button class="btn btn-sm" style="color:var(--danger)" onclick="deleteVehicle('${v.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function showVehicleForm() {
  EDITING_ID = null;
  document.getElementById('veh-form-title').textContent = 'Add New Vehicle';
  document.getElementById('veh-form').reset();
  document.getElementById('veh-edit-id').value = '';
  document.getElementById('veh-images-section').style.display = 'none';
  document.getElementById('images-preview').innerHTML = '';
  document.getElementById('vehicle-form').style.display = '';
}

function editVehicle(id) {
  const v = ALL_VEHICLES.find(x => x.id === id);
  if (!v) return;
  EDITING_ID = id;
  document.getElementById('veh-form-title').textContent = `Edit: ${v.year} ${v.make} ${v.model}`;
  document.getElementById('veh-edit-id').value = id;
  ['stock_number','vin','year','make','model','trim','price','mileage','exterior','interior','engine','transmission','drivetrain','fuel','status','description'].forEach(f => {
    const el = document.querySelector(`[name="${f}"]`);
    if (el) el.value = v[f] != null ? v[f] : '';
  });
  document.getElementById('vehicle-form').style.display = '';
  document.getElementById('veh-images-section').style.display = '';
  renderImagePreviews(v.images || []);
  document.getElementById('admin-vin-counter').textContent = `${(v.vin || '').length}/17`;
}

function hideVehicleForm() {
  document.getElementById('vehicle-form').style.display = 'none';
  EDITING_ID = null;
}

async function saveVehicle(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = {};
  for (const [k, v] of fd) { if (k !== 'id' || v) data[k] = v; }
  // Convert numbers
  for (const k of ['year','price','mileage']) { if (data[k]) data[k] = parseInt(data[k], 10); }

  const id = data.id;
  delete data.id;
  const btn = document.getElementById('veh-submit-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const r = await api(id ? `/api/vehicles/${id}` : '/api/vehicles', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Failed');
    await loadInventory();
    hideVehicleForm();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Vehicle';
  }
}

async function deleteVehicle(id) {
  if (!confirm('Delete this vehicle? This cannot be undone.')) return;
  try {
    await api(`/api/vehicles/${id}`, { method: 'DELETE' });
    await loadInventory();
  } catch (err) { alert('Error: ' + err.message); }
}

// ---------------------------------------------------------------------------
//  Images
// ---------------------------------------------------------------------------
function renderImagePreviews(images) {
  const container = document.getElementById('images-preview');
  container.innerHTML = images.map((url, i) => {
    const fname = url.split('/').pop();
    return `<div class="images-preview-item">
      <img src="${esc(url)}" alt="">
      <button class="remove-btn" onclick="deleteImage('${EDITING_ID}','${esc(fname)}')">&times;</button>
    </div>`;
  }).join('');
}

function handleImageUpload() {
  const files = document.getElementById('images-input').files;
  if (files.length && EDITING_ID) uploadImages(files);
}

async function uploadImages(files) {
  if (!EDITING_ID) return;
  const fd = new FormData();
  for (const f of files) fd.append('images', f);
  const status = document.getElementById('images-upload-status');
  status.innerHTML = '<span class="spinner"></span> Uploading...';
  try {
    const r = await api(`/api/vehicles/${EDITING_ID}/images`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error((await r.json()).error || 'Failed');
    status.textContent = 'Uploaded!';
    await loadInventory();
    // Refresh previews
    const v = ALL_VEHICLES.find(x => x.id === EDITING_ID);
    if (v) renderImagePreviews(v.images || []);
    document.getElementById('images-input').value = '';
  } catch (err) { status.textContent = 'Error: ' + err.message; }
}

async function deleteImage(vehicleId, filename) {
  try {
    await api(`/api/vehicles/${vehicleId}/images/${filename}`, { method: 'DELETE' });
    await loadInventory();
    const v = ALL_VEHICLES.find(x => x.id === vehicleId);
    if (v) renderImagePreviews(v.images || []);
  } catch {}
}

// ---------------------------------------------------------------------------
//  VIN Decode
// ---------------------------------------------------------------------------
async function decodeVIN() {
  const vinInput = document.getElementById('admin-vin');
  const btn = document.getElementById('admin-vin-decode');
  const vin = vinInput.value.replace(/\s/g, '');
  if (vin.length !== 17) return;

  btn.textContent = '...'; btn.disabled = true;

  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    const data = await r.json();
    const result = data.Results?.[0] || {};
    if (result.Make && result.Make !== '') {
      document.querySelector('[name="make"]').value = titleCase(result.Make);
    }
    if (result.Model && result.Model !== '') {
      document.querySelector('[name="model"]').value = titleCase(result.Model);
    }
    if (result.ModelYear && result.ModelYear !== '') {
      document.querySelector('[name="year"]').value = result.ModelYear;
    }
    btn.textContent = '✓'; btn.style.color = 'var(--success)';
  } catch {
    btn.textContent = '✗'; btn.style.color = 'var(--danger)';
  }
  setTimeout(() => { btn.textContent = 'Decode'; btn.disabled = false; btn.style.color = ''; }, 2000);
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ---------------------------------------------------------------------------
//  Financing
// ---------------------------------------------------------------------------
async function loadFinancing() {
  try {
    const r = await api('/api/financing');
    const apps = await r.json();
    const filter = document.getElementById('financing-filter').value;
    const filtered = filter === 'all' ? apps : apps.filter(a => a.status === filter);
    const newCount = apps.filter(a => a.status === 'new').length;
    const badge = document.getElementById('financing-badge');
    if (newCount > 0) { badge.style.display = ''; badge.textContent = newCount; }
    else { badge.style.display = 'none'; }

    const container = document.getElementById('financing-list');
    container.innerHTML = filtered.map(a => `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:12px">
          <div>
            <strong>${esc(a.first_name)} ${esc(a.last_name)}</strong>
            <span class="badge badge-${a.status === 'new' ? 'available' : a.status === 'approved' ? 'available' : ''}" style="margin-left:8px">${a.status}</span>
            <div style="font-size:0.8rem;color:var(--dim)">${esc(a.email)} · ${esc(a.phone)}</div>
            <div style="font-size:0.8rem;color:var(--dim)">Vehicle: ${esc(a.vehicle_of_interest || 'N/A')}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" onclick="updateFinancingStatus('${a.id}','in_review')">Review</button>
            <button class="btn btn-sm" onclick="updateFinancingStatus('${a.id}','approved')">Approve</button>
            <button class="btn btn-sm" onclick="updateFinancingStatus('${a.id}','archived')">Archive</button>
          </div>
        </div>
        <details style="margin-top:8px"><summary style="cursor:pointer;color:var(--dim);font-size:0.8rem">Details</summary>
          <div style="margin-top:8px;font-size:0.8rem;display:grid;grid-template-columns:1fr 1fr;gap:4px">
            ${renderFinancingDetails(a)}
          </div>
        </details>
      </div>
    `).join('') || '<p style="color:var(--dim)">No applications found.</p>';
  } catch {}
}

function renderFinancingDetails(a) {
  const fields = [
    ['DOB', a.date_of_birth], ['Marital', a.marital_status],
    ['Address', `${a.street_address}, ${a.city}, ${a.province} ${a.postal_code}`],
    ['Housing', `${a.housing_status} — $${(a.monthly_housing_payment || 0).toLocaleString()}`],
    ['Employment', `${a.employment_status} — ${a.employer_name || ''} (${a.job_title || ''})`],
    ['Gross Income', `$${(a.gross_monthly_income || 0).toLocaleString()}`],
    ['Other Income', `$${(a.other_income || 0).toLocaleString()} (${a.other_income_source || ''})`],
    ['Down Payment', `$${(a.down_payment || 0).toLocaleString()}`],
    ['Trade-in', a.has_trade_in ? `Yes — ${a.trade_in_details || ''}` : 'No'],
    ['Co-applicant', a.has_co_applicant ? `${a.co_applicant_name || ''} (${a.co_applicant_relationship || ''}) ${a.co_applicant_phone || ''}` : 'No'],
    ['Notes', a.notes], ['Admin Notes', a.admin_notes],
  ];
  return fields.filter(([,v]) => v).map(([k,v]) => `<div><strong style="color:var(--dim2)">${k}:</strong> ${esc(String(v))}</div>`).join('');
}

async function updateFinancingStatus(id, status) {
  try {
    await api(`/api/financing/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    loadFinancing();
  } catch {}
}

// ---------------------------------------------------------------------------
//  Contacts
// ---------------------------------------------------------------------------
async function loadContacts() {
  try {
    const r = await api('/api/contact');
    const msgs = await r.json();
    const container = document.getElementById('contacts-list');
    container.innerHTML = msgs.map(m => `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:12px">
          <div>
            <strong>${esc(m.name)}</strong>
            <span style="color:var(--dim);font-size:0.75rem;margin-left:8px">${esc(m.type)}</span>
            <span class="badge badge-${m.status === 'new' ? 'available' : ''}" style="margin-left:8px">${m.status}</span>
            <div style="font-size:0.8rem;color:var(--dim)">${esc(m.email)} · ${esc(m.phone)}</div>
            ${m.vehicle_details ? `<div style="font-size:0.8rem;color:var(--dim)">Vehicle: ${esc(m.vehicle_details)}</div>` : ''}
            ${m.message ? `<p style="margin-top:8px;font-size:0.85rem">${esc(m.message)}</p>` : ''}
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" onclick="updateContactStatus('${m.id}','read')">Mark Read</button>
            <button class="btn btn-sm" onclick="updateContactStatus('${m.id}','archived')">Archive</button>
            <button class="btn btn-sm" style="color:var(--danger)" onclick="deleteContact('${m.id}')">Delete</button>
          </div>
        </div>
      </div>
    `).join('') || '<p style="color:var(--dim)">No messages found.</p>';
  } catch {}
}

async function updateContactStatus(id, status) {
  try {
    await api(`/api/contact/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    loadContacts();
  } catch {}
}

async function deleteContact(id) {
  if (!confirm('Delete this message?')) return;
  try {
    await api(`/api/contact/${id}`, { method: 'DELETE' });
    loadContacts();
  } catch {}
}

// ---------------------------------------------------------------------------
//  Document generators (triggers docs.js)
// ---------------------------------------------------------------------------
function openWindowSticker() {
  switchTab('inventory');
  setTimeout(() => {
    // Re-use docs.js — called from docs.js scope
    if (typeof openStickerModal === 'function') {
      openStickerModal();
    } else {
      alert('Document system not loaded yet. Refresh and try again.');
    }
  }, 100);
}

function openBOSWaiver() {
  switchTab('inventory');
  setTimeout(() => {
    if (typeof openBOSModal === 'function') {
      openBOSModal();
    } else {
      alert('Document system not loaded yet. Refresh and try again.');
    }
  }, 100);
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
