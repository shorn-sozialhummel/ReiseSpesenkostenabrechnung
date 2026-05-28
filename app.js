'use strict';

function getRate() {
  var ag = store.get('ag_data', {});
  return ag.rate || 0.30;
}

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
  const stored = store.get('ag_data', null);
  if (!stored) return APP_CONFIG.arbeitgeber;
  var base = Object.assign({}, APP_CONFIG.arbeitgeber);
  ['name', 'strasse', 'plz', 'ort', 'email', 'tel', 'mapsKey'].forEach(function(k) {
    if (stored[k]) base[k] = stored[k];
  });
  base.rate            = stored.rate;
  base.buchhaltungMail = stored.buchhaltungMail;
  return base;
}

// ─── Profil ───────────────────────────────────────────────────────────────────

function getProfil() {
  const p = store.get('profil', {
    vorname: '', nachname: '', iban: '', rolle: '', rolleText: '',
    heimStrasse: '', heimPlz: '', heimOrt: '',
    arbeitsortName: '', arbeitsortAdresse: '',
    pendelKmEinfach: 0, pendelBerechnetAm: '',
    reisekostenStatus: ''
  });
  p.pendelKmEinfach = parseInt(p.pendelKmEinfach) || 0;
  return p;
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

async function ladeMapsApi() {
  const ag = getArbeitgeber();
  const key = ag.mapsKey || '';
  if (!key || key === 'HIER_DEN_API_KEY_EINTRAGEN') {
    throw new Error('Kein Google Maps API Key hinterlegt. Bitte in config.js eintragen.');
  }
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(); return; }
    const timeout = setTimeout(() => reject(new Error('Timeout beim Laden der Maps API')), 10000);
    window._mapsCallback = () => { clearTimeout(timeout); window._mapsReady = true; resolve(); };
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + key + '&loading=async&callback=_mapsCallback';
    s.onerror = () => { clearTimeout(timeout); reject(new Error('Maps API konnte nicht geladen werden')); };
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
  if (!origin || origin.trim().length < 5) { showToast('Bitte Startadresse eingeben.', 'warn'); return; }
  if (!destination || destination.trim().length < 5) { showToast('Bitte Zieladresse eingeben.', 'warn'); return; }
  const btn = document.getElementById(btnId);
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Berechne …'; }
  try {
    if (!window.google || !window.google.maps) await ladeMapsApi();
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

function getAktuellePendelKm() {
  if (window._tempPendelReset === true) return 0;
  if (window._pendingKm != null) return parseInt(window._pendingKm);
  return parseInt(getProfil().pendelKmEinfach) || 0;
}

function berechneFahrtErstattung(modus, kmHin, kmRueck, startTyp, endeZuhause) {
  var pendelEinfach = getAktuellePendelKm();
  var status = getProfil().reisekostenStatus;

  var gesamtKm = 0;
  if (modus === 'einfach')    gesamtKm = parseInt(kmHin) || 0;
  if (modus === 'hinrueck')   gesamtKm = (parseInt(kmHin) || 0) * 2;
  if (modus === 'mehrtaegig') gesamtKm = (parseInt(kmHin) || 0) + (parseInt(kmRueck) || 0);

  if (gesamtKm === 0) {
    return { gesamtKm: 0, pendelAbzug: 0, erstattungKm: 0, betrag: 0,
             keinAbzug: true, pendelEinfach: pendelEinfach, keineKm: true };
  }

  var keinAbzug, pendelKm;

  if (status === 'auswaerts' || pendelEinfach === 0) {
    keinAbzug = true;
    pendelKm  = 0;
  } else if (modus === 'hinrueck' && startTyp === 'zuhause') {
    // H&R ab Zuhause: immer voller Abzug (Feld ist ausgeblendet)
    keinAbzug = false;
    pendelKm  = pendelEinfach * 2;
  } else if (startTyp === 'zuhause') {
    // einfach/mehrtaegig ab Zuhause: Hinweg zur Wohnung, ggf. auch Rückweg
    keinAbzug = false;
    pendelKm  = endeZuhause ? pendelEinfach * 2 : pendelEinfach;
  } else {
    // Start NICHT von Zuhause (arbeitsort/andere)
    if (endeZuhause) {
      keinAbzug = false;
      pendelKm  = pendelEinfach;
    } else {
      keinAbzug = true;
      pendelKm  = 0;
    }
  }

  var pendelAbzug  = keinAbzug ? 0 : pendelKm;
  var erstattungKm = Math.max(0, gesamtKm - pendelAbzug);
  return {
    gesamtKm:     gesamtKm,
    pendelAbzug:  pendelAbzug,
    erstattungKm: erstattungKm,
    betrag:       erstattungKm * getRate(),
    keinAbzug:    keinAbzug,
    pendelEinfach: pendelEinfach,
    keineKm:      false
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

// ─── Hilfe-System ─────────────────────────────────────────────────────────────

const HILFE = {

  app: {
    titel: 'Was kann diese App?',
    html: `
      <p>Mit dieser App können Mitarbeiterinnen und Mitarbeiter
      ihre <strong>Reisekosten einfach und korrekt abrechnen</strong>
      — direkt im Browser, keine Installation nötig.</p>
      <ul class="help-list">
        <li><strong>Pendelstrecke berechnen</strong> — Google Maps
            ermittelt den Abzug automatisch</li>
        <li><strong>Mehrere Fahrten</strong> — Einfach, Hin & Zurück
            oder mehrtägig pro Abrechnung</li>
        <li><strong>PDF erstellen</strong> — Fertig zum Ausdrucken
            und Einreichen</li>
        <li><strong>Entwurf speichern</strong> — Jederzeit
            unterbrechen und weitermachen</li>
        <li><strong>Digitale Unterschrift</strong> — optional direkt im
            Browser unterschreiben, wird ins PDF eingebettet</li>
        <li><strong>Admin-Bereich</strong> — Erstattungssatz und
            Buchhaltungs-E-Mail anpassen (Zugang über Topbar)</li>
      </ul>
      <div class="help-info">
        Alle Daten werden <strong>lokal auf Ihrem Gerät</strong>
        gespeichert — kein Login, keine Cloud. Fertige Abrechnungen
        immer als PDF herunterladen und aufbewahren.
            Der <strong>Erstattungssatz</strong> (€/km) wird vom
            Admin festgelegt und gilt für alle Abrechnungen.
      </div>`
  },

  profil: {
    titel: 'Profil einrichten',
    html: `
      <p>Das Profil wird <strong>einmalig ausgefüllt</strong> und
      gespeichert. Bei Teamwechsel oder Umzug einfach aktualisieren.</p>
      <ul class="help-list">
        <li><strong>Reisekostenstatus</strong> — Pflichtfeld.
            Bestimmt, ob bei deinen Fahrten ein Pendelabzug anfällt:
            <ul class="help-list" style="margin-top:4px">
              <li><strong>Wechselnde Einsatzorte (Außendienst)</strong> —
                  keine feste Tätigkeitsstätte, alle dienstlichen Fahrten
                  voll erstattet, kein Pendelabzug</li>
              <li><strong>Fester Einsatzort (erste Tätigkeitsstätte)</strong> —
                  Pendelabzug für die Strecke Wohnung↔Einsatzort</li>
            </ul>
            Welcher Status für dich gilt, klärt im Zweifel die Buchhaltung.</li>
        <li><strong>IBAN</strong> — optional, nur wenn die Erstattung
            nicht auf das bereits bekannte Konto erfolgen soll.
            Checkbox: „IBAN bereits bekannt — Auszahlung auf
            hinterlegtes Konto"</li>
        <li><strong>E-Mail Vorgesetzte/r</strong> — Pflichtfeld für
            den E-Mail-Versand. Die Abrechnung geht an die/den
            Vorgesetzte/n, Buchhaltung erhält eine CC-Kopie.</li>
        <li><strong>Heimadresse</strong> — Basis für die
            Pendelberechnung</li>
        <li><strong>Einsatzort-Adresse</strong> — dein üblicher Einsatzort
            (z. B. WG Sonnenblume, Gartenstr. 8)</li>
      </ul>
      <div class="help-warn">
        Nach Adressänderung unbedingt die Pendelstrecke
        <strong>neu berechnen</strong> und dann
        <strong>Profil speichern</strong> klicken —
        sonst gilt die alte Strecke weiter.
      </div>`
  },

  pendel: {
    titel: 'Was ist der Pendelabzug?',
    html: `
      <div class="help-info" style="margin-bottom:8px">
        Der Pendelabzug greift <strong>nur</strong> bei Reisekostenstatus
        <strong>„Fester Einsatzort (erste Tätigkeitsstätte)"</strong>.
        Bei <strong>„Wechselnde Einsatzorte (Außendienst)"</strong> gibt es
        keinen Pendelabzug — alle dienstlichen Fahrten werden voll erstattet.
      </div>
      <p>Bei festem Einsatzort erstattet der AG nur die Strecke, die
      <strong>über den normalen Arbeitsweg hinausgeht</strong>.
      Der Abzug greift dabei nur, wenn eine Fahrt nachweislich
      <strong>von der Wohnung startet</strong> (Startpunkt „Zuhause").</p>
      <ul class="help-list">
        <li><strong>Start: Zuhause</strong> — Pendelabzug wird berechnet</li>
        <li><strong>Start: Arbeitsort</strong> — kein Abzug, volle Strecke erstattet</li>
        <li><strong>Start: Andere Adresse</strong> — kein Abzug, da die private
            Strecke Wohnung↔Büro nicht berührt wird (z. B. Kunde→Kunde bei
            einer Rundfahrt)</li>
      </ul>
      <div class="help-example">
        <div class="help-example-title">Beispielrechnung (Start Zuhause, hin & zurück)</div>
        <div class="help-example-row">
          <span>Gefahrene km (hin & zurück)</span><span>104 km</span>
        </div>
        <div class="help-example-row red">
          <span>Pendelabzug (17 km × 2)</span><span>− 34 km</span>
        </div>
        <div class="help-example-row total">
          <span>Erstattungs-km</span><span>70 km = 21,00 €</span>
        </div>
      </div>
      <div class="help-tip">
        Die abgezogenen km können als
        <strong>Entfernungspauschale (Anlage N)</strong>
        in der Steuererklärung angegeben werden.
      </div>`
  },

  fahrten: {
    titel: 'Fahrt eintragen',
    html: `
      <p><strong>Fahrtmodus wählen:</strong></p>
      <ul class="help-list">
        <li><strong>Einfache Fahrt</strong> — nur Hinfahrt,
            z. B. Mitarbeiter/in fährt mit Klienten in den Urlaub.
            Rückfahrt separat eintragen.</li>
        <li><strong>Hin & Rückfahrt (gleicher Tag)</strong> —
            z. B. Teamtreffen. KM wird automatisch ×2 gerechnet.</li>
        <li><strong>Mehrtägig</strong> — Hin- und Rückfahrt an
            verschiedenen Tagen. KM für beide Richtungen separat.
            Pendelabzug wird nur einmal pro Reise berechnet.</li>
      </ul>
      <p><strong>Startpunkt:</strong></p>
      <ul class="help-list">
        <li><strong>Zuhause</strong> — Pendelabzug wird berechnet</li>
        <li><strong>Arbeitsort</strong> — kein Abzug, volle Strecke
            erstattet (z. B. Fahrt direkt vom Klienten weiter)</li>
        <li><strong>Andere</strong> — freie Adresse,
            kein Pendelabzug (Wohnung wird nicht berührt)</li>
      </ul>
      <p style="margin-top:8px"><strong>Endet die Fahrt zuhause?</strong><br>
      Erscheint nur bei festem Einsatzort (erste Tätigkeitsstätte) und wenn
      der Startpunkt die Wohnungs&shy;berührung nicht bereits eindeutig regelt.
      Wer auch nach Hause zurückfährt, löst den Pendelabzug für
      <em>beide</em> Richtungen aus — sonst nur für eine.</p>
      <div class="help-example">
        <div class="help-example-title">Beispiel: Urlaubsbegleitung Holland (mehrtägig)</div>
        <div class="help-example-row">
          <span>Hinfahrt 248 km + Rückfahrt 248 km</span><span>496 km</span>
        </div>
        <div class="help-example-row red">
          <span>Pendelabzug (einmalig pro Reise)</span><span>− 34 km</span>
        </div>
        <div class="help-example-row total">
          <span>Erstattung (462 km × 0,30 €)</span><span>138,60 €</span>
        </div>
      </div>
      <div class="help-example" style="margin-top:6px">
        <div class="help-example-title">Beispiel: Helfertreffen mit Bewirtungsbeleg</div>
        <div class="help-example-row">
          <span>Hin & Rückfahrt 24 km × 2</span><span>48 km</span>
        </div>
        <div class="help-example-row red">
          <span>Pendelabzug 34 km</span><span>− 10,20 €</span>
        </div>
        <div class="help-example-row">
          <span>Fahrtkosten + Bewirtungsbeleg 38,50 €</span><span>43,30 €</span>
        </div>
      </div>
      <div class="help-warn">
        KM immer als <strong>einfache Strecke</strong> eingeben —
        bei Hin & Rückfahrt verdoppelt die App automatisch.
      </div>`
  },

  maps: {
    titel: 'Strecke via Google Maps berechnen',
    html: `
      <ol class="help-steps">
        <li><strong>Zieladresse eintragen</strong> —
            vollständige Adresse im Feld "Zieladresse"
            (z. B. "Strandweg 12, Noordwijk, Holland")</li>
        <li><strong>"via Maps berechnen" klicken</strong> —
            Google Maps berechnet die Strecke vom gewählten
            Startpunkt automatisch</li>
        <li><strong>KM wird automatisch eingetragen</strong> —
            Erstattungsbetrag und Pendelabzug werden sofort
            neu berechnet</li>
      </ol>
      <div class="help-tip">
        Der Startpunkt (Zuhause / Arbeitsort / Andere) wird
        automatisch übernommen — nicht extra eingeben.
      </div>
      <div class="help-warn">
        Ergebnis ist immer die <strong>einfache Strecke</strong> —
        bei "Hin & Rückfahrt" verdoppelt die App automatisch.
      </div>
      <div class="help-warn" style="margin-top:6px">
        <strong>Wichtig:</strong> Google Maps berechnet die
        <strong>schnellste</strong>, nicht die kürzeste Route.
        Laut Reisekostenrichtlinie gilt immer die kürzeste Strecke.
        KM ggf. manuell anpassen (z. B. via FALK-Routenplaner)
        und Grund im Zweck-Feld notieren.
      </div>`
  },

  spesen: {
    titel: 'Was kann ich als Spesen einreichen?',
    html: `
      <p>Folgende Auslagen werden
      <strong>gegen Beleg</strong> erstattet:</p>
      <ul class="help-list">
        <li><strong>Übernachtung</strong> — Hotelrechnung anhängen</li>
        <li><strong>ÖPNV / Bahn / Taxi</strong> — Ticket oder
            Quittung</li>
        <li><strong>Parkgebühren & Maut</strong> — Kassenbon</li>
        <li><strong>Sonstiges</strong> — z. B. Bewirtungsbeleg
            mit Beschreibung</li>
      </ul>
      <div class="help-info">
        <span><strong>Belege hochladen:</strong>
        JPG und PNG werden automatisch als extra Seiten ins PDF
        eingebettet — alles in einer Datei für die Buchhaltung.
        PDF-Belege werden im PDF namentlich aufgeführt und müssen
        separat eingereicht werden.</span>
      </div>
      <ul class="help-list" style="display:none">
      </ul>
      <div class="help-warn">
        <strong>Verpflegungspauschalen</strong> erstattet der AG
        nicht. Diese sind aber steuerlich absetzbar —
        ab 8 Std. 14 €, ab 24 Std. 28 € (Anlage N).
      </div>`
  },

  pdf: {
    titel: 'PDF erstellen & einreichen',
    html: `
      <p>Wenn alle Fahrten eingetragen sind, auf
      <strong>"PDF erstellen & herunterladen"</strong> klicken.
      Das PDF enthält alle Daten, eine Rechenübersicht
      und eine Unterschriftenzeile.</p>
      <ol class="help-steps">
        <li><strong>Erklärung bestätigen</strong> — Pflicht vor dem
            PDF-Erstellen: Checkbox „Ich bestätige die obige Erklärung"
            anhaken</li>
        <li><strong>PDF erstellen & herunterladen</strong></li>
        <li><strong>Ausdrucken</strong> — und unterschreiben, falls
            du nicht schon digital unterschrieben hast</li>
        <li><strong>Vorgesetzte/r genehmigt</strong></li>
        <li><strong>An Buchhaltung weitergeben</strong> — Auszahlung per Überweisung</li>
        <li><strong>Per E-Mail einreichen</strong> — öffnet direkt
            Ihr E-Mail-Programm. Empfänger ist die/der Vorgesetzte
            (aus Profil), Buchhaltung in CC. PDF manuell anhängen.
            Vorgesetzte/r muss im Profil eingetragen sein.</li>
      </ol>
      <div class="help-tip">
        <strong>"Entwurf speichern"</strong> sichert den Stand
        im Browser — jederzeit unterbrechen und weitermachen.
      </div>
      <div class="help-info">
        Das PDF enthält automatisch einen
        <strong>Steuerhinweis</strong> mit den abzugsfähigen
        Beträgen für die Anlage N.
        Falls du digital unterschrieben hast, wird deine Unterschrift
        in das PDF eingebettet — sonst bleibt die Unterschriftslinie
        leer und du unterschreibst nach dem Druck handschriftlich.
      </div>`
  },

  signature: {
    titel: 'Unterschrift',
    html: `
      <p>Du kannst direkt im Browser mit Maus, Trackpad oder Finger
      unterschreiben — die Unterschrift wird dann als Bild in das
      PDF eingebettet. Alternativ kannst du das PDF auch ohne
      digitale Unterschrift erzeugen, ausdrucken und per Hand
      unterschreiben. Tippe auf „Löschen", wenn du neu ansetzen
      möchtest. Die Erklärungs-Checkbox darüber muss in jedem
      Fall angehakt sein, damit das PDF erzeugt werden kann.</p>`
  },

  steuer: {
    titel: 'Steuererklärung (Anlage N) & häufige Fragen',
    html: `
      <p><strong>Was kann ich als Werbungskosten angeben?</strong></p>
      <ul class="help-list">
        <li><strong>Entfernungspauschale</strong> — Wege zwischen Wohnung und
            erster Tätigkeitsstätte können als Werbungskosten in der Anlage N
            geltend gemacht werden. Aktuelle Höhe und genaue Abgrenzung legt
            das Steuerrecht fest — bitte beim Finanzamt oder Steuerberater
            erfragen.</li>
        <li><strong>Verpflegungspauschale</strong> —
            ab 8 Std.: 14 €, ab 24 Std.: 28 €.
            Bei mehrtägigen Reisen: An- und Abreisetag je 14 €,
            volle Tage 28 €.</li>
        <li><strong>Übernachtungskosten</strong> —
            nicht erstattete Anteile mit Beleg</li>
        <li><strong>Fahrtkosten</strong> —
            nicht erstattete Anteile (gem. aktuellem Steuerrecht)</li>
      </ul>
      <div class="help-warn">
        Verpflegungspauschalen können nur geltend gemacht werden,
        wenn der AG sie <strong>nicht</strong> erstattet hat.
        Beides zusammen ist nicht möglich.
        Pauschalen gelten max. 3 Monate an derselben Tätigkeitsstätte.
      </div>
      <hr class="help-divider">
      <p><strong>Häufige Fragen:</strong></p>
      <div class="help-faq">
        <div class="help-faq-item">
          <div class="help-faq-q" onclick="toggleFaq(this)">
            Ich habe einen neuen Arbeitsort — was tun?
            <span class="faq-chevron">▾</span>
          </div>
          <div class="help-faq-a">
            Im Profil neue Adresse eintragen,
            "Jetzt via Google Maps berechnen" klicken
            und dann "Profil speichern".
            Die neue Pendelstrecke gilt sofort.
          </div>
        </div>
        <div class="help-faq-item">
          <div class="help-faq-q" onclick="toggleFaq(this)">
            Mehrtägige Begleitung — wie eintragen?
            <span class="faq-chevron">▾</span>
          </div>
          <div class="help-faq-a">
            Fahrtmodus "Mehrtägig" wählen, Datum für
            Hinfahrt und Rückfahrt eintragen, KM für beide
            Richtungen separat eingeben.
            Pendelabzug wird nur einmal berechnet.
          </div>
        </div>
        <div class="help-faq-item">
          <div class="help-faq-q" onclick="toggleFaq(this)">
            Ich starte direkt beim Klienten — welchen Startpunkt?
            <span class="faq-chevron">▾</span>
          </div>
          <div class="help-faq-a">
            "Arbeitsort" wählen — volle Strecke wird erstattet,
            kein Pendelabzug.
          </div>
        </div>
        <div class="help-faq-item">
          <div class="help-faq-q" onclick="toggleFaq(this)">
            Bewirtungsbeleg — wo eingeben?
            <span class="faq-chevron">▾</span>
          </div>
          <div class="help-faq-a">
            Unter "Spesen & Auslagen" → "Sonstige Auslagen" —
            Betrag und Beschreibung eingeben,
            Beleg unter "Belege hochladen" als Foto anhängen.
            Ohne Beleg keine Erstattung.
          </div>
        </div>
        <div class="help-faq-item">
          <div class="help-faq-q" onclick="toggleFaq(this)">
            Meine Daten sind nach Browser-Update weg?
            <span class="faq-chevron">▾</span>
          </div>
          <div class="help-faq-a">
            Die App speichert lokal im Browser. Wird der Cache
            geleert, gehen Entwürfe verloren. Fertige Abrechnungen
            immer als PDF herunterladen.
          </div>
        </div>
      </div>
      <div class="help-info" style="margin-top:8px">
        Allgemeine Informationen (Stand 2026). Bei Steuerfragen
        bitte Steuerberater oder Finanzamt kontaktieren.
      </div>`
  }
};

function toggleHilfe(panelId, btnEl) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const isOpen = panel.classList.toggle('hilfe-open');
  if (btnEl) {
    btnEl.classList.toggle('hilfe-btn-active', isOpen);
    btnEl.setAttribute('aria-expanded', String(isOpen));
  }
  document.querySelectorAll('.hilfe-panel').forEach(function (p) {
    if (p.id !== panelId) {
      p.classList.remove('hilfe-open');
      const btn = document.querySelector('[data-hilfe="' + p.id + '"]');
      if (btn) { btn.classList.remove('hilfe-btn-active'); btn.setAttribute('aria-expanded', 'false'); }
    }
  });
}

function toggleFaq(el) {
  el.classList.toggle('open');
  el.nextElementSibling.classList.toggle('open');
}

function buildHilfePanel(id, inhalt) {
  return '<div class="hilfe-panel" id="' + id + '" role="region" aria-label="Hilfe: ' + inhalt.titel + '">' +
    '<div class="hilfe-header">' +
      '<span class="hilfe-titel">' + inhalt.titel + '</span>' +
      '<button class="hilfe-close" onclick="toggleHilfe(\'' + id + '\', document.querySelector(\'[data-hilfe=' + id + ']\')" aria-label="Hilfe schließen">&times;</button>' +
    '</div>' +
    '<div class="hilfe-body">' + inhalt.html + '</div>' +
  '</div>';
}

function buildHilfeBtn(panelId, label) {
  return '<button class="hilfe-btn" data-hilfe="' + panelId + '" onclick="toggleHilfe(\'' + panelId + '\', this)" aria-expanded="false" aria-controls="' + panelId + '">? ' + (label || 'Hilfe') + '</button>';
}

// ─── Hilfe-Panels initialisieren ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {

  var platzhalter = [
    { id: 'hilfe-app',     inhalt: HILFE.app     },
    { id: 'hilfe-profil',  inhalt: HILFE.profil  },
    { id: 'hilfe-pendel',  inhalt: HILFE.pendel  },
    { id: 'hilfe-fahrten', inhalt: HILFE.fahrten },
    { id: 'hilfe-maps',    inhalt: HILFE.maps    },
    { id: 'hilfe-spesen',  inhalt: HILFE.spesen  },
    { id: 'hilfe-pdf',     inhalt: HILFE.pdf     },
    { id: 'hilfe-steuer',    inhalt: HILFE.steuer    },
    { id: 'hilfe-signature', inhalt: HILFE.signature },
  ];

  platzhalter.forEach(function (p) {
    var el = document.getElementById(p.id);
    if (el) el.outerHTML = buildHilfePanel(p.id, p.inhalt);
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.hilfe-panel') && !e.target.closest('.hilfe-btn')) {
      document.querySelectorAll('.hilfe-panel.hilfe-open').forEach(function (panel) {
        panel.classList.remove('hilfe-open');
        var btn = document.querySelector('[data-hilfe="' + panel.id + '"]');
        if (btn) {
          btn.classList.remove('hilfe-btn-active');
          btn.setAttribute('aria-expanded', 'false');
        }
      });
    }
  });

  // ─── Unterschriften-Canvas initialisieren ─────────────────────────────────
  initSignature();

});

// ─── Digitale Unterschrift ────────────────────────────────────────────────────

(function () {
  var canvas, ctx, isDrawing = false, isSignatureEmpty = true, savedDataURL = null;

  function initSignature() {
    canvas = document.getElementById('signature-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    skaliereCanvas();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup',     onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('pointerleave',  onPointerEnd);

    var clearBtn = document.getElementById('signature-clear');
    if (clearBtn) clearBtn.addEventListener('click', loescheSignatur);

    window.addEventListener('resize', onResize);
  }

  function skaliereCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = rect.width  || canvas.offsetWidth  || 600;
    var h = rect.height || canvas.offsetHeight || 160;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    setzeStrichStyle();
  }

  function setzeStrichStyle() {
    ctx.strokeStyle = '#2C2C2A';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }

  function onResize() {
    skaliereCanvas();
    // Gespeicherte Unterschrift wieder einzeichnen
    if (savedDataURL) {
      var img = new Image();
      img.onload = function () {
        var dpr  = window.devicePixelRatio || 1;
        var rect = canvas.getBoundingClientRect();
        ctx.drawImage(img, 0, 0, rect.width / dpr * dpr, rect.height / dpr * dpr);
        setzeStrichStyle();
      };
      img.src = savedDataURL;
    }
  }

  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function onPointerDown(e) {
    e.preventDefault();
    isDrawing = true;
    canvas.setPointerCapture(e.pointerId);
    var p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onPointerMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    var p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function onPointerEnd(e) {
    if (!isDrawing) return;
    isDrawing = false;
    if (isSignatureEmpty) {
      isSignatureEmpty = false;
      aktualisiereStatus();
    }
    // Aktuellen Stand für Resize-Wiederherstellung sichern
    savedDataURL = canvas.toDataURL('image/png');
  }

  function loescheSignatur() {
    var dpr  = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width * dpr, rect.height * dpr);
    isSignatureEmpty = true;
    savedDataURL     = null;
    aktualisiereStatus();
  }

  function aktualisiereStatus() {
    var statusEl = document.getElementById('signature-status');
    var clearBtn = document.getElementById('signature-clear');
    if (isSignatureEmpty) {
      if (statusEl) {
        statusEl.textContent = 'Manuelle Unterschrift nach Druck';
        statusEl.classList.remove('is-signed');
      }
      if (clearBtn) clearBtn.disabled = true;
    } else {
      if (statusEl) {
        statusEl.textContent = '✓ Unterschrift erfasst';
        statusEl.classList.add('is-signed');
      }
      if (clearBtn) clearBtn.disabled = false;
    }
  }

  // Öffentliche API für pdf-gen.js
  window.getSignatureDataURL = function () {
    if (isSignatureEmpty) return null;
    return canvas ? canvas.toDataURL('image/png') : null;
  };

  window.resetSignature = function () {
    if (canvas) loescheSignatur();
  };

  // initSignature per DOMContentLoaded-Handler aufrufbar machen
  window.initSignature = initSignature;

}());
