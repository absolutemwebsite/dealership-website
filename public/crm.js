/* CRM — Absolute Motor Cars */
(() => {
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt$=n=>'$'+(Number(n)||0).toLocaleString('en-CA');
let TOKEN=localStorage.getItem('amc_token')||'', USER=null, ROWS=[], SOLD=[], locFilter='All';
const LOCS=['Auction','Mechanic Shop','Dealership','Dealership - Absolute','Dealership - DND','Detail Shop','Body Shop','With Customer',"Owner's Home"];
const COSTS=[['purchase_price','Purchase Price'],['icbc','ICBC'],['detailing','Detailing'],['transport','Transport'],
 ['boost','Boost'],['tire','Tire'],['repair','Repair'],['windshield','Windshield'],['afc_extra','AFC Extra'],
 ['misc_cost','Misc Cost'],['sales_cost','Sales Cost']];
const INSPECTION_SECTIONS={
 'Powertrain':['Accelerator','Fuel System','Exhaust','Transmission','Front/Rear/Spindles Axles','Clutch','Fluid Levels (power steering, brake)','CV Joints'],
 'Brakes':['Parking/Emergency Brake','Hydraulic System','Vacuum System','Drum Brakes','Disc Brakes','Shoes/Pads','Anti-Lock (if OEM equipped)'],
 'Frame & Body':['Hood Latch','Door Latches & Hinges','Bumpers','Windshield Wipers & Washer','Rear Wiper & Washer','Windshield','Windows','Defrost/Heaters','Mirrors','Seats','Seat Belts/Airbags','Mudguards','Window Glazing','Structural Integrity'],
 'Lamps':['Head Lamp Hi Beam','Head Lamp Lo Beam','Head Lamp Location','Daytime Running Lamps','Tail Lamps','Brake Lamps','Turn Signal Lamps','Hazard Warning Lamps','Licence Plate Lamp','Back-up Lamps'],
 'Steering':['Steering Lash','Steering Linkage','Rack & Pinion','Power Steering System','King Pin','Ball Joints'],
 'Tires & Wheels':['Tread Depth','Tread Section','Sidewalls','Wheels'],
 'Instruments':['Speedometer/Odometer','Indicator Lamps','Horn','Hi Beam Indicator'],
 'Suspension':['Leaf springs','Struts and Shocks','Coil spring','Torsion Bar','Independent/Multilink Rear','Computer Controlled'],
 'Electrical':['Wiring','Battery','Switches','Alternator'],
 'Diagnostic':['Diagnostic Trouble Codes']};

const api=async(p,o={})=>{
  const r=await fetch(p,{...o,headers:{...(o.body?{'Content-Type':'application/json'}:{}),
    ...(TOKEN?{'Authorization':'Bearer '+TOKEN}:{}) }});
  if(r.status===401){logout();throw new Error('auth');}
  return r;
};
function logout(){localStorage.removeItem('amc_token');location.reload();}

async function boot(){
  if(TOKEN){try{const r=await api('/api/auth/me');if(r.ok){USER=await r.json();return show();}}catch{}}
  $('#login').style.display='flex';
}
$('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();const m=$('#l-msg');m.textContent='';m.className='msg';
  const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:$('#l-user').value.trim(),password:$('#l-pass').value})});
  if(!r.ok){m.textContent='Invalid credentials.';m.classList.add('err');return;}
  const d=await r.json();TOKEN=d.token;USER=d.user;localStorage.setItem('amc_token',TOKEN);show();
});
async function show(){
  $('#login').style.display='none';$('#app').style.display='';
  $('#who').textContent=`${USER.username} (${USER.role})`;
  if(USER.role==='owner') document.body.classList.add('owner');
  $('#logout').addEventListener('click',logout);
  wireTabs();wireBackup();wireDrawers();
  await refresh();
}
function wireTabs(){
  $$('.tab').forEach(t=>t.addEventListener('click',()=>{
    if(t.classList.contains('owner-only')&&USER.role!=='owner')return;
    $$('.tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');
    $$('main > section').forEach(s=>s.style.display='none');
    $('#tab-'+t.dataset.tab).style.display='';
  }));
  ['q-prod','q-ledger','q-sold'].forEach(id=>{const el=$('#'+id);el&&el.addEventListener('input',render);});
}

async function refresh(){
  const r=await api('/api/crm/vehicles');ROWS=r.ok?await r.json():[];
  if(USER.role==='owner'){const s=await api('/api/crm/sold');SOLD=s.ok?await s.json():[];}
  render();
}
const totalCost=v=>COSTS.reduce((t,[f])=>t+(Number(v[f])||0),0);
const q=id=>($('#'+id)?.value||'').toLowerCase();
const match=(v,term)=>!term||`${v.stock_number||''} ${v.year} ${v.make} ${v.model}`.toLowerCase().includes(term);

function render(){
  // KPIs
  const kp=[];
  kp.push(['Vehicles '+(USER.role==='owner'?'in production':'at dealership'),ROWS.length]);
  if(USER.role==='owner'){
    kp.push(['Capital invested',fmt$(ROWS.reduce((t,v)=>t+totalCost(v),0))]);
    kp.push(['Units sold',SOLD.length]);
    kp.push(['Gross profit',fmt$(SOLD.reduce((t,s)=>t+((s.selling_price||0)-(s.purchase_price||0)),0))]);
  }
  $('#kpis').innerHTML=kp.map(([k,v])=>`<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  // location chips
  const counts={All:ROWS.length};LOCS.forEach(l=>counts[l]=ROWS.filter(v=>v.location===l).length);
  $('#loc-chips').innerHTML=['All',...(USER.role==='owner'?LOCS:['Dealership'])].map(l=>
    `<button class="chip ${locFilter===l?'on':''}" data-loc="${l}">${l} (${counts[l]||0})</button>`).join(' ');
  $$('#loc-chips .chip').forEach(c=>c.addEventListener('click',()=>{locFilter=c.dataset.loc;render();}));

  // production cards
  const term=q('q-prod');
  const list=ROWS.filter(v=>match(v,term)&&(locFilter==='All'||v.location===locFilter));
  $('#prod-cards').innerHTML=list.map(v=>`<div class="card" data-id="${v.id}">
    <div class="stk">STOCK #${esc(v.stock_number||'—')}</div>
    <h3>${v.year} ${esc(v.make)} ${esc(v.model)}</h3>
    <div class="meta">${v.mileage!=null?Number(v.mileage).toLocaleString()+' km':''} ${esc(v.trim||'')}</div>
    ${USER.role==='owner'
      ?`<select class="loc ${esc(v.location||'')}" data-locsel>${LOCS.map(l=>`<option ${l===v.location?'selected':''}>${l}</option>`).join('')}</select>`
      :`<div class="loc Dealership" style="border:1px solid;padding:8px;text-align:center">Dealership</div>`}
    ${USER.role==='owner'?`
    <details class="costs"><summary>Costs — total ${fmt$(totalCost(v))}</summary>
      <div class="grid2">${COSTS.map(([f,l])=>`<div><label>${l}</label>
        <input type="number" data-cost="${f}" value="${v[f]??''}"></div>`).join('')}
        <div><label>GST Paid (tracked separately)</label><input type="number" data-cost="gst_paid" value="${v.gst_paid??''}"></div>
        <div><label>Source type</label><select data-cost="source_type">
          <option value="">—</option>${['Auction','Trade-in','Dealer','Private seller','Other'].map(s=>
          `<option ${v.source_type===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div><label>Source name</label><input data-cost="source_name" value="${esc(v.source_name||'')}"></div>
        <div><label>Acquisition price</label><input type="number" data-cost="acquisition_price" value="${v.acquisition_price??''}"></div>
      </div>
      <button class="btn btn-ghost btn-sm" data-savecosts style="margin-top:8px">Save costs</button>
    </details>
    <div class="tot-line"><span>Total cost</span><b>${fmt$(totalCost(v))}</b></div>
    <div class="gst-line"><span>GST paid</span><span>${fmt$(v.gst_paid)}</span></div>`:''}
    <div class="flags">
      <label><input type="checkbox" data-flag="registration_done" ${v.registration_done?'checked':''}> Registration</label>
      <label><input type="checkbox" data-flag="inspection_done" ${v.inspection_done?'checked':''}> Inspection</label>
    </div>
    <div class="cardbtns">
      <button class="btn btn-ghost btn-sm" data-insp>Inspection report</button>
      ${USER.role==='owner'?`<button class="btn btn-red btn-sm" data-sold>Mark sold</button>`:''}
    </div></div>`).join('')
    || '<div style="color:var(--muted)">No vehicles match.</div>';

  $$('#prod-cards .card').forEach(card=>{
    const id=card.dataset.id;
    const sel=$('[data-locsel]',card);
    sel&&sel.addEventListener('change',async()=>{
      await api(`/api/crm/vehicles/${id}/location`,{method:'PUT',body:JSON.stringify({location:sel.value})});
      refresh();
    });
    const save=$('[data-savecosts]',card);
    save&&save.addEventListener('click',async()=>{
      const body={};$$('[data-cost]',card).forEach(i=>{
        const f=i.dataset.cost;
        body[f]=i.type==='number'?(i.value===''?0:+i.value):(i.value||null);});
      await api(`/api/crm/vehicles/${id}/costs`,{method:'PUT',body:JSON.stringify(body)});
      refresh();
    });
    $$('[data-flag]',card).forEach(cb=>cb.addEventListener('change',async()=>{
      await api(`/api/crm/vehicles/${id}/costs`,{method:'PUT',
        body:JSON.stringify({[cb.dataset.flag]:cb.checked?1:0})});
    }));
    $('[data-insp]',card).addEventListener('click',()=>openInsp(id));
    const ms=$('[data-sold]',card);ms&&ms.addEventListener('click',()=>openSold(id));
  });

  if(USER.role==='owner'){renderLedger();renderSold();}
}

function renderLedger(){
  const term=q('q-ledger');
  const list=ROWS.filter(v=>match(v,term));
  const cols=[['stock_number','Stock'],['veh','Vehicle'],...COSTS,['total','Total'],['gst_paid','GST'],
    ['location','Location'],['created','Added']];
  const sum=f=>list.reduce((t,v)=>t+(Number(v[f])||0),0);
  $('#ledger-table').innerHTML=`<thead><tr>${cols.map(([,l])=>`<th>${l}</th>`).join('')}</tr></thead><tbody>
    ${list.map(v=>`<tr><td>${esc(v.stock_number||'—')}</td>
      <td>${v.year} ${esc(v.make)} ${esc(v.model)}</td>
      ${COSTS.map(([f])=>`<td>${fmt$(v[f])}</td>`).join('')}
      <td><b>${fmt$(totalCost(v))}</b></td><td>${fmt$(v.gst_paid)}</td>
      <td>${esc(v.location||'')}</td><td>${new Date(v.created_at).toLocaleDateString()}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="2">TOTALS (${list.length})</td>
      ${COSTS.map(([f])=>`<td>${fmt$(sum(f))}</td>`).join('')}
      <td>${fmt$(list.reduce((t,v)=>t+totalCost(v),0))}</td><td>${fmt$(sum('gst_paid'))}</td><td></td><td></td></tr></tfoot>`;
}

function renderSold(){
  const term=q('q-sold');
  const list=SOLD.filter(s=>!term||`${s.stock_number||''} ${s.year} ${s.make} ${s.model} ${s.buyer_name||''} ${s.seller_name||''}`.toLowerCase().includes(term));
  const sum=f=>list.reduce((t,s)=>t+(Number(s[f])||0),0);
  const profit=s=>(s.selling_price||0)-(s.purchase_price||0);
  $('#sold-table').innerHTML=`<thead><tr><th>Stock</th><th>Vehicle</th><th>Purchase</th><th>GST paid</th>
    <th>Seller</th><th>Sale date</th><th>Selling</th><th>Reserve</th><th>GST col.</th><th>PST col.</th>
    <th>Buyer</th><th>Profit</th><th></th></tr></thead><tbody>
    ${list.map(s=>`<tr><td>${esc(s.stock_number||'—')}</td><td>${s.year} ${esc(s.make)} ${esc(s.model)}</td>
      <td>${fmt$(s.purchase_price)}</td><td>${fmt$(s.gst_paid)}</td><td>${esc(s.seller_name||'')}</td>
      <td>${esc(s.sale_date||'')}</td><td>${fmt$(s.selling_price)}</td><td>${fmt$(s.reserve_non_gst)}</td>
      <td>${fmt$(s.gst_collected)}</td><td>${fmt$(s.pst_collected)}</td>
      <td>${esc(s.buyer_name||'')}<br><small style="color:var(--muted)">${esc(s.buyer_phone||'')} ${esc(s.buyer_email||'')}</small></td>
      <td style="color:${profit(s)>=0?'var(--ok)':'#ef4444'}"><b>${fmt$(profit(s))}</b></td>
      <td><button class="btn btn-ghost btn-sm" data-return="${s.id}">Return to inventory</button></td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="2">TOTALS (${list.length})</td><td>${fmt$(sum('purchase_price'))}</td>
      <td>${fmt$(sum('gst_paid'))}</td><td></td><td></td><td>${fmt$(sum('selling_price'))}</td>
      <td>${fmt$(sum('reserve_non_gst'))}</td><td>${fmt$(sum('gst_collected'))}</td><td>${fmt$(sum('pst_collected'))}</td>
      <td></td><td>${fmt$(list.reduce((t,s)=>t+profit(s),0))}</td><td></td></tr></tfoot>`;
  $$('#sold-table [data-return]').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('Return this vehicle to production at the Dealership and delete the sold record?'))return;
    await api('/api/crm/sold/'+b.dataset.return,{method:'DELETE'});refresh();
  }));
}

/* ---------- mark sold ---------- */
function openSold(id){
  const v=ROWS.find(x=>x.id===id);if(!v)return;
  $('#sold-title').textContent=`Mark Sold — ${v.year} ${v.make} ${v.model}`;
  $('#sd-vid').value=id;
  $('#sd-date').value=new Date().toISOString().slice(0,10);
  $('#sd-price').value='';$('#sd-reserve').value='';$('#sd-gst').value='';$('#sd-pst').value='';
  $('#sd-bname').value=v.buyer_name||'';$('#sd-bphone').value=v.buyer_phone||'';$('#sd-bemail').value=v.buyer_email||'';
  $('#sold-drawer').classList.add('open');
}
$('#sold-close').addEventListener('click',()=>$('#sold-drawer').classList.remove('open'));
$('#sd-save').addEventListener('click',async()=>{
  const num=id=>{const v=$('#'+id).value;return v===''?null:+v};
  const r=await api('/api/crm/sold',{method:'POST',body:JSON.stringify({
    vehicle_id:$('#sd-vid').value,sale_date:$('#sd-date').value,
    selling_price:num('sd-price'),reserve_non_gst:num('sd-reserve'),
    gst_collected:num('sd-gst'),pst_collected:num('sd-pst'),
    buyer_name:$('#sd-bname').value||null,buyer_phone:$('#sd-bphone').value||null,buyer_email:$('#sd-bemail').value||null})});
  const m=$('#sd-msg');
  if(r.ok){$('#sold-drawer').classList.remove('open');refresh();}
  else{m.textContent='Failed to save.';m.className='msg err';}
});

/* ---------- inspection ---------- */
let INSP={id:null,state:{}};
function openInsp(id){
  const v=ROWS.find(x=>x.id===id);if(!v)return;
  INSP.id=id;
  let saved={};try{saved=v.inspection_data?JSON.parse(v.inspection_data):{};}catch{}
  INSP.state=saved.items||{};
  $('#insp-title').textContent=`${v.year} ${v.make} ${v.model} — ${v.vin||'no VIN'}`;
  $('#insp-odo').value=saved.odometer??v.mileage??'';
  $('#insp-comments').value=saved.comments||'';
  renderInsp();
  $('#insp-drawer').classList.add('open');
}
function allItems(){return Object.entries(INSPECTION_SECTIONS).flatMap(([s,items])=>items.map(i=>s+'::'+i));}
function renderInsp(){
  $('#insp-items').innerHTML=Object.entries(INSPECTION_SECTIONS).map(([sec,items])=>`
    <div class="insp-sec"><h4>${sec}</h4>${items.map(it=>{
      const key=sec+'::'+it,cur=INSP.state[key]||'';
      return `<div class="insp-item"><span>${it}</span><span class="opts">
        ${['C','N','N/A'].map(o=>`<button data-k="${esc(key)}" data-o="${o}" class="${cur===o?'on':''}">${o}</button>`).join('')}
      </span></div>`;}).join('')}</div>`).join('');
  const marked=Object.values(INSP.state).filter(Boolean).length;
  $('#insp-count').textContent=`${marked}/${allItems().length} marked`;
  $$('#insp-items button').forEach(b=>b.addEventListener('click',()=>{
    const k=b.dataset.k,o=b.dataset.o;
    INSP.state[k]=INSP.state[k]===o?'':o; renderInsp();
  }));
}
function wireDrawers(){
  $('#insp-close').addEventListener('click',()=>$('#insp-drawer').classList.remove('open'));
  $('#insp-bulk').addEventListener('click',()=>{
    allItems().forEach(k=>{if(!INSP.state[k])INSP.state[k]='C';});renderInsp();});
  $('#insp-save').addEventListener('click',saveInsp);
  $('#insp-print').addEventListener('click',async()=>{await saveInsp();printInsp();});
}
async function saveInsp(){
  const data=JSON.stringify({items:INSP.state,odometer:$('#insp-odo').value,comments:$('#insp-comments').value});
  const r=await api(`/api/crm/vehicles/${INSP.id}/costs`,{method:'PUT',
    body:JSON.stringify({inspection_data:data,inspection_done:1})});
  $('#insp-msg').textContent=r.ok?'Saved.':'Save failed.';
  $('#insp-msg').className='msg '+(r.ok?'ok':'err');
  if(r.ok) refresh();
}
function printInsp(){
  const v=ROWS.find(x=>x.id===INSP.id)||{};
  // ⚠ FILL IN: facility name, facility number, technician name come from config —
  // they print blank until set (see config.js / your setup answers).
  const CFG={facility:'',facilityNo:'',dealer:'GP Auto Sales Ltd.',
    address:'16099 Fraser Hwy, Surrey, B.C. V4N 0G2',tech:''};
  const mark=k=>INSP.state[k]||'';
  const w=window.open('','_blank');if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(`<!doctype html><html><head><title>Mechanical Fitness Assessment</title><style>
  @page{size:letter;margin:.35in}*{box-sizing:border-box;margin:0}
  body{font-family:Arial;font-size:7pt;color:#000;line-height:1.25}
  h1{font-size:12pt;text-align:center;margin-bottom:4px}
  .hdr{display:flex;justify-content:space-between;border:1px solid #000;padding:4px;margin-bottom:5px;font-size:7.4pt}
  .cols{columns:3;column-gap:10px}
  .sec{break-inside:avoid;border:1px solid #000;margin-bottom:5px}
  .sec h4{background:#000;color:#fff;font-size:7pt;padding:2px 4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .it{display:flex;justify-content:space-between;padding:1.5px 4px;border-bottom:.5px solid #999}
  .it b{font-family:monospace}
  .cert{border:1px solid #000;padding:5px;margin-top:5px;font-size:6.8pt;text-align:justify}
  .sig{display:flex;gap:30px;margin-top:14px}
  .sig div{flex:1;border-top:1px solid #000;padding-top:3px;font-size:7pt;text-align:center}
  </style></head><body>
  <h1>MECHANICAL FITNESS ASSESSMENT</h1>
  <div class="hdr">
    <div><b>Inspection Facility:</b> ${esc(CFG.facility)||'____________'}<br>
      <b>Facility Number:</b> ${esc(CFG.facilityNo)||'____________'}<br>
      <b>Technician:</b> ${esc(CFG.tech)||'____________'}</div>
    <div><b>Dealer:</b> ${esc(CFG.dealer)}<br><b>Address:</b> ${esc(CFG.address)}</div>
    <div><b>Vehicle:</b> ${v.year||''} ${esc(v.make||'')} ${esc(v.model||'')}<br>
      <b>VIN:</b> ${esc(v.vin||'')}<br>
      <b>Odometer:</b> ${esc($('#insp-odo').value)} km</div>
  </div>
  <div style="font-size:6.8pt;margin-bottom:4px"><b>C</b> = Complies &nbsp; <b>N</b> = Non-Compliant &nbsp; <b>N/A</b> = Not Applicable</div>
  <div class="cols">
  ${Object.entries(INSPECTION_SECTIONS).map(([sec,items])=>`<div class="sec"><h4>${sec}</h4>
    ${items.map(it=>`<div class="it"><span>${it}</span><b>${mark(sec+'::'+it)||'☐'}</b></div>`).join('')}</div>`).join('')}
  </div>
  ${$('#insp-comments').value?`<div class="cert"><b>Technician comments:</b> ${esc($('#insp-comments').value)}</div>`:''}
  <div class="cert">I certify that the above assessment was carried out on the vehicle described above and reflects
  its condition at the time of inspection. This assessment describes the condition of the vehicle at the time of
  inspection only and expires 120 days after the date of issue.</div>
  <div class="sig"><div>TECHNICIAN SIGNATURE</div><div>DATE</div></div>
  </body></html>`);
  w.document.close();w.onload=()=>setTimeout(()=>w.print(),300);
}

/* ---------- backup ---------- */
function wireBackup(){
  const dl=$('#bk-dl');if(!dl)return;
  dl.addEventListener('click',async()=>{
    const r=await api('/api/backup');if(!r.ok)return alert('Backup failed');
    const blob=await r.blob(),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`amc-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
  });
  $('#bk-rs').addEventListener('click',()=>$('#bk-file').click());
  $('#bk-file').addEventListener('change',async e=>{
    const f=e.target.files[0];if(!f)return;
    const data=JSON.parse(await f.text());
    const counts=Object.entries(data).filter(([k,v])=>Array.isArray(v)).map(([k,v])=>`${k}: ${v.length}`).join(', ');
    const mode=confirm(`Restore from backup (${counts}).\n\nOK = MERGE (adds new records only)\nCancel = choose Replace next`)?'merge':
      (confirm('REPLACE ALL DATA with this backup? This cannot be undone.')?'replace':null);
    if(!mode)return;
    const r=await api('/api/restore',{method:'POST',body:JSON.stringify({mode,data})});
    alert(r.ok?'Restore complete.':'Restore failed.');refresh();e.target.value='';
  });
}

boot();
})();
