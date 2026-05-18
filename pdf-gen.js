'use strict';

function generiereUndLadePDF(data, files) {
  var jsPDF = window.jspdf.jsPDF;
  var doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  var PW = 210, PH = 297, ML = 18, MR = 18;
  var CW = PW - ML - MR; // 174 mm
  var MT = 26;           // top of content area (below header)
  var MB = 18;           // bottom margin (above footer)

  // ── Colours ──────────────────────────────────────────────────────────────────
  var ORANGE      = [245, 166, 35 ];  // #F5A623 — Sozialhummel Orange
  var ORANGE_DARK = [44,  44,  42 ];  // #2C2C2A — Dunkelgrau
  var ORANGE_BG   = [254, 243, 220];  // #FEF3DC — Helles Orange
  var BLUE        = [24,  95,  165];
  var BLUE_BG     = [230, 241, 251];
  var AMBER       = [133, 79,  11 ];
  var AMBER_BG    = [250, 238, 218];
  var PURPLE      = [60,  52,  137];
  var RED         = [163, 45,  45 ];
  var GRAY_50     = [255, 253, 247];  // #FFFDF7 — Warmweiß
  var GRAY_100    = [241, 240, 236];  // #F1F0EC — Hellgrau
  var GRAY_200    = [226, 224, 218];
  var TEXT        = [44,  44,  42 ];  // #2C2C2A — Dunkelgrau
  var MUTED       = [107, 106, 101];
  var WHITE       = [255, 255, 255];

  var ART_COLOR = {
    teamtreffen:   { fg: ORANGE_DARK, bg: ORANGE_BG  },
    urlaubsbegl:   { fg: BLUE,        bg: BLUE_BG    },
    helfertreffen: { fg: [114,36,62], bg: [251,220,235]},
    fortbildung:   { fg: PURPLE,      bg: [238,237,254]},
    kundenbesuch:  { fg: ORANGE_DARK, bg: ORANGE_BG  },
    sonstiges:     { fg: MUTED,       bg: GRAY_100   }
  };

  var ag      = data.arbeitgeber || {};
  var m       = data.mitarbeiter || {};
  var fahrten = data.fahrten     || [];
  var spesen  = data.spesen      || {};

  // ── Short helpers ─────────────────────────────────────────────────────────────
  function sf(style, size) { doc.setFont('Helvetica', style); doc.setFontSize(size); }
  function tc(c) { doc.setTextColor(c[0], c[1], c[2]); }
  function fc(c) { doc.setFillColor(c[0], c[1], c[2]); }
  function dc(c) { doc.setDrawColor(c[0], c[1], c[2]); }
  function lw(w) { doc.setLineWidth(w); }

  function txt(s, x, y, opts) { doc.text(String(s || ''), x, y, opts || {}); }

  function box(x, y, w, h, fill, stroke) {
    if (fill)   fc(fill);
    if (stroke) { dc(stroke); lw(0.25); }
    else        { dc([255,255,255,0]); }
    doc.rect(x, y, w, h, fill && stroke ? 'FD' : fill ? 'F' : 'S');
  }

  function hline(x1, x2, y, color) {
    dc(color || GRAY_200); lw(0.25); doc.line(x1, y, x2, y);
  }

  function fmtE(n)   { return (parseFloat(n) || 0).toFixed(2).replace('.', ',') + ' €'; }
  function fmtKm(n)  { return (parseInt(n)   || 0) + ' km'; }
  function fmtD(iso) {
    if (!iso) return '–';
    var p = (iso + '').split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : iso;
  }
  function clip(s, max) {
    if (!s) return '–';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  // ── Page management ───────────────────────────────────────────────────────────
  var y = MT;

  function needPage(needed) {
    if (y + needed > PH - MB) { doc.addPage(); y = MT; }
  }

  // ── Reusable section title ─────────────────────────────────────────────────────
  function secTitle(label) {
    needPage(14);
    sf('bold', 8); tc(MUTED);
    txt(label, ML, y);
    y += 5;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HEADER
  // ─────────────────────────────────────────────────────────────────────────────
  fc(ORANGE_DARK); doc.rect(0, 0, PW, 14, 'F');

  sf('bold', 9.5); tc(WHITE);
  txt((ag.name || 'Sozialhummel gGmbH').toUpperCase(), ML, 7);

  sf('normal', 7); tc([170, 165, 155]);
  var agAddr = [ag.strasse, ((ag.plz || '') + ' ' + (ag.ort || '')).trim()]
    .filter(Boolean).join(' · ');
  txt(agAddr, ML, 12);

  sf('bold', 10); tc(ORANGE);
  txt('REISEKOSTENABRECHNUNG', PW - MR, 9, { align: 'right' });

  // ─────────────────────────────────────────────────────────────────────────────
  // META LINE
  // ─────────────────────────────────────────────────────────────────────────────
  y = 20;
  sf('normal', 7.5); tc(MUTED);
  var meta = [
    'Antrag-Nr. ' + (data.id || '–'),
    'Eingereicht: ' + new Date().toLocaleDateString('de-DE'),
    'Zeitraum: ' + (data.zeitraum || '–')
  ].join('   ·   ');
  txt(meta, ML, y);
  hline(ML, PW - MR, y + 3, GRAY_200);
  y = MT;

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 1 — Mitarbeiterdaten
  // ─────────────────────────────────────────────────────────────────────────────
  secTitle('MITARBEITERDATEN');

  var rolleLbl = m.rolle === 'assistenz'    ? 'Assistenz' :
                 m.rolle === 'tk'           ? 'Teamkoordination' :
                 m.rolle === 'fsk'          ? 'Fachkraft' :
                 m.rolleText || m.rolle     || '';

  // Name row
  sf('bold', 11); tc(TEXT);
  txt((m.vorname || '') + ' ' + (m.nachname || ''), ML, y);
  if (rolleLbl) { sf('normal', 8.5); tc(MUTED); txt(rolleLbl, ML, y + 5); }

  sf('normal', 7.5); tc(MUTED);
  txt('IBAN', PW - MR - 58, y);
  sf('bold', 8.5); tc(TEXT);
  txt(m.iban || '–', PW - MR - 58, y + 5);
  y += (rolleLbl ? 12 : 8);

  // Address row
  var heimStr = [m.heimStrasse, ((m.heimPlz || '') + ' ' + (m.heimOrt || '')).trim()]
    .filter(Boolean).join(', ');
  var arbStr  = [m.arbeitsortName, m.arbeitsortAdresse]
    .filter(Boolean).join(' · ');

  sf('normal', 7.5); tc(MUTED); txt('Wohnort:', ML, y);
  tc(TEXT); txt(clip(heimStr || '–', 55), ML + 22, y);
  y += 5;
  tc(MUTED); txt('Arbeitsort:', ML, y);
  tc(TEXT); txt(clip(arbStr || '–', 55), ML + 22, y);
  y += 5;

  // Pendel bar
  if (m.pendelKmEinfach > 0) {
    box(ML, y, CW, 8, ORANGE_BG);
    sf('normal', 7.5); tc(ORANGE_DARK);
    txt(
      'Pendelstrecke: ' + m.pendelKmEinfach + ' km einfach' +
      '   |   Abzug pro Fahrt (Start Zuhause): ' + (m.pendelKmEinfach * 2) + ' km × 0,30 €' +
      ' = −' + fmtE(m.pendelKmEinfach * 2 * 0.30),
      ML + 3, y + 5.5
    );
    y += 10;
  } else {
    y += 2;
  }
  y += 5;

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 2 — Fahrten-Tabelle
  // ─────────────────────────────────────────────────────────────────────────────
  secTitle('DIENSTLICHE FAHRTEN');

  // Column layout (total = 174 mm)
  // #(6) | Datum(24) | Modus(20) | Art(22) | Start→Ziel(38) | Ges.km(16) | −Pendel(16) | Erst.km(16) | Betrag(16)
  var C = [
    { w:  6, lbl: '#',             right: false },
    { w: 24, lbl: 'Datum',         right: false },
    { w: 20, lbl: 'Modus',         right: false },
    { w: 22, lbl: 'Art',           right: false },
    { w: 38, lbl: 'Start → Ziel', right: false },
    { w: 16, lbl: 'Ges. km',       right: true  },
    { w: 16, lbl: '−Pendel',  right: true  },
    { w: 16, lbl: 'Erst. km',      right: true  },
    { w: 16, lbl: 'Betrag',        right: true  }
  ];
  // Precompute x positions
  var cx = ML;
  C.forEach(function(col) { col.x = cx; cx += col.w; });

  var HDR_H = 7, ROW_H = 9;

  function drawTableHeader() {
    box(ML, y, CW, HDR_H, GRAY_100);
    sf('bold', 7); tc(MUTED);
    C.forEach(function(col) {
      var tx = col.right ? col.x + col.w - 1.5 : col.x + 1.5;
      txt(col.lbl, tx, y + 5, { align: col.right ? 'right' : 'left' });
    });
    y += HDR_H;
  }

  drawTableHeader();

  var totGes = 0, totPendel = 0, totErst = 0, totBetrag = 0;

  fahrten.forEach(function(f, i) {
    needPage(ROW_H + 1);
    if (y === MT) drawTableHeader();

    var modus    = f.modus || 'hinrueck';
    var kmHin    = parseInt(f.kmHin)   || 0;
    var kmRueck  = parseInt(f.kmRueck) || 0;
    var keinAbzug = f.startTyp === 'arbeitsort';

    // Use pre-calculated values, fallback to own calc
    var gesamtKm, pendelAbzug, erstattungKm, betrag;
    if (f.gesamtKm !== undefined) {
      gesamtKm    = f.gesamtKm    || 0;
      pendelAbzug = f.pendelAbzug || 0;
      erstattungKm= f.erstattungKm|| 0;
      betrag      = f.betrag      || 0;
    } else {
      if      (modus === 'einfach')    gesamtKm = kmHin;
      else if (modus === 'hinrueck')   gesamtKm = kmHin * 2;
      else                             gesamtKm = kmHin + kmRueck;
      var pendelRound = (m.pendelKmEinfach || 0) * 2;
      pendelAbzug  = keinAbzug ? 0 : pendelRound;
      erstattungKm = Math.max(0, gesamtKm - pendelAbzug);
      betrag       = erstattungKm * 0.30;
    }

    totGes    += gesamtKm;
    totPendel += pendelAbzug;
    totErst   += erstattungKm;
    totBetrag += betrag;

    // Zebra
    box(ML, y, CW, ROW_H, i % 2 === 0 ? WHITE : GRAY_50);

    sf('normal', 7.5); tc(TEXT);
    var ry = y + 6; // baseline for single-line row

    // Col 0: #
    txt(String(i + 1), C[0].x + 1.5, ry);

    // Col 1: Datum
    if (modus === 'mehrtaegig') {
      sf('normal', 6.5); tc(MUTED);
      txt('Hin: ' + fmtD(f.datumHin), C[1].x + 1.5, y + 4);
      txt('Rk: ' + fmtD(f.datumRueck), C[1].x + 1.5, y + 8);
      sf('normal', 7.5); tc(TEXT);
    } else {
      txt(fmtD(f.datumHin || f.datum), C[1].x + 1.5, ry);
    }

    // Col 2: Modus badge text
    if (modus === 'einfach') {
      tc(ORANGE_DARK); sf('bold', 7); txt('-> Einfach', C[2].x + 1.5, ry);
    } else if (modus === 'hinrueck') {
      tc(BLUE);       sf('bold', 7); txt('<-> H+R',    C[2].x + 1.5, ry);
    } else {
      tc(PURPLE);     sf('bold', 7); txt('Mehrtaegig', C[2].x + 1.5, ry);
    }
    sf('normal', 7.5); tc(TEXT);

    // Col 3: Art (coloured badge)
    var artKey = f.art || 'sonstiges';
    var artCol = ART_COLOR[artKey] || ART_COLOR.sonstiges;
    var artLbl = clip(f.artLabel || f.art || '–', 16);
    box(C[3].x + 1, y + 1.5, C[3].w - 2, 6, artCol.bg);
    sf('normal', 6.5); tc(artCol.fg);
    txt(artLbl, C[3].x + C[3].w / 2, y + 5.7, { align: 'center' });
    sf('normal', 7.5); tc(TEXT);

    // Col 4: Start → Ziel (two half-lines)
    sf('normal', 6.5); tc(MUTED);
    txt(clip(f.startAdresse || '–', 28), C[4].x + 1.5, y + 4);
    tc(TEXT);
    txt(clip(f.ziel || '–', 28), C[4].x + 1.5, y + 8);
    sf('normal', 7.5);

    // Col 5: Ges. km
    tc(TEXT);
    txt(fmtKm(gesamtKm), C[5].x + C[5].w - 1.5, ry, { align: 'right' });

    // Col 6: −Pendel
    if (keinAbzug) {
      tc(ORANGE_DARK); txt('–', C[6].x + C[6].w - 1.5, ry, { align: 'right' });
    } else {
      tc(RED); txt(fmtKm(pendelAbzug), C[6].x + C[6].w - 1.5, ry, { align: 'right' });
    }
    tc(TEXT);

    // Col 7: Erst. km
    txt(fmtKm(erstattungKm), C[7].x + C[7].w - 1.5, ry, { align: 'right' });

    // Col 8: Betrag
    sf('bold', 7.5); tc(BLUE);
    txt(fmtE(betrag), C[8].x + C[8].w - 1.5, ry, { align: 'right' });
    sf('normal', 7.5); tc(TEXT);

    // "Start Arbeitsort" micro-label
    if (keinAbzug) {
      sf('normal', 5.5); tc(ORANGE_DARK);
      txt('Start Arbeitsort', C[4].x + 1.5, y + ROW_H - 1);
      sf('normal', 7.5); tc(TEXT);
    }

    y += ROW_H;
  });

  // Sum row
  needPage(8);
  box(ML, y, CW, 8, ORANGE_BG);
  sf('bold', 8); tc(ORANGE_DARK);
  txt('Summe', ML + 1.5, y + 5.5);
  txt(fmtKm(totGes),    C[5].x + C[5].w - 1.5, y + 5.5, { align: 'right' });
  tc(RED);
  txt(fmtKm(totPendel), C[6].x + C[6].w - 1.5, y + 5.5, { align: 'right' });
  tc(ORANGE_DARK);
  txt(fmtKm(totErst),   C[7].x + C[7].w - 1.5, y + 5.5, { align: 'right' });
  txt(fmtE(totBetrag),  C[8].x + C[8].w - 1.5, y + 5.5, { align: 'right' });
  y += 10;

  // Amber pendel hint
  if (m.pendelKmEinfach > 0) {
    var hintTxt =
      'Pendelabzug (Start von Zuhause/anderer Adresse): ' +
      fmtKm(m.pendelKmEinfach * 2) + ' pro Fahrt. ' +
      'Bei mehrtägigen Reisen: Abzug nur einmal pro Reise. ' +
      'Abgezogene km als Entfernungspauschale (Anlage N) geltend machen.';
    var hLines = doc.splitTextToSize(hintTxt, CW - 6);
    var hH = hLines.length * 4.2 + 5;
    needPage(hH + 4);
    box(ML, y, CW, hH, AMBER_BG);
    sf('normal', 7.5); tc(AMBER);
    doc.text(hLines, ML + 3, y + 4.5);
    y += hH + 5;
  }
  y += 3;

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 3 — Spesen (nur wenn > 0)
  // ─────────────────────────────────────────────────────────────────────────────
  var spesenSum = data.spesenSum || 0;
  if (spesenSum > 0) {
    secTitle('SPESEN & AUSLAGEN');

    var spesenRows = [
      { lbl: 'Übernachtungskosten', val: spesen.uebernachtung },
      { lbl: 'ÖPNV / Bahn / Taxi',  val: spesen.opnv         },
      { lbl: 'Parkgebühren / Maut', val: spesen.parken       },
      { lbl: 'Sonstige Auslagen' + (spesen.sonstigeText ? ' (' + clip(spesen.sonstigeText, 20) + ')' : ''),
        val: spesen.sonstige }
    ].filter(function(r) { return r.val > 0; });

    spesenRows.forEach(function(row, i) {
      needPage(8);
      box(ML, y, CW, 7.5, i % 2 === 0 ? WHITE : GRAY_50);
      sf('normal', 8.5); tc(TEXT);
      txt(row.lbl, ML + 2, y + 5.5);
      sf('bold', 8.5);
      txt(fmtE(row.val), PW - MR - 2, y + 5.5, { align: 'right' });
      y += 7.5;
    });
    y += 4;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 4 — Gesamtabrechnung
  // ─────────────────────────────────────────────────────────────────────────────
  secTitle('GESAMTABRECHNUNG');

  var boxH = spesenSum > 0 ? 31 : 23;
  needPage(boxH + 20);
  box(ML, y, CW, boxH, BLUE_BG);

  var by2 = y + 7;
  sf('normal', 9); tc(TEXT);
  txt('Fahrtkosten:', ML + 4, by2);
  sf('bold', 9);
  txt(fmtE(data.fahrtBetrag || totBetrag), PW - MR - 4, by2, { align: 'right' });

  if (spesenSum > 0) {
    by2 += 8;
    sf('normal', 9); tc(TEXT);
    txt('Spesen:', ML + 4, by2);
    sf('bold', 9);
    txt(fmtE(spesenSum), PW - MR - 4, by2, { align: 'right' });
  }

  dc(BLUE); lw(0.3);
  doc.line(ML + 4, by2 + 3, PW - MR - 4, by2 + 3);
  by2 += 9;

  sf('bold', 11); tc(BLUE);
  txt('Auszahlungsbetrag:', ML + 4, by2);
  txt(fmtE(data.gesamt || 0), PW - MR - 4, by2, { align: 'right' });

  y += boxH + 4;

  sf('normal', 8.5); tc(MUTED);
  txt('Auszahlung auf IBAN:', ML, y);
  sf('bold', 9); tc(TEXT);
  txt(m.iban || '–', ML + 44, y);
  y += 8;

  // Tax hint amber box
  var taxTxt = 'Hinweis: Pendelabzüge können als Entfernungspauschale (Anlage N) in der ' +
    'Einkommensteuererklärung geltend gemacht werden. ' +
    'Verpflegungspauschalen: ab 8 Std. 14,00 € / ab 24 Std. 28,00 €.';
  var taxLines = doc.splitTextToSize(taxTxt, CW - 6);
  var taxH = taxLines.length * 4.2 + 5;
  needPage(taxH + 4);
  box(ML, y, CW, taxH, AMBER_BG);
  sf('normal', 7.5); tc(AMBER);
  doc.text(taxLines, ML + 3, y + 4.5);
  y += taxH + 7;

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 5 — Belege
  // ─────────────────────────────────────────────────────────────────────────────
  if (files && files.length > 0) {
    secTitle('BELEGE (' + files.length + ')');
    files.forEach(function(f, i) {
      needPage(8);
      var sz = f.size < 1024 * 1024
        ? Math.round(f.size / 1024) + ' KB'
        : (f.size / 1024 / 1024).toFixed(1) + ' MB';
      box(ML, y, CW, 7, i % 2 === 0 ? WHITE : GRAY_50);
      sf('normal', 8); tc(TEXT);
      txt('Seite ' + (doc.getNumberOfPages() + 1 + i) + ': ' + clip(f.name, 55) + '  (' + sz + ')', ML + 2, y + 5);
      y += 7;
    });
    y += 4;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Erklärungstext
  // ─────────────────────────────────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 20; }
  box(ML, y, CW, 18, [250, 238, 218], [239, 159, 39]);
  sf('bold', 7.5); tc([65, 36, 2]);
  txt('Erklärung des Antragstellers:', ML + 3, y + 5);
  sf('normal', 7); tc([99, 56, 6]);
  txt(
    'Hiermit bestätige ich, dass mir die o.g. Kosten aufgrund des genannten Anlasses unter Beachtung des',
    ML + 3, y + 10
  );
  txt(
    'Gebots der Wirtschaftlichkeit und Sparsamkeit tatsächlich entstanden sind und von keiner anderen Seite erstattet werden.',
    ML + 3, y + 14
  );
  y += 22;

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 6 — Unterschriften
  // ─────────────────────────────────────────────────────────────────────────────
  needPage(38);
  secTitle('UNTERSCHRIFTEN');
  y += 2;

  var sigW  = (CW - 12) / 3;
  var sigH  = 24;
  var sigLbls = ['Mitarbeiter/in', 'Vorgesetzte/r', 'Buchhaltung'];

  sigLbls.forEach(function(lbl, i) {
    var sx = ML + i * (sigW + 6);
    box(sx, y, sigW, sigH, GRAY_50, GRAY_200);
    sf('bold', 7.5); tc(TEXT);
    txt(lbl, sx + 3, y + 7);
    sf('normal', 7); tc(MUTED);
    txt('Datum:', sx + 3, y + sigH - 8);
    hline(sx + 3, sx + sigW - 3, y + sigH - 4, GRAY_200);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // FOOTER — alle Seiten
  // ─────────────────────────────────────────────────────────────────────────────
  var totalPages = doc.getNumberOfPages();
  for (var pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    hline(ML, PW - MR, PH - 13, GRAY_200);
    sf('normal', 6.5); tc(MUTED);
    var footL = (ag.name || '') + '  ·  ' +
      [ag.strasse, ((ag.plz || '') + ' ' + (ag.ort || '')).trim()].filter(Boolean).join(', ');
    var footR = 'Seite ' + pg + '/' + totalPages + '  ·  ' + (data.id || '');
    txt(footL, ML, PH - 8);
    txt(footR, PW - MR, PH - 8, { align: 'right' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SAVE
  // ─────────────────────────────────────────────────────────────────────────────
  var fname = 'Reisekosten_' +
    (m.nachname || 'Unbekannt').replace(/\s+/g, '_') + '_' +
    (m.vorname  || '').replace(/\s+/g, '_') + '_' +
    (data.id    || 'DRAFT') + '.pdf';

  doc.save(fname);
}
