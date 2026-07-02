/* ============================================================================
   Absolute Motor Cars — Internal CRM
   Phase 2 — Production/Ledger/Sold/Inspection/Backup
   ============================================================================ */

let CRM_TOKEN = localStorage.getItem('amc_crm_token') || '';
let CRM_USER = null;
let CRM_VEHICLES = [];
let CRM_SOLD = [];
let CRM_CFG = {};

const LOCATIONS = ['Dealership','Auction','Mechanic Shop','Detail Shop','Body Shop','With Customer',"Owner's Home"];
const COST_LABELS = { purchase_price:'Purchase Price', icbc:'ICBC', detailing:'Detailing', transport:'Transport', boost:'Boost', tire:'Tire', repair:'Repair', windshield:'Windshield', afc_extra:'AFC Extra', misc_cost:'Misc Cost', sales_cost:'Sales Cost' };
const COST_KEYS = Object.keys(COST_LABELS);

// ============================================================================
//  INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  try { CRM_CFG = await (await fetch('/api/config')).json(); } catch {}

  if (CRM_TOKEN) tryAutoLogin();

  document.getElementById('crm-login-form').addEventListener('submit', doCRMLogin);
  document.getElementById('crm-logout-btn').addEventListener('click', doCRMLogout);

  // Tabs
  document.querySelectorAll('#crm-sidebar [data-tab]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); switchCRMTab(a.dataset.tab); });
  });

  // Filters
  document.getElementById('prod-search').addEventListener('input', renderProduction);
  document.getElementById('ledger-search').addEventListener('input', renderLedger);
  document.getElementById('sold-search').addEventListener('input', renderSold);

  // Backups
  document.getElementById('crm-backup-btn').addEventListener('click', showBackupModal);

  // Export
  document.getElementById('ledger-export').addEventListener('click', exportLedgerCSV);
  document.getElementById('sold-export').addEventListener('click', exportSoldCSV);
});

// ============================================================================
//  AUTH
// ============================================================================
async function doCRMLogin(e) {
  e.preventDefault();
  const alert = document.getElementById('crm-login-alert');
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
    CRM_TOKEN = data.token;
    CRM_USER = data.user;
    localStorage.setItem('amc_crm_token', CRM_TOKEN);
    showCRM();
  } catch (err) {
    alert.className = 'alert alert-error'; alert.textContent = err.message; alert.classList.remove('hidden');
  } finally { btn.disabled = false; btn.textContent = 'Log In'; }
}

async function tryAutoLogin() {
  try {
    const r = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${CRM_TOKEN}` } });
    if (r.ok) { CRM_USER = await r.json(); showCRM(); return; }
  } catch {}
  localStorage.removeItem('amc_crm_token'); CRM_TOKEN = '';
}

function doCRMLogout() {
  localStorage.removeItem('amc_crm_token');
  CRM_TOKEN = ''; CRM_USER = null;
  document.getElementById('crm-login').style.display = '';
  document.getElementById('crm-shell').style.display = 'none';
}

function showCRM() {
  document.getElementById('crm-login').style.display = 'none';
  document.getElementById('crm-shell').style.display = 'flex';
  document.getElementById('crm-sidebar-user').textContent = `${CRM_USER.username} (${CRM_USER.role})`;

  const isOwner = CRM_USER.role === 'owner';
  document.getElementById('crm-sidebar').classList.toggle('is-owner', isOwner);
  // Show/hide owner-only kpi
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = isOwner ? '' : 'none');

  loadCRMData();
}

// ============================================================================
//  API
// ============================================================================
async function crmApi(url, opts = {}) {
  if (!opts.headers) opts.headers = {};
  opts.headers['Authorization'] = `Bearer ${CRM_TOKEN}`;
  const r = await fetch(url, opts);
  if (r.status === 401) { doCRMLogout(); throw new Error('Session expired'); }
  return r;
}

async function loadCRMData() {
  try {
    const r = await crmApi('/api/data');
    const data = await r.json();
    CRM_VEHICLES = data.crmVehicles || [];
    CRM_SOLD = data.soldRecords || [];
    updateKPIs();
    populateLocationFilter();
    renderProduction();
  } catch (e) { console.error(e); }
}

// Save CRM state to GitHub via /api/data
// Debounces: collects rapid changes and writes once
let _saveTimer = null;
function saveCRMData() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      // Build clean crmVehicles array (costs nested under .costs)
      const crmVehicles = CRM_VEHICLES.map(v => ({
        vehicle_id: v.vehicle_id || v.id,
        stock_number: v.stock_number || '',
        costs: {
          purchase_price: v.purchase_price || 0,
          icbc: v.icbc || 0,
          detailing: v.detailing || 0,
          transport: v.transport || 0,
          boost: v.boost || 0,
          tire: v.tire || 0,
          repair: v.repair || 0,
          windshield: v.windshield || 0,
          afc_extra: v.afc_extra || 0,
          misc_cost: v.misc_cost || 0,
          sales_cost: v.sales_cost || 0,
          gst_paid: v.gst_paid || 0,
        },
        location: v.location || 'Dealership',
        registration_done: v.registration_done || 0,
        inspection_done: v.inspection_done || 0,
        inspection_data: v.inspection_data || null,
        source_type: v.source_type || null,
        source_name: v.source_name || null,
        acquisition_price: v.acquisition_price || 0,
        buyer_name: v.buyer_name || null,
        buyer_phone: v.buyer_phone || null,
        buyer_email: v.buyer_email || null,
      }));

      await crmApi('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crmVehicles, soldRecords: CRM_SOLD }),
      });
    } catch (e) { console.error('Save failed:', e); }
  }, 700); // 700ms debounce
}

// ============================================================================
//  KPIs
// ============================================================================
function updateKPIs() {
  document.getElementById('kpi-count').textContent = CRM_VEHICLES.length;
  if (CRM_USER.role !== 'owner') return;

  const totalCost = CRM_VEHICLES.reduce((s, v) => s + (v.total_cost || 0), 0);
  document.getElementById('kpi-capital').textContent = `$${totalCost.toLocaleString()}`;
  document.getElementById('kpi-units').textContent = CRM_SOLD.length;

  const totalProfit = CRM_SOLD.reduce((s, r) => {
    const profit = (r.selling_price || 0) - (r.purchase_price || 0);
    return s + profit;
  }, 0);
  document.getElementById('kpi-profit').textContent = `$${totalProfit.toLocaleString()}`;
}

// ============================================================================
//  TABS
// ============================================================================
function switchCRMTab(name) {
  document.querySelectorAll('.crm-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#crm-sidebar [data-tab]').forEach(a => a.classList.remove('active'));
  const tab = document.getElementById(`crm-tab-${name}`);
  if (tab) tab.classList.add('active');
  const link = document.querySelector(`#crm-sidebar [data-tab="${name}"]`);
  if (link) link.classList.add('active');

  if (name === 'production') renderProduction();
  if (name === 'ledger') renderLedger();
  if (name === 'sold') renderSold();
}

// ============================================================================
//  PRODUCTION TAB
// ============================================================================
function populateLocationFilter() {
  const sel = document.getElementById('prod-location-filter');
  const locs = new Set(CRM_VEHICLES.map(v => v.location || 'Dealership'));
  sel.innerHTML = '<option value="all">All Locations</option>' +
    LOCATIONS.filter(l => locs.has(l) || l === 'Dealership').map(l =>
      `<option value="${l}">${l}</option>`).join('');
  sel.addEventListener('change', renderProduction);
}

function renderProduction() {
  const search = document.getElementById('prod-search').value.toLowerCase();
  const locFilter = document.getElementById('prod-location-filter').value;

  let vehicles = CRM_VEHICLES;
  if (locFilter !== 'all') vehicles = vehicles.filter(v => (v.location || 'Dealership') === locFilter);
  if (search) vehicles = vehicles.filter(v =>
    (v.stock_number || '').toLowerCase().includes(search) ||
    String(v.year).includes(search) ||
    (v.make || '').toLowerCase().includes(search) ||
    (v.model || '').toLowerCase().includes(search)
  );

  const container = document.getElementById('production-list');
  const isOwner = CRM_USER.role === 'owner';

  container.innerHTML = vehicles.map(v => {
    const loc = v.location || 'Dealership';
    const locClass = loc === 'Dealership' ? 'location-dealership' : loc === 'Auction' ? 'location-auction' : loc.toLowerCase().includes('mechanic') ? 'location-mechanic' : 'location-other';

    return `<div class="prod-card ${locClass}">
      <div>
        <div class="prod-card-header">
          <span class="prod-card-title">${esc(v.stock_number||'—')} — ${v.year} ${esc(v.make)} ${esc(v.model)} ${esc(v.trim||'')}</span>
        </div>
        <div class="prod-card-detail">VIN: ${v.vin||'—'} · ${v.mileage ? v.mileage.toLocaleString()+' km' : ''} · Added ${new Date(v.created_at).toLocaleDateString()}</div>
        <div class="prod-card-meta">
          <div class="location-select">
            <select onchange="updateLocation('${v.id}', this.value)" style="${loc === 'Dealership' ? 'border-color:var(--success)' : loc === 'Auction' ? 'border-color:#f59e0b' : ''}">
              ${LOCATIONS.map(l => `<option value="${l}" ${l === loc ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <span class="${v.registration_done ? 'checkbox-done' : 'checkbox-pending'}" onclick="toggleCRMField('${v.id}','registration_done',${v.registration_done ? 1 : 0})" style="cursor:pointer">${v.registration_done ? '✓ Reg' : '○ Reg'}</span>
          <span class="${v.inspection_done ? 'checkbox-done' : 'checkbox-pending'}" onclick="toggleCRMField('${v.id}','inspection_done',${v.inspection_done ? 1 : 0})" style="cursor:pointer">${v.inspection_done ? '✓ Insp' : '○ Insp'}</span>
        </div>
        ${isOwner ? renderCostBreakdown(v) : ''}
      </div>
      <div class="prod-card-actions">
        ${isOwner ? `<button class="btn btn-sm" onclick="editCRMVehicle('${v.id}')">Edit Costs</button>` : ''}
        <button class="btn btn-sm" onclick="openInspectionModal('${v.id}')">Inspection Report</button>
        ${isOwner ? `<button class="btn btn-sm" style="color:var(--accent)" onclick="markSoldModal('${v.id}')">Mark Sold</button>` : ''}
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--dim);padding:20px">No vehicles in production.</p>';
}

function renderCostBreakdown(v) {
  const costs = COST_KEYS.map(k => ({ key: k, label: COST_LABELS[k], val: v[k] || 0 }));
  const nonZero = costs.filter(c => c.val > 0);
  const total = v.total_cost || 0;
  return `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:0.8rem;color:var(--dim)">Costs: <strong style="color:var(--accent)">$${total.toLocaleString()}</strong> | GST Paid: $${(v.gst_paid||0).toLocaleString()}</summary>
    <div class="cost-grid">${costs.map(c => `<div class="cost-item"><span>${c.label}</span><span>$${c.val.toLocaleString()}</span></div>`).join('')}</div>
    <div class="cost-item" style="margin-top:2px;font-weight:700"><span>GST Paid</span><span>$${(v.gst_paid||0).toLocaleString()}</span></div>
  </details>`;
}

async function updateLocation(id, location) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id || x.id) === id);
  if (v) {
    v.location = location;
    renderProduction();
    saveCRMData();
  }
}

async function toggleCRMField(id, field, currentVal) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id || x.id) === id);
  if (v) {
    v[field] = currentVal ? 0 : 1;
    renderProduction();
    saveCRMData();
  }
}

// ============================================================================
//  EDIT COSTS (Owner only)
// ============================================================================
function editCRMVehicle(id) {
  const v = CRM_VEHICLES.find(x => x.id === id);
  if (!v) return;

  const html = `
    <div class="modal-overlay" id="crm-edit-modal" style="display:flex">
      <div class="modal form-modal modal-wide">
        <div class="form-header">
          <h3>Edit — ${v.year} ${v.make} ${v.model}</h3>
          <button class="modal-close" style="position:static" onclick="document.getElementById('crm-edit-modal').remove()">&times;</button>
        </div>
        <div class="form-body" style="max-height:70vh">
          ${COST_KEYS.map(k => `<div class="form-group"><label>${COST_LABELS[k]}</label><input type="number" id="crm-edit-${k}" value="${v[k] || 0}"></div>`).join('')}
          <div class="form-group"><label>GST Paid</label><input type="number" id="crm-edit-gst_paid" value="${v.gst_paid || 0}"></div>
          <div class="form-section"><div class="form-section-header">Source</div><div class="form-section-body">
            <div class="form-inline">
              <div class="form-group"><label>Type</label><select id="crm-edit-source_type"><option value="">—</option>${['Auction','Trade-in','Dealer','Private seller','Other'].map(t => `<option ${v.source_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
              <div class="form-group"><label>Source Name</label><input id="crm-edit-source_name" value="${esc(v.source_name||'')}"></div>
              <div class="form-group"><label>Acquisition Price</label><input type="number" id="crm-edit-acquisition_price" value="${v.acquisition_price || 0}"></div>
            </div>
          </div></div>
          <div class="form-section"><div class="form-section-header">Buyer</div><div class="form-section-body">
            <div class="form-inline">
              <div class="form-group"><label>Name</label><input id="crm-edit-buyer_name" value="${esc(v.buyer_name||'')}"></div>
              <div class="form-group"><label>Phone</label><input id="crm-edit-buyer_phone" value="${esc(v.buyer_phone||'')}"></div>
              <div class="form-group"><label>Email</label><input id="crm-edit-buyer_email" value="${esc(v.buyer_email||'')}"></div>
            </div>
          </div></div>
          <button class="btn btn-primary btn-block" onclick="saveCRMEdit('${v.id}')">Save</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('crm-edit-modal').addEventListener('click', function(e) { if (e.target === this) this.remove(); });
}

async function saveCRMEdit(id) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id || x.id) === id);
  if (!v) return;
  COST_KEYS.forEach(k => { v[k] = parseInt(document.getElementById(`crm-edit-${k}`).value) || 0; });
  v.gst_paid = parseInt(document.getElementById('crm-edit-gst_paid').value) || 0;
  v.source_type = document.getElementById('crm-edit-source_type').value || null;
  v.source_name = document.getElementById('crm-edit-source_name').value || null;
  v.acquisition_price = parseInt(document.getElementById('crm-edit-acquisition_price').value) || 0;
  v.buyer_name = document.getElementById('crm-edit-buyer_name').value || null;
  v.buyer_phone = document.getElementById('crm-edit-buyer_phone').value || null;
  v.buyer_email = document.getElementById('crm-edit-buyer_email').value || null;

  document.getElementById('crm-edit-modal').remove();
  renderProduction();
  saveCRMData();  // debounced save to GitHub
}

// ============================================================================
//  MARK SOLD
// ============================================================================
function markSoldModal(id) {
  const v = CRM_VEHICLES.find(x => x.id === id);
  if (!v) return;

  const html = `<div class="modal-overlay" id="crm-sold-modal" style="display:flex">
    <div class="modal form-modal">
      <div class="form-header"><h3>Mark Sold — ${v.year} ${v.make} ${v.model}</h3><button class="modal-close" style="position:static" onclick="document.getElementById('crm-sold-modal').remove()">&times;</button></div>
      <div class="form-body" style="max-height:65vh">
        <div class="form-inline">
          <div class="form-group"><label>Stock #</label><input id="sold-stock" value="${esc(v.stock_number||'')}" readonly></div>
          <div class="form-group"><label>Vehicle</label><input value="${v.year} ${v.make} ${v.model} ${v.trim||''}" readonly></div>
        </div>
        <div class="form-inline">
          <div class="form-group"><label>Purchase Price</label><input type="number" id="sold-purchase" value="${v.purchase_price||v.price||0}"></div>
          <div class="form-group"><label>GST Paid</label><input type="number" id="sold-gst-paid" value="${v.gst_paid||0}"></div>
        </div>
        <div class="form-inline">
          <div class="form-group"><label>Selling Price</label><input type="number" id="sold-selling" value="${v.price||0}"></div>
          <div class="form-group"><label>Reserve (non-GST)</label><input type="number" id="sold-reserve" value="0"></div>
        </div>
        <div class="form-inline">
          <div class="form-group"><label>GST Collected</label><input type="number" id="sold-gst-collected" value="0"></div>
          <div class="form-group"><label>PST Collected</label><input type="number" id="sold-pst-collected" value="0"></div>
        </div>
        <div class="form-inline">
          <div class="form-group"><label>Seller Name</label><input id="sold-seller" value="${esc(v.source_name||CRM_CFG.legalName||'GP Auto Sales Ltd.')}"></div>
          <div class="form-group"><label>Sale Date</label><input type="date" id="sold-date"></div>
        </div>
        <div class="form-inline">
          <div class="form-group"><label>Buyer Name</label><input id="sold-buyer" value="${esc(v.buyer_name||'')}"></div>
          <div class="form-group"><label>Buyer Phone</label><input id="sold-buyer-phone" value="${esc(v.buyer_phone||'')}"></div>
        </div>
        <div class="form-group"><label>Buyer Email</label><input id="sold-buyer-email" value="${esc(v.buyer_email||'')}"></div>
        <button class="btn btn-primary btn-block" onclick="confirmMarkSold('${v.id}')">Confirm — Mark as Sold</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('crm-sold-modal').addEventListener('click', function(e) { if (e.target === this) this.remove(); });
}

async function confirmMarkSold(id) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id || x.id) === id);
  if (!v) return;
  if (!confirm('Mark this vehicle as SOLD? This removes it from production.')) return;

  const data = {
    vehicle_id: v.vehicle_id || v.id,
    stock_number: document.getElementById('sold-stock').value,
    year: v.year, make: v.make, model: v.model,
    purchase_price: parseInt(document.getElementById('sold-purchase').value) || 0,
    gst_paid: parseInt(document.getElementById('sold-gst-paid').value) || 0,
    selling_price: parseInt(document.getElementById('sold-selling').value) || 0,
    reserve_non_gst: parseInt(document.getElementById('sold-reserve').value) || 0,
    gst_collected: parseInt(document.getElementById('sold-gst-collected').value) || 0,
    pst_collected: parseInt(document.getElementById('sold-pst-collected').value) || 0,
    seller_name: document.getElementById('sold-seller').value,
    sale_date: document.getElementById('sold-date').value,
    buyer_name: document.getElementById('sold-buyer').value,
    buyer_phone: document.getElementById('sold-buyer-phone').value,
    buyer_email: document.getElementById('sold-buyer-email').value,
  };

  try {
    // POST to server (handles SQLite cleanup + GitHub write)
    await crmApi('/api/crm/sold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    document.getElementById('crm-sold-modal').remove();
    await loadCRMData();
  } catch (e) { alert('Error: ' + e.message); }
}

// ============================================================================
//  INSPECTION REPORT
// ============================================================================
const INSPECTION_SECTIONS = {
  'Powertrain': ['Accelerator','Fuel System','Exhaust','Transmission','Front/Rear/Spindles Axles','Clutch','Fluid Levels (Power Steering)','Fluid Levels (Brake)','CV Joints'],
  'Brakes': ['Parking/Emergency Brake','Hydraulic System','Vacuum System','Drum Brakes','Disc Brakes','Shoes/Pads','Anti-Lock (if OEM)'],
  'Frame & Body': ['Hood Latch','Door Latches & Hinges','Bumpers','Windshield Wipers & Washer','Rear Wiper & Washer','Windshield','Windows','Defrost/Heaters','Mirrors','Seats','Seat Belts/Airbags','Mudguards','Window Glazing','Structural Integrity'],
  'Lamps': ['Head Lamp Hi Beam','Head Lamp Lo Beam','Head Lamp Location','Daytime Running Lamps','Tail Lamps','Brake Lamps','Turn Signal Lamps','Hazard Warning Lamps','Licence Plate Lamp','Back-up Lamps'],
  'Steering': ['Steering Lash','Steering Linkage','Rack & Pinion','Power Steering System','King Pin','Ball Joints'],
  'Tires & Wheels': ['Tread Depth','Tread Section','Sidewalls','Wheels'],
  'Instruments': ['Speedometer/Odometer','Indicator Lamps','Horn','Hi Beam Indicator'],
  'Suspension': ['Leaf Springs','Struts and Shocks','Coil Spring','Torsion Bar','Independent/Multilink Rear','Computer Controlled'],
  'Electrical': ['Wiring','Battery','Switches','Alternator'],
  'Diagnostic': ['Diagnostic Trouble Codes'],
};

function openInspectionModal(id) {
  const v = CRM_VEHICLES.find(x => x.id === id);
  if (!v) return;

  let inspData = {};
  try { inspData = JSON.parse(v.inspection_data || '{}'); } catch {}

  const checklist = Object.entries(INSPECTION_SECTIONS).map(([section, items]) => {
    const itemsHtml = items.map(item => {
      const state = inspData[item] || '';
      return `<div class="inspect-item ${state}" onclick="cycleInspect(this,'${escJs(item)}')" data-state="${state}" title="${item}">${item} <span>${state || '—'}</span></div>`;
    }).join('');
    return `<div class="inspect-section-title">${section}</div>${itemsHtml}`;
  }).join('');

  const html = `<div class="modal-overlay" id="crm-inspect-modal" style="display:flex">
    <div class="modal modal-wide" style="max-height:90vh;overflow-y:auto">
      <div class="modal-body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3>Mechanical Fitness Assessment</h3>
          <button class="modal-close" style="position:static" onclick="document.getElementById('crm-inspect-modal').remove()">&times;</button>
        </div>
        <p style="font-size:0.85rem;color:var(--dim)">${v.year} ${v.make} ${v.model} · VIN: ${v.vin||'N/A'}</p>

        <div class="form-inline" style="margin:8px 0">
          <div class="form-group"><label>Odometer (km)</label><input type="number" id="inspect-odo" value="${inspData._odometer || v.mileage || ''}"></div>
          <div class="form-group"><label>Facility</label><input value="${CRM_CFG.inspection?.facilityName || ''}" readonly></div>
          <div class="form-group"><label>Facility #</label><input value="${CRM_CFG.inspection?.facilityNumber || ''}" readonly></div>
          <div class="form-group"><label>Technician</label><input value="${CRM_CFG.inspection?.technicianName || ''}" readonly></div>
        </div>

        <div style="display:flex;gap:8px;margin:8px 0;align-items:center">
          <button class="btn btn-sm" onclick="markAllInspect('C')">Mark Rest Complies</button>
          <button class="btn btn-sm" onclick="markAllInspect('')">Clear All</button>
          <span style="font-size:0.75rem;color:var(--dim)">Tap items: C→N→NA→clear</span>
          <span style="margin-left:auto;font-size:0.75rem" id="inspect-counter"></span>
        </div>

        <div class="inspect-grid">${checklist}</div>

        <div class="form-group" style="margin-top:12px"><label>Technician Comments</label><textarea id="inspect-comments" rows="2">${esc(inspData._comments||'')}</textarea></div>

        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-primary" onclick="saveAndPrintInspection('${id}')">Save & Print</button>
          <button class="btn" onclick="saveInspection('${id}')">Save Only</button>
        </div>

        <p style="font-size:0.7rem;color:var(--dim);margin-top:8px">Certification expires 120 days after issue. This form is not valid without a signature and date.</p>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('crm-inspect-modal').addEventListener('click', function(e) { if (e.target === this) this.remove(); });
  updateInspectCounter();
}

function cycleInspect(el, item) {
  const states = ['C', 'N', 'NA', ''];
  const current = el.dataset.state;
  const next = states[(states.indexOf(current) + 1) % states.length];
  el.dataset.state = next;
  el.className = 'inspect-item ' + next;
  el.querySelector('span').textContent = next || '—';
  updateInspectCounter();
}

function markAllInspect(state) {
  document.querySelectorAll('#crm-inspect-modal .inspect-item').forEach(el => {
    if (!el.dataset.state || el.dataset.state === '') {
      el.dataset.state = state;
      el.className = 'inspect-item ' + state;
      el.querySelector('span').textContent = state || '—';
    }
  });
  updateInspectCounter();
}

function updateInspectCounter() {
  const items = document.querySelectorAll('#crm-inspect-modal .inspect-item');
  const marked = [...items].filter(el => el.dataset.state).length;
  document.getElementById('inspect-counter').textContent = `${marked}/${items.length} marked`;
}

function collectInspectionData() {
  const data = {};
  document.querySelectorAll('#crm-inspect-modal .inspect-item').forEach(el => {
    const item = el.textContent.trim().split(' ')[0];
    data[item] = el.dataset.state || '';
  });
  data._odometer = document.getElementById('inspect-odo').value;
  data._comments = document.getElementById('inspect-comments').value;
  return data;
}

async function saveInspection(id) {
  const data = collectInspectionData();
  const v = CRM_VEHICLES.find(x => (x.vehicle_id || x.id) === id);
  if (v) {
    v.inspection_data = JSON.stringify(data);
    v.inspection_done = 1;
    renderProduction();
    saveCRMData();
  }
}

async function saveAndPrintInspection(id) {
  await saveInspection(id);
  const v = CRM_VEHICLES.find(x => x.id === id);
  if (!v) return;
  printInspectionPDF(v);
}

function printInspectionPDF(v) {
  const inspData = JSON.parse(v.inspection_data || '{}');
  const cfg = CRM_CFG;

  const checkItems = Object.entries(INSPECTION_SECTIONS).map(([section, items]) => {
    const rows = items.map(item => {
      const state = inspData[item] || '';
      return `<tr><td>${item}</td><td style="text-align:center;width:50px">${state === 'C' ? '✓' : state === 'N' ? '✗' : state === 'NA' ? 'N/A' : ''}</td></tr>`;
    }).join('');
    return `<tr><td colspan="2" style="font-weight:700;background:#f0f0f0;padding:4px">${section}</td></tr>${rows}`;
  }).join('');

  const win = window.open('', '_blank', 'width=900,height=1100');
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Inspection — ${v.year} ${v.make} ${v.model}</title>
<style>
  @page { size: letter; margin: 0.3in; }
  body { font-family: Arial, sans-serif; font-size: 7pt; color:#000; }
  h2 { font-size: 12pt; text-align:center; margin-bottom: 4px; }
  .head { display:flex; justify-content:space-between; font-size: 7pt; margin-bottom: 8px; }
  .head-box { border: 1px solid #000; padding: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  td { padding: 2px 4px; border: 1px solid #ccc; vertical-align: top; }
  .sig { margin-top: 16px; }
  .sig-line { border-bottom: 1px solid #000; width: 200px; margin-bottom: 2px; }
  .footer { margin-top: 12px; font-size: 6pt; color: #666; text-align:center; }
</style></head><body>
<h2>Mechanical Fitness Assessment</h2>
<div class="head">
  <div class="head-box"><strong>Facility:</strong> ${cfg.inspection?.facilityName || '—'}<br><strong>Facility #:</strong> ${cfg.inspection?.facilityNumber || '—'}</div>
  <div class="head-box"><strong>Dealer:</strong> ${cfg.inspection?.dealerLegalName || cfg.legalName}<br><strong>Address:</strong> ${cfg.inspection?.dealerAddress || ''}</div>
</div>
<p><strong>Vehicle:</strong> ${v.year} ${v.make} ${v.model} ${v.trim||''} &nbsp;|&nbsp; <strong>VIN:</strong> ${v.vin||'N/A'} &nbsp;|&nbsp; <strong>Odometer:</strong> ${inspData._odometer||v.mileage||'—'} km</p>
<table>${checkItems}</table>
${inspData._comments ? `<p><strong>Technician Comments:</strong> ${esc(inspData._comments)}</p>` : ''}
<div class="sig">
  <div class="sig-line"></div>
  <div style="font-size:7pt">Technician: ${cfg.inspection?.technicianName || '—'} &nbsp;|&nbsp; Date: _______________</div>
</div>
<div style="margin-top:8px;font-size:6pt;font-style:italic">I certify that the above-listed vehicle has been inspected as indicated and the results are accurate to the best of my knowledge. This assessment expires 120 days after the date of issue.</div>
<div class="sig" style="margin-top:20px">
  <div class="sig-line"></div>
  <div style="font-size:7pt">Signature &nbsp;|&nbsp; Date: _______________</div>
</div>
<div class="footer">${cfg.legalName||'GP Auto Sales Ltd.'} · ${cfg.phone} · Dealer Reg #${cfg.dealerReg}</div>
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ============================================================================
//  LEDGER TAB
// ============================================================================
function renderLedger() {
  const search = document.getElementById('ledger-search').value.toLowerCase();
  let vehicles = CRM_VEHICLES;
  if (search) vehicles = vehicles.filter(v =>
    (v.stock_number||'').toLowerCase().includes(search) ||
    String(v.year).includes(search) || (v.make||'').toLowerCase().includes(search) || (v.model||'').toLowerCase().includes(search)
  );

  const cols = ['Vehicle','Stock','Location','Purchase','ICBC','Detail','Transport','Boost','Tire','Repair','Windshield','AFC','Misc','Sales','Total Cost','GST Paid','Date Added'];
  const keys = ['', 'stock_number', 'location', 'purchase_price','icbc','detailing','transport','boost','tire','repair','windshield','afc_extra','misc_cost','sales_cost','','gst_paid',''];

  const rows = vehicles.map(v => [
    `${v.year} ${v.make} ${v.model}`,
    v.stock_number||'',
    v.location||'Dealership',
    v.purchase_price||0, v.icbc||0, v.detailing||0, v.transport||0, v.boost||0,
    v.tire||0, v.repair||0, v.windshield||0, v.afc_extra||0, v.misc_cost||0, v.sales_cost||0,
    v.total_cost||0, v.gst_paid||0,
    new Date(v.created_at).toLocaleDateString(),
  ]);

  // Totals
  const totals = ['TOTAL', '', '', ...Array(11).fill(0), 0, 0, ''];
  rows.forEach(r => {
    for (let i = 3; i <= 14; i++) totals[i] += r[i];
  });

  const allRows = [...rows, totals];
  const fmt = (val, i) => i >= 3 ? `$${val.toLocaleString()}` : String(val);

  const html = `<table class="ledger-table"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>
    ${allRows.map((r, ri) => `<tr class="${ri === allRows.length - 1 ? 'ledger-total' : ''}">${r.map((val, i) => `<td>${fmt(val, i)}</td>`).join('')}</tr>`).join('')}
  </tbody></table>`;

  document.getElementById('ledger-table-wrap').innerHTML = html;
}

function exportLedgerCSV() {
  const search = document.getElementById('ledger-search').value.toLowerCase();
  let vehicles = CRM_VEHICLES;
  if (search) vehicles = vehicles.filter(v =>
    (v.stock_number||'').toLowerCase().includes(search) ||
    String(v.year).includes(search) || (v.make||'').toLowerCase().includes(search) || (v.model||'').toLowerCase().includes(search)
  );

  const headers = ['Year','Make','Model','Stock','Location','Purchase Price','ICBC','Detailing','Transport','Boost','Tire','Repair','Windshield','AFC','Misc','Sales','Total Cost','GST Paid','Date'];
  const rows = vehicles.map(v => [
    v.year,v.make,v.model,v.stock_number||'',v.location||'Dealership',
    v.purchase_price||0,v.icbc||0,v.detailing||0,v.transport||0,v.boost||0,
    v.tire||0,v.repair||0,v.windshield||0,v.afc_extra||0,v.misc_cost||0,v.sales_cost||0,
    v.total_cost||0,v.gst_paid||0,new Date(v.created_at).toISOString().slice(0,10)
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))].join('\n');
  downloadBlob(csv, 'ledger.csv', 'text/csv');
}

// ============================================================================
//  SOLD TAB
// ============================================================================
function renderSold() {
  const search = document.getElementById('sold-search').value.toLowerCase();
  let sold = CRM_SOLD;
  if (search) sold = sold.filter(s =>
    (s.buyer_name||'').toLowerCase().includes(search) ||
    (s.seller_name||'').toLowerCase().includes(search) ||
    (s.stock_number||'').toLowerCase().includes(search) ||
    (s.make||'').toLowerCase().includes(search) ||
    (s.model||'').toLowerCase().includes(search)
  );

  const cols = ['Stock','Vehicle','Purchase','GST Paid','Seller','Sale Date','Selling Price','Reserve','GST Col.','PST Col.','Buyer','Profit','Actions'];
  const rows = sold.map(s => {
    const profit = (s.selling_price||0) - (s.purchase_price||0);
    return [s.stock_number||'', `${s.year} ${s.make} ${s.model}`, s.purchase_price||0, s.gst_paid||0, s.seller_name||'',
      s.sale_date, s.selling_price||0, s.reserve_non_gst||0, s.gst_collected||0, s.pst_collected||0,
      s.buyer_name||'', profit, s.id];
  });

  // Totals
  const totals = ['TOTAL', '', 0, 0, '', '', 0, 0, 0, 0, '', 0, ''];
  rows.forEach(r => { totals[2] += r[2]; totals[3] += r[3]; totals[6] += r[6]; totals[7] += r[7]; totals[8] += r[8]; totals[9] += r[9]; totals[11] += r[11]; });
  const allRows = [...rows, totals];

  const fmt = (val, i) => {
    if (i === 2 || i === 3 || i === 6 || i === 7 || i === 8 || i === 9 || i === 11) return `$${val.toLocaleString()}`;
    return String(val);
  };

  const html = `<table class="ledger-table"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>
    ${allRows.map((r, ri) => {
      if (ri === allRows.length - 1) {
        return `<tr class="ledger-total">${r.map((val,i) => `<td>${i === r.length - 1 ? '' : fmt(val,i)}</td>`).join('')}</tr>`;
      }
      return `<tr>${r.map((val,i) => {
        if (i === r.length - 1) return `<td><button class="btn btn-sm" onclick="returnToInventory('${val}')">Return</button></td>`;
        return `<td>${fmt(val,i)}</td>`;
      }).join('')}</tr>`;
    }).join('')}
  </tbody></table>`;
  document.getElementById('sold-table-wrap').innerHTML = html;
}

async function returnToInventory(id) {
  if (!confirm('Return this vehicle to inventory? It will appear in Production at the Dealership.')) return;
  try {
    await crmApi(`/api/crm/sold/${id}/return`, { method: 'POST' });
    await loadCRMData();
  } catch (e) { alert('Error: ' + e.message); }
}

function exportSoldCSV() {
  const search = document.getElementById('sold-search').value.toLowerCase();
  let sold = CRM_SOLD;
  if (search) sold = sold.filter(s =>
    (s.buyer_name||'').toLowerCase().includes(search) || (s.seller_name||'').toLowerCase().includes(search) ||
    (s.stock_number||'').toLowerCase().includes(search) || (s.make||'').toLowerCase().includes(search) || (s.model||'').toLowerCase().includes(search)
  );

  const headers = ['Stock','Year','Make','Model','Purchase','GST Paid','Seller','Sale Date','Selling Price','Reserve','GST Collected','PST Collected','Buyer','Buyer Phone','Buyer Email','Profit'];
  const rows = sold.map(s => {
    const profit = (s.selling_price||0) - (s.purchase_price||0);
    return [s.stock_number||'',s.year,s.make,s.model,s.purchase_price||0,s.gst_paid||0,s.seller_name||'',s.sale_date,s.selling_price||0,s.reserve_non_gst||0,s.gst_collected||0,s.pst_collected||0,s.buyer_name||'',s.buyer_phone||'',s.buyer_email||'',profit];
  });

  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))].join('\n');
  downloadBlob(csv, 'sold.csv', 'text/csv');
}

// ============================================================================
//  BACKUP
// ============================================================================
function showBackupModal() {
  const html = `<div class="modal-overlay" id="crm-backup-modal" style="display:flex">
    <div class="modal form-modal">
      <div class="form-header"><h3>Backup & Restore</h3><button class="modal-close" style="position:static" onclick="document.getElementById('crm-backup-modal').remove()">&times;</button></div>
      <div class="form-body">
        <h4 style="margin-bottom:8px">Download Backup</h4>
        <p style="color:var(--dim);font-size:0.8rem;margin-bottom:8px">Download a full backup of all vehicles, costs, and sold records.</p>
        <button class="btn btn-primary btn-block" onclick="downloadBackup()">Download Backup</button>

        <div style="border-top:1px solid var(--border);margin:20px 0;padding-top:16px">
          <h4 style="margin-bottom:8px">Restore from Backup</h4>
          <p style="color:var(--dim);font-size:0.8rem;margin-bottom:8px">Upload a previously downloaded backup file.</p>
          <input type="file" id="restore-file" accept=".json" style="margin-bottom:8px">
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <button class="btn btn-sm" onclick="restoreBackup('merge')">Merge (add new only)</button>
            <button class="btn btn-sm" style="color:var(--danger)" onclick="restoreBackup('replace')">Replace All</button>
          </div>
          <p style="color:var(--dim);font-size:0.7rem">Merge adds only new records. Replace overwrites everything.</p>
          <div id="restore-status" style="margin-top:8px"></div>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('crm-backup-modal').addEventListener('click', function(e) { if (e.target === this) this.remove(); });
}

async function downloadBackup() {
  try {
    const r = await crmApi('/api/crm/backup');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `dealership-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  } catch (e) { alert('Error: ' + e.message); }
}

async function restoreBackup(mode) {
  const fileInput = document.getElementById('restore-file');
  const statusEl = document.getElementById('restore-status');
  if (!fileInput.files[0]) { statusEl.textContent = 'Select a file first.'; return; }

  const text = await fileInput.files[0].text();
  let data;
  try { data = JSON.parse(text); } catch { statusEl.textContent = 'Invalid JSON file.'; return; }

  const recordCount = (data.vehicles||[]).length + (data.sold||[]).length;
  if (!confirm(`${mode === 'replace' ? 'REPLACE all data' : 'Merge'} with ${recordCount} records from backup?`)) return;

  statusEl.innerHTML = '<span class="spinner"></span> Restoring...';
  try {
    const r = await crmApi('/api/crm/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, mode }),
    });
    const result = await r.json();
    statusEl.textContent = `Done! Added ${result.added}, skipped ${result.skipped}.`;
    await loadCRMData();
  } catch (e) { statusEl.textContent = 'Error: ' + e.message; }
}

// ============================================================================
//  HELPERS
// ============================================================================
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML;
}
function escJs(s) {
  return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"');
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}
