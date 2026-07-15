/* ============================================================================
   Absolute Motor Cars — Document Generators
   Window Sticker · Bill of Sale · Delivery Waiver
   Oswald/Inter design, professional print output
   ============================================================================ */

let DOCS_CFG = {};
let LOGO_B64 = '';

(async function init() {
  try { DOCS_CFG = await (await fetch('/api/config')).json(); } catch {}
  try {
    const r = await fetch('/logo.png');
    if (r.ok) { const blob = await r.blob(); LOGO_B64 = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(blob); }); }
  } catch {}
})();

const TOKEN = localStorage.getItem('amc_token') || '';
const PROVINCES = ['Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Nova Scotia','Ontario','Prince Edward Island','Quebec','Saskatchewan','Northwest Territories','Nunavut','Yukon'];

// ============================================================================
//  SHARED — vehicle picker
// ============================================================================
async function populatePicker(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select a vehicle —</option>';
  try {
    const r = await fetch('/api/vehicles', { headers: TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {} });
    const vehicles = await r.json();
    vehicles.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = `${v.year} ${v.make} ${v.model} ${v.trim||''} — ${v.stock_number ? '#'+v.stock_number : ''}`;
      sel.appendChild(opt);
    });
  } catch {}
}

// ============================================================================
//  WINDOW STICKER
// ============================================================================
function openStickerModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.id = 'sticker-modal';
  modal.innerHTML = `<div class="modal" style="max-width:540px"><div class="modal-body" style="padding:28px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h3 style="font-family:'Oswald';font-size:1.2rem;text-transform:uppercase;color:var(--chrome-1)">Window Sticker</h3>
      <button class="modal-close" style="position:static" onclick="closeDocModal('sticker-modal')">&times;</button>
    </div>
    <div class="field"><label style="font-family:'Oswald';font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Vehicle</label><select id="sticker-pick"></select></div>
    <div class="field"><label style="font-family:'Oswald';font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Highlights (one per line)</label><textarea id="sticker-hl" rows="4" placeholder="Leather seats&#10;Sunroof&#10;Navigation system"></textarea></div>
    <div class="field"><label style="font-family:'Oswald';font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Title Status</label><input id="sticker-title" value="Clean Title"></div>
    <label class="consent" style="margin:10px 0"><input type="checkbox" id="sticker-financing" checked><span>Financing Available</span></label>
    <label class="consent" style="margin:10px 0"><input type="checkbox" id="sticker-certified"><span>Dealer Certified</span></label>
    <p style="font-size:.7rem;color:#f59e0b;margin:8px 0;font-family:'Inter'">⚠️ When printing, enable <strong>Background graphics</strong> in browser print settings.</p>
    <button class="btn btn-solid" style="width:100%;justify-content:center" onclick="genSticker()">Generate & Print</button>
  </div></div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeDocModal('sticker-modal'); });
  populatePicker('sticker-pick');
}

async function genSticker() {
  const v = await getVehicleById(document.getElementById('sticker-pick').value);
  if (!v) { alert('Select a vehicle'); return; }
  const cfg = DOCS_CFG;
  const hl = (document.getElementById('sticker-hl').value||'').split('\n').filter(Boolean);
  const title = document.getElementById('sticker-title').value||'Clean Title';
  const hasFin = document.getElementById('sticker-financing').checked;
  const cert = document.getElementById('sticker-certified').checked;
  const logo = LOGO_B64;

  const specs = [];
  if (v.mileage) specs.push(['Mileage', `${Number(v.mileage).toLocaleString()} km`]);
  if (v.exterior) specs.push(['Exterior', v.exterior]);
  if (v.interior) specs.push(['Interior', v.interior]);
  if (v.engine) specs.push(['Engine', v.engine]);
  if (v.transmission) specs.push(['Transmission', v.transmission]);
  if (v.drivetrain) specs.push(['Drivetrain', v.drivetrain]);
  if (v.fuel) specs.push(['Fuel', v.fuel]);
  const taxPct = ((cfg.gstRate||0.05)+(cfg.pstRate||0.07))*100;

  const w = window.open('','_blank','width=850,height=1100');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Window Sticker — ${v.year} ${v.make} ${v.model}</title>
<style>
  @page{size:letter;margin:.4in}*{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10pt;color:#0a0a0a;background:#fff;color-scheme:only light}
  .page{min-height:10in;display:flex;flex-direction:column;border:2px solid #0a0a0a;padding:.25in}
  .hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #0a0a0a;padding-bottom:8px;margin-bottom:10px}
  .hdr img{height:100px}.hdr-phone{font-size:40pt;font-weight:900}
  .hdr-addr{font-size:9pt;text-align:right}
  .stock{background:#0a0a0a;color:#fff;text-align:center;padding:4px 0;font-size:9pt;font-weight:700;letter-spacing:.05em;margin-bottom:10px}
  .yr{font-size:10pt;letter-spacing:.15em;text-transform:uppercase;color:#555}
  .title{font-size:40pt;font-weight:900;line-height:1}
  .trim{font-size:16pt;font-style:italic;color:#555;margin-bottom:4px}
  .price{font-size:52pt;font-weight:900;color:#e0120c;margin:6px 0}
  .price-sub{font-size:9pt;color:#555;margin-bottom:10px}
  .specs{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#0a0a0a;margin-bottom:10px}
  .sp{background:#fff;padding:5px 8px}.sp-lbl{font-size:7pt;text-transform:uppercase;letter-spacing:.05em;color:#777}
  .sp-val{font-size:10pt;font-weight:600}
  .hl-title{font-size:9pt;font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
  .hls{display:grid;grid-template-columns:1fr 1fr;gap:3px 30px;margin-bottom:8px;flex:1}
  .hl{font-size:9pt}.hl::before{content:'✓ ';color:#e0120c;font-weight:700}
  .spacer{flex:1}
  .sbar{background:#0a0a0a;color:#fff;display:flex;gap:20px;padding:6px 10px;font-size:8pt;text-transform:uppercase;letter-spacing:.05em;font-weight:700}
  .ftr{font-size:8pt;text-align:center;margin-top:6px;color:#555}
</style></head><body><div class="page">
<div class="hdr"><div>${logo?`<img src="${logo}">`:'<div style="font-size:20pt;font-weight:900;color:#e0120c">AMC</div>'}</div><div class="hdr-phone">${cfg.phone||'778.855.4903'}</div><div class="hdr-addr">${cfg.address||''}<br>${cfg.city||''}, ${cfg.province||''} ${cfg.postalCode||''}</div></div>
<div class="stock">STOCK # ${v.stock_number||'—'}</div>
<div class="yr">${v.year}</div>
<div class="title">${tc(v.make)} ${tc(v.model)}</div>
${v.trim?`<div class="trim">${v.trim}</div>`:''}
<div class="price">$${v.price.toLocaleString()}</div>
<div class="price-sub">Plus ${taxPct}% ${cfg.province||'BC'} Taxes &amp; Applicable Fees</div>
<div class="specs">${specs.map(([l,v])=>`<div class="sp"><div class="sp-lbl">${l}</div><div class="sp-val">${escHtml(String(v))}</div></div>`).join('')}</div>
${hl.length?`<div class="hl-title">Highlights</div><div class="hls">${hl.map(f=>`<div class="hl">${escHtml(f)}</div>`).join('')}</div>`:''}
<div class="spacer"></div>
<div class="sbar"><span>${title}</span>${hasFin?'<span>✦ Financing Available</span>':''}${cert?'<span>✦ Dealer Certified</span>':''}</div>
<div class="ftr">${cfg.legalName||'GP Auto Sales Ltd.'} · Dealer Reg #${cfg.dealerReg||'30721'} · ${cfg.phone||'778.855.4903'}</div>
</div></body></html>`);
  w.document.close(); setTimeout(()=>w.print(),500);
}

// ============================================================================
//  BILL OF SALE + WAIVER
// ============================================================================
function openBOSModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.id = 'bos-modal';
  modal.innerHTML = `<div class="modal" style="max-width:760px;max-height:90vh;overflow-y:auto"><div class="modal-body" style="padding:28px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-family:'Oswald';font-size:1.2rem;text-transform:uppercase;color:var(--chrome-1)">Bill of Sale / Waiver</h3>
      <button class="modal-close" style="position:static" onclick="closeDocModal('bos-modal')">&times;</button>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:16px">
      <label class="consent"><input type="checkbox" id="bos-chk-bos" checked onchange="updateBOSBtn()"><span>Bill of Sale</span></label>
      <label class="consent"><input type="checkbox" id="bos-chk-waiver" onchange="updateBOSBtn()"><span>Delivery Waiver</span></label>
    </div>
    <div class="field"><label style="font-family:'Oswald';font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Vehicle</label><select id="bos-pick"></select></div>

    <h4 style="font-family:'Oswald';font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin:16px 0 10px">Purchaser</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Full Name</label><input id="bos-pname"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Address</label><input id="bos-paddr"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">City</label><input id="bos-pcity"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Province</label><select id="bos-pprov">${PROVINCES.map(p=>`<option>${p}</option>`).join('')}</select></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Postal Code</label><input id="bos-ppc"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Driver's License</label><input id="bos-pdl"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Date</label><input type="date" id="bos-date"></div>
    </div>

    <h4 style="font-family:'Oswald';font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin:16px 0 10px">Financial Breakdown</h4>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Selling Price</label><input type="number" id="bos-fprice" oninput="updateBOSTots()"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Warranty</label><input type="number" id="bos-fwarr" value="0" oninput="updateBOSTots()"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Trade-in Allowance</label><input type="number" id="bos-ftrade" value="0" oninput="updateBOSTots()"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Doc Fee</label><input type="number" id="bos-fdoc" value="0" oninput="updateBOSTots()"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Transaction Levy</label><input type="number" id="bos-flevy" value="0" oninput="updateBOSTots()"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Lien Registration</label><input type="number" id="bos-flien" value="0" oninput="updateBOSTots()"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Down Payment</label><input type="number" id="bos-fdown" value="0" oninput="updateBOSTots()"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Deposit</label><input type="number" id="bos-fdep" value="0" oninput="updateBOSTots()"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">CC Charge</label><input type="number" id="bos-fcc" value="0" oninput="updateBOSTots()"></div>
    </div>
    <div style="background:var(--black);border:1px solid var(--line);padding:12px;margin-top:12px;font-family:'Inter';font-size:.82rem">
      <div>Price Difference: <strong id="bos-tdiff">$0</strong></div>
      <div>Subtotal: <strong id="bos-tsub">$0</strong></div>
      <div>GST (${(DOCS_CFG.gstRate||0.05)*100}%): <strong id="bos-tgst">$0</strong></div>
      <div>PST (${(DOCS_CFG.pstRate||0.07)*100}%): <strong id="bos-tpst">$0</strong></div>
      <div style="font-size:1rem;margin-top:4px;color:var(--red)">TOTAL DELIVERY PRICE: <strong id="bos-ttotal">$0</strong></div>
      <div style="color:var(--red)">BALANCE DUE: <strong id="bos-tbal">$0</strong></div>
    </div>

    <h4 style="font-family:'Oswald';font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin:16px 0 10px">Declarations</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Used as taxi/police/racing?</label><select id="bos-dtaxi"><option>No</option><option>Yes</option></select></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Used as lease/rental?</label><select id="bos-dlease"><option>No</option><option>Yes</option></select></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Odometer accurate?</label><select id="bos-dodo"><option>Yes</option><option>No</option></select></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Damage >$2,000</label><input id="bos-ddam" value="No"></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Complies with MVA?</label><select id="bos-dmva"><option>Yes</option><option>No</option></select></div>
      <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Warranty Statement</label><input id="bos-dwarr" value="No Warranties of Any Sorts."></div>
    </div>
    <div class="field" style="margin-top:8px"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Additional Notes / Special Terms</label><textarea id="bos-notes" rows="2"></textarea></div>
    <div class="field"><label style="font-family:'Oswald';font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Salesperson</label><input id="bos-sperson"></div>

    <p style="font-size:.7rem;color:#f59e0b;margin:10px 0;font-family:'Inter'">⚠️ Enable <strong>Background graphics</strong> in print settings. BOS fits 2 pages max.</p>
    <button class="btn btn-solid" style="width:100%;justify-content:center" id="bos-gen-btn" onclick="genBOS()">Generate Bill of Sale</button>
  </div></div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeDocModal('bos-modal'); });
  populatePicker('bos-pick');
  document.getElementById('bos-pick').addEventListener('change', async function() {
    const v = await getVehicleById(this.value);
    if (v) document.getElementById('bos-fprice').value = v.price;
    updateBOSTots();
  });
}

function updateBOSBtn() {
  const b = document.getElementById('bos-chk-bos').checked;
  const w = document.getElementById('bos-chk-waiver').checked;
  const btn = document.getElementById('bos-gen-btn');
  if (b && w) btn.textContent = 'Generate Both Documents';
  else if (b) btn.textContent = 'Generate Bill of Sale';
  else if (w) btn.textContent = 'Generate Waiver';
  else btn.textContent = 'Select document type';
}

function updateBOSTots() {
  const g = id => parseInt(document.getElementById(id)?.value)||0;
  const price = g('bos-fprice'), warr = g('bos-fwarr'), trade = g('bos-ftrade');
  const doc = g('bos-fdoc'), levy = g('bos-flevy'), lien = g('bos-flien');
  const down = g('bos-fdown'), dep = g('bos-fdep'), cc = g('bos-fcc');
  const diff = price + warr - trade;
  const sub = diff + doc + levy + lien + cc;
  const gstR = DOCS_CFG.gstRate||0.05, pstR = DOCS_CFG.pstRate||0.07;
  const gst = Math.round(sub*gstR), pst = Math.round(sub*pstR);
  const total = sub + gst + pst;
  const bal = total - down - dep;
  document.getElementById('bos-tdiff').textContent = '$'+diff.toLocaleString();
  document.getElementById('bos-tsub').textContent = '$'+sub.toLocaleString();
  document.getElementById('bos-tgst').textContent = '$'+gst.toLocaleString();
  document.getElementById('bos-tpst').textContent = '$'+pst.toLocaleString();
  document.getElementById('bos-ttotal').textContent = '$'+total.toLocaleString();
  document.getElementById('bos-tbal').textContent = '$'+bal.toLocaleString();
}

async function genBOS() {
  const doBOS = document.getElementById('bos-chk-bos').checked;
  const doWaiver = document.getElementById('bos-chk-waiver').checked;
  if (!doBOS && !doWaiver) { alert('Select at least one document.'); return; }
  const cfg = DOCS_CFG;
  const g = id => document.getElementById(id)?.value||'';
  const gn = id => parseInt(document.getElementById(id)?.value)||0;

  const v = await getVehicleById(document.getElementById('bos-pick').value);

  if (doBOS) {
    if (!v) { alert('Select a vehicle.'); return; }
    const price=gn('bos-fprice'),warr=gn('bos-fwarr'),trade=gn('bos-ftrade');
    const doc=gn('bos-fdoc'),levy=gn('bos-flevy'),lien=gn('bos-flien');
    const down=gn('bos-fdown'),dep=gn('bos-fdep'),cc=gn('bos-fcc');
    const diff=price+warr-trade,sub=diff+doc+levy+lien+cc;
    const gstR=cfg.gstRate||0.05,pstR=cfg.pstRate||0.07;
    const gst=Math.round(sub*gstR),pst=Math.round(sub*pstR);
    const total=sub+gst+pst,bal=total-down-dep;
    const logo=LOGO_B64;

    const w = window.open('','_blank','width=900,height=1100');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bill of Sale — ${v.year} ${v.make} ${v.model}</title>
<style>
  @page{size:letter;margin:.25in}*{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:7pt;color:#0a0a0a;background:#fff;color-scheme:only light}
  .banner{text-align:center;font-weight:900;font-size:8pt;border:1.5px solid #0a0a0a;padding:2px 0;margin-bottom:4px}
  .hdr{display:flex;align-items:center;border:1.5px solid #0a0a0a;padding:4px 6px;margin-bottom:4px}
  .hdr img{height:50px}.hdr-l{font-size:6.5pt}.hdr-r{margin-left:auto;text-align:right;font-size:6pt}
  table{width:100%;border-collapse:collapse;margin-bottom:4px}
  table.bd td,table.bd th{border:1px solid #0a0a0a;padding:2px 4px;vertical-align:top}
  td.lbl{font-size:5.5pt;text-transform:uppercase;color:#555}td.val{font-size:7pt;font-weight:600}
  .sec{font-weight:900;font-size:7pt;background:#0a0a0a;color:#fff;padding:2px 5px;margin-bottom:2px}
  .trow td{font-weight:900;font-size:8pt;background:#0a0a0a;color:#fff}
  .warn{background:#fff5f0;border:2px solid #0a0a0a;padding:4px 6px;margin:4px 0;font-size:7pt;font-weight:700}
  .sig{margin-top:8px}.sig-blk{display:inline-block;width:48%;margin-top:8px}
  .sig-line{border-bottom:1px solid #0a0a0a;margin-top:18px}
  .ftr-bar{background:#0a0a0a;color:#fff;text-align:center;padding:2px;font-size:6pt;margin-top:6px}
  ol{padding-left:14px;font-size:6.5pt;margin:3px 0}
</style></head><body>
<div class="banner">THIS IS A LEGAL AND BINDING CONTRACT</div>
<div class="hdr">
  <div class="hdr-l"><strong>${cfg.dbaLine||cfg.legalName}</strong><br>${cfg.address}, ${cfg.city}, ${cfg.province} ${cfg.postalCode}<br>Phone: ${cfg.phone} | Dealer Reg: ${cfg.dealerReg}</div>
  ${logo?`<img src="${logo}">`:''}
  <div class="hdr-r">GST #${cfg.gstNumber}<br>PST #${cfg.pstNumber}<br>Dealer Reg #${cfg.dealerReg}</div>
</div>
<div class="sec">PURCHASER INFORMATION</div>
<table class="bd"><tr><td class="lbl">Name</td><td class="val">${escHtml(g('bos-pname'))}</td><td class="lbl">Date</td><td class="val">${g('bos-date')}</td></tr>
<tr><td class="lbl">Address</td><td class="val" colspan="3">${escHtml(g('bos-paddr'))}, ${g('bos-pcity')}, ${g('bos-pprov')} ${g('bos-ppc')}</td></tr>
<tr><td class="lbl">DL</td><td class="val">${escHtml(g('bos-pdl'))}</td></tr></table>

<div class="sec">VEHICLE INFORMATION</div>
<table class="bd"><tr><td class="lbl">Year</td><td class="val">${v.year}</td><td class="lbl">Make</td><td class="val">${v.make}</td><td class="lbl">Model</td><td class="val">${v.model} ${v.trim||''}</td><td class="lbl">Stock</td><td class="val">${v.stock_number||'—'}</td></tr>
<tr><td class="lbl">VIN</td><td class="val" colspan="4">${v.vin||'—'}</td><td class="lbl">Odometer</td><td class="val">${v.mileage?Number(v.mileage).toLocaleString()+' km':'—'}</td></tr></table>

<div class="sec">FINANCIAL BREAKDOWN</div>
<table class="bd">
<tr><td class="lbl">Selling Price</td><td class="val" style="text-align:right">$${price.toLocaleString()}</td></tr>
<tr><td class="lbl">Warranty</td><td class="val" style="text-align:right">$${warr.toLocaleString()}</td></tr>
<tr><td class="lbl">Trade-in Allowance</td><td class="val" style="text-align:right">($${trade.toLocaleString()})</td></tr>
<tr><td class="lbl">Price Difference</td><td class="val" style="text-align:right"><strong>$${diff.toLocaleString()}</strong></td></tr>
<tr><td class="lbl">Doc Fee / Levy / Lien Reg</td><td class="val" style="text-align:right">$${doc.toLocaleString()} / $${levy.toLocaleString()} / $${lien.toLocaleString()}</td></tr>
<tr><td class="lbl">Subtotal</td><td class="val" style="text-align:right"><strong>$${sub.toLocaleString()}</strong></td></tr>
<tr><td class="lbl">GST (${gstR*100}%)</td><td class="val" style="text-align:right">$${gst.toLocaleString()}</td></tr>
<tr><td class="lbl">PST (${pstR*100}%)</td><td class="val" style="text-align:right">$${pst.toLocaleString()}</td></tr>
<tr class="trow"><td>TOTAL DELIVERY PRICE</td><td style="text-align:right">$${total.toLocaleString()}</td></tr>
<tr><td class="lbl">Down / Deposit / CC</td><td class="val" style="text-align:right">$${down.toLocaleString()} / $${dep.toLocaleString()} / $${cc.toLocaleString()}</td></tr>
<tr class="trow"><td>TOTAL BALANCE DUE</td><td style="text-align:right">$${bal.toLocaleString()}</td></tr>
</table>

<div class="sec">DECLARATIONS</div>
<table class="bd">
<tr><td class="lbl">Used as taxi/police/racing?</td><td class="val">${g('bos-dtaxi')}</td><td class="lbl">Used as lease/rental?</td><td class="val">${g('bos-dlease')}</td></tr>
<tr><td class="lbl">Odometer accurate?</td><td class="val">${g('bos-dodo')}</td><td class="lbl">Damage >$2,000</td><td class="val">${escHtml(g('bos-ddam'))}</td></tr>
<tr><td class="lbl">Complies with MVA?</td><td class="val">${g('bos-dmva')}</td><td class="lbl">Warranty</td><td class="val">${escHtml(g('bos-dwarr'))}</td></tr>
</table>

${g('bos-notes')?`<div style="border:1.5px solid #e0120c;padding:4px 6px;margin:4px 0;font-weight:700;font-size:7pt"><strong>SPECIAL TERMS:</strong> ${escHtml(g('bos-notes'))}</div>`:''}

<div class="sec" style="margin-top:6px">CONDITIONS (PAGE 2)</div>
<div style="font-size:6.5pt;line-height:1.35;padding:2px 4px">
<p><strong>1.</strong> If the purchaser of the motor vehicle is to be financed by or through the Vendor, it is agreed that a Conditional Sales Agreement or Chattel Mortgage will be entered into by the Purchaser with such lending company or person as the Vendor shall advise is acceptable, and the Purchaser agrees to execute the said Conditional Sales Agreement or Chattel Mortgage or Forms required by the said company or the person drawn for the balance of the purchase price plus financing charges and interest in accord with the terms of payment indicated on Page 1 of this Agreement hereof, and in the event of a conflict between the terms or conditions of the Conditional Sale or Chattel Mortgage and the terms or conditions of this Agreement, the terms and conditions of the Chattel Mortgage or Conditional Sale shall prevail and apply.</p>
<p><strong>2.</strong> The right and title to the motor vehicle ordered herein and hereinafter referred to as "the motor vehicle" shall remain in the Vendor until the unpaid cash balance stated on Page 1 of this Agreement hereof and all other sums including interest, owing by the Purchaser to the Vendor according to the terms, conditions and warranties herein, are fully paid to the Vendor.</p>
<p><strong>3.</strong> The Purchaser agrees that he will not, without first obtaining the Vendor's permission in writing, suffer or permit any charge, lien or encumbrance whether possessory or otherwise, to exist against the motor vehicle until all the sums owing by the Purchaser to the Vendor or its assigns according to the terms, conditions and warranties herein or set out in any applicable Conditional Sales Contract or Chattel Mortgage, are fully paid to the Vendor or its assigns.</p>
<p><strong>4.</strong> The Purchaser agrees to accept delivery of the motor vehicle and to comply with the terms of payment within seven days after notification to him that it is ready for delivery. In the event that the Purchaser does not so comply then any deposit paid or any used motor vehicle traded-in and accepted as part payment of the proceeds thereof, if and when sold, may be retained by the Vendor not as a penalty but as a portion of liquidated damages so that the Vendor may recover any further damages it has suffered and the Vendor shall be entitled to dispose of the motor vehicle without incurring any liability whatsoever to the Purchaser.</p>
<p><strong>5.</strong> Subject to the usual conditions of the trade and causes beyond the control of the Vendor, the Vendor shall deliver the motor vehicle to the Purchaser at the Vendor's place of business within a reasonable time from the date hereof. In the event the motor vehicle is not delivered, this Agreement may be cancelled by the Purchaser by delivering to the Vendor written notice of cancellation and upon receipt of the said notice the Vendor shall return the deposit paid. If the deposit paid consisted, in whole or in part, of a used motor vehicle, or if such motor vehicle has been sold, the Vendor shall pay to the Purchaser the net proceeds of the sale calculated on the gross proceeds less cost of repairs and parts and handling expenses (including overhead and storage) and a commission of 20% of the gross sale proceeds. The return of the deposit or used motor vehicle or net proceeds shall release the Vendor from all claims whatsoever which the Purchaser may have or claim to have against the Vendor including claims arising from non-delivery of the motor vehicle or alleged deficiency in the amount or value refunded or paid to or delivered to the Purchaser.</p>
<p><strong>6.</strong> In the event of the Purchaser's default in payment of any installment or in the event of any proceeding in bankruptcy being taken by or against the Purchaser or in the event of any other default by the Purchaser under this Agreement, or in the event of the death of the Purchaser, the entire unpaid balance of the purchase price then outstanding shall become immediately due and payable.</p>
<p><strong>7.</strong> The Purchaser, if a corporation, hereby waives the benefit of Sections 14, 14A, 14B, and 14C of the Conditional Sales Act or replacing those Sections and agrees if Paragraph 6 of the Conditions is invoked the Vendor or its assignee may take possession of the motor vehicle and concurrently bring suit against the Purchaser for the unpaid balance immediately.</p>
<p><strong>8.</strong> The Purchaser agrees that if the Vendor suffers any loss or damage in respect of any charge, lien or encumbrance against the traded-in vehicle if any, whether or not the said charge, lien or encumbrance is disclosed on Page 1 of this Agreement hereof, the Purchaser shall indemnify and save harmless the Vendor in respect of the said loss or damage.</p>
<p><strong>9.</strong> The Purchaser agrees to insure the motor vehicle by collision and comprehensive insurance and maintain such insurance in the amount of the Total Balance Due as owing to the Vendor. The Purchaser shall furnish the Vendor with satisfactory evidence of such insurance, on request by the Vendor.</p>
<p><strong>10.</strong> If there has been an error by the Vendor in any calculation or any other matter on Page 1 of this Agreement or in connection with the sale of the motor vehicle described herein, the Purchaser agrees to allow the Vendor to correct the error forthwith and if the correction requires any amount to be paid by one party to the other, such amount shall be paid immediately.</p>
<p><strong>11.</strong> The Vendor does not warranty or guarantee as to year, model, mileage, odometer reading or otherwise with respect to any used motor vehicles sold herein unless an express representation is made to the contrary.</p>
<p><strong>12.</strong> The motor vehicle will be covered, in the case of a new vehicle, by the manufacturers New Vehicle Warranty delivered to the Purchaser with the motor vehicle, and in the case of a used vehicle, the warranty, if any, delivered to the Purchaser in writing with the used motor vehicle. Subject to the above there are no other warranties, guarantees or representations, expressed or implied with respect to the motor vehicle. If the motor vehicle being sold pursuant to this Agreement is a used vehicle, it is governed by the "Sale of Goods Act". The Purchaser further acknowledges that he or she has inspected the motor vehicle and it is satisfactory in every respect and hereby accepts the motor vehicle on an "existing condition" basis without warranty or guarantee except as provided by the Vendor to the Purchaser in writing.</p>
<p><strong>13.</strong> Right, title and ownership to the motor vehicle shall not pass to the Purchaser until the Purchaser has paid in full the "Total Balance Due" as described on Page 1 of this Agreement. In addition to the Vendor's other legal rights under this Agreement, the Purchaser also hereby grants, assigns and conveys to the Vendor and acknowledges that the Vendor shall have and retain a security interest in the motor vehicle and the proceeds thereof in accordance with all the applicable laws until the Total Balance owing is paid in full.</p>
<p><strong>14.</strong> If the Purchaser defaults in the payment of any amount, or defaults in the performance of any obligations hereunder, or if proceeding in bankruptcy, a receivership, or insolvency is instituted by or against the Purchaser or a receiver is appointed judicially or otherwise affecting the Purchaser or the Purchaser's property, or should cause the Vendor to deem itself insecure: (a) any unpaid balance of the Total Balance Due shall immediately come due and payable; (b) the Vendor may take possession of the motor vehicle and resell the motor vehicle in accordance with and subject to applicable legislation without further notice; and (c) the Vendor may retain any payments that it has received prior to the possession and resale as liquidated damages and not as a penalty.</p>
<p><strong>15.</strong> The Vendor may satisfy any charge, lien or encumbrance now existing or which may exist in the future against the used motor vehicle traded-in occurring by reason of any work done to the used motor vehicle traded-in and authorized by the Purchaser whether expressed or implied or by reason of any act or omission of the Purchaser and any amount paid by the Vendor in satisfaction of any charge, lien or encumbrance shall be added to and form a portion of the purchase price and the Vendor may enforce payment of the said amount in like manner as it may enforce payment of any arrears of the purchase price and title to the motor vehicle shall not pass to the Purchaser until such amount and the purchase price and interest and all other sums owing to the Vendor by the Purchaser have been paid in full.</p>
<p><strong>16.</strong> This Agreement is binding upon the heirs, executors, administrators, successors and assigns of the parties. This Agreement is assignable by the Vendor without notice to the Purchaser.</p>
<p><strong>17.</strong> This Agreement constitutes the entire agreement between the parties and there are no representations, warranties or guarantees except as expressly set out herein.</p>
<p><strong>18.</strong> The Purchaser acknowledges that he has inspected the motor vehicle and is satisfied with its mechanical and physical condition as of the date hereof.</p>
<p><strong>19.</strong> Time is of the essence of this Agreement.</p>
<p><strong>20.</strong> Wherever the singular or masculine are used throughout this Agreement, the same shall be construed as being the plural or feminine or neuter where the context so requires.</p>
<p style="margin-top:4px;font-style:italic;font-weight:700">CUSTOMER IS AWARE, DEALER IS NOT RESPONSIBLE FOR ANY REPAIRS PRIOR OR AFTER SALE DATE. VEHICLE DISCOUNTED FOR FUTURE REPAIRS.</p>
</div>

<div class="sec">PURCHASER'S ACCEPTANCE</div>
<ol style="font-size:6.5pt"><li>I have read and understood and agree to the terms and conditions of this agreement including any warranty and all conditions set out herein and hereby acknowledge receipt of a copy thereof.</li><li>The Purchaser understands that this offer is not binding on the parties hereto until accepted and executed by a duly authorized official of the Vendor and that a Salesperson does not have such authority.</li><li>The Purchaser declares that he/she is of the full age of majority.</li></ol>

<div style="font-size:6pt;margin:4px 0;font-style:italic">The personal information received from individuals relating to this form is collected in accordance with the Privacy Policy Act. The collection of data is necessary to provide services directly requested by you and is also necessary for the purchase(s), sale(s), financing, leasing, or service(s) of the vehicle(s). Please contact the organization's Privacy Officer if you have any questions. If, in the future, you wish to have the information you have provided withdrawn please notify us in writing.</div>

<div class="sig">
  <div class="sig-blk"><div class="sig-line"></div><div style="font-size:6pt">SIGNATURE OF PURCHASER</div></div>
  <div class="sig-blk"><div class="sig-line"></div><div style="font-size:6pt">SIGNATURE OF CO-PURCHASER</div></div>
  <div class="sig-blk"><div class="sig-line"></div><div style="font-size:6pt">ACCEPTED BY: ${cfg.legalName||'GP Auto Sales Ltd.'}</div></div>
</div>
<div class="ftr-bar">${cfg.legalName||'GP Auto Sales Ltd.'} · 16099 Fraser Hwy, Surrey, ${cfg.province||'B.C.'} V4N 0G2 · ${cfg.phone||'778.855.4903'} · GST #${cfg.gstNumber||'868674789'} · PST #${cfg.pstNumber||'1015-1724'} · Dealer Reg #${cfg.dealerReg||'30721'}</div>
${g('bos-sperson')?`<p style="font-size:7pt;margin-top:4px"><strong>Salesperson:</strong> ${escHtml(g('bos-sperson'))}</p>`:''}
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }

  if (doWaiver) {
    setTimeout(() => genWaiver(v), doBOS ? 1200 : 0);
  }
}

function genWaiver(v) {
  const cfg = DOCS_CFG;
  const w = window.open('','_blank','width=850,height=1100');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Delivery Waiver</title>
<style>
  @page{size:letter;margin:.5in}body{font-family:Georgia,serif;font-size:11pt;color:#0a0a0a;background:#fff;color-scheme:only light;line-height:1.5}
  h2{font-size:16pt;text-align:center;margin-bottom:16px}
  .vbox{background:#f5f5f5;border-left:4px solid #0a0a0a;padding:6px 10px;margin-bottom:14px;font-size:10pt}
  .wtext{margin-bottom:10px;font-size:10pt}
  ol{margin-left:18px;margin-bottom:14px;font-size:10pt}
  .fld{margin:10px 0;font-size:10pt}.fld .ul{display:inline-block;min-width:200px;border-bottom:1px solid #0a0a0a}
  .sig{margin-top:28px}.sig-line{border-bottom:1px solid #0a0a0a;width:250px;margin:0 auto}
</style></head><body>
<h2>Delivery Waiver Acknowledgment</h2>
${v?`<div class="vbox"><strong>Vehicle:</strong> ${v.year} ${v.make} ${v.model} ${v.trim||''}<br><strong>VIN:</strong> ${v.vin||'N/A'} | <strong>Condition:</strong> Used</div>`:''}
<div class="wtext">
  <p>The Purchaser acknowledges that they have been given the opportunity to fully inspect the motor vehicle prior to taking delivery and have been provided with all keys, manuals, and accessories. The Purchaser accepts delivery of the motor vehicle in its present condition.</p>
  <p style="margin-top:6px"><strong>Important:</strong> The Purchaser understands that upon taking delivery, the vehicle is their responsibility including insurance, registration, and compliance with all applicable laws. Any manufacturer warranties, where applicable, are transferred to the Purchaser at delivery. The Dealer makes no additional warranties express or implied beyond those stated in the Bill of Sale.</p>
  <p style="margin-top:6px;font-style:italic">If the vehicle is NOT suitable for transportation, it is mutually understood and agreed between the Purchaser and the Vendor that the used vehicle is NOT suitable for transportation and is sold for parts only or for purposes other than transportation and that the Purchaser agrees there is no warranty expressed or implied.</p>
</div>
<ol><li>The Purchaser confirms that all representations and promises made by the Dealer have been fulfilled to the Purchaser's satisfaction as of the date of delivery.</li><li>The Purchaser has received a copy of the Bill of Sale, all warranty documents (if any), and understands the terms of any financing agreement entered into.</li><li>The Purchaser accepts the vehicle with the odometer reading as stated and acknowledges that the Dealer has disclosed all known material facts about the vehicle.</li></ol>
<div class="fld"><strong>Customer:</strong> <span class="ul">&nbsp;</span></div>
<div class="fld"><strong>Date:</strong> <span class="ul">&nbsp;</span></div>
<div class="sig"><div class="sig-line"></div><div style="text-align:center;font-size:9pt;margin-top:4px">SIGNATURE</div></div>
<div style="text-align:center;margin-top:28px;font-size:8pt;color:#aaa">${cfg.legalName||'GP Auto Sales Ltd.'} · ${cfg.phone} · Dealer Reg #${cfg.dealerReg}</div>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// ============================================================================
//  HELPERS
// ============================================================================
function closeDocModal(id) { const el = document.getElementById(id); if (el) el.remove(); }
function escHtml(s) { if (s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function tc(s) { if (!s) return ''; return s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()); }
async function getVehicleById(id) {
  try { const r = await fetch('/api/vehicles', { headers: TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {} }); const vs = await r.json(); return vs.find(x=>x.id===id); }
  catch { return null; }
}
