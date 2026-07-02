/* ============================================================================
   Absolute Motor Cars — CRM
   Oswald/Inter chrome design — Production / Ledger / Sold / Inspection / Backup
   ============================================================================ */

let CRM_TOKEN = localStorage.getItem('amc_crm_token') || '';
let CRM_USER = null;
let CRM_VEHICLES = [];
let CRM_SOLD = [];
let CRM_CFG = {};

const LOCS = ['Dealership','Auction','Mechanic Shop','Detail Shop','Body Shop','With Customer',"Owner's Home"];
const COST_LABELS = { purchase_price:'Purchase', icbc:'ICBC', detailing:'Detail', transport:'Transport', boost:'Boost', tire:'Tire', repair:'Repair', windshield:'Windshield', afc_extra:'AFC', misc_cost:'Misc', sales_cost:'Sales' };
const COST_KEYS = Object.keys(COST_LABELS);

// ============================================================================
//  INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  try { CRM_CFG = await (await fetch('/api/config')).json(); } catch {}
  if (CRM_TOKEN) tryAuto();

  document.getElementById('crm-login-form').addEventListener('submit', doLogin);
  document.getElementById('crm-logout-btn').addEventListener('click', doLogout);
  document.querySelectorAll('.crm-nav [data-tab]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); switchTab(a.dataset.tab); }));
  document.getElementById('prod-search').addEventListener('input', renderProd);
  document.getElementById('ledger-search').addEventListener('input', renderLedger);
  document.getElementById('sold-search').addEventListener('input', renderSold);
  document.getElementById('crm-backup-btn').addEventListener('click', showBackup);
  document.getElementById('ledger-export').addEventListener('click', exportLedger);
  document.getElementById('sold-export').addEventListener('click', exportSoldCSV);
});

// ============================================================================
//  AUTH
// ============================================================================
async function doLogin(e) {
  e.preventDefault();
  const alert = document.getElementById('crm-login-alert');
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Signing in…';
  const fd = new FormData(e.target);
  try {
    const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:fd.get('username'),password:fd.get('password')}) });
    if (!r.ok) throw new Error((await r.json()).error||'Invalid');
    const d = await r.json(); CRM_TOKEN = d.token; CRM_USER = d.user;
    localStorage.setItem('amc_crm_token', CRM_TOKEN); showCRM();
  } catch(err) { alert.className='alert alert-error show'; alert.textContent=err.message; }
  finally { btn.disabled=false; btn.textContent='Sign In'; }
}

async function tryAuto() {
  try { const r = await fetch('/api/auth/me',{headers:{'Authorization':`Bearer ${CRM_TOKEN}`}}); if(r.ok){CRM_USER=await r.json();showCRM();return;} } catch{}
  localStorage.removeItem('amc_crm_token'); CRM_TOKEN='';
}

function doLogout() { localStorage.removeItem('amc_crm_token'); CRM_TOKEN=''; CRM_USER=null; document.getElementById('crm-login-page').style.display=''; document.getElementById('crm-shell').classList.remove('logged-in'); }

function showCRM() {
  document.getElementById('crm-login-page').style.display='none';
  document.getElementById('crm-shell').classList.add('logged-in');
  document.getElementById('crm-nav-user').textContent = `${CRM_USER.username} (${CRM_USER.role})`;
  const isOwner = CRM_USER.role === 'owner';
  document.getElementById('crm-nav').classList.toggle('is-owner', isOwner);
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = isOwner ? '' : 'none');
  loadData();
}

// ============================================================================
//  API + DATA
// ============================================================================
async function api(url, opts = {}) {
  if (!opts.headers) opts.headers = {};
  opts.headers['Authorization'] = `Bearer ${CRM_TOKEN}`;
  const r = await fetch(url, opts);
  if (r.status === 401) { doLogout(); throw new Error('Session expired'); }
  return r;
}

async function loadData() {
  try {
    const r = await api('/api/data');
    const d = await r.json();
    CRM_VEHICLES = d.crmVehicles || [];
    CRM_SOLD = d.soldRecords || [];
    updateKPIs();
    populateLocs();
    renderProd();
  } catch(e) { console.error(e); }
}

let _saveT = null;
function saveData() {
  clearTimeout(_saveT);
  _saveT = setTimeout(async () => {
    const crmVehicles = CRM_VEHICLES.map(v => ({
      vehicle_id: v.vehicle_id || v.id,
      stock_number: v.stock_number || '',
      costs: Object.fromEntries(COST_KEYS.map(k => [k, v[k] || 0]).concat([['gst_paid', v.gst_paid || 0]])),
      location: v.location || 'Dealership',
      registration_done: v.registration_done || 0,
      inspection_done: v.inspection_done || 0,
      inspection_data: v.inspection_data || null,
      source_type: v.source_type || null, source_name: v.source_name || null,
      acquisition_price: v.acquisition_price || 0,
      buyer_name: v.buyer_name || null, buyer_phone: v.buyer_phone || null, buyer_email: v.buyer_email || null,
    }));
    try { await api('/api/data', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ crmVehicles, soldRecords: CRM_SOLD }) }); }
    catch(e) { console.error('Save failed:', e); }
  }, 700);
}

// ============================================================================
//  KPIs
// ============================================================================
function updateKPIs() {
  document.getElementById('kpi-count').textContent = CRM_VEHICLES.length;
  if (CRM_USER.role !== 'owner') return;
  const totalCost = CRM_VEHICLES.reduce((s,v) => s + ((v.purchase_price||0)+(v.icbc||0)+(v.detailing||0)+(v.transport||0)+(v.boost||0)+(v.tire||0)+(v.repair||0)+(v.windshield||0)+(v.afc_extra||0)+(v.misc_cost||0)+(v.sales_cost||0)), 0);
  document.getElementById('kpi-capital').textContent = '$'+totalCost.toLocaleString();
  document.getElementById('kpi-sold').textContent = CRM_SOLD.length;
  const profit = CRM_SOLD.reduce((s,r) => s + ((r.selling_price||0)-(r.purchase_price||0)), 0);
  document.getElementById('kpi-profit').textContent = '$'+profit.toLocaleString();
}

// ============================================================================
//  TABS
// ============================================================================
function switchTab(name) {
  document.querySelectorAll('.crm-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.crm-nav [data-tab]').forEach(a => a.classList.remove('active'));
  const tab = document.getElementById(`tab-${name}`);
  if (tab) tab.classList.add('active');
  const link = document.querySelector(`.crm-nav [data-tab="${name}"]`);
  if (link) link.classList.add('active');
  if (name === 'production') renderProd();
  if (name === 'ledger') renderLedger();
  if (name === 'sold') renderSold();
}

// ============================================================================
//  PRODUCTION
// ============================================================================
function populateLocs() {
  const sel = document.getElementById('prod-loc-filter');
  sel.innerHTML = '<option value="all">All Locations</option>' + LOCS.map(l => `<option>${l}</option>`).join('');
  sel.addEventListener('change', renderProd);
}

function renderProd() {
  const s = document.getElementById('prod-search').value.toLowerCase();
  const lf = document.getElementById('prod-loc-filter').value;
  let list = CRM_VEHICLES;
  if (lf !== 'all') list = list.filter(v => (v.location||'Dealership') === lf);
  if (s) list = list.filter(v => (v.stock_number||''+v.year+v.make+v.model).toLowerCase().includes(s));
  const isO = CRM_USER.role === 'owner';

  document.getElementById('prod-list').innerHTML = list.map(v => {
    const loc = v.location || 'Dealership';
    const locCls = loc === 'Dealership' ? 'loc-dealership' : loc === 'Auction' ? 'loc-auction' : loc.includes('Mechanic') ? 'loc-mechanic' : '';
    const tc = isO ? (v.purchase_price||0)+(v.icbc||0)+(v.detailing||0)+(v.transport||0)+(v.boost||0)+(v.tire||0)+(v.repair||0)+(v.windshield||0)+(v.afc_extra||0)+(v.misc_cost||0)+(v.sales_cost||0) : 0;
    return `<div class="prod-card ${locCls}">
      <div class="row">
        <div>
          <h4>${esc(v.stock_number||'—')} — ${v.year} ${esc(v.make)} ${esc(v.model)} ${esc(v.trim||'')}</h4>
          <div class="sub">VIN: ${v.vin||'—'} · ${v.mileage?Number(v.mileage).toLocaleString()+' km':''} · Added ${new Date(v.created_at).toLocaleDateString()}</div>
          <div class="meta-row">
            <span class="loc-sel"><select onchange="setLoc('${v.vehicle_id||v.id}',this.value)">${LOCS.map(l=>`<option ${l===loc?'selected':''}>${l}</option>`).join('')}</select></span>
            <span class="chk ${v.registration_done?'done':'pending'}" onclick="toggleF('${v.vehicle_id||v.id}','registration_done',${v.registration_done||0})">${v.registration_done?'✓ Reg':'○ Reg'}</span>
            <span class="chk ${v.inspection_done?'done':'pending'}" onclick="toggleF('${v.vehicle_id||v.id}','inspection_done',${v.inspection_done||0})">${v.inspection_done?'✓ Insp':'○ Insp'}</span>
          </div>
          ${isO ? `<details><summary>Costs: <strong style="color:var(--red)">$${tc.toLocaleString()}</strong> | GST: $${(v.gst_paid||0).toLocaleString()}</summary><div class="cost-grid">${COST_KEYS.map(k=>`<div class="cost-line"><span>${COST_LABELS[k]}</span><span>$${(v[k]||0).toLocaleString()}</span></div>`).join('')}</div></details>` : ''}
        </div>
        <div class="actions">
          ${isO ? `<button class="btn btn-ghost" style="font-size:.68rem;padding:6px 12px" onclick="editCosts('${v.vehicle_id||v.id}')">Edit Costs</button>` : ''}
          <button class="btn btn-ghost" style="font-size:.68rem;padding:6px 12px" onclick="openInsp('${v.vehicle_id||v.id}')">Inspection</button>
          ${isO ? `<button class="btn btn-ghost" style="font-size:.68rem;padding:6px 12px;color:var(--red);border-color:var(--line-red)" onclick="soldDialog('${v.vehicle_id||v.id}')">Mark Sold</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--muted);padding:30px;font-family:\'Inter\'">No vehicles in production.</p>';
}

function setLoc(id, loc) { const v = CRM_VEHICLES.find(x => (x.vehicle_id||x.id)===id); if(v){v.location=loc;renderProd();saveData();} }
function toggleF(id, field, val) { const v = CRM_VEHICLES.find(x => (x.vehicle_id||x.id)===id); if(v){v[field]=val?0:1;renderProd();saveData();} }

// ============================================================================
//  EDIT COSTS
// ============================================================================
function editCosts(id) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id||x.id)===id);
  if (!v) return;
  document.getElementById('crm-modals').innerHTML = `
    <div class="modal-overlay" id="cost-modal" style="display:flex">
      <div class="modal" style="max-width:700px">
        <div class="modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <h3 style="font-family:'Oswald';font-size:1.1rem;text-transform:uppercase;color:var(--chrome-1)">Edit — ${v.year} ${v.make} ${v.model}</h3>
            <button class="modal-close" style="position:static" onclick="closeModal('cost-modal')">&times;</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
            ${COST_KEYS.map(k => `<div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">${COST_LABELS[k]}</label><input type="number" id="ec-${k}" value="${v[k]||0}" style="width:100%;padding:9px;border:1px solid var(--line);background:var(--black);color:#fff;font-family:'Inter';font-size:.85rem"></div>`).join('')}
          </div>
          <div class="field" style="margin-top:10px"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">GST Paid</label><input type="number" id="ec-gst" value="${v.gst_paid||0}" style="width:100%;padding:9px;border:1px solid var(--line);background:var(--black);color:#fff;font-family:'Inter';font-size:.85rem;max-width:200px"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Source Type</label><select id="ec-st" style="width:100%;padding:9px;border:1px solid var(--line);background:var(--black);color:#fff;font-family:'Inter';font-size:.85rem"><option value="">—</option>${['Auction','Trade-in','Dealer','Private seller','Other'].map(t=>`<option ${v.source_type===t?'selected':''}>${t}</option>`).join('')}</select></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Source Name</label><input id="ec-sn" value="${esc(v.source_name||'')}" style="width:100%;padding:9px;border:1px solid var(--line);background:var(--black);color:#fff;font-family:'Inter';font-size:.85rem"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Buyer Name</label><input id="ec-bn" value="${esc(v.buyer_name||'')}" style="width:100%"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Buyer Phone</label><input id="ec-bp" value="${esc(v.buyer_phone||'')}" style="width:100%"></div>
          </div>
          <button class="btn btn-solid" style="margin-top:16px" onclick="saveCosts('${id}')">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById('cost-modal').addEventListener('click', function(e){ if(e.target===this)closeModal('cost-modal'); });
}

function saveCosts(id) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id||x.id)===id);
  if (!v) return;
  COST_KEYS.forEach(k => { v[k] = parseInt(document.getElementById('ec-'+k).value) || 0; });
  v.gst_paid = parseInt(document.getElementById('ec-gst').value) || 0;
  v.source_type = document.getElementById('ec-st').value || null;
  v.source_name = document.getElementById('ec-sn').value || null;
  v.buyer_name = document.getElementById('ec-bn').value || null;
  v.buyer_phone = document.getElementById('ec-bp').value || null;
  closeModal('cost-modal'); renderProd(); saveData();
}

// ============================================================================
//  MARK SOLD
// ============================================================================
function soldDialog(id) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id||x.id)===id);
  if (!v) return;
  document.getElementById('crm-modals').innerHTML = `
    <div class="modal-overlay" id="sold-modal" style="display:flex">
      <div class="modal" style="max-width:560px">
        <div class="modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <h3 style="font-family:'Oswald';font-size:1.1rem;text-transform:uppercase;color:var(--chrome-1)">Mark Sold — ${v.year} ${v.make} ${v.model}</h3>
            <button class="modal-close" style="position:static" onclick="closeModal('sold-modal')">&times;</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Selling Price</label><input type="number" id="sp-price" value="${v.price||0}" style="width:100%;padding:9px;border:1px solid var(--line);background:var(--black);color:#fff;font-family:'Inter';font-size:.85rem"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Reserve (non-GST)</label><input type="number" id="sp-reserve" value="0" style="width:100%;padding:9px;border:1px solid var(--line);background:var(--black);color:#fff;font-family:'Inter';font-size:.85rem"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">GST Collected</label><input type="number" id="sp-gstc" value="0" style="width:100%"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">PST Collected</label><input type="number" id="sp-pstc" value="0" style="width:100%"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Seller</label><input id="sp-seller" value="${esc(v.source_name||CRM_CFG.legalName||'GP Auto Sales')}" style="width:100%"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Sale Date</label><input type="date" id="sp-date" style="width:100%"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Buyer Name</label><input id="sp-bn" value="${esc(v.buyer_name||'')}" style="width:100%"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Buyer Phone</label><input id="sp-bp" value="${esc(v.buyer_phone||'')}" style="width:100%"></div>
          </div>
          <button class="btn btn-solid" style="margin-top:16px;width:100%;justify-content:center" onclick="doMarkSold('${v.vehicle_id||v.id}')">Confirm — Mark as Sold</button>
        </div>
      </div>
    </div>`;
  document.getElementById('sold-modal').addEventListener('click', function(e){ if(e.target===this)closeModal('sold-modal'); });
}

async function doMarkSold(id) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id||x.id)===id);
  if (!v || !confirm('Mark this vehicle as SOLD? It will be removed from production.')) return;
  const data = {
    vehicle_id: id,
    stock_number: v.stock_number, year: v.year, make: v.make, model: v.model,
    purchase_price: v.purchase_price||v.price||0, gst_paid: v.gst_paid||0,
    selling_price: parseInt(document.getElementById('sp-price').value)||0,
    reserve_non_gst: parseInt(document.getElementById('sp-reserve').value)||0,
    gst_collected: parseInt(document.getElementById('sp-gstc').value)||0,
    pst_collected: parseInt(document.getElementById('sp-pstc').value)||0,
    seller_name: document.getElementById('sp-seller').value,
    sale_date: document.getElementById('sp-date').value,
    buyer_name: document.getElementById('sp-bn').value,
    buyer_phone: document.getElementById('sp-bp').value,
  };
  try { await api('/api/crm/sold', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }); closeModal('sold-modal'); await loadData(); }
  catch(e) { alert('Error: '+e.message); }
}

// ============================================================================
//  INSPECTION
// ============================================================================
const INSP = {
  'Powertrain': ['Accelerator','Fuel System','Exhaust','Transmission','Front/Rear Axles','Clutch','Fluid Levels','CV Joints'],
  'Brakes': ['Parking Brake','Hydraulic System','Vacuum System','Drum Brakes','Disc Brakes','Shoes/Pads','Anti-Lock'],
  'Frame & Body': ['Hood Latch','Door Latches','Bumpers','Wipers','Windshield','Windows','Defrost','Mirrors','Seats','Seat Belts','Mudguards','Structure'],
  'Lamps': ['Head Hi Beam','Head Lo Beam','DRL','Tail Lamps','Brake Lamps','Turn Signal','Hazard','Licence Plate','Back-up'],
  'Steering': ['Steering Lash','Linkage','Rack & Pinion','Power Steering','King Pin','Ball Joints'],
  'Tires & Wheels': ['Tread Depth','Tread Section','Sidewalls','Wheels'],
  'Instruments': ['Speedometer','Indicator Lamps','Horn','Hi Beam Indicator'],
  'Suspension': ['Leaf Springs','Struts/Shocks','Coil Spring','Torsion Bar','Multilink','Computer Controlled'],
  'Electrical': ['Wiring','Battery','Switches','Alternator'],
  'Diagnostic': ['DTC'],
};

function openInsp(id) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id||x.id)===id);
  if (!v) return;
  let d = {}; try { d = JSON.parse(v.inspection_data||'{}'); } catch {}
  const items = Object.entries(INSP).map(([sec, its]) => {
    return `<div class="insp-section">${sec}</div>` + its.map(it => {
      const st = d[it] || '';
      return `<div class="insp-item ${st}" onclick="cycleI(this)" data-state="${st}">${it}<span>${st||'—'}</span></div>`;
    }).join('');
  }).join('');

  document.getElementById('crm-modals').innerHTML = `
    <div class="modal-overlay" id="insp-modal" style="display:flex">
      <div class="modal" style="max-width:800px;max-height:90vh;overflow-y:auto">
        <div class="modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="font-family:'Oswald';font-size:1.1rem;text-transform:uppercase;color:var(--chrome-1)">Mechanical Fitness Assessment</h3>
            <button class="modal-close" style="position:static" onclick="closeModal('insp-modal')">&times;</button>
          </div>
          <p style="font-family:'Inter';font-size:.82rem;color:var(--muted);margin-bottom:8px">${v.year} ${v.make} ${v.model} · VIN: ${v.vin||'N/A'}</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:8px">
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Odometer</label><input type="number" id="insp-odo" value="${d._odometer||v.mileage||''}" style="width:100%;padding:7px;border:1px solid var(--line);background:var(--black);color:#fff;font-family:'Inter';font-size:.8rem"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Facility</label><input value="${CRM_CFG.inspection?.facilityName||''}" readonly style="width:100%;padding:7px;border:1px solid var(--line);background:var(--black);color:var(--muted);font-family:'Inter';font-size:.8rem"></div>
            <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Technician</label><input value="${CRM_CFG.inspection?.technicianName||''}" readonly style="width:100%;padding:7px;border:1px solid var(--line);background:var(--black);color:var(--muted);font-family:'Inter';font-size:.8rem"></div>
          </div>
          <div style="display:flex;gap:8px;margin:6px 0;align-items:center">
            <button class="btn btn-ghost" style="font-size:.66rem;padding:5px 10px" onclick="markAllI('C')">Mark Rest Complies</button>
            <button class="btn btn-ghost" style="font-size:.66rem;padding:5px 10px" onclick="markAllI('')">Clear All</button>
            <span style="font-size:.7rem;color:var(--muted);font-family:'Inter';margin-left:auto" id="insp-cnt"></span>
          </div>
          <div class="insp-grid">${items}</div>
          <div class="field" style="margin-top:10px"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Technician Comments</label><textarea id="insp-cmts" rows="2" style="width:100%;padding:8px;border:1px solid var(--line);background:var(--black);color:#fff;font-family:'Inter';font-size:.8rem;resize:vertical">${esc(d._comments||'')}</textarea></div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn btn-solid" onclick="saveInsp('${id}')">Save & Print</button>
            <button class="btn btn-ghost" onclick="saveInspOnly('${id}')">Save Only</button>
          </div>
          <p style="font-size:.65rem;color:var(--muted);margin-top:6px;font-family:'Inter'">Certification expires 120 days after issue.</p>
        </div>
      </div>
    </div>`;
  document.getElementById('insp-modal').addEventListener('click', function(e){ if(e.target===this)closeModal('insp-modal'); });
  upCnt();
}

function cycleI(el) { const st=['C','N','NA','']; const i=st.indexOf(el.dataset.state); el.dataset.state=st[(i+1)%4]; el.className='insp-item '+el.dataset.state; el.querySelector('span').textContent=el.dataset.state||'—'; upCnt(); }
function markAllI(state) { document.querySelectorAll('#insp-modal .insp-item').forEach(el=>{if(!el.dataset.state){el.dataset.state=state;el.className='insp-item '+state;el.querySelector('span').textContent=state||'—';}}); upCnt(); }
function upCnt() { const total=document.querySelectorAll('#insp-modal .insp-item').length; const m=[...document.querySelectorAll('#insp-modal .insp-item')].filter(e=>e.dataset.state).length; document.getElementById('insp-cnt').textContent=m+'/'+total+' marked'; }

function collectI() {
  const d = {};
  document.querySelectorAll('#insp-modal .insp-item').forEach(el => { const it=el.textContent.trim().split(' ')[0]; d[it]=el.dataset.state||''; });
  d._odometer = document.getElementById('insp-odo').value;
  d._comments = document.getElementById('insp-cmts').value;
  return d;
}

async function saveInspOnly(id) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id||x.id)===id);
  if (!v) return;
  v.inspection_data = JSON.stringify(collectI());
  v.inspection_done = 1;
  closeModal('insp-modal'); renderProd(); saveData();
}

async function saveInsp(id) {
  await saveInspOnly(id);
  printInsp(id);
}

async function printInsp(id) {
  const v = CRM_VEHICLES.find(x => (x.vehicle_id||x.id)===id);
  if (!v) return;
  const d = JSON.parse(v.inspection_data||'{}');
  const cfg = CRM_CFG;
  const rows = Object.entries(INSP).map(([sec,its]) =>
    `<tr><td colspan="2" style="font-weight:700;background:#f0f0f0;padding:3px;font-size:7pt">${sec}</td></tr>` +
    its.map(it => `<tr><td style="font-size:7pt">${it}</td><td style="text-align:center;width:40px;font-size:7pt">${d[it]==='C'?'✓':d[it]==='N'?'✗':d[it]==='NA'?'N/A':''}</td></tr>`).join('')
  ).join('');

  const w = window.open('','_blank','width=900,height=1100');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Inspection — ${v.year} ${v.make} ${v.model}</title>
<style>@page{size:letter;margin:.3in}body{font-family:Arial;font-size:7pt;color:#000}
h2{font-size:12pt;text-align:center;margin:0 0 4px}.head{display:flex;justify-content:space-between;margin-bottom:6px}
.head-box{border:1px solid #000;padding:3px 5px;font-size:6pt}table{width:100%;border-collapse:collapse;margin-bottom:3px}
td{padding:1px 3px;border:1px solid #ccc}.sig{margin-top:14px}.sig-line{border-bottom:1px solid #000;width:200px;margin-bottom:2px}
</style></head><body>
<h2>Mechanical Fitness Assessment</h2>
<div class="head"><div class="head-box"><strong>Facility:</strong> ${cfg.inspection?.facilityName||'—'}<br><strong>#:</strong> ${cfg.inspection?.facilityNumber||'—'}</div>
<div class="head-box"><strong>Dealer:</strong> ${cfg.inspection?.dealerLegalName||cfg.legalName}<br><strong>:</strong> ${cfg.inspection?.dealerAddress||''}</div></div>
<p><strong>Vehicle:</strong> ${v.year} ${v.make} ${v.model} ${v.trim||''} | <strong>VIN:</strong> ${v.vin||'N/A'} | <strong>Odometer:</strong> ${d._odometer||v.mileage||'—'} km</p>
<table>${rows}</table>
${d._comments?`<p><strong>Comments:</strong> ${esc(d._comments)}</p>`:''}
<div class="sig"><div class="sig-line"></div><div style="font-size:7pt">Technician: ${cfg.inspection?.technicianName||'—'} | Date: _______________</div></div>
<p style="font-size:5pt;font-style:italic">I certify the above vehicle has been inspected as indicated. Assessment expires 120 days from issue.</p>
<div class="sig" style="margin-top:16px"><div class="sig-line"></div><div style="font-size:7pt">Signature | Date: _______________</div></div>
</body></html>`);
  w.document.close(); setTimeout(()=>w.print(),500);
}

// ============================================================================
//  LEDGER
// ============================================================================
function renderLedger() {
  const s = document.getElementById('ledger-search').value.toLowerCase();
  let list = CRM_VEHICLES;
  if (s) list = list.filter(v => (v.stock_number||''+v.year+v.make+v.model).toLowerCase().includes(s));

  const cols = ['Vehicle','Stock','Location','Purchase','ICBC','Detail','Transport','Boost','Tire','Repair','Windshield','AFC','Misc','Sales','Total','GST','Date'];
  const rows = list.map(v => [
    `${v.year} ${v.make} ${v.model}`, v.stock_number||'', v.location||'Dealership',
    v.purchase_price||0,v.icbc||0,v.detailing||0,v.transport||0,v.boost||0,v.tire||0,
    v.repair||0,v.windshield||0,v.afc_extra||0,v.misc_cost||0,v.sales_cost||0,
    (v.purchase_price||0)+(v.icbc||0)+(v.detailing||0)+(v.transport||0)+(v.boost||0)+(v.tire||0)+(v.repair||0)+(v.windshield||0)+(v.afc_extra||0)+(v.misc_cost||0)+(v.sales_cost||0),
    v.gst_paid||0, new Date(v.created_at).toLocaleDateString()
  ]);
  const totals = ['TOTAL','','',0,0,0,0,0,0,0,0,0,0,0,0,0,''];
  rows.forEach(r => { for(let i=3;i<=14;i++)totals[i]+=r[i]; totals[15]+=r[15]; });

  document.getElementById('ledger-wrap').innerHTML = `<table class="wide-table"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>
    ${[...rows,totals].map((r,i)=>`<tr${i===rows.length?' class="total"':''}>${r.map((v,j)=>`<td>${j>=3&&j<=15?'$'+v.toLocaleString():String(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function exportLedger() {
  const rows = CRM_VEHICLES.map(v => [v.year,v.make,v.model,v.stock_number||'',v.location||'Dealership',v.purchase_price||0,v.icbc||0,v.detailing||0,v.transport||0,v.boost||0,v.tire||0,v.repair||0,v.windshield||0,v.afc_extra||0,v.misc_cost||0,v.sales_cost||0,v.gst_paid||0,new Date(v.created_at).toISOString().slice(0,10)]);
  const csv = [['Year','Make','Model','Stock','Location','Purchase','ICBC','Detail','Transport','Boost','Tire','Repair','Windshield','AFC','Misc','Sales','GST','Date'].join(','), ...rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(','))].join('\n');
  dl(csv, 'ledger.csv');
}

// ============================================================================
//  SOLD
// ============================================================================
function renderSold() {
  const s = document.getElementById('sold-search').value.toLowerCase();
  let list = CRM_SOLD;
  if (s) list = list.filter(r => (r.buyer_name||''+r.seller_name||''+r.stock_number||''+r.make+''+r.model).toLowerCase().includes(s));

  const cols = ['Stock','Vehicle','Purchase','GST','Seller','Date','Price','Reserve','GST Col','PST','Buyer','Profit',''];
  const rows = list.map(r => {
    const p = (r.selling_price||0)-(r.purchase_price||0);
    return [r.stock_number||'',`${r.year} ${r.make} ${r.model}`,r.purchase_price||0,r.gst_paid||0,r.seller_name||'',r.sale_date,r.selling_price||0,r.reserve_non_gst||0,r.gst_collected||0,r.pst_collected||0,r.buyer_name||'',p,r.id];
  });
  const totals = ['','',0,0,'','',0,0,0,0,'',0,''];
  rows.forEach(r => { totals[2]+=r[2]; totals[3]+=r[3]; totals[6]+=r[6]; totals[7]+=r[7]; totals[8]+=r[8]; totals[9]+=r[9]; totals[11]+=r[11]; });

  document.getElementById('sold-wrap').innerHTML = `<table class="wide-table"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>
    ${[...rows,totals].map((r,i)=>{
      if (i===rows.length) return `<tr class="total">${r.map((v,j)=>`<td>${j>=2&&j<=11?'$'+v.toLocaleString():j===12?'':String(v)}</td>`).join('')}</tr>`;
      return `<tr>${r.map((v,j)=>j===12?`<td><button class="btn btn-ghost" style="font-size:.64rem;padding:3px 8px" onclick="retInv('${v}')">Return</button></td>`:`<td>${j>=2&&j<=11?'$'+v.toLocaleString():String(v)}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table>`;
}

async function retInv(id) {
  if (!confirm('Return this vehicle to inventory?')) return;
  try { await api(`/api/crm/sold/${id}/return`, { method:'POST' }); await loadData(); }
  catch(e) { alert('Error: '+e.message); }
}

function exportSoldCSV() {
  const rows = CRM_SOLD.map(r => [r.stock_number||'',r.year,r.make,r.model,r.purchase_price||0,r.gst_paid||0,r.seller_name||'',r.sale_date,r.selling_price||0,r.reserve_non_gst||0,r.gst_collected||0,r.pst_collected||0,r.buyer_name||'',r.buyer_phone||'',r.buyer_email||'',(r.selling_price||0)-(r.purchase_price||0)]);
  const h = ['Stock','Year','Make','Model','Purchase','GST','Seller','Date','Price','Reserve','GST Col','PST','Buyer','Phone','Email','Profit'];
  dl([h.join(','), ...rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(','))].join('\n'), 'sold.csv');
}

// ============================================================================
//  BACKUP
// ============================================================================
function showBackup() {
  document.getElementById('crm-modals').innerHTML = `
    <div class="modal-overlay" id="backup-modal" style="display:flex">
      <div class="modal" style="max-width:500px">
        <div class="modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <h3 style="font-family:'Oswald';font-size:1.1rem;text-transform:uppercase;color:var(--chrome-1)">Backup & Restore</h3>
            <button class="modal-close" style="position:static" onclick="closeModal('backup-modal')">&times;</button>
          </div>
          <p style="font-family:'Inter';font-size:.85rem;color:var(--muted);margin-bottom:12px">CRM data is stored in GitHub — every save is a commit. Download an offline copy below.</p>
          <button class="btn btn-solid" style="width:100%;justify-content:center;margin-bottom:16px" onclick="dlBackup()">Download Backup</button>
          <div style="border-top:1px solid var(--line);padding-top:16px">
            <p style="font-family:'Inter';font-size:.8rem;color:var(--muted);margin-bottom:8px">Restore from file:</p>
            <input type="file" id="restore-file" accept=".json" style="margin-bottom:8px;font-family:'Inter';font-size:.82rem">
            <div style="display:flex;gap:8px">
              <button class="btn btn-ghost" style="font-size:.68rem" onclick="restore('merge')">Merge</button>
              <button class="btn btn-ghost" style="font-size:.68rem;color:#ef4444" onclick="restore('replace')">Replace All</button>
            </div>
            <div id="restore-msg" style="margin-top:8px;font-family:'Inter';font-size:.8rem"></div>
          </div>
        </div>
      </div>
    </div>`;
  document.getElementById('backup-modal').addEventListener('click', function(e){ if(e.target===this)closeModal('backup-modal'); });
}

async function dlBackup() { try{const r=await api('/api/crm/backup');const b=await r.blob();const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(u)}catch(e){alert('Error: '+e.message)} }

async function restore(mode) {
  const f = document.getElementById('restore-file').files[0];
  const msg = document.getElementById('restore-msg');
  if (!f) { msg.textContent='Select a file.'; return; }
  const text = await f.text(); let d;
  try { d = JSON.parse(text); } catch { msg.textContent='Invalid JSON.'; return; }
  if (!confirm(`${mode==='replace'?'REPLACE all':'Merge'} ${(d.crmVehicles||[]).length+(d.soldRecords||[]).length} records?`)) return;
  msg.innerHTML='Restoring…';
  try { const r=await api('/api/crm/backup/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:d,mode})}); const j=await r.json(); msg.textContent=`Done. Added ${j.added}, skipped ${j.skipped}.`; loadData(); }
  catch(e) { msg.textContent='Error: '+e.message; }
}

// ============================================================================
//  HELPERS
// ============================================================================
function closeModal(id) { const el=document.getElementById(id); if(el)el.remove(); }
function esc(s) { if(s==null)return''; const d=document.createElement('div');d.textContent=String(s);return d.innerHTML; }
function dl(content, fn) { const b=new Blob([content],{type:'text/csv'}); const u=URL.createObjectURL(b); const a=document.createElement('a');a.href=u;a.download=fn;a.click();URL.revokeObjectURL(u); }
