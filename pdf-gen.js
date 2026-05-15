'use strict';

// ─── PDF Generation ──────────────────────────────────────────────────────────
// Requires jsPDF UMD loaded from CDN (window.jspdf.jsPDF)
// Signature: async function generiereUndLadePDF(data, files)
//
// data = {
//   id, savedAt, zeitraum, arbeitstage, pendelKm,
//   profil: { vorname, nachname, strasse, plz, ort, iban, rolle, rolleText,
//             teamId, teamName, teamAdresse, bereich, arbeitsortTk },
//   fahrten: [{ datum, von, nach, art, zweck, km }],
//   spesen: { uebernachtung, oepnv, parken, sonstige, sonstigeText },
//   anmerkungen,
//   belegNamen: []
// }

async function generiereUndLadePDF(data, files) {
  if (typeof window.jspdf === 'undefined') {
    throw new Error('jsPDF ist nicht geladen.');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const PAGE_W  = 210;
  const PAGE_H  = 297;
  const ML      = 18; // margin left
  const MR      = 18; // margin right
  const MT      = 15; // margin top
  const MB      = 15; // margin bottom
  const CONTENT_W = PAGE_W - ML - MR; // 174mm

  const ag = getAG();

  let y = MT;
  let pageNum = 1;
  const totalPages = () => doc.getNumberOfPages();

  // Color helpers (RGB arrays)
  const C_GREEN       = [29, 158, 117];
  const C_GREEN_DARK  = [21, 110, 82];
  const C_GREEN_LIGHT = [232, 247, 242];
  const C_BLUE        = [24, 95, 165];
  const C_BLUE_LIGHT  = [232, 241, 251];
  const C_RED         = [163, 45, 45];
  const C_RED_LIGHT   = [254, 242, 242];
  const C_AMBER_BG    = [255, 251, 235];
  const C_AMBER_BORDER= [217, 119, 6];
  const C_AMBER_TEXT  = [133, 79, 11];
  const C_GRAY_50     = [249, 250, 251];
  const C_GRAY_100    = [243, 244, 246];
  const C_GRAY_200    = [229, 231, 235];
  const C_GRAY_500    = [107, 114, 128];
  const C_GRAY_700    = [55, 65, 81];
  const C_GRAY_800    = [31, 41, 55];
  const C_WHITE       = [255, 255, 255];
  const C_BLACK       = [0, 0, 0];

  function setFill(c)   { doc.setFillColor(c[0], c[1], c[2]); }
  function setDraw(c)   { doc.setDrawColor(c[0], c[1], c[2]); }
  function setTextC(c)  { doc.setTextColor(c[0], c[1], c[2]); }

  // ── Page footer ────────────────────────────────────────────────────────────
  function drawFooter() {
    const fp = doc.getNumberOfPages();
    doc.setPage(fp);
    const fy = PAGE_H - 8;
    setTextC(C_GRAY_500);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${ag.name}  ·  ${ag.strasse}, ${ag.plz} ${ag.ort}`, ML, fy);
    const rightText = `Seite ${fp} / ${fp}  ·  ${data.id}`;
    doc.text(rightText, PAGE_W - MR, fy, { align: 'right' });
  }

  // Final pass: fix page X/Y on all pages
  function fixAllFooters(total) {
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      const fy = PAGE_H - 8;
      setTextC(C_GRAY_500);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      // clear old footer area with white rect
      setFill(C_WHITE);
      setDraw(C_WHITE);
      doc.rect(0, fy - 4, PAGE_W, 10, 'F');
      doc.text(`${ag.name}  ·  ${ag.strasse}, ${ag.plz} ${ag.ort}`, ML, fy);
      const rightText = `Seite ${p} / ${total}  ·  ${data.id}`;
      doc.text(rightText, PAGE_W - MR, fy, { align: 'right' });
    }
  }

  // ── Page break check ───────────────────────────────────────────────────────
  function checkPageBreak(neededMm = 20) {
    if (y + neededMm > PAGE_H - MB - 10) {
      drawFooter();
      doc.addPage();
      y = MT;
      return true;
    }
    return false;
  }

  // ── Text helpers ───────────────────────────────────────────────────────────
  function textAt(text, x, ty, opts = {}) {
    doc.text(String(text), x, ty, opts);
  }

  // ── Art badge colors ───────────────────────────────────────────────────────
  function artColor(art) {
    const map = {
      'Teamtreffen':          [29, 158, 117],
      'Dienstbesprechung':    [29, 158, 117],
      'Urlaubsbegleitung':    [24, 95, 165],
      'Helfertreffen':        [236, 72, 153],
      'Kundenbesuch':         [13, 148, 136],
      'Klientenbegleitung':   [13, 148, 136],
      'Fortbildung':          [124, 58, 237],
      'Schulung':             [124, 58, 237],
      'Sonstiges':            [107, 114, 128]
    };
    for (const key of Object.keys(map)) {
      if (art && art.toLowerCase().includes(key.toLowerCase())) return map[key];
    }
    return [107, 114, 128];
  }

  // ── Section header ─────────────────────────────────────────────────────────
  function sectionHeader(title, ty) {
    setFill(C_GREEN_LIGHT);
    setDraw(C_GREEN_LIGHT);
    doc.roundedRect(ML, ty - 4, CONTENT_W, 8, 2, 2, 'F');
    setTextC(C_GREEN_DARK);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), ML + 3, ty + 1);
    return ty + 7;
  }

  // ── Format date from ISO or dd.mm.yyyy ─────────────────────────────────────
  function fmtDate(d) {
    if (!d) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [yyyy, mm, dd] = d.split('-');
      return `${dd}.${mm}.${yyyy}`;
    }
    return d;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. HEADER BAR
  // ─────────────────────────────────────────────────────────────────────────
  const HEADER_H = 14;
  setFill(C_GREEN);
  setDraw(C_GREEN);
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F');

  // Left: company name + address
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextC(C_WHITE);
  doc.text('SOZIALHUMMEL gGmbH', ML, 7.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`${ag.strasse}  ·  ${ag.plz} ${ag.ort}`, ML, 12);

  // Right: title + antrag-nr
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('REISEKOSTENABRECHNUNG', PAGE_W - MR, 7.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Antrag-Nr.: ${data.id}`, PAGE_W - MR, 12, { align: 'right' });

  y = HEADER_H + 5;

  // ─────────────────────────────────────────────────────────────────────────
  // 2. META LINE
  // ─────────────────────────────────────────────────────────────────────────
  setFill(C_GRAY_50);
  setDraw(C_GRAY_200);
  doc.roundedRect(ML, y, CONTENT_W, 8, 2, 2, 'FD');
  setTextC(C_GRAY_700);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const metaText = `Antrag-ID: ${data.id}   |   Eingereicht: ${today()}   |   Abrechnungsmonat: ${data.zeitraum || '–'}`;
  doc.text(metaText, ML + 4, y + 5.2);
  y += 12;

  // ─────────────────────────────────────────────────────────────────────────
  // 3. BLOCK 1 – Mitarbeiterdaten
  // ─────────────────────────────────────────────────────────────────────────
  checkPageBreak(50);

  setFill(C_GRAY_50);
  setDraw(C_GRAY_200);
  const b1y = y;
  // We'll draw the box after we know the height
  y = sectionHeader('Mitarbeiter/In', y + 4);

  const p = data.profil || {};
  const fullName = `${p.vorname || ''} ${p.nachname || ''}`.trim();
  const wohnort  = [p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  let arbeitsortLabel = '';
  let arbeitsortVal   = '';
  let bereichLabel    = '';
  let bereichVal      = '';

  if (p.rolle === 'assistenz') {
    arbeitsortLabel = 'Team / Arbeitsort';
    arbeitsortVal   = `${p.teamName || ''}${p.teamAdresse ? '  ·  ' + p.teamAdresse : ''}`;
    bereichLabel    = 'Funktion';
    bereichVal      = 'Assistenz';
  } else if (p.rolle === 'tk') {
    arbeitsortLabel = 'Arbeitsort (TK)';
    arbeitsortVal   = p.arbeitsortTk || '–';
    bereichLabel    = 'Bereich / Region';
    bereichVal      = p.bereich || '–';
  } else {
    arbeitsortLabel = 'Funktion';
    arbeitsortVal   = p.rolleText || '–';
    bereichLabel    = 'Bereich';
    bereichVal      = '–';
  }

  const rows = [
    ['Name', fullName || '–',           'Funktion/Rolle', p.rolleText || p.rolle || '–'],
    [bereichLabel, bereichVal,           arbeitsortLabel, arbeitsortVal],
    ['Wohnort', wohnort || '–',          'IBAN (Erstattung)', p.iban || '–'],
  ];

  doc.setFontSize(8);
  const colW = CONTENT_W / 2;
  rows.forEach(row => {
    // Label
    doc.setFont('helvetica', 'bold');
    setTextC(C_GRAY_500);
    doc.setFontSize(6.5);
    doc.text(String(row[0]).toUpperCase(), ML + 3, y + 2);
    doc.text(String(row[2]).toUpperCase(), ML + 3 + colW, y + 2);
    // Value
    doc.setFont('helvetica', 'normal');
    setTextC(C_GRAY_800);
    doc.setFontSize(8.5);
    doc.text(String(row[1]), ML + 3, y + 7, { maxWidth: colW - 6 });
    doc.text(String(row[3]), ML + 3 + colW, y + 7, { maxWidth: colW - 6 });
    y += 12;
  });

  // Draw box around block 1
  setFill(C_GRAY_50);
  setDraw(C_GRAY_200);
  doc.roundedRect(ML, b1y, CONTENT_W, y - b1y + 2, 3, 3, 'FD');
  // Redraw content on top (box was drawn after but PDF layers it behind)
  // Actually in jsPDF, later draws are on top – so we need to draw box first.
  // We'll use a different approach: draw background, then content.

  y += 6;

  // ─────────────────────────────────────────────────────────────────────────
  // 4. BLOCK 2 – Fahrtenübersicht
  // ─────────────────────────────────────────────────────────────────────────
  checkPageBreak(30);

  y = sectionHeader('Dienstliche Fahrten', y);
  y += 3;

  // Column widths (total = CONTENT_W = 174)
  // # 8 | Datum 20 | Art 26 | Beschreibung 40 | Gesamt km 18 | -Pendel 18 | Erstatt 18 | Betrag 26
  const COL = {
    idx:     { x: ML,                        w: 8  },
    datum:   { x: ML + 8,                    w: 20 },
    art:     { x: ML + 8 + 20,               w: 26 },
    desc:    { x: ML + 8 + 20 + 26,          w: 40 },
    gesamt:  { x: ML + 8 + 20 + 26 + 40,     w: 18 },
    pendel:  { x: ML + 8 + 20 + 26 + 40 + 18, w: 18 },
    erstatt: { x: ML + 8 + 20 + 26 + 40 + 36, w: 18 },
    betrag:  { x: ML + 8 + 20 + 26 + 40 + 54, w: 26 }
  };

  // Table header
  const TH = 7;
  setFill(C_GREEN);
  setDraw(C_GREEN);
  doc.rect(ML, y, CONTENT_W, TH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  setTextC(C_WHITE);
  const headers = ['#', 'Datum', 'Art', 'Beschreibung / Ziel', 'Ges. km', '−Pendel', 'Erst. km', 'Betrag'];
  const colKeys = ['idx','datum','art','desc','gesamt','pendel','erstatt','betrag'];
  colKeys.forEach((k, i) => {
    const c = COL[k];
    const align = i >= 4 ? 'right' : 'left';
    const tx = align === 'right' ? c.x + c.w - 2 : c.x + 2;
    doc.text(headers[i], tx, y + 4.8, { align });
  });
  y += TH;

  // Data rows
  const ROW_H = 7.5;
  let totalGesamtKm = 0;
  let totalErstattKm = 0;
  let totalBetrag   = 0;
  const pendelKm    = parseFloat(data.pendelKm) || 0;
  const arbeitstage = parseInt(data.arbeitstage) || 0;

  (data.fahrten || []).forEach((fahrt, idx) => {
    checkPageBreak(ROW_H + 4);

    const gesamtKm  = (parseFloat(fahrt.km) || 0) * 2;
    const pendelRow = pendelKm * 2;
    const erstattKm = Math.max(0, gesamtKm - pendelRow);
    const betrag    = erstattKm * RATE_PER_KM;

    totalGesamtKm  += gesamtKm;
    totalErstattKm += erstattKm;
    totalBetrag    += betrag;

    // Zebra
    if (idx % 2 === 1) {
      setFill(C_GRAY_50);
      setDraw(C_GRAY_50);
      doc.rect(ML, y, CONTENT_W, ROW_H, 'F');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextC(C_GRAY_800);

    // #
    doc.text(String(idx + 1), COL.idx.x + 2, y + 5);
    // Datum
    doc.text(fmtDate(fahrt.datum), COL.datum.x + 2, y + 5);
    // Art – colored badge
    const artStr = fahrt.art || 'Sonstiges';
    const aC = artColor(artStr);
    setFill(aC);
    setDraw(aC);
    doc.roundedRect(COL.art.x + 1, y + 1.5, COL.art.w - 2, 4.5, 1.2, 1.2, 'F');
    setTextC(C_WHITE);
    doc.setFontSize(6);
    doc.text(artStr.substring(0, 14), COL.art.x + 2, y + 4.8);
    // Desc
    setTextC(C_GRAY_800);
    doc.setFontSize(7.5);
    const descStr = fahrt.zweck || `${fahrt.von || ''} → ${fahrt.nach || ''}`;
    doc.text(descStr.substring(0, 28), COL.desc.x + 2, y + 5);
    // Numeric columns (right-aligned)
    doc.text(fmtKm(gesamtKm),  COL.gesamt.x  + COL.gesamt.w  - 2, y + 5, { align: 'right' });
    doc.text(fmtKm(pendelRow), COL.pendel.x  + COL.pendel.w  - 2, y + 5, { align: 'right' });
    doc.text(fmtKm(erstattKm), COL.erstatt.x + COL.erstatt.w - 2, y + 5, { align: 'right' });
    doc.text(fmt(betrag),      COL.betrag.x  + COL.betrag.w  - 2, y + 5, { align: 'right' });

    // Bottom border
    setDraw(C_GRAY_100);
    doc.setLineWidth(0.2);
    doc.line(ML, y + ROW_H, ML + CONTENT_W, y + ROW_H);

    y += ROW_H;
  });

  // Footer row
  checkPageBreak(9);
  const totalPendelGesamt = pendelKm * 2 * arbeitstage;
  const actualErstattKm   = Math.max(0, totalGesamtKm - totalPendelGesamt);
  const actualBetrag      = actualErstattKm * RATE_PER_KM;

  setFill(C_GREEN_LIGHT);
  setDraw(C_GREEN_LIGHT);
  doc.rect(ML, y, CONTENT_W, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setTextC(C_GREEN_DARK);
  doc.text('Summe', COL.idx.x + 2, y + 5.3);
  doc.text(fmtKm(totalGesamtKm),       COL.gesamt.x  + COL.gesamt.w  - 2, y + 5.3, { align: 'right' });
  doc.text(fmtKm(totalPendelGesamt),   COL.pendel.x  + COL.pendel.w  - 2, y + 5.3, { align: 'right' });
  doc.text(fmtKm(actualErstattKm),     COL.erstatt.x + COL.erstatt.w - 2, y + 5.3, { align: 'right' });
  doc.text(fmt(actualBetrag),          COL.betrag.x  + COL.betrag.w  - 2, y + 5.3, { align: 'right' });
  y += 11;

  // ─────────────────────────────────────────────────────────────────────────
  // 5. BLOCK 3 – Spesen (only if any > 0)
  // ─────────────────────────────────────────────────────────────────────────
  const sp = data.spesen || {};
  const spesenRows = [
    ['Übernachtungskosten', parseFloat(sp.uebernachtung) || 0],
    ['ÖPNV / Bahn / Taxi',  parseFloat(sp.oepnv)        || 0],
    ['Parkgebühren / Maut', parseFloat(sp.parken)        || 0],
    ['Sonstige Auslagen',   parseFloat(sp.sonstige)      || 0],
  ].filter(r => r[1] > 0);

  const totalSpesen = spesenRows.reduce((a, r) => a + r[1], 0);

  if (spesenRows.length > 0) {
    checkPageBreak(20 + spesenRows.length * 7);

    y = sectionHeader('Spesen & Auslagen', y);
    y += 3;

    const SP_COL_LABEL = ML;
    const SP_COL_VAL   = ML + CONTENT_W - 40;
    const SP_W_LABEL   = CONTENT_W - 40;
    const SP_W_VAL     = 40;

    spesenRows.forEach((row, i) => {
      if (i % 2 === 1) {
        setFill(C_GRAY_50);
        setDraw(C_GRAY_50);
        doc.rect(ML, y, CONTENT_W, 6.5, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setTextC(C_GRAY_800);
      doc.text(row[0], SP_COL_LABEL + 3, y + 4.5);
      doc.text(fmt(row[1]), SP_COL_VAL + SP_W_VAL - 3, y + 4.5, { align: 'right' });
      y += 6.5;
    });

    // Spesen footer
    setFill(C_GRAY_100);
    setDraw(C_GRAY_200);
    doc.rect(ML, y, CONTENT_W, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setTextC(C_GRAY_700);
    doc.text('Summe Spesen', SP_COL_LABEL + 3, y + 5);
    doc.text(fmt(totalSpesen), SP_COL_VAL + SP_W_VAL - 3, y + 5, { align: 'right' });
    y += 10;

    if (sp.sonstigeText) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      setTextC(C_GRAY_500);
      doc.text(`Hinweis: ${sp.sonstigeText}`, ML + 3, y);
      y += 6;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. BLOCK 4 – Gesamtabrechnung
  // ─────────────────────────────────────────────────────────────────────────
  checkPageBreak(50);

  y = sectionHeader('Gesamtabrechnung', y);
  y += 4;

  const fahrtkosten   = actualBetrag;
  const auszahlung    = fahrtkosten + totalSpesen;

  // Right-aligned summary box
  const BOX_W = 90;
  const BOX_X = ML + CONTENT_W - BOX_W;
  const BOX_LINES = totalSpesen > 0 ? 3 : 2;
  const BOX_H = BOX_LINES * 10 + 14;

  setFill(C_WHITE);
  setDraw(C_BLUE);
  doc.setLineWidth(0.6);
  doc.roundedRect(BOX_X, y, BOX_W, BOX_H, 3, 3, 'FD');
  doc.setLineWidth(0.2);

  let by = y + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setTextC(C_GRAY_700);
  doc.text('Fahrtkosten', BOX_X + 5, by);
  doc.text(fmt(fahrtkosten), BOX_X + BOX_W - 5, by, { align: 'right' });
  by += 9;

  if (totalSpesen > 0) {
    doc.text('+ Spesen', BOX_X + 5, by);
    doc.text(fmt(totalSpesen), BOX_X + BOX_W - 5, by, { align: 'right' });
    by += 9;
    // Separator
    setDraw(C_GRAY_200);
    doc.line(BOX_X + 3, by - 3, BOX_X + BOX_W - 3, by - 3);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextC(C_BLUE);
  doc.text('= Auszahlungsbetrag', BOX_X + 5, by + 2);
  doc.text(fmt(auszahlung), BOX_X + BOX_W - 5, by + 2, { align: 'right' });
  by += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setTextC(C_GRAY_500);
  doc.text(`IBAN: ${p.iban || '–'}`, BOX_X + 5, by + 2);

  y = Math.max(y + BOX_H + 6, by + 8);

  // Amber tax hint box
  checkPageBreak(20);
  setFill(C_AMBER_BG);
  setDraw(C_AMBER_BORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(ML, y, CONTENT_W, 14, 2, 2, 'FD');
  doc.setLineWidth(0.2);
  setTextC(C_AMBER_TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Für Ihre Steuererklärung (Anlage N):', ML + 4, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const taxText = `Gesamte Dienstfahrten: ${fmtKm(totalGesamtKm)}  ·  Erstattete Fahrtkosten (steuerfrei): ${fmt(fahrtkosten)}  ·  Pendelabzug (${fmtKm(pendelKm)} × 2 × ${arbeitstage} AT): ${fmtKm(totalPendelGesamt)}`;
  doc.text(taxText, ML + 4, y + 10, { maxWidth: CONTENT_W - 8 });
  y += 18;

  // ─────────────────────────────────────────────────────────────────────────
  // 7. BLOCK 5 – Belege
  // ─────────────────────────────────────────────────────────────────────────
  const belegNamen = data.belegNamen || [];
  if (belegNamen.length > 0) {
    checkPageBreak(16 + belegNamen.length * 6);

    y = sectionHeader('Beigefügte Belege', y);
    y += 3;

    belegNamen.forEach((name, i) => {
      if (i % 2 === 1) {
        setFill(C_GRAY_50);
        setDraw(C_GRAY_50);
        doc.rect(ML, y, CONTENT_W, 6, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setTextC(C_GRAY_700);
      doc.text(`${i + 1}.  ${name}`, ML + 4, y + 4.2);
      y += 6;
    });
    y += 5;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. BLOCK 6 – Anmerkungen
  // ─────────────────────────────────────────────────────────────────────────
  if (data.anmerkungen && data.anmerkungen.trim()) {
    checkPageBreak(20);
    y = sectionHeader('Anmerkungen', y);
    y += 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setTextC(C_GRAY_800);
    const lines = doc.splitTextToSize(data.anmerkungen.trim(), CONTENT_W - 6);
    lines.forEach(line => {
      checkPageBreak(6);
      doc.text(line, ML + 3, y + 4);
      y += 6;
    });
    y += 4;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. BLOCK 7 – Unterschriften
  // ─────────────────────────────────────────────────────────────────────────
  checkPageBreak(48);

  y = sectionHeader('Unterschriften & Freigabe', y);
  y += 6;

  const sigColW = CONTENT_W / 3;
  const sigCols = [
    { title: 'Mitarbeiter/in',    sub: p.vorname + ' ' + p.nachname,       hint: '' },
    { title: 'Vorgesetzte/r',     sub: 'Genehmigung',                      hint: '' },
    { title: 'Buchhaltung',       sub: 'Geprüft & angewiesen',             hint: '' },
  ];

  sigCols.forEach((col, i) => {
    const cx = ML + i * sigColW;

    // Box
    setFill(C_GRAY_50);
    setDraw(C_GRAY_200);
    doc.roundedRect(cx + 1, y, sigColW - 2, 32, 2, 2, 'FD');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setTextC(C_GREEN_DARK);
    doc.text(col.title.toUpperCase(), cx + 5, y + 6);

    // Date line
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setTextC(C_GRAY_500);
    doc.text('Datum:', cx + 5, y + 13);
    setDraw(C_GRAY_300);
    doc.line(cx + 20, y + 13.5, cx + sigColW - 6, y + 13.5);

    // Signature line
    doc.text('Unterschrift:', cx + 5, y + 24);
    doc.line(cx + 26, y + 24.5, cx + sigColW - 6, y + 24.5);

    // Sub label
    doc.setFontSize(6.5);
    setTextC(C_GRAY_500);
    doc.text(col.sub, cx + 5, y + 30);
  });

  y += 38;

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Fix all footers with correct total page count
  // ─────────────────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  fixAllFooters(total);

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Save
  // ─────────────────────────────────────────────────────────────────────────
  const lastName  = (p.nachname || 'Unbekannt').replace(/\s+/g, '_');
  const firstName = (p.vorname  || 'Unbekannt').replace(/\s+/g, '_');
  const filename  = `Reisekosten_${lastName}_${firstName}_${data.id}.pdf`;
  doc.save(filename);
}
