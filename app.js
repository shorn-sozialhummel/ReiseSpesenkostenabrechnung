// Reisekostenabrechnung – Sozialhummel gGmbH
const RATE_PER_KM = 0.30;

// ── Storage helpers ──────────────────────────────────────────────────────────
const LS = {
  get: (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  remove: (k) => localStorage.removeItem(k),
};

// ── Default employer data ────────────────────────────────────────────────────
const DEFAULT_EMPLOYER = {
  name: 'Sozialhummel gGmbH',
  street: 'Mozartstr. 10',
  zip: '53819',
  city: 'Neunkirchen-Seelscheid',
};

function getEmployer() {
  return LS.get('employer', DEFAULT_EMPLOYER);
}

function getTeams() {
  return LS.get('teams', ['Ambulant', 'Stationär', 'Verwaltung', 'Leitung']);
}

function getGmapsKey() {
  return LS.get('gmapsKey', '');
}

// ── Toast notifications ──────────────────────────────────────────────────────
function showToast(msg, type = 'success', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ── Format helpers ───────────────────────────────────────────────────────────
function formatEuro(val) {
  return (Math.round(val * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ── KM calculation via Google Distance Matrix API ────────────────────────────
async function calcKmGoogle(origin, destination) {
  const key = getGmapsKey();
  if (!key) throw new Error('Kein Google Maps API Key gesetzt (Admin → API Key).');
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&language=de&key=${key}`;
  // Use a CORS proxy pattern – direct call from browser requires Maps JS API + callback approach
  // We use Distance Matrix JS API via callback if Maps JS API is loaded
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined' || !google.maps || !google.maps.DistanceMatrixService) {
      reject(new Error('Google Maps API nicht geladen. Bitte API Key prüfen.'));
      return;
    }
    const svc = new google.maps.DistanceMatrixService();
    svc.getDistanceMatrix({
      origins: [origin],
      destinations: [destination],
      travelMode: google.maps.TravelMode.DRIVING,
    }, (res, status) => {
      if (status !== 'OK') { reject(new Error('Distanz-API Fehler: ' + status)); return; }
      const el = res.rows[0]?.elements[0];
      if (el?.status !== 'OK') { reject(new Error('Route nicht gefunden.')); return; }
      resolve(Math.round(el.distance.value / 1000));
    });
  });
}

function loadGoogleMapsScript(key) {
  if (document.getElementById('gmaps-script')) return;
  const script = document.createElement('script');
  script.id = 'gmaps-script';
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

// ── Profile ──────────────────────────────────────────────────────────────────
function saveProfile() {
  const profile = {
    firstName: document.getElementById('firstName')?.value || '',
    lastName: document.getElementById('lastName')?.value || '',
    street: document.getElementById('empStreet')?.value || '',
    zip: document.getElementById('empZip')?.value || '',
    city: document.getElementById('empCity')?.value || '',
    iban: document.getElementById('empIban')?.value || '',
    team: document.getElementById('empTeam')?.value || '',
  };
  LS.set('profile', profile);
}

function loadProfile() {
  const profile = LS.get('profile', {});
  const fields = ['firstName', 'lastName', 'empStreet', 'empZip', 'empCity', 'empIban', 'empTeam'];
  const keys = ['firstName', 'lastName', 'street', 'zip', 'city', 'iban', 'team'];
  fields.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el && profile[keys[i]] !== undefined) el.value = profile[keys[i]];
  });
}

function populateTeamSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const teams = getTeams();
  const current = sel.value;
  sel.innerHTML = '<option value="">Bitte wählen …</option>';
  teams.forEach(t => {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    if (t === current) o.selected = true;
    sel.appendChild(o);
  });
}

// ── Trip rows ────────────────────────────────────────────────────────────────
let tripRows = [];
let rowCounter = 0;

function addTripRow(data = {}) {
  rowCounter++;
  const id = rowCounter;
  const tbody = document.getElementById('trip-tbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.id = `row-${id}`;
  tr.dataset.rowId = id;

  tr.innerHTML = `
    <td><input type="date" class="row-date" value="${data.date || todayISO()}" onchange="updateSummary()"></td>
    <td><input type="text" class="row-from" placeholder="Von-Adresse" value="${data.from || ''}" style="min-width:130px"></td>
    <td><input type="text" class="row-to" placeholder="Ziel-Adresse" value="${data.to || ''}" style="min-width:130px"></td>
    <td><input type="text" class="row-purpose" placeholder="Zweck" value="${data.purpose || ''}" style="min-width:110px"></td>
    <td>
      <div class="km-cell">
        <input type="number" class="row-km" min="0" step="1" value="${data.km || ''}" style="width:75px" onchange="updateSummary()" oninput="updateSummary()">
        <button class="btn btn-sm btn-outline calc-btn" onclick="calcRowKm(${id})" title="Per Google Maps berechnen">📍</button>
      </div>
    </td>
    <td style="text-align:right"><span class="row-total">${data.km ? formatEuro(data.km * RATE_PER_KM) : '–'}</span></td>
    <td><button class="btn btn-sm btn-danger" onclick="removeRow(${id})">✕</button></td>
  `;

  tbody.appendChild(tr);
  tripRows.push(id);
  updateSummary();
}

function removeRow(id) {
  const tr = document.getElementById(`row-${id}`);
  if (tr) tr.remove();
  tripRows = tripRows.filter(r => r !== id);
  updateSummary();
}

function calcRowKm(id) {
  const tr = document.getElementById(`row-${id}`);
  if (!tr) return;
  const from = tr.querySelector('.row-from').value.trim();
  const to = tr.querySelector('.row-to').value.trim();
  if (!from || !to) { showToast('Bitte Von- und Ziel-Adresse eingeben.', 'warning'); return; }

  const btn = tr.querySelector('.calc-btn');
  btn.disabled = true;
  btn.textContent = '…';

  const key = getGmapsKey();
  if (!key) {
    showToast('Kein Google Maps API Key gesetzt. Bitte im Admin-Bereich eintragen.', 'error');
    btn.disabled = false;
    btn.textContent = '📍';
    return;
  }

  loadGoogleMapsScript(key);

  const attempt = (tries) => {
    if (typeof google !== 'undefined' && google.maps) {
      calcKmGoogle(from, to).then(km => {
        tr.querySelector('.row-km').value = km;
        updateSummary();
        showToast(`${km} km berechnet.`, 'success');
      }).catch(err => {
        showToast(err.message, 'error');
      }).finally(() => {
        btn.disabled = false;
        btn.textContent = '📍';
      });
    } else if (tries > 0) {
      setTimeout(() => attempt(tries - 1), 500);
    } else {
      showToast('Google Maps API konnte nicht geladen werden.', 'error');
      btn.disabled = false;
      btn.textContent = '📍';
    }
  };
  attempt(10);
}

function getRowData() {
  return tripRows.map(id => {
    const tr = document.getElementById(`row-${id}`);
    if (!tr) return null;
    return {
      date: tr.querySelector('.row-date').value,
      from: tr.querySelector('.row-from').value.trim(),
      to: tr.querySelector('.row-to').value.trim(),
      purpose: tr.querySelector('.row-purpose').value.trim(),
      km: parseFloat(tr.querySelector('.row-km').value) || 0,
    };
  }).filter(Boolean);
}

function updateSummary() {
  let totalKm = 0;
  tripRows.forEach(id => {
    const tr = document.getElementById(`row-${id}`);
    if (!tr) return;
    const km = parseFloat(tr.querySelector('.row-km').value) || 0;
    const span = tr.querySelector('.row-total');
    span.textContent = km > 0 ? formatEuro(km * RATE_PER_KM) : '–';
    totalKm += km;
  });

  const commute = parseFloat(document.getElementById('commuteKm')?.value) || 0;
  const trips = parseInt(document.getElementById('commuteTrips')?.value) || 0;
  const totalCommuteKm = commute * trips;
  const reimburseKm = Math.max(0, totalKm - totalCommuteKm);
  const totalEuro = reimburseKm * RATE_PER_KM;

  const el = (id) => document.getElementById(id);
  if (el('sumTotalKm')) el('sumTotalKm').textContent = totalKm.toLocaleString('de-DE') + ' km';
  if (el('sumCommuteKm')) el('sumCommuteKm').textContent = totalCommuteKm.toLocaleString('de-DE') + ' km';
  if (el('sumReimburseKm')) el('sumReimburseKm').textContent = reimburseKm.toLocaleString('de-DE') + ' km';
  if (el('sumTotal')) el('sumTotal').textContent = formatEuro(totalEuro);
}

// ── Draft handling ───────────────────────────────────────────────────────────
function collectFormData() {
  saveProfile();
  return {
    savedAt: new Date().toISOString(),
    period: document.getElementById('period')?.value || '',
    profile: LS.get('profile', {}),
    commuteKm: parseFloat(document.getElementById('commuteKm')?.value) || 0,
    commuteTrips: parseInt(document.getElementById('commuteTrips')?.value) || 0,
    notes: document.getElementById('notes')?.value || '',
    rows: getRowData(),
  };
}

function saveDraft() {
  const data = collectFormData();
  const name = prompt('Name für diesen Entwurf (z.B. "Mai 2025"):');
  if (!name) return;
  data.name = name.trim();
  const drafts = LS.get('drafts', []);
  drafts.push(data);
  LS.set('drafts', drafts);
  showToast(`Entwurf "${data.name}" gespeichert.`, 'success');
}

function loadDraftIntoForm(draftData) {
  const el = (id) => document.getElementById(id);
  if (el('period')) el('period').value = draftData.period || '';
  if (el('commuteKm')) el('commuteKm').value = draftData.commuteKm || '';
  if (el('commuteTrips')) el('commuteTrips').value = draftData.commuteTrips || '';
  if (el('notes')) el('notes').value = draftData.notes || '';

  const profile = draftData.profile || {};
  Object.assign(LS.get('profile', {}), profile);
  LS.set('profile', profile);
  loadProfile();

  // Clear and reload trip rows
  const tbody = el('trip-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    tripRows = [];
    rowCounter = 0;
  }
  (draftData.rows || []).forEach(r => addTripRow(r));
  updateSummary();
}

// ── Init index.html ──────────────────────────────────────────────────────────
function initIndex() {
  loadProfile();
  populateTeamSelect('empTeam');

  // Auto-save profile on change
  ['firstName', 'lastName', 'empStreet', 'empZip', 'empCity', 'empIban', 'empTeam'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveProfile);
  });

  // Listen for commute changes
  ['commuteKm', 'commuteTrips'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateSummary);
  });

  // Add initial row if none
  addTripRow();

  // Load Google Maps if key set
  const key = getGmapsKey();
  if (key) loadGoogleMapsScript(key);

  // Check if returning from drafts with a pending load
  const pending = LS.get('pendingDraft', null);
  if (pending) {
    LS.remove('pendingDraft');
    loadDraftIntoForm(pending);
    showToast(`Entwurf "${pending.name || ''}" geladen.`, 'success');
  }

  updateSummary();
}

// ── Init drafts.html ─────────────────────────────────────────────────────────
function initDrafts() {
  renderDraftList();
}

function renderDraftList() {
  const container = document.getElementById('draft-list');
  if (!container) return;
  const drafts = LS.get('drafts', []);

  if (drafts.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="icon">📄</span><p>Keine gespeicherten Entwürfe vorhanden.</p></div>';
    return;
  }

  container.innerHTML = '';
  drafts.forEach((draft, idx) => {
    const totalKm = (draft.rows || []).reduce((s, r) => s + (r.km || 0), 0);
    const commuteKm = (draft.commuteKm || 0) * (draft.commuteTrips || 0);
    const reimbKm = Math.max(0, totalKm - commuteKm);
    const amount = reimbKm * RATE_PER_KM;

    const item = document.createElement('div');
    item.className = 'draft-item';
    item.innerHTML = `
      <div class="draft-info">
        <div class="draft-name">${draft.name || 'Entwurf ' + (idx + 1)}</div>
        <div class="draft-meta">
          ${draft.profile?.firstName || ''} ${draft.profile?.lastName || ''} &nbsp;·&nbsp;
          ${draft.period || 'kein Zeitraum'} &nbsp;·&nbsp;
          ${(draft.rows || []).length} Fahrt(en) &nbsp;·&nbsp;
          ${reimbKm} km &nbsp;·&nbsp;
          ${formatEuro(amount)}
          &nbsp;·&nbsp; gespeichert: ${new Date(draft.savedAt).toLocaleDateString('de-DE')}
        </div>
      </div>
      <div class="draft-actions">
        <button class="btn btn-sm btn-outline" onclick="loadDraft(${idx})">Laden</button>
        <button class="btn btn-sm btn-primary" onclick="generatePdfFromDraft(${idx})">PDF</button>
        <button class="btn btn-sm btn-danger" onclick="deleteDraft(${idx})">Löschen</button>
      </div>
    `;
    container.appendChild(item);
  });
}

function loadDraft(idx) {
  const drafts = LS.get('drafts', []);
  if (!drafts[idx]) return;
  LS.set('pendingDraft', drafts[idx]);
  window.location.href = 'index.html';
}

function deleteDraft(idx) {
  if (!confirm('Entwurf wirklich löschen?')) return;
  const drafts = LS.get('drafts', []);
  drafts.splice(idx, 1);
  LS.set('drafts', drafts);
  renderDraftList();
  showToast('Entwurf gelöscht.', 'success');
}

function generatePdfFromDraft(idx) {
  const drafts = LS.get('drafts', []);
  if (!drafts[idx]) return;
  generatePDF(drafts[idx]);
}

function clearAllDrafts() {
  if (!confirm('Alle Entwürfe wirklich löschen?')) return;
  LS.remove('drafts');
  renderDraftList();
  showToast('Alle Entwürfe gelöscht.', 'success');
}

// ── Admin ────────────────────────────────────────────────────────────────────
const ADMIN_PW_KEY = 'adminPassword';

function getAdminPassword() {
  return LS.get(ADMIN_PW_KEY, 'sozialhummel');
}

function checkAdminPassword() {
  const overlay = document.getElementById('pw-overlay');
  if (!overlay) return;
  const stored = getAdminPassword();
  if (!stored) { overlay.classList.add('hidden'); return; }

  const input = document.getElementById('pw-input');
  const btn = document.getElementById('pw-btn');
  const err = document.getElementById('pw-error');

  btn?.addEventListener('click', () => {
    if (input.value === stored) {
      overlay.classList.add('hidden');
    } else {
      err.textContent = 'Falsches Passwort.';
      err.style.color = 'var(--danger)';
      input.value = '';
    }
  });

  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
}

function initAdmin() {
  checkAdminPassword();

  // Load employer
  const emp = getEmployer();
  const el = (id) => document.getElementById(id);
  if (el('agName')) el('agName').value = emp.name || '';
  if (el('agStreet')) el('agStreet').value = emp.street || '';
  if (el('agZip')) el('agZip').value = emp.zip || '';
  if (el('agCity')) el('agCity').value = emp.city || '';

  // Load API key
  if (el('gmapsKey')) el('gmapsKey').value = getGmapsKey();

  // Load teams
  renderTeamList();
}

function saveEmployer() {
  const emp = {
    name: document.getElementById('agName')?.value || '',
    street: document.getElementById('agStreet')?.value || '',
    zip: document.getElementById('agZip')?.value || '',
    city: document.getElementById('agCity')?.value || '',
  };
  LS.set('employer', emp);
  showToast('Arbeitgeberdaten gespeichert.', 'success');
}

function saveGmapsKey() {
  const key = document.getElementById('gmapsKey')?.value?.trim() || '';
  LS.set('gmapsKey', key);
  showToast('API Key gespeichert.', 'success');
}

function renderTeamList() {
  const container = document.getElementById('team-list');
  if (!container) return;
  const teams = getTeams();
  container.innerHTML = '';
  teams.forEach((t, i) => {
    const span = document.createElement('span');
    span.className = 'team-tag';
    span.innerHTML = `${t} <button onclick="removeTeam(${i})" title="Entfernen">×</button>`;
    container.appendChild(span);
  });
}

function addTeam() {
  const input = document.getElementById('newTeam');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  const teams = getTeams();
  if (teams.includes(name)) { showToast('Team bereits vorhanden.', 'warning'); return; }
  teams.push(name);
  LS.set('teams', teams);
  input.value = '';
  renderTeamList();
  showToast(`Team "${name}" hinzugefügt.`, 'success');
}

function removeTeam(idx) {
  const teams = getTeams();
  teams.splice(idx, 1);
  LS.set('teams', teams);
  renderTeamList();
}

function changePassword() {
  const curr = document.getElementById('pwCurrent')?.value;
  const next = document.getElementById('pwNew')?.value;
  const confirm2 = document.getElementById('pwConfirm')?.value;

  if (curr !== getAdminPassword()) { showToast('Aktuelles Passwort falsch.', 'error'); return; }
  if (!next || next.length < 4) { showToast('Neues Passwort zu kurz (mind. 4 Zeichen).', 'warning'); return; }
  if (next !== confirm2) { showToast('Passwörter stimmen nicht überein.', 'error'); return; }

  LS.set(ADMIN_PW_KEY, next);
  document.getElementById('pwCurrent').value = '';
  document.getElementById('pwNew').value = '';
  document.getElementById('pwConfirm').value = '';
  showToast('Passwort geändert.', 'success');
}

function resetToDefaults() {
  if (!confirm('Alle Admin-Einstellungen auf Standard zurücksetzen?')) return;
  LS.set('employer', DEFAULT_EMPLOYER);
  LS.set('teams', ['Ambulant', 'Stationär', 'Verwaltung', 'Leitung']);
  LS.remove('gmapsKey');
  LS.set(ADMIN_PW_KEY, 'sozialhummel');
  initAdmin();
  showToast('Einstellungen zurückgesetzt.', 'success');
}
