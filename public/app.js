/* ============================================================
   Absolute Motor Cars — public site logic
   Inventory is LIVE from /api/vehicles (no hardcoded cars).
   ============================================================ */
(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const fmt$ = n => (n==null||n==='') ? '' : '$' + Number(n).toLocaleString('en-CA');
  const fmtKm = n => (n==null||n==='') ? '' : Number(n).toLocaleString('en-CA') + ' km';

  let CONFIG = {};
  let VEHICLES = [];
  let filterStatus = 'all';
  let searchTerm = '';

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    wireNav();
    wireContactForm();
    wireModalShell();
    try {
      const r = await fetch('/api/config');
      if (r.ok) CONFIG = await r.json();
    } catch {}
    applyConfig();
    await loadInventory();
    wireControls();
    revealOnScroll();
  });

  function applyConfig(){
    // Only touch fields that have real values — never invent.
    if (CONFIG.hours)     $$('.js-hours').forEach(el => el.textContent = CONFIG.hours);
    if (CONFIG.email)     $$('.js-email').forEach(el => { el.textContent = CONFIG.email; el.href = 'mailto:'+CONFIG.email; });
    if (CONFIG.instagram) { const a = $('.js-instagram'); if (a){ a.style.display=''; a.textContent = CONFIG.instagram;
      a.href = 'https://instagram.com/' + CONFIG.instagram.replace('@',''); } }
    if (CONFIG.phoneE164) { const wa = $('.wa'); if (wa) wa.href =
      'https://wa.me/' + CONFIG.phoneE164 + '?text=' + encodeURIComponent('Hi! I\'m interested in one of your vehicles.'); }
  }

  /* ---------- nav ---------- */
  function wireNav(){
    const head = $('#head');
    addEventListener('scroll', () => head.classList.toggle('scrolled', scrollY > 40));
    const burger = $('#burger'), nl = $('#navlinks');
    burger.addEventListener('click', () => nl.classList.toggle('open'));
    $$('#navlinks a').forEach(a => a.addEventListener('click', () => nl.classList.remove('open')));
  }

  /* ---------- inventory ---------- */
  async function loadInventory(){
    const grid = $('#inv-grid');
    grid.innerHTML = '<div class="inv-empty"><h3>Loading inventory…</h3></div>';
    try {
      const r = await fetch('/api/vehicles');
      VEHICLES = r.ok ? await r.json() : [];
    } catch { VEHICLES = []; }
    renderGrid();
  }

  function visibleVehicles(){
    return VEHICLES.filter(v => {
      if (filterStatus !== 'all' && v.status !== filterStatus) return false;
      if (searchTerm) {
        const hay = `${v.year} ${v.make} ${v.model} ${v.trim||''}`.toLowerCase();
        if (!hay.includes(searchTerm)) return false;
      }
      return true;
    });
  }

  function renderGrid(){
    const grid = $('#inv-grid');
    const list = visibleVehicles();
    if (!list.length){
      grid.innerHTML = `
        <div class="inv-empty" style="grid-column:1/-1">
          <h3>${VEHICLES.length ? 'No matches' : 'Inventory is being updated'}</h3>
          <p>${VEHICLES.length
            ? 'Try a different search or filter.'
            : 'Our current stock is on its way to the site. Please <a href="#contact">get in touch</a> or call — we likely have exactly what you\'re looking for.'}</p>
        </div>`;
      return;
    }
    grid.innerHTML = list.map(v => `
      <button class="card" data-id="${v.id}">
        <div class="card-img">
          ${v.images && v.images.length
            ? `<img src="${v.images[0]}" alt="${esc(v.year+' '+v.make+' '+v.model)}" loading="lazy">`
            : `<span class="noimg">Photos coming soon</span>`}
          <span class="tag ${v.status}">${v.status}</span>
        </div>
        <div class="card-body">
          <div class="yr">${v.year}</div>
          <h3>${esc(v.make)} ${esc(v.model)}</h3>
          <div class="card-specs">
            ${v.trim ? `<span>${esc(v.trim)}</span>` : ''}
            ${v.mileage != null ? `<span>${fmtKm(v.mileage)}</span>` : ''}
            ${v.exterior ? `<span>${esc(v.exterior)}</span>` : ''}
          </div>
          <div class="card-foot">
            <span class="price">${fmt$(v.price)}</span>
            <span class="more">View Details →</span>
          </div>
        </div>
      </button>`).join('');
    $$('.card', grid).forEach(c => c.addEventListener('click', () => openVehicle(c.dataset.id)));
  }

  function wireControls(){
    $$('.chip[data-status]').forEach(ch => ch.addEventListener('click', () => {
      $$('.chip[data-status]').forEach(x => x.classList.remove('on'));
      ch.classList.add('on');
      filterStatus = ch.dataset.status;
      renderGrid();
    }));
    const si = $('#inv-search');
    si.addEventListener('input', () => { searchTerm = si.value.trim().toLowerCase(); renderGrid(); });
  }

  /* ---------- vehicle modal ---------- */
  let gIndex = 0, gImages = [];

  function openVehicle(id){
    const v = VEHICLES.find(x => x.id === id);
    if (!v) return;
    gImages = v.images || [];
    gIndex = 0;
    $('#vm-yr').textContent = v.year;
    $('#vm-title').textContent = `${v.make} ${v.model}`;
    $('#vm-trim').textContent = v.trim || '';
    $('#vm-price').textContent = fmt$(v.price);
    $('#vm-specs').innerHTML = [
      ['Mileage', v.mileage!=null ? fmtKm(v.mileage) : null],
      ['Exterior', v.exterior], ['Interior', v.interior],
      ['Engine', v.engine], ['Transmission', v.transmission],
      ['Drivetrain', v.drivetrain], ['Fuel', v.fuel],
      ['Stock #', v.stock_number], ['VIN', v.vin],
    ].filter(([,val]) => val).map(([k,val]) =>
      `<div class="spec"><div class="k">${k}</div><div class="v">${esc(String(val))}</div></div>`).join('');
    $('#vm-desc').textContent = v.description || '';
    $('#vm-ask').onclick = () => { closeOverlay('#vehicle-modal');
      openContact('general', `I'm interested in the ${v.year} ${v.make} ${v.model}${v.stock_number ? ' (Stock #'+v.stock_number+')' : ''}.`); };
    $('#vm-fin').href = '/financing?vehicle=' + encodeURIComponent(v.id);
    renderGallery();
    openOverlay('#vehicle-modal');
  }

  function renderGallery(){
    const img = $('#g-img'), noimg = $('#g-none');
    const has = gImages.length > 0;
    img.style.display = has ? '' : 'none';
    noimg.style.display = has ? 'none' : '';
    $('.g-prev').style.display = $('.g-next').style.display = gImages.length > 1 ? '' : 'none';
    $('#g-count').style.display = gImages.length > 1 ? '' : 'none';
    if (has){
      img.src = gImages[gIndex];
      $('#g-count').textContent = `${gIndex+1} / ${gImages.length}`;
    }
    const t = $('#thumbs');
    t.innerHTML = gImages.length > 1
      ? gImages.map((s,i)=>`<img src="${s}" class="${i===gIndex?'on':''}" data-i="${i}" alt="">`).join('') : '';
    $$('#thumbs img').forEach(th => th.addEventListener('click', () => { gIndex = +th.dataset.i; renderGallery(); }));
  }
  const gStep = d => { if(!gImages.length) return;
    gIndex = (gIndex + d + gImages.length) % gImages.length; renderGallery(); };

  function wireModalShell(){
    $('.g-prev').addEventListener('click', () => gStep(-1));
    $('.g-next').addEventListener('click', () => gStep(1));
    document.addEventListener('keydown', e => {
      if (!$('#vehicle-modal').classList.contains('open')) {
        if (e.key === 'Escape') $$('.overlay.open').forEach(o => o.classList.remove('open'));
        return;
      }
      if (e.key === 'ArrowLeft') gStep(-1);
      if (e.key === 'ArrowRight') gStep(1);
      if (e.key === 'Escape') closeOverlay('#vehicle-modal');
    });
    // swipe
    let x0 = null;
    $('#g-wrap').addEventListener('touchstart', e => x0 = e.touches[0].clientX, {passive:true});
    $('#g-wrap').addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) gStep(dx < 0 ? 1 : -1);
      x0 = null;
    }, {passive:true});
    // generic overlay close
    $$('.overlay').forEach(o => {
      o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
      $('.modal-x', o).addEventListener('click', () => o.classList.remove('open'));
    });
  }
  const openOverlay  = s => $(s).classList.add('open');
  const closeOverlay = s => $(s).classList.remove('open');

  /* ---------- contact ---------- */
  function openContact(type, prefill){
    const sel = $('#cf-type');
    sel.value = type || 'general';
    onTypeChange();
    if (prefill) $('#cf-message').value = prefill;
    document.getElementById('contact').scrollIntoView({behavior:'smooth'});
    setTimeout(() => $('#cf-name').focus({preventScroll:true}), 600);
  }
  window.openContact = openContact; // used by inline buttons

  function onTypeChange(){
    const t = $('#cf-type').value;
    const vd = $('#cf-vd-wrap');
    vd.style.display = (t === 'trade-in' || t === 'sourcing') ? '' : 'none';
    $('#cf-vd-label').textContent = t === 'trade-in'
      ? 'Tell us about your trade-in (year, make, model, condition)'
      : 'What vehicle are you looking for?';
  }

  function wireContactForm(){
    $('#cf-type').addEventListener('change', onTypeChange);
    $$('.js-open-contact').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); openContact(b.dataset.type || 'general');
    }));
    const form = $('#contact-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('#cf-msg');
      msg.textContent = ''; msg.className = 'form-msg';
      const t = $('#cf-type').value;
      const body = {
        type: t,
        name:  $('#cf-name').value.trim(),
        email: $('#cf-email').value.trim(),
        phone: $('#cf-phone').value.trim(),
        vehicle_details: (t==='trade-in'||t==='sourcing') ? $('#cf-vd').value.trim() : null,
        message: $('#cf-message').value.trim() || null,
      };
      if ((t==='trade-in'||t==='sourcing') && !body.vehicle_details){
        msg.textContent = 'Please add the vehicle details.'; msg.classList.add('err'); return;
      }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const r = await fetch('/api/contact', { method:'POST',
          headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        if (!r.ok) throw 0;
        msg.textContent = 'Sent — we\'ll get back to you shortly.'; msg.classList.add('ok');
        form.reset(); onTypeChange();
      } catch {
        msg.textContent = 'Something went wrong sending your message. Please call us instead.';
        msg.classList.add('err');
      } finally { btn.disabled = false; }
    });
  }

  /* ---------- misc ---------- */
  function revealOnScroll(){
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
    }), {threshold:.15});
    $$('.reveal').forEach(el => io.observe(el));
  }
  function esc(s){ return String(s).replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
})();
