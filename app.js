'use strict';

// ─── Constants ──────────────────────────────────────────────────────────────
const RATE_PER_KM = 0.30;

// ─── Storage helpers ─────────────────────────────────────────────────────────
const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('store.set error:', e);
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('store.del error:', e);
    }
  }
};

// ─── Defaults ────────────────────────────────────────────────────────────────
const AG_DEFAULTS = {
  name: 'Sozialhummel gGmbH',
  strasse: 'Mozartstr. 10',
  plz: '53819',
  ort: 'Neunkirchen-Seelscheid',
  email: '',
  tel: '',
  mapsKey: ''
};

const TEAMS_DEFAULTS = [
  { id: 't1', name: 'Team Rheinblick',  adresse: 'Hummelweg 3, 53757 Sankt Augustin' },
  { id: 't2', name: 'Team Hummelburg',  adresse: 'Schlossstr. 12, 53721 Siegburg' },
  { id: 't3', name: 'Team Sonnenweg',   adresse: 'Sonnenweg 5, 53840 Troisdorf' }
];

// ─── Data accessors ──────────────────────────────────────────────────────────
function getAG() {
  return { ...AG_DEFAULTS, ...store.get('ag_data', {}) };
}

function getTeams() {
  return store.get('teams', TEAMS_DEFAULTS);
}

function getProfile() {
  return store.get('profil', {});
}

function getDrafts() {
  return store.get('drafts', []);
}

// ─── Antrag ID ───────────────────────────────────────────────────────────────
function newAntragId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const seq  = String(Math.floor(Math.random() * 9000) + 1000);
  return `RK-${yyyy}-${mm}-${seq}`;
}

// ─── Draft CRUD ───────────────────────────────────────────────────────────────
function saveDraft(antrag) {
  const drafts = getDrafts();
  const idx = drafts.findIndex(d => d.id === antrag.id);
  if (idx >= 0) {
    drafts[idx] = antrag;
  } else {
    drafts.push(antrag);
  }
  store.set('drafts', drafts);
}

function deleteDraft(id) {
  const drafts = getDrafts().filter(d => d.id !== id);
  store.set('drafts', drafts);
}

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmt(n) {
  const num = typeof n === 'number' ? n : parseFloat(n) || 0;
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtKm(n) {
  const num = typeof n === 'number' ? n : parseFloat(n) || 0;
  return num.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' km';
}

function today() {
  const d = new Date();
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  let root = document.querySelector('.toast-root');
  if (!root) {
    root = document.createElement('div');
    root.className = 'toast-root';
    document.body.appendChild(root);
  }

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  root.appendChild(el);

  // Auto-remove after 3.5s with fade
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 320);
  }, 3500);
}

// ─── Google Maps – Distance Matrix ───────────────────────────────────────────
async function berechnKm(origin, destination) {
  return new Promise((resolve, reject) => {
    if (!origin || !destination) {
      reject(new Error('Bitte Start und Ziel angeben.'));
      return;
    }

    if (typeof google === 'undefined' || !google.maps || !google.maps.DistanceMatrixService) {
      reject(new Error('Google Maps ist nicht geladen. Bitte API-Key in den Admin-Einstellungen hinterlegen.'));
      return;
    }

    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [origin],
        destinations: [destination],
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC,
        avoidHighways: false,
        avoidTolls: false
      },
      (response, status) => {
        if (status !== 'OK') {
          reject(new Error('Distance Matrix Fehler: ' + status));
          return;
        }

        try {
          const element = response.rows[0].elements[0];
          if (element.status !== 'OK') {
            reject(new Error('Route nicht gefunden: ' + element.status));
            return;
          }
          const meters = element.distance.value;
          const km = Math.round(meters / 1000);
          resolve(km);
        } catch (e) {
          reject(new Error('Unerwarteter Fehler beim Auswerten der Route.'));
        }
      }
    );
  });
}

// ─── Google Maps Loader ───────────────────────────────────────────────────────
function ladeGoogleMaps(key) {
  if (!key || key === 'YOUR_API_KEY') return;
  if (document.getElementById('gmaps-js')) return;

  const s = document.createElement('script');
  s.id  = 'gmaps-js';
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
}
