/* ============================================================================
   Absolute Motor Cars — Document Generators
   Window Sticker, Bill of Sale, Delivery Waiver
   Phase 1 · Steps 10-12
   ============================================================================ */

// ---- Config (filled from /api/config) ----
let DOCS_CFG = {};

(async function init() {
  try { DOCS_CFG = await (await fetch('/api/config')).json(); } catch {}
})();

// ============================================================================
//  VEHICLE PICKER (shared)
// ============================================================================
async function getVehicles() {
  const token = localStorage.getItem('amc_token') || '';
  try {
    const r = await fetch('/api/vehicles', { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
    return await r.json();
  } catch { return []; }
}

function makeVehiclePicker(selectEl, onSelect) {
  selectEl.innerHTML = '<option value="">— Select a vehicle —</option>';
  getVehicles().then(vehicles => {
    vehicles.forEach(v => {
      const label = `${v.year} ${v.make} ${v.model} ${v.trim || ''} — ${v.stock_number ? 'Stock #'+v.stock_number : ''}`;
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = label;
      selectEl.appendChild(opt);
    });
    if (onSelect) selectEl.addEventListener('change', () => {
      const v = vehicles.find(x => x.id === selectEl.value);
      if (v) onSelect(v);
    });
  });
}

// ============================================================================
//  WINDOW STICKER
// ============================================================================

// Logo cache
let LOGO_BASE64 = '';

async function getLogo() {
  if (LOGO_BASE64) return LOGO_BASE64;
  try {
    const r = await fetch('/logo.png');
    if (r.ok) {
      const blob = await r.blob();
      LOGO_BASE64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }
  } catch {}
  return LOGO_BASE64;
}

async function openStickerModalForm(vehicle) {
  const v = vehicle || null;
  const logo = await getLogo();

  const html = `
    <div class="modal-overlay" id="sticker-modal-overlay" style="display:flex">
      <div class="modal form-modal">
        <div class="form-header">
          <h3>Window Sticker</h3>
          <button class="modal-close" style="position:static" onclick="document.getElementById('sticker-modal-overlay').remove()">&times;</button>
        </div>
        <div class="form-body">
          <div class="alert" style="background:rgba(245,158,11,0.1);border-color:#f59e0b;color:#f59e0b;font-size:0.8rem;margin-bottom:16px">
            ⚠️ When printing, enable <strong>"Background graphics"</strong> in your browser's print settings.
          </div>
          <div class="form-group">
            <label>Vehicle</label>
            <select id="sticker-vehicle-pick"></select>
          </div>
          <div class="form-group"><label>Highlights / Features (one per line)</label>
            <textarea id="sticker-features" rows="4" placeholder="Leather seats&#10;Sunroof&#10;Navigation"></textarea>
          </div>
          <div class="form-group"><label>Title Status</label>
            <input type="text" id="sticker-title-status" value="Clean Title">
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="sticker-financing" checked>
            <label for="sticker-financing">Financing Available</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="sticker-certified">
            <label for="sticker-certified">Dealer Certified</label>
          </div>
          <button class="btn btn-primary btn-block" onclick="generateWindowSticker()">Generate & Print</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  makeVehiclePicker(document.getElementById('sticker-vehicle-pick'), _v => {});

  // Close on overlay click
  document.getElementById('sticker-modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) this.remove();
  });
}

async function generateWindowSticker() {
  const selectEl = document.getElementById('sticker-vehicle-pick');
  const vehicles = await getVehicles();
  const v = vehicles.find(x => x.id === selectEl.value);
  if (!v) { alert('Select a vehicle first'); return; }

  const cfg = DOCS_CFG;
  const features = (document.getElementById('sticker-features').value || '').split('\n').filter(Boolean);
  const titleStatus = document.getElementById('sticker-title-status').value || 'Clean Title';
  const hasFinancing = document.getElementById('sticker-financing').checked;
  const isCertified = document.getElementById('sticker-certified').checked;
  const logo = await getLogo();

  const specs = [];
  if (v.mileage) specs.push(['Mileage', `${v.mileage.toLocaleString()} km`]);
  if (v.exterior) specs.push(['Exterior', v.exterior]);
  if (v.interior) specs.push(['Interior', v.interior]);
  if (v.engine) specs.push(['Engine', v.engine]);
  if (v.transmission) specs.push(['Transmission', v.transmission]);
  if (v.drivetrain) specs.push(['Drivetrain', v.drivetrain]);
  if (v.fuel) specs.push(['Fuel', v.fuel]);

  const win = window.open('', '_blank', 'width=850,height=1100');
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Window Sticker — ${v.year} ${v.make} ${v.model}</title>
<style>
  @page { size: letter; margin: 0.4in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0a0a0a; font-size: 10pt; }
  .page { min-height: 10in; display: flex; flex-direction: column; border: 2px solid #0a0a0a; padding: 0.25in; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0a0a0a; padding-bottom: 8px; margin-bottom: 12px; }
  .header img { height: 100px; }
  .header-phone { font-size: 40pt; font-weight: 900; color: #0a0a0a; }
  .header-addr { font-size: 9pt; text-align: right; }
  .stock-bar { background: #0a0a0a; color: #fff; text-align: center; padding: 4px 0; font-size: 9pt; font-weight: 700; margin-bottom: 12px; letter-spacing: 0.05em; }
  .year { font-size: 10pt; letter-spacing: 0.15em; text-transform: uppercase; color: #555; }
  .title { font-size: 40pt; font-weight: 900; line-height: 1; }
  .trim { font-size: 16pt; font-style: italic; color: #555; margin-bottom: 4px; }
  .price { font-size: 52pt; font-weight: 900; color: #e0120c; margin: 8px 0; }
  .price-sub { font-size: 9pt; color: #555; margin-bottom: 12px; }
  .specs { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #0a0a0a; margin-bottom: 12px; }
  .spec-item { background: #fff; padding: 6px 10px; }
  .spec-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.05em; color: #777; }
  .spec-value { font-size: 10pt; font-weight: 600; }
  .features-title { font-size: 9pt; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
  .features { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 40px; margin-bottom: 12px; flex: 1; }
  .feature { font-size: 9pt; }
  .feature::before { content: '✓ '; color: #e0120c; font-weight: 700; }
  .spacer { flex: 1; }
  .status-bar { background: #0a0a0a; color: #fff; display: flex; gap: 24px; padding: 8px 12px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
  .footer { font-size: 8pt; text-align: center; margin-top: 8px; color: #555; }
</style></head><body>
<div class="page">
  <div class="header">
    <div>${logo ? `<img src="${logo}" alt="">` : '<div style="font-size:20pt;font-weight:900;color:#e0120c">AMC</div>'}</div>
    <div class="header-phone">${cfg.phone || '778.855.4903'}</div>
    <div class="header-addr">${cfg.address || ''}<br>${cfg.city || ''}, ${cfg.province || ''} ${cfg.postalCode || ''}</div>
  </div>
  <div class="stock-bar">STOCK # ${v.stock_number || '—'}</div>
  <div class="year">${v.year}</div>
  <div class="title">${titleCase(v.make || '')} ${titleCase(v.model || '')}</div>
  ${v.trim ? `<div class="trim">${v.trim}</div>` : ''}
  <div class="price">$${v.price.toLocaleString()}</div>
  <div class="price-sub">Plus ${((DOCS_CFG.gstRate || 0.05) + (DOCS_CFG.pstRate || 0.07)) * 100}% ${cfg.province || 'BC'} Taxes &amp; Applicable Fees</div>
  <div class="specs">${specs.map(([l,val]) => `<div class="spec-item"><div class="spec-label">${l}</div><div class="spec-value">${escHtml(String(val))}</div></div>`).join('')}</div>
  ${features.length ? `<div class="features-title">Highlights</div><div class="features">${features.map(f => `<div class="feature">${escHtml(f)}</div>`).join('')}</div>` : ''}
  <div class="spacer"></div>
  <div class="status-bar">
    <span>${titleStatus}</span>
    ${hasFinancing ? '<span>✦ Financing Available</span>' : ''}
    ${isCertified ? '<span>✦ Dealer Certified</span>' : ''}
  </div>
  <div class="footer">${cfg.legalName || 'GP Auto Sales Ltd.'} · Dealer Reg #${cfg.dealerReg || '30721'} · ${cfg.phone || '778.855.4903'}</div>
</div>
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ============================================================================
//  BILL OF SALE
// ============================================================================

const PROVINCES = ['Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Nova Scotia','Ontario','Prince Edward Island','Quebec','Saskatchewan','Northwest Territories','Nunavut','Yukon'];

function openBOSModalForm() {
  const html = `
    <div class="modal-overlay" id="bos-modal-overlay" style="display:flex">
      <div class="modal form-modal" style="max-width:800px">
        <div class="form-header">
          <h3>Bill of Sale / Waiver</h3>
          <button class="modal-close" style="position:static" onclick="document.getElementById('bos-modal-overlay').remove()">&times;</button>
        </div>
        <div class="form-body" style="max-height:70vh">
          <div class="alert" style="background:rgba(245,158,11,0.1);border-color:#f59e0b;color:#f59e0b;font-size:0.8rem;margin-bottom:16px">
            ⚠️ When printing, enable <strong>"Background graphics"</strong> in your browser's print settings.
          </div>

          <div class="checkbox-group" style="margin-bottom:16px">
            <input type="checkbox" id="bos-check-bos" checked onchange="updateBOSButton()">
            <label for="bos-check-bos">Bill of Sale</label>
            <input type="checkbox" id="bos-check-waiver" onchange="updateBOSButton()" style="margin-left:16px">
            <label for="bos-check-waiver">Delivery Waiver</label>
          </div>

          <div class="form-group"><label>Vehicle</label><select id="bos-vehicle-pick"></select></div>

          <div class="form-section"><div class="form-section-header">Purchaser</div><div class="form-section-body">
            <div class="form-inline">
              <div class="form-group"><label>Name</label><input id="bos-purch-name"></div>
              <div class="form-group"><label>Address</label><input id="bos-purch-addr"></div>
              <div class="form-group"><label>City</label><input id="bos-purch-city"></div>
              <div class="form-group"><label>Province</label><select id="bos-purch-prov">${PROVINCES.map(p => `<option value="${p}">${p}</option>`).join('')}</select></div>
              <div class="form-group"><label>Postal Code</label><input id="bos-purch-postal"></div>
              <div class="form-group"><label>Driver's License</label><input id="bos-purch-dl"></div>
              <div class="form-group"><label>Email</label><input type="email" id="bos-purch-email"></div>
              <div class="form-group"><label>Home Phone</label><input type="tel" id="bos-purch-home"></div>
              <div class="form-group"><label>Work Phone</label><input type="tel" id="bos-purch-work"></div>
              <div class="form-group"><label>Cell Phone</label><input type="tel" id="bos-purch-cell"></div>
              <div class="form-group"><label>Date</label><input type="date" id="bos-date"></div>
            </div>
          </div></div>

          <div class="form-section"><div class="form-section-header">Financial Breakdown</div><div class="form-section-body">
            <div class="form-inline" style="grid-template-columns:1fr 1fr 1fr">
              <div class="form-group"><label>Selling Price</label><input type="number" id="bos-price" oninput="updateBOSTotals()"></div>
              <div class="form-group"><label>Warranty</label><input type="number" id="bos-warranty" value="0" oninput="updateBOSTotals()"></div>
              <div class="form-group"><label>Trade-in Allowance</label><input type="number" id="bos-tradein" value="0" oninput="updateBOSTotals()"></div>
              <div class="form-group"><label>Doc Fee</label><input type="number" id="bos-docfee" value="0" oninput="updateBOSTotals()"></div>
              <div class="form-group"><label>Transaction Levy</label><input type="number" id="bos-levy" value="0" oninput="updateBOSTotals()"></div>
              <div class="form-group"><label>Lender Admin Fee</label><input type="number" id="bos-lender" value="0" oninput="updateBOSTotals()"></div>
              <div class="form-group"><label>Lien Registration</label><input type="number" id="bos-lienreg" value="0" oninput="updateBOSTotals()"></div>
              <div class="form-group"><label>Admin/CC Fee</label><input type="number" id="bos-admincc" value="0" oninput="updateBOSTotals()"></div>
              <div class="form-group"><label>Down Payment</label><input type="number" id="bos-down" value="0" oninput="updateBOSTotals()"></div>
              <div class="form-group"><label>Deposit</label><input type="number" id="bos-deposit" value="0" oninput="updateBOSTotals()"></div>
              <div class="form-group"><label>CC Charge</label><input type="number" id="bos-cccharge" value="0" oninput="updateBOSTotals()"></div>
            </div>
            <div style="margin-top:12px;padding:12px;background:var(--bg);border-radius:4px;font-size:0.85rem">
              <div>Price Difference: <strong id="bos-diff">$0.00</strong></div>
              <div>Subtotal: <strong id="bos-sub">$0.00</strong></div>
              <div>GST (${(DOCS_CFG.gstRate || 0.05) * 100}%): <strong id="bos-gst">$0.00</strong></div>
              <div>PST (${(DOCS_CFG.pstRate || 0.07) * 100}%): <strong id="bos-pst">$0.00</strong></div>
              <div style="font-size:1.1rem;margin-top:4px">Total Delivery Price: <strong id="bos-total" style="color:var(--accent)">$0.00</strong></div>
              <div>Balance Due: <strong id="bos-balance" style="color:var(--accent)">$0.00</strong></div>
            </div>
          </div></div>

          <div class="form-section"><div class="form-section-header">Declarations</div><div class="form-section-body">
            <div class="form-group"><label>Used as taxi/police/emergency/racing?</label><select id="bos-decl-taxi"><option>No</option><option>Yes</option></select></div>
            <div class="form-group"><label>Used as lease/rental?</label><select id="bos-decl-lease"><option>No</option><option>Yes</option></select></div>
            <div class="form-group"><label>Registered outside ${DOCS_CFG.province || 'BC'}?</label><select id="bos-decl-outside" onchange="toggleOutsideProv()"><option>No</option><option>Yes</option></select></div>
            <div class="form-group" id="bos-outside-prov-grp" style="display:none"><label>Previously registered in:</label><select id="bos-outside-prov">${PROVINCES.filter(p => p !== DOCS_CFG.province && p !== 'British Columbia').map(p => `<option>${p}</option>`).join('')}</select></div>
            <div class="form-group"><label>Odometer accurate?</label><select id="bos-decl-odo"><option>Yes</option><option>No</option></select></div>
            <div class="form-group"><label>Damage over $2,000</label><input id="bos-decl-damage" value="No"></div>
            <div class="form-group"><label>Complies with Motor Vehicle Act?</label><select id="bos-decl-mva"><option>Yes</option><option>No</option></select></div>
            <div class="form-group"><label>Warranty Statement</label><input id="bos-decl-warranty" value="No Warranties of Any Sorts."></div>
            <div class="form-group"><label>Repairs to be Effected</label><input id="bos-decl-repairs"></div>
            <div class="form-group"><label>Additional Notes / Special Terms</label><textarea id="bos-notes" rows="2"></textarea></div>
          </div></div>

          <div class="form-section"><div class="form-section-header">Financing Details</div><div class="form-section-body">
            <div class="form-inline">
              <div class="form-group"><label>Payment Frequency</label><select id="bos-payfreq"><option value="">—</option><option>Weekly</option><option>Bi-Weekly</option><option>Monthly</option></select></div>
              <div class="form-group"><label>Start Date</label><input type="date" id="bos-paystart"></div>
              <div class="form-group"><label>Term (months)</label><input type="number" id="bos-payterm"></div>
              <div class="form-group"><label>Payment Amount</label><input type="number" id="bos-payamount"></div>
              <div class="form-group"><label>Total Payments</label><input type="number" id="bos-totalpay"></div>
              <div class="form-group"><label>Amount Financed</label><input type="number" id="bos-amfin"></div>
              <div class="form-group"><label>Annual Rate (%)</label><input type="number" id="bos-rate" step="0.01"></div>
              <div class="form-group"><label>Total Finance Charges</label><input type="number" id="bos-fincharge"></div>
            </div>
          </div></div>

          <div class="form-section"><div class="form-section-header">Delivery</div><div class="form-section-body">
            <div class="form-inline">
              <div class="form-group"><label>Salesperson</label><input id="bos-salesperson"></div>
              <div class="form-group"><label>Delivery Required?</label><select id="bos-delivery"><option>No</option><option>Yes</option></select></div>
              <div class="form-group"><label>Date Delivered</label><input type="date" id="bos-deliverdate"></div>
            </div>
          </div></div>

          <button class="btn btn-primary btn-block" id="bos-generate-btn" onclick="generateBOS()">Generate Bill of Sale</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  makeVehiclePicker(document.getElementById('bos-vehicle-pick'), autoFillBOS);
  document.getElementById('bos-modal-overlay').addEventListener('click', function(e) { if (e.target === this) this.remove(); });
}

function updateBOSButton() {
  const bos = document.getElementById('bos-check-bos').checked;
  const waiver = document.getElementById('bos-check-waiver').checked;
  const btn = document.getElementById('bos-generate-btn');
  if (bos && waiver) btn.textContent = 'Generate Both Documents';
  else if (bos) btn.textContent = 'Generate Bill of Sale';
  else if (waiver) btn.textContent = 'Generate Waiver';
  else btn.textContent = 'Select document type';
}

function toggleOutsideProv() {
  const sel = document.getElementById('bos-decl-outside');
  document.getElementById('bos-outside-prov-grp').style.display = sel.value === 'Yes' ? '' : 'none';
}

async function autoFillBOS(v) {
  if (!v) return;
  document.getElementById('bos-price').value = v.price;
  updateBOSTotals();
}

function updateBOSTotals() {
  const get = id => parseInt(document.getElementById(id).value) || 0;
  const selling = get('bos-price');
  const warranty = get('bos-warranty');
  const tradein = get('bos-tradein');
  const docfee = get('bos-docfee');
  const levy = get('bos-levy');
  const lender = get('bos-lender');
  const lienreg = get('bos-lienreg');
  const admincc = get('bos-admincc');
  const down = get('bos-down');
  const deposit = get('bos-deposit');
  const cccharge = get('bos-cccharge');

  const diff = selling + warranty - tradein;
  const subtotal = diff + docfee + levy + lender + lienreg + admincc;
  const gstRate = DOCS_CFG.gstRate || 0.05;
  const pstRate = DOCS_CFG.pstRate || 0.07;
  const gst = Math.round(subtotal * gstRate);
  const pst = Math.round(subtotal * pstRate);
  const total = subtotal + gst + pst;
  const balance = total - down - deposit - cccharge;

  document.getElementById('bos-diff').textContent = `$${diff.toLocaleString()}`;
  document.getElementById('bos-sub').textContent = `$${subtotal.toLocaleString()}`;
  document.getElementById('bos-gst').textContent = `$${gst.toLocaleString()}`;
  document.getElementById('bos-pst').textContent = `$${pst.toLocaleString()}`;
  document.getElementById('bos-total').textContent = `$${total.toLocaleString()}`;
  document.getElementById('bos-balance').textContent = `$${balance.toLocaleString()}`;
}

async function generateBOS() {
  const cfg = DOCS_CFG;
  const doBOS = document.getElementById('bos-check-bos').checked;
  const doWaiver = document.getElementById('bos-check-waiver').checked;
  if (!doBOS && !doWaiver) { alert('Select at least one document.'); return; }

  const vehicles = await getVehicles();
  const vId = document.getElementById('bos-vehicle-pick').value;
  const v = vehicles.find(x => x.id === vId);
  if (!v && doBOS) { alert('Select a vehicle first.'); return; }

  const get = id => document.getElementById(id)?.value || '';

  if (doBOS) {
    const getNum = id => parseInt(document.getElementById(id)?.value) || 0;
    const selling = getNum('bos-price');
    const diff = selling + getNum('bos-warranty') - getNum('bos-tradein');
    const subtotal = diff + getNum('bos-docfee') + getNum('bos-levy') + getNum('bos-lender') + getNum('bos-lienreg') + getNum('bos-admincc');
    const gstR = cfg.gstRate || 0.05;
    const pstR = cfg.pstRate || 0.07;
    const gst = Math.round(subtotal * gstR);
    const pst = Math.round(subtotal * pstR);
    const total = subtotal + gst + pst;
    const balance = total - getNum('bos-down') - getNum('bos-deposit') - getNum('bos-cccharge');
    const logo = await getLogo();

    const outsideVal = get('bos-decl-outside') === 'Yes' ? `Yes — Previously registered in: ${get('bos-outside-prov')}` : 'No';

    const win = window.open('', '_blank', 'width=900,height=1100');
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Bill of Sale — ${v.year} ${v.make} ${v.model}</title>
<style>
  @page { size: letter; margin: 0.25in; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 7pt; color:#0a0a0a; }
  .banner { text-align:center; font-weight:900; font-size:8pt; border:1.5px solid #0a0a0a; padding:2px 0; margin-bottom:6px; }
  .header { display:flex; align-items:center; border:1.5px solid #0a0a0a; padding:6px; margin-bottom:4px; }
  .header img { height:55px; }
  .header-left { font-size:6.5pt; }
  .header-right { margin-left:auto; text-align:right; font-size:6.5pt; }
  table { width:100%; border-collapse:collapse; margin-bottom:4px; }
  table.bordered td, table.bordered th { border:1px solid #0a0a0a; padding:3px 5px; vertical-align:top; }
  td.label { font-size:5.5pt; text-transform:uppercase; color:#555; }
  td.value { font-size:7pt; font-weight:600; }
  .section { font-weight:900; font-size:7pt; background:#0a0a0a; color:#fff; padding:2px 5px; margin-bottom:2px; }
  .total-row td { font-weight:900; font-size:8pt; background:#0a0a0a; color:#fff; }
  .warranty { background:#fff5f0; border:2px solid #0a0a0a; padding:6px; margin:6px 0; font-size:7pt; font-weight:700; }
  .signatures { margin-top:8px; }
  .sig-block { display:inline-block; width:48%; margin-top:8px; }
  .sig-line { border-bottom:1px solid #0a0a0a; margin-top:20px; }
  .footer-bar { background:#0a0a0a; color:#fff; text-align:center; padding:3px; font-size:6pt; margin-top:8px; }
</style></head><body>
<div class="banner">THIS IS A LEGAL AND BINDING CONTRACT</div>
<div class="header">
  <div class="header-left">
    <strong>${cfg.dbaLine || cfg.legalName}</strong><br>
    ${cfg.address}, ${cfg.city}, ${cfg.province} ${cfg.postalCode}<br>
    Phone: ${cfg.phone} | Dealer Reg: ${cfg.dealerReg}
  </div>
  ${logo ? `<img src="${logo}" alt="">` : ''}
  <div class="header-right">
    GST #${cfg.gstNumber}<br>
    PST #${cfg.pstNumber}<br>
    Dealer Reg #${cfg.dealerReg}
  </div>
</div>

<div class="section">PURCHASER INFORMATION</div>
<table class="bordered"><tr>
  <td class="label">Name</td><td class="value">${escHtml(get('bos-purch-name'))}</td>
  <td class="label">Date</td><td class="value">${get('bos-date')}</td>
</tr><tr>
  <td class="label">Address</td><td class="value" colspan="3">${escHtml(get('bos-purch-addr'))}, ${escHtml(get('bos-purch-city'))}, ${get('bos-purch-prov')} ${get('bos-purch-postal')}</td>
</tr><tr>
  <td class="label">Driver's Lic.</td><td class="value">${escHtml(get('bos-purch-dl'))}</td>
  <td class="label">Email</td><td class="value">${get('bos-purch-email')}</td>
</tr><tr>
  <td class="label">Home</td><td class="value">${get('bos-purch-home')}</td>
  <td class="label">Work</td><td class="value">${get('bos-purch-work')}</td>
</tr><tr>
  <td class="label">Cell</td><td class="value" colspan="3">${get('bos-purch-cell')}</td>
</tr></table>

<div class="section">VEHICLE INFORMATION</div>
<table class="bordered"><tr>
  <td class="label">Year</td><td class="value">${v.year}</td>
  <td class="label">Make</td><td class="value">${v.make}</td>
  <td class="label">Model</td><td class="value">${v.model} ${v.trim||''}</td>
  <td class="label">Stock #</td><td class="value">${v.stock_number||'—'}</td>
</tr><tr>
  <td class="label">VIN</td><td class="value" colspan="3">${v.vin||'—'}</td>
  <td class="label">Odometer</td><td class="value">${v.mileage ? v.mileage.toLocaleString()+' km' : '—'}</td>
</tr></table>

<div class="section">FINANCIAL BREAKDOWN</div>
<table class="bordered">
  <tr><td class="label">Selling Price</td><td class="value" style="text-align:right">$${selling.toLocaleString()}</td></tr>
  <tr><td class="label">Warranty</td><td class="value" style="text-align:right">$${getNum('bos-warranty').toLocaleString()}</td></tr>
  <tr><td class="label">Trade-in Allowance</td><td class="value" style="text-align:right">($${getNum('bos-tradein').toLocaleString()})</td></tr>
  <tr><td class="label">Price Difference</td><td class="value" style="text-align:right"><strong>$${diff.toLocaleString()}</strong></td></tr>
  <tr><td class="label">Doc Fee / Levy / Lender / Lien / Admin</td><td class="value" style="text-align:right">$${getNum('bos-docfee').toLocaleString()} / $${getNum('bos-levy').toLocaleString()} / $${getNum('bos-lender').toLocaleString()} / $${getNum('bos-lienreg').toLocaleString()} / $${getNum('bos-admincc').toLocaleString()}</td></tr>
  <tr><td class="label">Subtotal</td><td class="value" style="text-align:right"><strong>$${subtotal.toLocaleString()}</strong></td></tr>
  <tr><td class="label">GST (${gstR*100}%)</td><td class="value" style="text-align:right">$${gst.toLocaleString()}</td></tr>
  <tr><td class="label">PST (${pstR*100}%)</td><td class="value" style="text-align:right">$${pst.toLocaleString()}</td></tr>
  <tr class="total-row"><td>TOTAL DELIVERY PRICE</td><td style="text-align:right">$${total.toLocaleString()}</td></tr>
  <tr><td class="label">Down Payment / Deposit / CC</td><td class="value" style="text-align:right">$${getNum('bos-down').toLocaleString()} / $${getNum('bos-deposit').toLocaleString()} / $${getNum('bos-cccharge').toLocaleString()}</td></tr>
  <tr class="total-row"><td>TOTAL BALANCE DUE</td><td style="text-align:right">$${balance.toLocaleString()}</td></tr>
</table>

<div class="section">DECLARATIONS</div>
<table class="bordered">
  <tr><td class="label">Used as taxi/police/racing?</td><td class="value">${get('bos-decl-taxi')}</td><td class="label">Used as lease/rental?</td><td class="value">${get('bos-decl-lease')}</td></tr>
  <tr><td class="label">Registered outside ${cfg.province}?</td><td class="value" colspan="3">${outsideVal}</td></tr>
  <tr><td class="label">Odometer accurate?</td><td class="value">${get('bos-decl-odo')}</td><td class="label">Damage >$2,000</td><td class="value">${escHtml(get('bos-decl-damage'))}</td></tr>
  <tr><td class="label">Complies w/ MVA?</td><td class="value">${get('bos-decl-mva')}</td><td class="label">Warranty</td><td class="value">${escHtml(get('bos-decl-warranty'))}</td></tr>
</table>

${get('bos-decl-repairs') ? `<div class="section">REPAIRS TO BE EFFECTED</div><p style="margin:4px">${escHtml(get('bos-decl-repairs'))}</p>` : ''}
${get('bos-notes') ? `<div style="border:1.5px solid #e0120c;padding:6px;margin:6px 0;font-weight:700;font-size:7pt"><strong>SPECIAL TERMS:</strong> ${escHtml(get('bos-notes'))}</div>` : ''}

<div class="warranty">
  Purchaser has inspected and/or test driven the vehicle and accepts its present condition. Except as expressly stated in this Bill of Sale or required by law, No warranties or guarantees are provided by the Dealer, expressed or implied, including any warranty of merchantability or fitness for a particular purpose. The vehicle is sold "AS IS — WHERE IS" unless otherwise specified above.
</div>

<div class="section">PURCHASER'S ACCEPTANCE</div>
<ol style="margin:4px 0 4px 16px;font-size:6.5pt">
  <li>I have read and understood all terms and conditions of this Bill of Sale.</li>
  <li>I acknowledge receipt of a true copy of this Bill of Sale.</li>
  <li>I understand that no other promises or conditions, verbal or otherwise, are binding unless stated in this document.</li>
</ol>

<div class="signatures">
  <div class="sig-block">
    <div class="sig-line"></div>
    <div style="font-size:6pt">Purchaser's Signature</div>
  </div>
  <div class="sig-block">
    <div class="sig-line"></div>
    <div style="font-size:6pt">Co-Purchaser's Signature</div>
  </div>
  <div class="sig-block">
    <div class="sig-line"></div>
    <div style="font-size:6pt">Vendor's Acceptance (${cfg.legalName})</div>
  </div>
</div>

<div class="footer-bar">${cfg.legalName || 'GP Auto Sales Ltd.'} · ${cfg.address}, ${cfg.city}, ${cfg.province} · ${cfg.phone} · Dealer Reg #${cfg.dealerReg}</div>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }

  // Waiver (after short delay if both)
  if (doWaiver) {
    const delay = doBOS ? 1200 : 0;
    setTimeout(() => generateWaiver(v), delay);
  }
}

function generateWaiver(v) {
  const cfg = DOCS_CFG;
  const win = window.open('', '_blank', 'width=850,height=1100');
  const vline = v ? `${v.year} ${v.make} ${v.model} ${v.trim||''} — VIN: ${v.vin||'N/A'}` : '';

  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Delivery Waiver — ${vline}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  body { font-family: Georgia, serif; font-size: 11pt; color:#0a0a0a; line-height:1.5; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
  .header img { height:60px; }
  h2 { font-size: 16pt; margin-bottom: 16px; text-align:center; }
  .vehicle-box { background:#f5f5f5; border-left:4px solid #0a0a0a; padding:8px 12px; margin-bottom:16px; }
  .waiver-text { margin-bottom:12px; font-size:10pt; }
  .terms { margin-left:20px; margin-bottom:16px; }
  .field { margin:12px 0; }
  .field label { display:inline-block; width:80px; font-weight:700; font-size:10pt; }
  .field .underline { display:inline-block; min-width:200px; border-bottom:1px solid #0a0a0a; }
  .sig { margin-top:32px; }
  .sig-line { border-bottom:1px solid #0a0a0a; width:250px; margin:0 auto; }
  @media print { body { -webkit-print-color-adjust:exact; } }
</style></head><body>
<div class="header">
  <div><strong>${cfg.legalName || 'GP Auto Sales Ltd.'}</strong><br><small>${cfg.address}, ${cfg.city}, ${cfg.province} ${cfg.postalCode}</small></div>
</div>

<h2>Delivery Waiver Acknowledgment</h2>

${v ? `<div class="vehicle-box"><strong>Vehicle:</strong> ${v.year} ${v.make} ${v.model} ${v.trim||''}<br><strong>VIN:</strong> ${v.vin||'N/A'} &nbsp;|&nbsp; <strong>Condition:</strong> Used</div>` : ''}

<div class="waiver-text">
  <p><strong>⚠️ WAIVER TEXT PLACEHOLDER</strong></p>
  <p style="color:#888;font-style:italic">The dealership must provide the exact Delivery Waiver wording. This text is a placeholder and should be replaced before use.</p>
  <p>The purchaser acknowledges that they have inspected the vehicle, received all keys and manuals, and accepts delivery of the vehicle in its present condition. The purchaser understands that upon delivery, the vehicle is their responsibility.</p>
</div>

<ol class="terms">
  <li>The purchaser has been given the opportunity to fully inspect the vehicle prior to taking delivery.</li>
  <li>All representations made by the dealer have been fulfilled to the purchaser's satisfaction at the time of delivery.</li>
  <li>Upon signing, the purchaser accepts the vehicle and all associated responsibilities including insurance, registration, and compliance with all applicable laws.</li>
</ol>

<div class="field"><label>Customer:</label> <span class="underline">&nbsp;</span></div>
<div class="field"><label>Date:</label> <span class="underline">&nbsp;</span></div>
<div class="field"><label>Address:</label> <span class="underline">&nbsp;</span></div>
<div class="field"><label>Phone:</label> <span class="underline">&nbsp;</span></div>

<div class="sig">
  <div class="sig-line"></div>
  <div style="text-align:center;font-size:9pt;margin-top:4px">SIGNATURE</div>
</div>

<div style="text-align:center;margin-top:32px;font-size:8pt;color:#aaa">${cfg.legalName || 'GP Auto Sales Ltd.'} · ${cfg.phone || ''} · Dealer Reg #${cfg.dealerReg || ''}</div>
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ============================================================================
//  Helpers
// ============================================================================
function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function titleCase(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Global entry points for admin page
function openStickerModal(v) {
  if (typeof openStickerModalForm === 'function') openStickerModalForm(v);
}
function openBOSModal() {
  openBOSModalForm();
}
