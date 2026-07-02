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
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10pt;color:#0a0a0a}
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
  const sub = diff + doc + levy + lien;
  const gstR = DOCS_CFG.gstRate||0.05, pstR = DOCS_CFG.pstRate||0.07;
  const gst = Math.round(sub*gstR), pst = Math.round(sub*pstR);
  const total = sub + gst + pst;
  const bal = total - down - dep - cc;
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
    const diff=price+warr-trade,sub=diff+doc+levy+lien;
    const gstR=cfg.gstRate||0.05,pstR=cfg.pstRate||0.07;
    const gst=Math.round(sub*gstR),pst=Math.round(sub*pstR);
    const total=sub+gst+pst,bal=total-down-dep-cc;
    const logo=LOGO_B64;

    const w = window.open('','_blank','width=900,height=1100');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bill of Sale — ${v.year} ${v.make} ${v.model}</title>
<style>
  @page{size:letter;margin:.25in}*{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:7pt;color:#0a0a0a}
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

<div class="warn">
  Purchaser has inspected and/or test driven the vehicle and accepts its present condition. Except as expressly stated in this Bill of Sale or required by law, No warranties or guarantees are provided by the Dealer, expressed or implied, including any warranty of merchantability or fitness for a particular purpose. The vehicle is sold "AS IS — WHERE IS" unless otherwise specified above.
</div>

<div class="sec">PURCHASER'S ACCEPTANCE</div>
<ol><li>I have read and understood all terms and conditions of this Bill of Sale.</li><li>I acknowledge receipt of a true copy of this Bill of Sale.</li><li>I understand that no other promises or conditions, verbal or otherwise, are binding unless stated in this document.</li></ol>

<div class="sig">
  <div class="sig-blk"><div class="sig-line"></div><div style="font-size:6pt">Purchaser's Signature</div></div>
  <div class="sig-blk"><div class="sig-line"></div><div style="font-size:6pt">Co-Purchaser's Signature</div></div>
  <div class="sig-blk"><div class="sig-line"></div><div style="font-size:6pt">Vendor's Acceptance (${cfg.legalName})</div></div>
</div>
<div class="ftr-bar">${cfg.legalName||'GP Auto Sales Ltd.'} · ${cfg.address}, ${cfg.city}, ${cfg.province} · ${cfg.phone} · Dealer Reg #${cfg.dealerReg}</div>
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
  @page{size:letter;margin:.5in}body{font-family:Georgia,serif;font-size:11pt;color:#0a0a0a;line-height:1.5}
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
  <p><strong>⚠️ WAIVER TEXT — PLACEHOLDER</strong></p>
  <p style="color:#888;font-style:italic">The dealership's lawyer-approved Delivery Waiver wording should replace this placeholder before use. Upload the XLS template for exact wording.</p>
  <p>The purchaser acknowledges that they have inspected the vehicle, received all keys and manuals, and accepts delivery of the vehicle in its present condition. The purchaser understands that upon delivery, the vehicle is their responsibility including insurance, registration, and compliance with all applicable laws.</p>
</div>
<ol><li>The purchaser has been given the opportunity to fully inspect the vehicle prior to taking delivery.</li><li>All representations made by the dealer have been fulfilled to the purchaser's satisfaction at the time of delivery.</li><li>Upon signing, the purchaser accepts the vehicle and all associated responsibilities.</li></ol>
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
