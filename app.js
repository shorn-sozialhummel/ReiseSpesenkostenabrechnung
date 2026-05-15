'use strict';

const RATE = 0.30;

const REISEARTEN = [
  {v:'',             l:'– Art wählen –'},
  {v:'teamtreffen',  l:'Teamtreffen / Dienstbesprechung'},
  {v:'urlaubsbegl',  l:'Urlaubsbegleitung'},
  {v:'helfertreffen',l:'Helfertreffen'},
  {v:'kundenbesuch', l:'Kundenbesuch / Klientenbegleitung'},
  {v:'fortbildung',  l:'Fortbildung / Schulung'},
  {v:'sonstiges',    l:'Sonstiges'},
];

// ─── localStorage wrapper ─────────────────────────────────────────────────────

const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch { return false; }
  },
  del(key) { localStorage.removeItem(key); }
};

// ─── Arbeitgeberdaten ─────────────────────────────────────────────────────────

function getArbeitgeber() {
  return store.get('ag_data', {
    name: 'Sozialhummel gGmbH',
    strasse: 'Mozartstr. 10',
    plz: '53819',
    ort: 'Neunkirchen-Seelscheid',
    email: '',
    tel: '',
    mapsKey: ''
  });
}

// ─── Profil ───────────────────────────────────────────────────────────────────

function getProfil() {
  return store.get('profil', {
    vorname: '', nachname: '', iban: '', rolle: '', rolleText: '',
    heimStrasse: '', heimPlz: '', heimOrt: '',
    arbeitsortName: '', arbeitsortAdresse: '',
    pendelKmEinfach: 0, pendelBerechnetAm: ''
  });
}

function saveProfil(p) { store.set('profil', p); }

function getHeimAdresse() {
  const p = getProfil();
  return [p.heimStrasse, (p.heimPlz + ' ' + p.heimOrt).trim()].filter(x => x.trim()).join(', ');
}

function getArbeitsAdresse() {
  return getProfil().arbeitsortAdresse || '';
}

// ─── Entwürfe ─────────────────────────────────────────────────────────────────

function getDrafts() { return store.get('drafts', []); }

function saveDraft(d) {
  const drafts = getDrafts();
  d.savedAt = new Date().toISOString();
  d.status = 'entwurf';
  const idx = drafts.findIndex(x => x.id === d.id);
  if (idx >= 0) drafts[idx] = d; else drafts.unshift(d);
  store.set('drafts', drafts);
}

function deleteDraft(id) { store.set('drafts', getDrafts().filter(d => d.id !== id)); }

function newAntragId() {
  const d = new Date();
  return 'RK-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}

// ─── Google Maps ──────────────────────────────────────────────────────────────

function ladeMapsApi(key) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(); return; }
    const timeout = setTimeout(() => reject(new Error('Timeout beim Laden der Maps API')), 10000);
    window._mapsCallback = () => { clearTimeout(timeout); window._mapsReady = true; resolve(); };
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + key + '&loading=async&callback=_mapsCallback';
    s.onerror = () => { clearTimeout(timeout); reject(new Error('Maps konnte nicht geladen werden')); };
    document.head.appendChild(s);
  });
}

async function berechnKm(origin, destination) {
  if (!window.google || !window.google.maps) throw new Error('Google Maps nicht verfügbar');
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout — Google Maps antwortet nicht')), 15000);
    new google.maps.DistanceMatrixService().getDistanceMatrix({
      origins: [origin],
      destinations: [destination],
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.METRIC,
      region: 'de'
    }, (res, status) => {
      clearTimeout(timeout);
      console.log('Maps Antwort:', status, res);
      if (status !== 'OK') { reject(new Error('Maps Fehler: ' + status)); return; }
      const el = res.rows[0].elements[0];
      if (el.status !== 'OK') { reject(new Error('Route nicht gefunden: ' + el.status)); return; }
      resolve(Math.round(el.distance.value / 1000));
    });
  });
}

async function mitMapsButton(btnId, origin, destination, onSuccess) {
  const ag = getArbeitgeber();
  if (!ag.mapsKey) { showToast('Bitte API Key im Admin-Bereich hinterlegen.', 'warn'); return; }
  if (!origin || origin.trim().length < 5) { showToast('Bitte Startadresse eingeben.', 'warn'); return; }
  if (!destination || destination.trim().length < 5) { showToast('Bitte Zieladresse eingeben.', 'warn'); return; }
  const btn = document.getElementById(btnId);
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Berechne …'; }
  try {
    if (!window.google || !window.google.maps) await ladeMapsApi(ag.mapsKey);
    const km = await berechnKm(origin, destination);
    onSuccess(km);
  } catch (e) {
    console.error('Maps Fehler:', e);
    showToast('Fehler: ' + e.message, 'warn');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

// ─── Pendelabzug-Logik ────────────────────────────────────────────────────────
// Start vom Arbeitsort = kein Pendelabzug (volle Strecke wird erstattet)
// modus: 'einfach' | 'hinrueck' | 'mehrtaegig'
// startTyp: 'zuhause' | 'arbeitsort' | 'andere'
// Pendelabzug immer nur einmal pro Fahrt-Eintrag

function berechneFahrtErstattung(modus, kmHin, kmRueck, startTyp) {
  var p = getProfil();
  var pendelKm = (p.pendelKmEinfach || 0) * 2;
  var gesamtKm = 0;
  if (modus === 'einfach')    gesamtKm = parseInt(kmHin) || 0;
  if (modus === 'hinrueck')   gesamtKm = (parseInt(kmHin) || 0) * 2;
  if (modus === 'mehrtaegig') gesamtKm = (parseInt(kmHin) || 0) + (parseInt(kmRueck) || 0);
  var pendelAbzug   = startTyp === 'arbeitsort' ? 0 : pendelKm;
  var erstattungKm  = Math.max(0, gesamtKm - pendelAbzug);
  return {
    gesamtKm:    gesamtKm,
    pendelAbzug: pendelAbzug,
    erstattungKm: erstattungKm,
    betrag:      erstattungKm * RATE,
    keinAbzug:   startTyp === 'arbeitsort'
  };
}

// ─── Formatierung ─────────────────────────────────────────────────────────────

function fmt(n) {
  return parseFloat(n || 0).toFixed(2).replace('.', ',') + ' €';
}

function fmtKm(n) {
  return (parseInt(n) || 0) + ' km';
}

function today() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '.' +
    String(d.getMonth() + 1).padStart(2, '0') + '.' +
    d.getFullYear();
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function fmtDateDE(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d + '.' + m + '.' + y;
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return String(d.getDate()).padStart(2, '0') + '.' +
    String(d.getMonth() + 1).padStart(2, '0') + '.' +
    d.getFullYear() + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

// ─── HTML escaping ────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  const cols = {
    info: ['#E6F1FB', '#0C447C', '#85B7EB'],
    warn: ['#FAEEDA', '#633806', '#EF9F27'],
    ok:   ['#E1F5EE', '#085041', '#1D9E75']
  };
  const [bg, fg, border] = cols[type] || cols.info;
  Object.assign(t.style, {
    background: bg,
    color: fg,
    border: '1px solid ' + border,
    opacity: '1',
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    padding: '10px 18px',
    borderRadius: '10px',
    fontSize: '13px',
    fontFamily: 'inherit',
    fontWeight: '500',
    zIndex: '9999',
    transition: 'opacity .3s',
    pointerEvents: 'none',
    maxWidth: '320px'
  });
  clearTimeout(t._to);
  t._to = setTimeout(() => { t.style.opacity = '0'; }, 3500);
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

const TOPBAR_LOGO = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="white" stroke-width="1.2"/>
  <line x1="5" y1="5" x2="11" y2="5" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="5" y1="8" x2="11" y2="8" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="5" y1="11" x2="8"  y2="11" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

function renderTopbar(active) {
  const pages = [
    { href: 'index.html',  key: 'index',  label: 'Neue Abrechnung' },
    { href: 'drafts.html', key: 'drafts', label: 'Entwürfe' },
    { href: 'admin.html',  key: 'admin',  label: 'Admin' },
  ];
  const navLinks = pages.map(p =>
    `<a href="${p.href}"${p.key === active ? ' class="active"' : ''}>${esc(p.label)}</a>`
  ).join('');
  return `
<div class="topbar">
  <a class="topbar-brand" href="index.html">
    <div class="topbar-logo-sq">${TOPBAR_LOGO}</div>
    <div>
      <div class="topbar-name">Reisekostenabrechnung</div>
      <div class="topbar-sub">Sozialhummel gGmbH</div>
    </div>
  </a>
  <nav class="topbar-nav">${navLinks}</nav>
</div>`;
}
