'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const RATE_PER_KM = 0.30;

const REISEARTEN = [
  { v: '',              l: '– Art wählen –' },
  { v: 'teamtreffen',   l: 'Teamtreffen / Dienstbesprechung' },
  { v: 'urlaubsbegl',   l: 'Urlaubsbegleitung' },
  { v: 'helfertreffen', l: 'Helfertreffen' },
  { v: 'kundenbesuch',  l: 'Kundenbesuch / Klientenbegleitung' },
  { v: 'fortbildung',   l: 'Fortbildung / Schulung' },
  { v: 'sonstiges',     l: 'Sonstiges' },
];

// ─── Local Storage ───────────────────────────────────────────────────────────
const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
};

// ─── Arbeitgeber / Profile ────────────────────────────────────────────────────
const AG_DEFAULTS = {
  name: 'Sozialhummel gGmbH',
  strasse: 'Mozartstr. 10',
  plz: '53819',
  ort: 'Neunkirchen-Seelscheid',
  email: '',
  tel: '',
  mapsKey: ''
};

function getArbeitgeber() {
  return { ...AG_DEFAULTS, ...store.get('ag_data', {}) };
}

function getProfil() {
  return store.get('profil', {});
}

function saveProfil(p) {
  store.set('profil', p);
}

function getDrafts() {
  return store.get('drafts', []);
}

// ─── ID Generation ────────────────────────────────────────────────────────────
function newAntragId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `RK-${y}-${m}-${r}`;
}

// ─── Draft Management ─────────────────────────────────────────────────────────
function saveDraft(d) {
  d.savedAt = new Date().toISOString();
  d.status = 'entwurf';
  const drafts = getDrafts().filter(x => x.id !== d.id);
  drafts.unshift(d);
  store.set('drafts', drafts);
}

function deleteDraft(id) {
  store.set('drafts', getDrafts().filter(d => d.id !== id));
}

// ─── Formatting ───────────────────────────────────────────────────────────────
function fmt(n) {
  return (+(n || 0)).toFixed(2).replace('.', ',') + ' €';
}

function fmtKm(n) {
  return (+(n || 0)).toLocaleString('de-DE') + ' km';
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

function fmtDateDE(isoStr) {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length !== 3) return isoStr;
  return parts[2] + '.' + parts[1] + '.' + parts[0];
}

function fmtDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return String(d.getDate()).padStart(2,'0') + '.' +
         String(d.getMonth()+1).padStart(2,'0') + '.' +
         d.getFullYear() + ' ' +
         String(d.getHours()).padStart(2,'0') + ':' +
         String(d.getMinutes()).padStart(2,'0');
}

// ─── Escape HTML ──────────────────────────────────────────────────────────────
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
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:9999',
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      'pointer-events:none'
    ].join(';');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = msg;

  container.appendChild(toast);

  // Auto-fade after 3 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 420);
  }, 3000);
}

// ─── Google Maps Distance ─────────────────────────────────────────────────────
async function berechnKm(origin, destination) {
  if (!origin || !destination) throw new Error('Bitte beide Adressen eingeben.');

  if (typeof google === 'undefined' || !google.maps || !google.maps.DistanceMatrixService) {
    const ag = getArbeitgeber();
    if (!ag.mapsKey) {
      throw new Error('Kein Google Maps API Key gesetzt. Bitte im Admin-Bereich eintragen.');
    }
    throw new Error('Google Maps API wird noch geladen. Bitte kurz warten und erneut versuchen.');
  }

  return new Promise((resolve, reject) => {
    const svc = new google.maps.DistanceMatrixService();
    svc.getDistanceMatrix(
      {
        origins: [origin],
        destinations: [destination],
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC,
        region: 'de'
      },
      (res, status) => {
        if (status !== 'OK') {
          reject(new Error('Google Maps Fehler: ' + status));
          return;
        }
        const el = res.rows[0]?.elements[0];
        if (!el || el.status !== 'OK') {
          reject(new Error('Route nicht gefunden.'));
          return;
        }
        resolve(Math.round(el.distance.value / 1000));
      }
    );
  });
}

// ─── Google Maps Script Loader ────────────────────────────────────────────────
function loadGoogleMapsScript() {
  const ag = getArbeitgeber();
  if (!ag.mapsKey) return; // No key – skip loading
  if (document.getElementById('gmaps-script')) return; // Already loading/loaded

  const script = document.createElement('script');
  script.id = 'gmaps-script';
  script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(ag.mapsKey) + '&libraries=&v=weekly';
  script.async = true;
  script.defer = true;
  document.body.appendChild(script);
}

// ─── Topbar Logo SVG ──────────────────────────────────────────────────────────
const LOGO_SVG = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="white" stroke-width="1.2" fill="none"/>
  <line x1="5" y1="5" x2="11" y2="5" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="5" y1="8" x2="11" y2="8" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="5" y1="11" x2="8" y2="11" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

// ─── Topbar HTML generator ────────────────────────────────────────────────────
function renderTopbar(activePage) {
  const pages = [
    { href: 'index.html',  label: 'Neue Abrechnung', key: 'index' },
    { href: 'drafts.html', label: 'Entwürfe',   key: 'drafts' },
    { href: 'admin.html',  label: 'Admin',            key: 'admin' },
  ];

  const navHtml = pages.map((p, i) => {
    const isActive = p.key === activePage ? ' class="active"' : '';
    const sep = i < pages.length - 1 ? '<span class="nav-sep"></span>' : '';
    return `<a href="${p.href}"${isActive}>${esc(p.label)}</a>${sep}`;
  }).join('');

  return `
<div class="topbar">
  <div class="topbar-logo">
    <div class="logo-square">${LOGO_SVG}</div>
    <span class="topbar-title">Reisekostenabrechnung &middot; Sozialhummel gGmbH</span>
  </div>
  <nav class="topbar-nav">${navHtml}</nav>
</div>`;
}
