/* ============================================================================
   Absolute Motor Cars — Admin Dashboard
   Oswald/Inter chrome design
   ============================================================================ */

let ADM_TOKEN = localStorage.getItem('amc_token') || '';
let ADM_USER = null;
let ALL_VEHICLES = [];
let EDITING_ID = null;

// ============================================================================
//  INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  if (ADM_TOKEN) tryAutoLogin();

  document.getElementById('login-form').addEventListener('submit', doLogin);
  document.getElementById('logout-btn').addEventListener('click', doLogout);

  document.querySelectorAll('.admin-nav [data-tab]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); switchTab(a.dataset.tab); });
  });

  document.getElementById('add-vehicle-btn').addEventListener('click', showEditor);
  document.getElementById('veh-form').addEventListener('submit', saveVehicle);
  document.getElementById('veh-cancel').addEventListener('click', hideEditor);

  document.getElementById('img-zone').addEventListener('click', () => document.getElementById('img-input').click());
  document.getElementById('img-input').addEventListener('change', handleImages);

  const drop = document.getElementById('img-zone');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--red)'; });
  drop.addEventListener('dragleave', () => { drop.style.borderColor = 'var(--line)'; });
  drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = 'var(--line)'; if (e.dataTransfer.files.length && EDITING_ID) uploadImages(e.dataTransfer.files); });

  const vin = document.getElementById('admin-vin');
  vin.addEventListener('input', () => {
    const l = vin.value.replace(/\s/g,'').length;
    document.getElementById('vin-counter').textContent = l + '/17';
    document.getElementById('vin-decode-btn').disabled = l !== 17;
  });
  document.getElementById('vin-decode-btn').addEventListener('click', decodeVin);

  document.getElementById('inv-search').addEventListener('input', renderTable);
  document.getElementById('fin-filter').addEventListener('change', loadFinancing);
});

// ============================================================================
//  AUTH
// ============================================================================
async function doLogin(e) {
  e.preventDefault();
  const alert = document.getElementById('login-alert');
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Signing in…';
  const fd = new FormData(e.target);
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Invalid credentials');
    const d = await r.json();
    ADM_TOKEN = d.token; ADM_USER = d.user;
    localStorage.setItem('amc_token', ADM_TOKEN);
    showAdmin();
  } catch (err) {
    alert.className = 'alert alert-error show'; alert.textContent = err.message;
  } finally { btn.disabled = false; btn.textContent = 'Sign In'; }
}

async function tryAutoLogin() {
  try {
    const r = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${ADM_TOKEN}` } });
    if (r.ok) { ADM_USER = await r.json(); showAdmin(); return; }
  } catch {}
  localStorage.removeItem('amc_token'); ADM_TOKEN = '';
}

function doLogout() {
  localStorage.removeItem('amc_token'); ADM_TOKEN = ''; ADM_USER = null;
  document.getElementById('login-page').style.display = '';
  document.getElementById('admin-shell').classList.remove('logged-in');
}

function showAdmin() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('admin-shell').classList.add('logged-in');
  document.getElementById('nav-user').textContent = `${ADM_USER.username} (${ADM_USER.role})`;
  loadInventory();
  loadFinancing();
  loadContacts();
}

// ============================================================================
//  API
// ============================================================================
async function api(url, opts = {}) {
  if (!opts.headers) opts.headers = {};
  opts.headers['Authorization'] = `Bearer ${ADM_TOKEN}`;
  const r = await fetch(url, opts);
  if (r.status === 401) { doLogout(); throw new Error('Session expired'); }
  return r;
}

// ============================================================================
//  TABS
// ============================================================================
function switchTab(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-nav [data-tab]').forEach(a => a.classList.remove('active'));
  const sec = document.getElementById(`sec-${name}`);
  if (sec) sec.classList.add('active');
  const link = document.querySelector(`.admin-nav [data-tab="${name}"]`);
  if (link) link.classList.add('active');
}

// ============================================================================
//  INVENTORY
// ============================================================================
async function loadInventory() {
  try {
    const r = await api('/api/vehicles');
    ALL_VEHICLES = await r.json();
    renderTable();
  } catch {}
}

function renderTable() {
  const s = document.getElementById('inv-search').value.toLowerCase();
  let rows = ALL_VEHICLES;
  if (s) rows = rows.filter(v =>
    (v.stock_number||'').toLowerCase().includes(s) || String(v.year).includes(s) ||
    (v.make||'').toLowerCase().includes(s) || (v.model||'').toLowerCase().includes(s) ||
    (v.trim||'').toLowerCase().includes(s)
  );

  document.querySelector('#inv-table tbody').innerHTML = rows.map(v => {
    const badge = v.status === 'available' ? 'pill-green' : v.status === 'reserved' ? 'pill-amber' : 'pill-gray';
    return `<tr>
      <td>${esc(v.stock_number||'—')}</td>
      <td><strong>${v.year} ${esc(v.make)} ${esc(v.model)} ${esc(v.trim||'')}</strong></td>
      <td>$${v.price.toLocaleString()}</td>
      <td><span class="pill-sm ${badge}">${v.status}</span></td>
      <td>${(v.images||[]).length}</td>
      <td class="cell-actions">
        <button class="btn btn-ghost" style="font-size:.68rem;padding:6px 12px" onclick="editVehicle('${v.id}')">Edit</button>
        <button class="btn btn-ghost" style="font-size:.68rem;padding:6px 12px;color:#ef4444;border-color:rgba(239,68,68,.3)" onclick="deleteVehicle('${v.id}')">Delete</button>
      </td></tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:40px">No vehicles found.</td></tr>';
}

function showEditor() {
  EDITING_ID = null;
  document.getElementById('editor-title').textContent = 'Add New Vehicle';
  document.getElementById('veh-form').reset();
  document.getElementById('veh-edit-id').value = '';
  document.getElementById('img-section').style.display = 'none';
  document.getElementById('img-previews').innerHTML = '';
  document.getElementById('vehicle-editor').classList.add('open');
  document.getElementById('vin-counter').textContent = '0/17';
}

function editVehicle(id) {
  const v = ALL_VEHICLES.find(x => x.id === id);
  if (!v) return;
  EDITING_ID = id;
  document.getElementById('editor-title').textContent = `Edit: ${v.year} ${v.make} ${v.model}`;
  document.getElementById('veh-edit-id').value = id;
  ['stock_number','vin','year','make','model','trim','price','mileage','exterior','interior','engine','transmission','drivetrain','fuel','status','description'].forEach(f => {
    const el = document.querySelector(`[name="${f}"]`);
    if (el) el.value = v[f] != null ? v[f] : '';
  });
  document.getElementById('vehicle-editor').classList.add('open');
  document.getElementById('img-section').style.display = '';
  renderPreviews(v.images||[]);
  document.getElementById('vin-counter').textContent = `${(v.vin||'').length}/17`;
}

function hideEditor() {
  document.getElementById('vehicle-editor').classList.remove('open');
  EDITING_ID = null;
}

async function saveVehicle(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = {}; for (const [k,v] of fd) { if (k !== 'id' || v) data[k] = v; }
  for (const k of ['year','price','mileage']) { if (data[k]) data[k] = parseInt(data[k],10); }
  const id = data.id; delete data.id;
  const btn = document.getElementById('veh-submit');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const r = await api(id ? `/api/vehicles/${id}` : '/api/vehicles', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Failed');
    await loadInventory(); hideEditor();
  } catch (err) { alert('Error: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Save Vehicle'; }
}

async function deleteVehicle(id) {
  if (!confirm('Permanently delete this vehicle?')) return;
  try { await api(`/api/vehicles/${id}`, { method: 'DELETE' }); await loadInventory(); }
  catch (err) { alert('Error: ' + err.message); }
}

// ============================================================================
//  IMAGES
// ============================================================================
function renderPreviews(images) {
  document.getElementById('img-previews').innerHTML = images.map((url,i) =>
    `<div class="thumb"><img src="${esc(url)}"><button class="rm" onclick="deleteImg('${EDITING_ID}','${esc(url.split('/').pop())}')">&times;</button></div>`
  ).join('');
}

function handleImages() {
  const files = document.getElementById('img-input').files;
  if (files.length && EDITING_ID) uploadImages(files);
}

async function uploadImages(files) {
  const fd = new FormData(); for (const f of files) fd.append('images', f);
  try {
    await api(`/api/vehicles/${EDITING_ID}/images`, { method: 'POST', body: fd });
    const r = await api(`/api/vehicles/${EDITING_ID}`);
    const v = await r.json();
    renderPreviews(v.images||[]);
    document.getElementById('img-input').value = '';
  } catch (err) { alert('Upload error: ' + err.message); }
}

async function deleteImg(vehicleId, filename) {
  try {
    await api(`/api/vehicles/${vehicleId}/images/${filename}`, { method: 'DELETE' });
    const r = await api(`/api/vehicles/${vehicleId}`);
    const v = await r.json();
    renderPreviews(v.images||[]);
  } catch {}
}

// ============================================================================
//  VIN DECODE
// ============================================================================
async function decodeVin() {
  const vin = document.getElementById('admin-vin').value.replace(/\s/g,'');
  if (vin.length !== 17) return;
  const btn = document.getElementById('vin-decode-btn');
  btn.textContent = '…'; btn.disabled = true;
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    const d = await r.json();
    const res = d.Results?.[0] || {};
    if (res.Make) document.querySelector('[name="make"]').value = titleCase(res.Make);
    if (res.Model) document.querySelector('[name="model"]').value = titleCase(res.Model);
    if (res.ModelYear) document.querySelector('[name="year"]').value = res.ModelYear;
    btn.textContent = '✓'; btn.style.color = '#22c55e';
  } catch { btn.textContent = '✗'; btn.style.color = '#ef4444'; }
  setTimeout(() => { btn.textContent = 'Decode'; btn.disabled = false; btn.style.color = ''; }, 2000);
}

// ============================================================================
//  FINANCING
// ============================================================================
async function loadFinancing() {
  try {
    const r = await api('/api/financing');
    const apps = await r.json();
    const filter = document.getElementById('fin-filter').value;
    const filtered = filter === 'all' ? apps : apps.filter(a => a.status === filter);
    const n = apps.filter(a => a.status === 'new').length;
    const badge = document.getElementById('fin-badge');
    badge.style.display = n ? '' : 'none';
    badge.textContent = n;

    document.getElementById('fin-list').innerHTML = filtered.map(a => `
      <div class="fin-card">
        <div class="top">
          <div>
            <h4>${esc(a.first_name)} ${esc(a.last_name)}</h4>
            <div class="meta">${esc(a.email)} · ${esc(a.phone)} · ${a.vehicle_of_interest||'N/A'}</div>
          </div>
          <div class="cell-actions">
            <button class="btn btn-ghost" style="font-size:.68rem;padding:5px 10px" onclick="updateFinStatus('${a.id}','in_review')">Review</button>
            <button class="btn btn-ghost" style="font-size:.68rem;padding:5px 10px" onclick="updateFinStatus('${a.id}','approved')">Approve</button>
            <button class="btn btn-ghost" style="font-size:.68rem;padding:5px 10px" onclick="updateFinStatus('${a.id}','archived')">Archive</button>
          </div>
        </div>
        <details><summary>Full Details</summary>
          <div class="detail-grid">
            ${[
              ['DOB',a.date_of_birth],['Marital',a.marital_status],
              ['Address',`${a.street_address}, ${a.city}`],
              ['Income','$'+(a.gross_monthly_income||0).toLocaleString()],
              ['Down','$'+(a.down_payment||0).toLocaleString()],
              ['Trade-in',a.has_trade_in?'Yes':'No'],
              ['Co-app',a.has_co_applicant?`${a.co_applicant_name||''}`:'No'],
              ['Notes',a.notes],
            ].filter(([,v])=>v).map(([k,v])=>`<div><strong>${k}:</strong> ${esc(String(v))}</div>`).join('')}
          </div>
        </details>
      </div>
    `).join('') || '<p style="color:var(--muted);padding:20px;font-family:\'Inter\'">No applications.</p>';
  } catch {}
}

async function updateFinStatus(id, status) {
  try { await api(`/api/financing/${id}`, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status}) }); loadFinancing(); }
  catch {}
}

// ============================================================================
//  CONTACTS
// ============================================================================
async function loadContacts() {
  try {
    const r = await api('/api/contact');
    const msgs = await r.json();
    document.getElementById('contact-list').innerHTML = msgs.map(m => `
      <div class="fin-card">
        <div class="top">
          <div>
            <h4>${esc(m.name)}</h4>
            <div class="meta">${esc(m.type)} · ${esc(m.email)} · ${esc(m.phone)}</div>
            ${m.message ? `<p style="margin-top:6px;font-family:'Inter';font-size:.85rem;color:var(--text)">${esc(m.message)}</p>` : ''}
          </div>
          <div class="cell-actions">
            <button class="btn btn-ghost" style="font-size:.68rem;padding:5px 10px" onclick="updateContactStatus('${m.id}','read')">Read</button>
            <button class="btn btn-ghost" style="font-size:.68rem;padding:5px 10px" onclick="updateContactStatus('${m.id}','archived')">Archive</button>
            <button class="btn btn-ghost" style="font-size:.68rem;padding:5px 10px;color:#ef4444" onclick="deleteContact('${m.id}')">Del</button>
          </div>
        </div>
      </div>
    `).join('') || '<p style="color:var(--muted);padding:20px;font-family:\'Inter\'">No messages.</p>';
  } catch {}
}

async function updateContactStatus(id, status) {
  try { await api(`/api/contact/${id}`, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status}) }); loadContacts(); }
  catch {}
}

async function deleteContact(id) {
  if (!confirm('Delete this message?')) return;
  try { await api(`/api/contact/${id}`, { method: 'DELETE' }); loadContacts(); }
  catch {}
}

// ============================================================================
//  HELPERS
// ============================================================================
function esc(s) { if (s==null) return ''; const d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }
function titleCase(s) { return (s||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()); }
