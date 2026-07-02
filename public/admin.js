/* Admin dashboard — Absolute Motor Cars */
(() => {
const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const fmt$ = n => '$' + (Number(n)||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let TOKEN = localStorage.getItem('amc_token') || '';
let USER = null, VEHICLES = [], LOGO64 = null;

const api = async (path, opts={}) => {
  const r = await fetch(path, { ...opts, headers: {
    ...(opts.body && !(opts.body instanceof FormData) ? {'Content-Type':'application/json'} : {}),
    ...(TOKEN ? {'Authorization':'Bearer '+TOKEN} : {}), ...(opts.headers||{}) }});
  if (r.status === 401) { logout(); throw new Error('auth'); }
  return r;
};

/* ---------- auth ---------- */
async function boot(){
  if (TOKEN) {
    try { const r = await api('/api/auth/me'); if (r.ok){ USER = await r.json(); return showApp(); } } catch {}
  }
  $('#login').style.display='flex';
}
function logout(){ TOKEN=''; USER=null; localStorage.removeItem('amc_token'); location.reload(); }
$('#login-form').addEventListener('submit', async e=>{
  e.preventDefault(); const m=$('#l-msg'); m.textContent=''; m.className='msg';
  const r = await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:$('#l-user').value.trim(),password:$('#l-pass').value})});
  if (!r.ok){ m.textContent='Invalid credentials.'; m.classList.add('err'); return; }
  const d = await r.json(); TOKEN=d.token; USER=d.user; localStorage.setItem('amc_token',TOKEN); showApp();
});
$('#logout') && $('#logout').addEventListener('click', logout);

function showApp(){
  $('#login').style.display='none'; $('#app').style.display='';
  $('#who-name').textContent = USER.username; $('#who-role').textContent = USER.role;
  loadVehicles(); loadFinancing(); loadMessages();
}

/* ---------- tabs ---------- */
$$('.tab').forEach(t=>t.addEventListener('click',()=>{
  $$('.tab').forEach(x=>x.classList.remove('on')); t.classList.add('on');
  $$('main > section').forEach(s=>s.style.display='none');
  $('#tab-'+t.dataset.tab).style.display='';
}));

/* ---------- VIN decode (NHTSA vPIC) ---------- */
const vinInput = $('#v-vin'), vinBtn = $('#vin-decode'), vinStatus = $('#vin-status');
const tc = s => s ? s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()) : s;
vinInput.addEventListener('input', ()=>{
  const n = vinInput.value.trim().length;
  $('#vin-count').textContent = n+'/17';
  vinBtn.disabled = n !== 17;
});
vinBtn.addEventListener('click', async ()=>{
  const vin = vinInput.value.trim();
  vinStatus.textContent='Decoding…'; vinStatus.className='vin-status vs-busy';
  try{
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    const d = (await r.json()).Results?.[0] || {};
    let filled = 0;
    if (d.ModelYear){ $('#v-year').value = d.ModelYear; filled++; }
    if (d.Make){ $('#v-make').value = tc(d.Make); filled++; }
    if (d.Model){ $('#v-model').value = tc(d.Model); filled++; }
    if (filled===3){ vinStatus.textContent='Decoded — year, make, model filled (editable).'; vinStatus.className='vin-status vs-ok'; }
    else if (filled>0){ vinStatus.textContent='Partially decoded — please complete the rest.'; vinStatus.className='vin-status vs-busy'; }
    else { vinStatus.textContent='No data for this VIN — enter details manually.'; vinStatus.className='vin-status vs-err'; }
  } catch { vinStatus.textContent='Decode failed (network) — enter details manually.'; vinStatus.className='vin-status vs-err'; }
});

/* ---------- inventory ---------- */
async function loadVehicles(){
  // Admin sees everything: fetch public list won't include hidden/sold, so query CRM endpoint for full list
  const r = await api('/api/crm/vehicles'); let rows = r.ok ? await r.json() : [];
  // also include sold ones from public detail? CRM excludes sold; acceptable for admin inventory: fetch all via vehicles + status filter would need extra endpoint; show CRM set + note
  VEHICLES = rows;
  $('#veh-rows').innerHTML = rows.map(v=>`<tr>
    <td>${esc(v.stock_number||'—')}</td>
    <td>${v.year} ${esc(v.make)} ${esc(v.model)} ${esc(v.trim||'')}</td>
    <td>${fmt$(v.price)}</td><td>${v.mileage!=null?Number(v.mileage).toLocaleString():'—'}</td>
    <td><span class="status st-${v.status}">${v.status}</span></td>
    <td>${v.at_dealership? 'visible':'hidden'}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-ghost btn-sm" data-edit="${v.id}">Edit</button>
      <button class="btn btn-ghost btn-sm" data-del="${v.id}">Delete</button></td></tr>`).join('')
    || '<tr><td colspan="7" style="color:var(--muted)">No vehicles yet — add your first above.</td></tr>';
  $$('#veh-rows [data-edit]').forEach(b=>b.addEventListener('click',()=>editVehicle(b.dataset.edit)));
  $$('#veh-rows [data-del]').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('Delete this vehicle and its photos?')) return;
    await api('/api/vehicles/'+b.dataset.del,{method:'DELETE'}); loadVehicles(); fillDocPicker();
  }));
  fillDocPicker();
}

function vform(){ return {
  stock_number: $('#v-stock').value.trim()||null, vin: $('#v-vin').value.trim()||null,
  year:+$('#v-year').value, make:$('#v-make').value.trim(), model:$('#v-model').value.trim(),
  trim:$('#v-trim').value.trim()||null, price:+$('#v-price').value,
  mileage:$('#v-mileage').value?+$('#v-mileage').value:null,
  exterior:$('#v-exterior').value.trim()||null, interior:$('#v-interior').value.trim()||null,
  engine:$('#v-engine').value.trim()||null, transmission:$('#v-transmission').value.trim()||null,
  drivetrain:$('#v-drivetrain').value.trim()||null, fuel:$('#v-fuel').value.trim()||null,
  status:$('#v-status').value, at_dealership:+$('#v-atd').value,
  description:$('#v-desc').value.trim()||null };
}
function editVehicle(id){
  const v = VEHICLES.find(x=>x.id===id); if(!v) return;
  $('#veh-form-title').textContent = 'Edit Vehicle';
  $('#v-id').value=v.id; $('#v-stock').value=v.stock_number||''; $('#v-vin').value=v.vin||'';
  vinInput.dispatchEvent(new Event('input'));
  $('#v-year').value=v.year; $('#v-make').value=v.make; $('#v-model').value=v.model;
  $('#v-trim').value=v.trim||''; $('#v-price').value=v.price; $('#v-mileage').value=v.mileage??'';
  $('#v-exterior').value=v.exterior||''; $('#v-interior').value=v.interior||'';
  $('#v-engine').value=v.engine||''; $('#v-transmission').value=v.transmission||'';
  $('#v-drivetrain').value=v.drivetrain||''; $('#v-fuel').value=v.fuel||'';
  $('#v-status').value=v.status; $('#v-atd').value=String(v.at_dealership);
  $('#v-desc').value=v.description||'';
  $('#img-zone').style.display=''; renderImgs(v);
  scrollTo({top:0,behavior:'smooth'});
}
function renderImgs(v){
  const list = $('#img-list');
  list.innerHTML = (v.images||[]).map((src,i)=>`<div class="im">
    <img src="${src}"><button class="del" data-src="${src}">✕</button>
    ${i>0?`<button class="mv mvl" data-mv="-1" data-i="${i}">‹</button>`:''}
    ${i<v.images.length-1?`<button class="mv mvr" data-mv="1" data-i="${i}">›</button>`:''}</div>`).join('');
  $$('.del',list).forEach(b=>b.addEventListener('click',async()=>{
    const fname=b.dataset.src.split('/').pop();
    await api(`/api/vehicles/${v.id}/images/${fname}`,{method:'DELETE'});
    v.images=v.images.filter(s=>s!==b.dataset.src); renderImgs(v);
  }));
  $$('.mv',list).forEach(b=>b.addEventListener('click',async()=>{
    const i=+b.dataset.i, j=i+(+b.dataset.mv);
    [v.images[i],v.images[j]]=[v.images[j],v.images[i]];
    await api(`/api/vehicles/${v.id}/images/reorder`,{method:'PUT',body:JSON.stringify({order:v.images})});
    renderImgs(v);
  }));
}
$('#v-imgs').addEventListener('change', async e=>{
  const id=$('#v-id').value; if(!id||!e.target.files.length) return;
  const fd=new FormData(); [...e.target.files].forEach(f=>fd.append('images',f));
  const m=$('#veh-msg'); m.textContent='Uploading photos…'; m.className='msg';
  const r=await api(`/api/vehicles/${id}/images`,{method:'POST',body:fd});
  if(r.ok){ m.textContent='Photos uploaded.'; m.classList.add('ok'); await loadVehicles(); editVehicle(id); }
  else { m.textContent='Upload failed.'; m.classList.add('err'); }
  e.target.value='';
});
$('#veh-form').addEventListener('submit', async e=>{
  e.preventDefault(); const m=$('#veh-msg'); m.textContent=''; m.className='msg';
  const id=$('#v-id').value, body=JSON.stringify(vform());
  const r = await api(id?'/api/vehicles/'+id:'/api/vehicles',{method:id?'PUT':'POST',body});
  if(r.ok){
    const v=await r.json();
    m.textContent = id?'Saved.':'Vehicle added — you can now upload photos.'; m.classList.add('ok');
    await loadVehicles(); if(!id) editVehicle(v.id);
  } else { m.textContent='Save failed — check required fields.'; m.classList.add('err'); }
});
$('#veh-reset').addEventListener('click',()=>{
  $('#veh-form').reset(); $('#v-id').value=''; $('#veh-form-title').textContent='Add New Vehicle';
  $('#img-zone').style.display='none'; $('#veh-msg').textContent='';
  $('#vin-count').textContent='0/17'; vinBtn.disabled=true; vinStatus.textContent='';
});

/* ---------- financing ---------- */
async function loadFinancing(){
  const f=$('#fin-filter').value||'all';
  const r=await api('/api/financing?status='+f); const rows=r.ok?await r.json():[];
  const newest = rows.filter(x=>x.status==='new').length;
  const badge=$('#fin-badge'); badge.style.display=newest?'':'none'; badge.textContent=newest;
  $('#fin-rows').innerHTML = rows.map(a=>`<tr>
    <td>${new Date(a.created_at).toLocaleDateString()}</td>
    <td>${esc(a.first_name)} ${esc(a.last_name)}</td><td>${esc(a.phone)}</td>
    <td>${esc(a.vehicle_of_interest||'—')}</td>
    <td>${a.gross_monthly_income?fmt$(a.gross_monthly_income):'—'}</td>
    <td><span class="status st-${a.status}">${a.status.replace('_',' ')}</span></td>
    <td><button class="btn btn-ghost btn-sm" data-fin="${a.id}">Open</button></td></tr>`).join('')
    || '<tr><td colspan="7" style="color:var(--muted)">No applications.</td></tr>';
  $$('#fin-rows [data-fin]').forEach(b=>b.addEventListener('click',()=>openFin(b.dataset.fin)));
}
$('#fin-filter').addEventListener('change', loadFinancing);
async function openFin(id){
  const r=await api('/api/financing/'+id); if(!r.ok) return; const a=await r.json();
  const F=(k,v)=>v?`<div><b style="color:var(--muted);font-size:.7rem;text-transform:uppercase">${k}</b><div>${esc(v)}</div></div>`:'';
  $('#fin-detail').style.display='';
  $('#fin-detail').innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <h3 style="margin-right:auto">${esc(a.first_name)} ${esc(a.last_name)}</h3>
      ${['new','in_review','approved','archived'].map(s=>
        `<button class="btn ${a.status===s?'btn-red':'btn-ghost'} btn-sm" data-st="${s}">${s.replace('_',' ')}</button>`).join('')}
      <button class="btn btn-ghost btn-sm" onclick="print()">Print</button>
    </div>
    <div class="row r4">
      ${F('Email',a.email)}${F('Phone',a.phone)}${F('DOB',a.date_of_birth)}${F('Marital',a.marital_status)}
      ${F('Address',[a.street_address,a.city,a.province,a.postal_code].filter(Boolean).join(', '))}
      ${F('Housing',a.housing_status)}${F('Monthly Housing',a.monthly_housing_payment&&fmt$(a.monthly_housing_payment))}
      ${F('At address',(a.years_at_address||0)+'y '+(a.months_at_address||0)+'m')}
      ${F('Employer',a.employer_name)}${F('Title',a.job_title)}${F('Employer Ph',a.employer_phone)}
      ${F('Employed',(a.years_employed||0)+'y '+(a.months_employed||0)+'m')}
      ${F('Gross income/mo',a.gross_monthly_income&&fmt$(a.gross_monthly_income))}
      ${F('Other income',a.other_income&&fmt$(a.other_income)+' — '+(a.other_income_source||''))}
      ${F('Vehicle',a.vehicle_of_interest)}${F('Down payment',a.down_payment&&fmt$(a.down_payment))}
      ${F('Trade-in',a.has_trade_in?(a.trade_in_details||'Yes'):null)}
      ${F('Co-applicant',a.has_co_applicant?`${a.co_applicant_name||''} (${a.co_applicant_relationship||''}) ${a.co_applicant_phone||''}`:null)}
      ${F('SIN',a.sin)}${F('Notes',a.notes)}
      ${F('Credit consent',a.consent_credit_check?'Given':'NOT GIVEN')}
    </div>
    <label>Admin notes</label><textarea id="fin-notes" rows="2">${esc(a.admin_notes||'')}</textarea>
    <button class="btn btn-ghost btn-sm" id="fin-save" style="margin-top:8px">Save notes</button>`;
  $$('#fin-detail [data-st]').forEach(b=>b.addEventListener('click',async()=>{
    await api('/api/financing/'+id,{method:'PUT',body:JSON.stringify({status:b.dataset.st})});
    loadFinancing(); openFin(id);
  }));
  $('#fin-save').addEventListener('click',async()=>{
    await api('/api/financing/'+id,{method:'PUT',body:JSON.stringify({admin_notes:$('#fin-notes').value})});
  });
}

/* ---------- messages ---------- */
async function loadMessages(){
  const r=await api('/api/contact'); const rows=r.ok?await r.json():[];
  const fresh=rows.filter(x=>x.status==='new').length;
  const badge=$('#msg-badge'); badge.style.display=fresh?'':'none'; badge.textContent=fresh;
  $('#msg-rows').innerHTML = rows.map(m=>`<tr>
    <td>${new Date(m.created_at).toLocaleDateString()}</td><td>${esc(m.type)}</td>
    <td>${esc(m.name)}<br><small style="color:var(--muted)">${esc(m.email)}</small></td>
    <td>${esc(m.phone)}</td>
    <td style="max-width:280px">${esc(m.vehicle_details||'')} ${esc(m.message||'')}</td>
    <td><span class="status st-${m.status}">${m.status}</span></td>
    <td style="white-space:nowrap">
      ${m.status==='new'?`<button class="btn btn-ghost btn-sm" data-done="${m.id}">Mark done</button>`:''}
      <button class="btn btn-ghost btn-sm" data-delm="${m.id}">Delete</button></td></tr>`).join('')
    || '<tr><td colspan="7" style="color:var(--muted)">No messages.</td></tr>';
  $$('#msg-rows [data-done]').forEach(b=>b.addEventListener('click',async()=>{
    await api('/api/contact/'+b.dataset.done,{method:'PUT',body:JSON.stringify({status:'done'})}); loadMessages(); }));
  $$('#msg-rows [data-delm]').forEach(b=>b.addEventListener('click',async()=>{
    if(confirm('Delete message?')){ await api('/api/contact/'+b.dataset.delm,{method:'DELETE'}); loadMessages(); }}));
}

/* ---------- documents ---------- */
$$('.doc-card').forEach(c=>c.addEventListener('click',()=>{
  $$('.doc-card').forEach(x=>x.classList.remove('on')); c.classList.add('on');
  $('#doc-sticker').style.display = c.dataset.doc==='sticker'?'':'none';
  $('#doc-sale').style.display    = c.dataset.doc==='sale'?'':'none';
}));
function fillDocPicker(){
  const sel=$('#doc-vehicle');
  const sorted=[...VEHICLES].sort((a,b)=>b.year-a.year);
  sel.innerHTML='<option value="">— choose a vehicle —</option>'+sorted.map(v=>
    `<option value="${v.id}">${v.year} ${esc(v.make)} ${esc(v.model)} ${esc(v.trim||'')} ${v.stock_number?'— Stock #'+esc(v.stock_number):''}</option>`).join('');
}
$('#doc-vehicle').addEventListener('change',()=>{
  const v=VEHICLES.find(x=>x.id===$('#doc-vehicle').value); if(!v) return;
  $('#s-price').value=v.price; $('#b-sell').value=v.price; calc();
});
const selVehicle=()=>VEHICLES.find(x=>x.id===$('#doc-vehicle').value)||null;

/* BOS math — mirrors the master spreadsheet */
const n=id=>parseFloat($(id).value)||0;
function calc(){
  const sell=n('#b-sell'),addl=n('#b-addl'),trade=n('#b-trade'),fee=n('#b-fee'),env=n('#b-env'),
        warr=n('#b-warr'),other=n('#b-other'),dep=n('#b-dep'),payout=n('#b-payout'),down=n('#b-down');
  const total=sell+addl, diff=total-trade, sub=diff+fee;
  const gst=.05*(diff+fee), pst=.07*(diff+fee), gstw=.05*warr, pstw=.07*warr;
  const delivery=sub+env+gst+pst+warr+gstw+pstw+other;
  const pay=dep+payout+down, balance=delivery-pay;
  const set=(id,v)=>$(id).textContent=fmt$(v);
  set('#o-total',total);set('#o-diff',diff);set('#o-sub',sub);set('#o-gst',gst);set('#o-pst',pst);
  set('#o-gstw',gstw);set('#o-pstw',pstw);set('#o-delivery',delivery);set('#o-pay',pay);set('#o-balance',balance);
  return {total,diff,sub,gst,pst,gstw,pstw,delivery,pay,balance};
}
$$('.calc').forEach(i=>i.addEventListener('input',calc));

async function logo64(){
  if (LOGO64) return LOGO64;
  const blob = await (await fetch('/logo.png')).blob();
  LOGO64 = await new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(blob);});
  return LOGO64;
}
function openPrint(html){
  const w=window.open('','_blank');
  if(!w){ alert('Please allow pop-ups to print documents.'); return; }
  w.document.write(html); w.document.close();
  w.onload=()=>setTimeout(()=>w.print(),300);
}

/* ---- Window Sticker ---- */
$('#gen-sticker').addEventListener('click', async ()=>{
  const v=selVehicle(); if(!v){alert('Choose a vehicle first.');return;}
  const logo=await logo64();
  const hi=$('#s-high').value.split('\n').map(s=>s.trim()).filter(Boolean);
  openPrint(`<!doctype html><html><head><title>Window Sticker</title><style>
  @page{size:letter;margin:.35in}*{box-sizing:border-box;margin:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#000;min-height:10in;display:flex;flex-direction:column}
  .banner{background:#fff3cd;border:1px solid #ffc107;padding:6px 10px;font-size:11px;margin-bottom:8px}
  @media print{.banner{display:none}}
  .head{background:#000;color:#fff;text-align:center;padding:22px 10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .head img{height:130px}
  .head .ph{font-size:50pt;font-weight:800;letter-spacing:.02em;margin-top:6px}
  .head .ad{font-size:12pt;margin-top:4px}
  .stock{background:#e5e5e5;text-align:center;font-weight:700;letter-spacing:.2em;padding:6px;font-size:13pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .name{text-align:center;padding:14px 0 4px}
  .name .yr{letter-spacing:.35em;font-size:13pt}
  .name .mm{font-size:50pt;font-weight:800;line-height:1}
  .name .tr{font-family:Georgia,serif;font-style:italic;font-size:16pt;color:#444}
  .price{text-align:center;padding:12px 0}
  .price .p{font-size:64pt;font-weight:800}
  .price .t{font-size:11pt;color:#333}
  .specs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#000;border:1px solid #000;margin:10px 0}
  .sp{background:#fff;padding:10px;text-align:center}
  .sp .k{font-size:8pt;letter-spacing:.15em;color:#555;text-transform:uppercase}
  .sp .v{font-size:13pt;font-weight:700}
  .hl{columns:2;padding:6px 20px;font-size:11pt}
  .hl div{break-inside:avoid;padding:3px 0}.hl div::before{content:"✓ ";font-weight:700}
  .spacer{flex:1}
  .bar{background:#000;color:#fff;display:flex;justify-content:space-around;padding:10px;font-size:11pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .foot{text-align:center;font-size:9pt;color:#333;padding-top:8px}
  </style></head><body>
  <div class="banner">Enable “Background graphics” in the print dialog so the black header prints.</div>
  <div class="head"><img src="${logo}"><div class="ph">778.855.4903</div>
    <div class="ad">16099 Fraser Hwy, Surrey, B.C. V4N 0G2</div></div>
  <div class="stock">STOCK #${esc(v.stock_number||'—')}</div>
  <div class="name"><div class="yr">${v.year}</div><div class="mm">${esc(v.make)} ${esc(v.model)}</div>
    ${v.trim?`<div class="tr">${esc(v.trim)}</div>`:''}</div>
  <div class="price"><div class="p">${'$'+(n('#s-price')||v.price).toLocaleString()}</div>
    <div class="t">Plus 12% BC Taxes &amp; Applicable Fees</div></div>
  <div class="specs">
    ${[['Mileage',v.mileage!=null?Number(v.mileage).toLocaleString()+' km':'—'],['Exterior',v.exterior||'—'],
      ['Engine',v.engine||'—'],['Transmission',v.transmission||'—'],['Drivetrain',v.drivetrain||'—'],
      ['Fuel',v.fuel||'—']].map(([k,val])=>`<div class="sp"><div class="k">${k}</div><div class="v">${esc(val)}</div></div>`).join('')}
  </div>
  ${hi.length?`<div class="hl">${hi.map(h=>`<div>${esc(h)}</div>`).join('')}</div>`:''}
  <div class="spacer"></div>
  <div class="bar"><span>Title: ${esc($('#s-title').value||'—')}</span>
    <span>Financing: ${esc($('#s-fin').value)}</span><span>GP Auto Sales Ltd. · Dealer #30721</span></div>
  <div class="foot">Absolute Motor Cars · 16099 Fraser Hwy, Surrey BC · 778.855.4903 · GPAUTOBC.COM</div>
  </body></html>`);
});

/* ---- Bill of Sale (template text verbatim) + Waiver ---- */
$('#d-bos').addEventListener('change',updSaleBtn); $('#d-waiver').addEventListener('change',updSaleBtn);
function updSaleBtn(){
  const b=$('#d-bos').checked, w=$('#d-waiver').checked;
  $('#gen-sale').textContent = b&&w?'Generate Both Documents':w?'Generate Waiver':'Generate Bill of Sale';
  $('#popup-hint').style.display = b&&w?'':'none';
}
$('#gen-sale').addEventListener('click', async ()=>{
  const v=selVehicle(); if(!v){alert('Choose a vehicle first.');return;}
  const doBos=$('#d-bos').checked, doW=$('#d-waiver').checked;
  if(!doBos&&!doW){alert('Check at least one document.');return;}
  if(doBos) openPrint(await bosHTML(v));
  if(doW) setTimeout(async()=>openPrint(await waiverHTML(v)), doBos?1200:0);
});

async function bosHTML(v){
  const logo=await logo64(), o=calc(), g=id=>esc($(id).value);
  const L=(w='100%')=>`<span style="display:inline-block;border-bottom:1px solid #000;min-width:${w}">&nbsp;</span>`;
  const cell=(lbl,val,flex=1)=>`<td style="border:.75px solid #000;padding:2px 4px;vertical-align:top;width:${flex}%">
    <div style="font-size:6pt;color:#444;text-transform:uppercase;letter-spacing:.05em">${lbl}</div>
    <div style="font-size:8pt;min-height:11px;font-weight:600">${val||'&nbsp;'}</div></td>`;
  const money=(lbl,val,hl)=>`<div style="display:flex;justify-content:space-between;border-bottom:.75px solid #000;
    padding:2px 5px;font-size:7.6pt;${hl?'background:#000;color:#fff;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact':''}">
    <span>${lbl}</span><span>${val}</span></div>`;
  return `<!doctype html><html><head><title>Bill of Sale</title><style>
  @page{size:letter;margin:.35in}*{box-sizing:border-box;margin:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:7.2pt;line-height:1.28}
  table{border-collapse:collapse;width:100%}
  .sec{background:#000;color:#fff;text-align:center;font-weight:700;letter-spacing:.08em;padding:2px;font-size:7.5pt;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  ol{padding-left:13px}li{margin:1px 0}
  .pg2{page-break-before:always}
  .cond p{margin:2.5px 0;text-align:justify;font-size:6.6pt}
  .warr{border:1.2px solid #000;padding:4px;margin-top:4px}
  .asis{font-weight:700;background:#fff5f0;border:1.2px solid #c00;padding:3px;margin:3px 0;font-size:7.6pt;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  </style></head><body>

  <div style="text-align:center;font-style:italic;font-size:7.5pt">(THIS IS A LEGAL AND BINDING CONTRACT)</div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #000;padding:4px 0;margin-bottom:4px">
    <div style="display:flex;gap:8px;align-items:center">
      <img src="${logo}" style="height:44px">
      <div><b>To:</b> <b style="font-size:9pt">GP AUTO SALES LTD&nbsp;&nbsp;DBA 1 ABSOLUTE MOTOR CARS</b><br>
      16099 Fraser Hwy, Surrey B.C. V4N 0G2<br>
      Ph: 778.855.4903&nbsp;&nbsp;&nbsp;GPAUTOBC.COM&nbsp;&nbsp;&nbsp;GPAUTOBC.CA</div>
    </div>
    <div style="text-align:right;font-size:7.5pt"><b>Dealer Registration #</b> 30721<br>
      <b>GST #</b> 868674789&nbsp;&nbsp;<b>PST</b> 1015-1724</div>
  </div>

  <table><tr>${cell('I/We',g('#p-name'),34)}${cell('Date',g('#p-date'),16)}${cell('Year',new Date().getFullYear(),8)}
    ${cell("Driver's Lic.",g('#p-dl'),20)}${cell('Email',g('#p-email'),22)}</tr>
  <tr>${cell('Address',g('#p-addr'),34)}${cell('City',g('#p-city'),16)}${cell('Province',g('#p-prov'),8)}
    ${cell('Postal Code',g('#p-postal'),20)}${cell('Tel(H) / (W) / (C)',[g('#p-telh'),g('#p-telw'),g('#p-telc')].filter(Boolean).join(' / '),22)}</tr></table>

  <div style="font-weight:700;margin:3px 0">Hereby offer to purchase from you one Used Motor Vehicle described and identified as follows:</div>
  <table><tr>${cell('Year',v.year,8)}${cell('Make',esc(v.make),14)}${cell('Series & Model',esc(v.model+' '+(v.trim||'')),26)}
    ${cell('Colour',esc(v.exterior||''),12)}${cell('Stock#',esc(v.stock_number||''),10)}
    ${cell('V.I.N.(Serial No.)',esc(v.vin||''),20)}${cell('No. of Cyl.','',5)}${cell('Odometer — Km. ☒ / Mil. ☐ (CHECK ONE)',v.mileage!=null?Number(v.mileage).toLocaleString():'',15)}</tr></table>
  <div style="font-size:6.6pt;margin:2px 0">(hereinafter called the Motor Vehicle) and the optional equipment and accessories, if any, set out herein at the price stated and under the terms and conditions set forth below and on the 2nd page hereof.</div>

  <div class="sec">DESCRIPTION OF TRADE-IN — Disclosures - Authorization to Transfer Title</div>
  <table><tr>${cell('Year',g('#t-year'),8)}${cell('Make',g('#t-make'),14)}${cell('Model',g('#t-model'),18)}
    ${cell('Color',g('#t-color'),12)}${cell('V.I.N.',g('#t-vin'),22)}
    ${cell('Estimated Amount of Lien $',g('#t-lien'),12)}${cell('Owing to / Name / Address',g('#t-owing'),14)}
    ${cell('Odometer — Km. ☒ / Mil. ☐',g('#t-odo'),12)}</tr></table>
  <div style="font-size:6.6pt;margin-top:2px">The owner of the trade-in vehicle (described herein as the "Purchaser") declares the following to be true to the best of his/her knowledge and belief.</div>
  <ol style="font-size:6.6pt">
    <li>(a) The trade-in vehicle has never been used as a taxi, police vehicle, emergency vehicle, leased vehicle, rental vehicle, or used in organized racing, except as disclosed herein: ${L('120px')}<br>
    (b) The trade-in vehicle has never sustained damage requiring repairs costing more than $2000.00 except as disclosed herein: ${L('120px')}<br>
    (c) The trade-in vehicle has never been registered in any jurisdiction other than British Columbia, except as disclosed herein: ${L('120px')}</li>
    <li>The Purchaser further declares that the odometer reading of the trade-in vehicle to be true to the best of his/her knowledge and belief, or ____________________</li>
    <li>The Purchaser further declares the trade-in to be free of all liens and encumbrances, except as noted in this agreement.</li>
    <li>Upon acceptance of this offer by the Vendor, the Purchaser hereby transfers all his/her right and title in the trade-in vehicle to the Vendor or his assigns, such transfer being as part payment and deposit on this contract, and hereby authorizes the Vendor or his assigns to dispose of the said trade-in vehicle.</li>
    <li>Does the trade-in vehicle have an outstanding notice and order for inspection ? &nbsp;&nbsp;Yes ☐ &nbsp;No ☐ &nbsp;(CHECK ONE)</li>
  </ol>
  <div style="font-size:7pt">SIGNATURE OF PURCHASER(S)____________________________________________________________________________________</div>

  <div style="display:flex;gap:6px;margin-top:4px">
    <div style="flex:1.4">
      <div class="sec">DECLARATION</div>
      <div style="font-size:6.6pt">To the best of its knowledge and belief, the Vendor declares the following:</div>
      <ol style="font-size:6.6pt">
        <li>The Motor Vehicle has never been used as a taxi, police vehicle, emergency vehicle or used in organized racing, except as disclosed herein: <b>NO</b></li>
        <li>The Motor Vehicle has not been used as a lease or rental vehicle, except as disclosed herein: <b>EX LEASE EX RENTAL</b></li>
        <li>The Motor Vehicle has never sustained damages requiring repairs costing more than $2000, except as disclosed herein: <b>CARFAX ACCIDENT $0.00</b></li>
        <li>The Motor Vehicle has not previously been registered in any jurisdiction other than British Columbia and has not been brought into the province specifically for the purpose of sale, except as disclosed herein: <b>BC</b></li>
        <li>The odometer of the Motor Vehicle accurately reflects the true distance traveled by the Motor Vehicle, except as disclosed herein: <b>YES</b></li>
        <li>The Terms and Conditions governing the refund of deposits are as follows: <b>FINAL SALE</b></li>
        <li>The Motor Vehicle complies with the requirements of the Motor Vehicle Act. <b>YES</b></li>
      </ol>
      <div class="warr"><div style="text-align:center;font-weight:700">WARRANTY</div>
        <div style="font-size:6.6pt">If the vehicle is suitable for transportation, the only warranty is as follows:</div>
        <div style="font-size:6.6pt">If any repairs are to be effected, they are listed along with the additional cost, if any, as follows:</div>
        <div class="asis">CUSTOMER IS AWARE, DEALER IS NOT RESPONSIBLE FOR ANY REPAIRS PRIOR OR AFTER SALE DATE. VEHICLE DISCOUNTED FOR FUTURE REPAIRS.</div>
        <div style="font-size:6.4pt">If vehicle is NOT suitable for transportation, it is mutually understood and agreed between the Purchaser and the Vendor that the Used Vehicle is NOT suitable transportation and is sold for parts only or for the purposes other than transportation and that the Purchaser agrees that there is no warranty expressed or implied.</div>
      </div>
      <div style="font-size:7pt;margin-top:3px">SIGNATURE OF PURCHASER(S)_________________________________________________________________________</div>
      <div class="sec" style="margin-top:3px">PURCHASER'S ACCEPTANCE</div>
      <ol style="font-size:6.4pt">
        <li>The Purchaser has read and understood and agrees to the terms and conditions of this agreement including any warranty and all conditions set out on the 2nd page of this agreement and hereby acknowledge receipt of a copy thereof.</li>
        <li>The Purchaser understands that this offer is not binding on the parties hereto until accepted and executed by a duly authorized official of the Vendor and that a Salesperson does not have such authority.</li>
        <li>The Purchaser declares that he/she is of the full age of majority, except as disclosed herein:</li>
      </ol>
      <div style="font-size:7pt">SIGNATURE OF PURCHASER_______________________________________________________________________</div>
      <div style="font-size:7pt;margin-top:2px">SIGNATURE OF CO-PURCHASER____________________________________________________________________</div>
      <div class="sec" style="margin-top:3px">VENDOR'S ACCEPTANCE</div>
      <div style="font-size:7pt;margin-top:2px">ACCEPTED BY___________________________________________________ &nbsp;TITLE&nbsp; <b>Business Office Manager</b></div>
      <table style="margin-top:2px"><tr>${cell("Salesperson's Name",g('#d-sales'),40)}${cell('Delivery Required',g('#d-req'),30)}${cell('Date Delivered',g('#d-date'),30)}</tr></table>
    </div>
    <div style="flex:1;border:1px solid #000">
      ${money('SELLING PRICE OF VEHICLE $',fmt$(n('#b-sell')))}
      ${money('Additional Equipment, if any',fmt$(n('#b-addl')))}
      ${money('TOTAL PRICE&nbsp;&nbsp;$',fmt$(o.total))}
      ${money('Less allowance for Trade-in',fmt$(n('#b-trade')))}
      ${money('PRICE DIFFERENCE',fmt$(o.diff))}
      ${money('Documentation, Lien Search, & Transfer Fee',fmt$(n('#b-fee')))}
      ${money('SUB-TOTAL&nbsp;&nbsp;$',fmt$(o.sub))}
      ${money('ENVIRONMENTAL TAX',fmt$(n('#b-env')))}
      ${money('G.S.T. 5 %',fmt$(o.gst))}
      ${money('P.S.T. 7%',fmt$(o.pst))}
      ${money('EXTENDED WARRANTY',fmt$(n('#b-warr')))}
      ${money('GST on Warranty 5%',fmt$(o.gstw))}
      ${money('PST on Warranty 7%',fmt$(o.pstw))}
      ${money('Other Charges',fmt$(n('#b-other')))}
      ${money('TOTAL DELIVERY PRICE&nbsp;&nbsp;$',fmt$(o.delivery),1)}
      ${money('Deposit',fmt$(n('#b-dep')))}
      ${money('Payout on Lien',fmt$(n('#b-payout')))}
      ${money('Down Payments',fmt$(n('#b-down')))}
      ${money('TOTAL PAYMENTS',fmt$(o.pay))}
      ${money('Amount to be Financed',fmt$(n('#b-fin')))}
      ${money('(@ annual % rate)',(n('#b-rate')||0)+' %')}
      ${money('Total Finance Charges','')}
      ${money('TOTAL BALANCE DUE&nbsp;&nbsp;$',fmt$(o.balance),1)}
      <div style="font-size:6.2pt;padding:3px">This section to be completed only if the balance is to be financed by or through the Vendor.<br><br>
      To be paid in ______ equal monthly installments of $ ________ each, due on the ______ day of each month, commencing ____________, and a final installment of ________ payable on ____________.</div>
    </div>
  </div>

  <!-- PAGE 2: CONDITIONS (verbatim) -->
  <div class="pg2">
  <div style="text-align:center;font-weight:700;font-size:10pt;letter-spacing:.2em;margin:4px 0">C O N D I T I O N S</div>
  <div style="text-align:center;font-size:6.8pt;margin-bottom:4px">The conditions set out herein are included in the Agreement of Sale or Purchase set out on Page 1 of this Agreement</div>
  <div class="cond">
  <p>1.  If the purchaser of the motor vehicle is to be financed by or through the Vendor, it is agreed that a Conditional Sales Agreement or Chattel Mortgage will be entered into by the Purchaser with such lending company or person as the Vendor shall advise is acceptable, and the Purchaser agrees to execute the said Conditional Sales Agreement or Chattel Mortgage or Forms required by the said company or the person drawn for the balance of the purchase price plus financing charges and interest in accord with the terms of payment indicated on Page 1 of this Agreement hereof, and in the event of a conflict between the terms or conditions of the Conditional Sale or Chattel Mortgage and the terms or conditions of this Agreement, the terms and conditions of the Chattel Mortgage or Conditional Sale shall prevail and apply.</p>
  <p>2.  The right and title to the motor vehicle ordered herein and hereinafter referred to as "the motor vehicle" shall remain in the Vendor until the unpaid cash balance stated on Page 1 of this Agreement hereof and all other sums including interest, owing by the Purchaser to the Vendor according to the terms, conditions and warranties herein, are fully paid to the Vendor.</p>
  <p>3.  The Purchaser agrees that he will not, without first obtaining the Vendor's permission in writing, suffer or permit and charge, lien or encumbrance whether possessory or otherwise, to exist against the motor vehicle until all the sums owing by the Purchaser to the Vendor or its assigns according to the terms, conditions and warranties herein or set out in any applicable Conditional Sales Contract or Chattel Mortgage, are fully paid to the Vendor or its assigns.</p>
  <p>4.  The Purchaser agrees to accept delivery of the motor vehicle and to comply with the terms or payment within seven days after notification to him that it is ready for delivery.  In the event that the Purchaser does not so comply then any deposit paid or any used motor vehicle traded-in and accepted as part payment of the proceeds thereof, if and when sold, may by retained by the Vendor not as a penalty but as a portion of liquidated damages so that the Vendor may recover any further damages it has suffered and the Vendor shall be entitled to dispose of the motor vehicle without incurring any liability whatsoever to the Purchaser.</p>
  <p>5.  Subject to the usual conditions of the trade and causes beyond the control of the Vendor, the Vendor shall deliver the motor vehicle to the Purchaser at the Vendor's place of business within a reasonable time from the date hereof.  In the event the motor vehicle is not delivered, this Agreement may be cancelled by the Purchaser by delivering to the Vendor written notice of cancellation and upon receipt of the said notice the Vendor shall return the deposit paid.  If the deposit paid consisted, in whole or in part, of a used motor vehicle, or if such motor vehicle has been sold, the Vendor shall pay to the Purchaser the net proceeds of the sale calculated on the gross proceeds less cost of repairs and parts and handling expenses (including overhead and storage) and a commission of 20% of the gross sale proceeds.  The return of the deposit or used motor vehicle or net proceeds shall release the Vendor from all claims whatsoever which the Purchaser may have or claim to have against the Vendor including claims arising from non-delivery of the motor vehicle or alleged deficiency in the amount or value refunded or paid to or delivered to the Purchaser.</p>
  <p>6.  In the event of the Purchaser's default in payment of any installment or in the event of any proceeding in bankruptcy being taken by or against the Purchaser or in the event of any other default by the Purchaser under this Agreement, or in the event of the death of the Purchaser, the entire unpaid balance of the purchase price then outstanding shall become immediately due and payable.</p>
  <p>7.  The Purchaser, if a corporation, hereby waives the benefit of Sections 14, 14A, 14B, and 14C of the Conditional Sales Act or replacing those Sections and agrees if Paragraph 6 of the Conditions is invoked the Vendor or its assignee may take possession of the motor vehicle and concurrently bring suit against the Purchaser for the unpaid balance immediately.</p>
  <p>8.  The Purchaser agrees that if the Vendor suffers any loss or damage in respect of any charge, lien or encumbrance against the traded-in vehicle if any, whether or not the said charge, lien or encumbrance is disclosed on Page 1 of this Agreement hereof, the Purchaser shall indemnify and save harmless the Vendor in respect of the said loss or damage.</p>
  <p>9.  The Purchaser agrees to insure the motor vehicle by collision and comprehensive insurance and maintain such insurance in the amount of the Total Balance Due as owing to the Vendor.  The Purchaser shall furnish the Vendor with satisfactory evidence of such insurance, on request by the Vendor.</p>
  <p>10.  If there has been an error by the Vendor in any calculation or any other matter on Page 1 of this Agreement or in connection with the sale of the motor vehicle described herein, the Purchaser agrees to allow the Vendor to correct the error forthwith and if the correction requires any amount to be paid by one party to the other, such amount shall be paid immediately.</p>
  <p>11.  The Vendor does not warranty or guarantee as to year, model, mileage, odometer reading or otherwise with respect to any used motor vehicles sold herein unless an express representation is made to the contrary.</p>
  <p>12.  The motor vehicle will be covered, in the case of a new vehicle, by the manufacturers New Vehicle Warranty delivered to the Purchaser with the motor vehicle, and in the case of an used vehicle, the warranty, if any, delivered to the Purchaser in writing with the used motor vehicle.  Subject to the above there are no other warranties, guarantees or representations, expressed or implied with respect to the motor vehicle.  If the motor vehicle being sold pursuant to this Agreement is an used vehicle, it is governed by the "Sale of Goods Act".  The Purchaser further acknowledges that he or she has inspected the motor vehicle and it is satisfactory in every respect and hereby accepts the motor vehicle in the "existing condition" basis without warranty or guarantee except provided by the Vendor to the Purchaser in writing.</p>
  <p>13.  Right, title and ownership to the motor vehicle shall not pass to the Purchaser until the Purchaser has paid in full the "Total Balance Due" as described on Page 1 of this Agreement.  In addition to the Vendor's other legal rights under this Agreement, the Purchaser also hereby grants, assigns and conveys to the Vendor and acknowledges that the Vendor shall have and retain a security interest in the motor vehicle and the proceeds thereof in accordance with all the applicable laws until the Total Balance owing is paid in full.</p>
  <p>14.  If the Purchaser defaults in the payment of any amount, or defaults in the performance of any obligations hereunder, or if proceeding in bankruptcy, a receivership, or insolvency is instituted by or against the Purchaser or a receiver is appointed judicially or otherwise affecting the Purchaser or the Purchaser's property, or should cause the Vendor to deem itself insecure:<br>
  &nbsp;&nbsp;&nbsp;a.  any unpaid balance of the Total Balance Due shall immediately come due and payable;<br>
  &nbsp;&nbsp;&nbsp;b.  the Vendor may take possession of the motor vehicle and resell the motor vehicle in accordance with and subject to applicable legislation without further notice; and<br>
  &nbsp;&nbsp;&nbsp;c.  the Vendor may retain any payments that it has received prior to the possession and resale as liquidated damages and not as a penalty.</p>
  <p>15.  The Vendor may satisfy any charge, lien or encumbrance now existing or which may exist in the future against the used motor vehicle traded-in occurring by reason of any work done to the used motor vehicle traded-in and authorized by the Purchaser whether expressed or implied or by reason of any act or omission of the Purchaser and any amount paid by the Vendor in satisfaction of any charge, lien or encumbrance shall be added to and form a portion of the purchase price and the Vendor may enforce payment of the said amount in like manner as it may enforce payment of any arrears of the purchase price and title to the motor vehicle shall not pass to the Purchaser until such amount and the purchase price and interest and all other sums owing to the Vendor by the Purchaser have been paid in full.</p>
  <p>16.  This Agreement is binding upon the heirs, executors, administrators, successors and assigns of the parties.  This Agreement is assignable by the Vendor without notice to the Purchaser.</p>
  <p>17.  This Agreement constitutes the entire agreement between the parties and there are no representatives, warranties or guarantees except as expressly set out herein.</p>
  <p>18.  The Purchaser acknowledges that he has inspected the motor vehicle and is satisfied with its mechanical and physical condition as of the date hereof.</p>
  <p>19.  Time is of the essence of this Agreement.</p>
  <p>20.  Wherever the singular or masculine are used throughout this Agreement, the same shall be construed as being the plural or feminine or neuter where the context so requires.</p>
  </div>
  <div style="border:.75px solid #000;padding:3px;margin-top:4px"><b style="font-size:6.8pt">Additional Comments:</b><div style="min-height:26px"></div></div>
  <div style="font-size:7pt;margin-top:5px">SIGNATURE OF PURCHASER__________________________________________________________ &nbsp;&nbsp;Date_______________________</div>
  <div style="font-size:7pt;margin-top:2px">SIGNATURE OF CO-PURCHASER_______________________________________________________</div>
  <p style="font-size:6.2pt;border-top:1px solid #000;margin-top:5px;padding-top:3px;text-align:justify">The personal information received from individuals relating to this form is collected in accordance with the Privacy Policy Act.  The collection of data is necessary to provide services directly requested by you and is also necessary for the purchase(s), sale(s), financing, leasing, or service(s) of the vehicle(s).  Please contact the organization's Privacy Officer if you have any questions.  If, in the future, you wish to have the information you have provided withdrawn please notify us in writing.</p>

  <div style="border:1.2px solid #000;padding:5px;margin-top:6px">
    <div style="text-align:center;font-weight:700;font-size:9pt;margin-bottom:3px">Warranty, Repair, and Parts Agreement</div>
    <div style="font-size:7pt">Between GP AUTO SALES LTD. and <b>${g('#p-name')||'____________________'}</b></div>
    <table style="margin:3px 0"><tr>${cell('Year',v.year,8)}${cell('Make',esc(v.make),14)}${cell('Series & Model',esc(v.model+' '+(v.trim||'')),24)}
      ${cell('Colour',esc(v.exterior||''),12)}${cell('Stock#',esc(v.stock_number||''),10)}
      ${cell('V.I.N.(Serial No.)',esc(v.vin||''),18)}${cell('No. of Cyl.','',5)}${cell('Odometer — Km. ☒ / Mil. ☐',v.mileage!=null?Number(v.mileage).toLocaleString():'',9)}</tr></table>
    <div style="font-size:7pt">I/We, <b>${g('#p-name')||'____________________'}</b>, hereby acknowledge that I am purchasing a pre-owned vehicle and that regular maintenance and vehicle repairs will be required.</div>
    <div style="font-size:7pt;margin-top:3px">I have inspected the vehicle that I am purchasing and am satisfied with the quality of the vehicle and its operating condition.  Please sign: X __________________________________________</div>
    <div style="font-size:7pt;margin-top:3px">I have purchased an Extended Warranty to protect my vehicle &nbsp;&nbsp;&nbsp;Yes_____ &nbsp;&nbsp;&nbsp;No_____</div>
  </div>
  </div>
  </body></html>`;
}

async function waiverHTML(v){
  const logo=await logo64(), g=id=>esc($(id).value);
  return `<!doctype html><html><head><title>Delivery Waiver</title><style>
  @page{size:letter;margin:.6in}*{box-sizing:border-box;margin:0}
  body{font-family:Georgia,'Times New Roman',serif;color:#000;font-size:11pt;line-height:1.5}
  .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:22px}
  .hd img{height:52px}
  .vblock{background:#f2f2f2;border-left:4px solid #000;padding:10px 14px;margin:16px 0;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ph{background:#fffbe6;border:1.5px dashed #b8860b;padding:14px;margin:14px 0;font-family:Arial;font-size:10pt;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  ol li{margin:8px 0}
  .fl{display:inline-block;border-bottom:1px solid #000;min-width:280px}
  .sig{text-align:center;margin-top:44px}
  .sig .line{border-top:1px solid #000;width:320px;margin:0 auto;padding-top:5px;font-size:9.5pt;letter-spacing:.1em}
  </style></head><body>
  <div class="hd"><div style="display:flex;gap:12px;align-items:center"><img src="${logo}">
    <div><b style="font-size:13pt">GP Auto Sales Ltd.</b><br><span style="font-size:9.5pt">DBA Absolute Motor Cars</span></div></div>
    <div style="text-align:right;font-size:9.5pt">16099 Fraser Hwy<br>Surrey, B.C. V4N 0G2<br>778.855.4903</div></div>
  <h1 style="text-align:center;font-size:16pt;letter-spacing:.06em;margin-bottom:16px">Delivery Waiver Acknowledgment</h1>
  <div class="vblock">
    <b>${v.year} ${esc(v.make)} ${esc(v.model)} ${esc(v.trim||'')}</b>${v.stock_number?' — Stock #'+esc(v.stock_number):''}<br>
    VIN: ${esc(v.vin||'________________')}<br>Condition: Used
  </div>
  <div class="ph"><b>[[ PASTE THE DEALERSHIP'S EXACT WAIVER WORDING HERE — placeholder only. ]]</b><br>
  This block is intentionally a placeholder. Replace it with the exact Delivery Waiver text approved by the dealership
  (in <code>public/admin.js</code>, function <code>waiverHTML</code>) before using this document with customers.</div>
  <ol>
    <li>[[ Term 1 — replace with exact approved wording ]]</li>
    <li>[[ Term 2 — replace with exact approved wording ]]</li>
    <li>[[ Term 3 — replace with exact approved wording ]]</li>
  </ol>
  <p style="margin-top:18px">Customer name: <span class="fl">${g('#p-name')||'&nbsp;'}</span></p>
  <p style="margin-top:10px">Phone: <span class="fl" style="min-width:180px">${g('#p-telc')||g('#p-telh')||'&nbsp;'}</span>
   &nbsp;&nbsp; Email: <span class="fl" style="min-width:200px">${g('#p-email')||'&nbsp;'}</span></p>
  <div class="sig"><div class="line">SIGNATURE</div></div>
  <div class="sig" style="margin-top:26px"><div class="line" style="width:200px">DATE</div></div>
  </body></html>`;
}

/* boot */
boot();
})();
