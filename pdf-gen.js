'use strict';

function generiereUndLadePDF(data, files) {
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  var PW   = 210;
  var PH   = 297;
  var ML   = 18;
  var MR   = 18;
  var W    = PW - ML - MR;
  var pageCount = 1;

  // Colors
  var C_GREEN      = [29, 158, 117];
  var C_GREEN_DARK = [8, 80, 65];
  var C_GREEN_LIGHT= [225, 245, 238];
  var C_BLUE       = [24, 95, 165];
  var C_BLUE_LIGHT = [230, 241, 251];
  var C_AMBER      = [133, 79, 11];
  var C_AMBER_LIGHT= [250, 238, 218];
  var C_RED        = [163, 45, 45];
  var C_GRAY_50    = [248, 248, 246];
  var C_GRAY_100   = [241, 240, 236];
  var C_GRAY_200   = [226, 224, 218];
  var C_TEXT       = [26, 26, 24];
  var C_MUTED      = [107, 106, 101];
  var C_WHITE      = [255, 255, 255];

  var BADGE_COLORS = {
    teamtreffen:   [[0, 128, 128],   [204, 240, 240]],
    urlaubsbegl:   [[24, 95, 165],   [230, 241, 251]],
    helfertreffen: [[160, 60, 110],  [248, 220, 235]],
    fortbildung:   [[100, 50, 160],  [235, 220, 255]],
    kundenbesuch:  [[29, 158, 117],  [225, 245, 238]],
    sonstiges:     [[100, 100, 100], [235, 235, 235]]
  };

  var m = data.mitarbeiter || {};
  var pendelKm = m.pendelKmEinfach || 0;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function rgb(c) { return { r: c[0], g: c[1], b: c[2] }; }

  function setFill(c)   { doc.setFillColor(c[0], c[1], c[2]); }
  function setDraw(c)   { doc.setDrawColor(c[0], c[1], c[2]); }
  function setTextC(c)  { doc.setTextColor(c[0], c[1], c[2]); }
  function setFont(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); }

  function rect(x, y, w, h, fill, draw, radius) {
    if (fill) setFill(fill);
    if (draw) setDraw(draw); else doc.setDrawColor(0, 0, 0, 0);
    var style = fill && draw ? 'FD' : fill ? 'F' : 'D';
    if (radius) doc.roundedRect(x, y, w, h, radius, radius, style);
    else        doc.rect(x, y, w, h, style);
  }

  function line(x1, y1, x2, y2, c, lw) {
    doc.setLineWidth(lw || 0.2);
    setDraw(c || C_GRAY_200);
    doc.line(x1, y1, x2, y2);
  }

  function text(str, x, y, opts) {
    doc.text(String(str || ''), x, y, opts || {});
  }

  function fmt(n) {
    return parseFloat(n || 0).toFixed(2).replace('.', ',') + ' €';
  }

  function fmtKm(n) { return (parseInt(n) || 0) + ' km'; }

  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  var footerH = 10;
  var contentBottom = PH - footerH - 8;

  function checkY(y, needed) {
    if (y + needed > contentBottom) {
      addPage();
      return MT;
    }
    return y;
  }

  var MT = 30; // top margin after header area

  function drawFooter(pageNum, total) {
    var y = PH - 8;
    setFont('normal', 7);
    setTextC(C_MUTED);
    var ag = getArbeitgeber ? getArbeitgeber() : {};
    var left = (ag.name || 'Sozialhummel gGmbH') + '  ·  ' +
      (ag.strasse || 'Mozartstr. 10') + ', ' + (ag.plz || '53819') + ' ' + (ag.ort || 'Neunkirchen-Seelscheid');
    text(left, ML, y);
    var right = 'Seite ' + pageNum + '/' + total + '  ·  ' + (data.id || '');
    text(right, PW - MR, y, { align: 'right' });
    line(ML, PH - footerH - 1, PW - MR, PH - footerH - 1, C_GRAY_200, 0.3);
  }

  var pages = [1];

  function addPage() {
    doc.addPage();
    pageCount++;
    pages.push(pageCount);
    drawHeader();
  }

  // ── Header ───────────────────────────────────────────────────────────────────

  function drawHeader() {
    rect(0, 0, PW, 14, C_GREEN);
    setFont('bold', 10);
    setTextC(C_WHITE);
    text('SOZIALHUMMEL gGmbH', ML, 6.5);
    setFont('normal', 7);
    setTextC([180, 230, 210]);
    var ag = getArbeitgeber ? getArbeitgeber() : {};
    text(
      (ag.strasse || 'Mozartstr. 10') + ' · ' +
      (ag.plz || '53819') + ' ' + (ag.ort || 'Neunkirchen-Seelscheid'),
      ML, 11
    );
    setFont('bold', 9);
    setTextC(C_WHITE);
    text('REISEKOSTENABRECHNUNG', PW - MR, 8.5, { align: 'right' });
  }

  // ── Draw all pages, then patch footers ──────────────────────────────────────

  drawHeader();

  var y = MT - 2;

  // ── Meta ─────────────────────────────────────────────────────────────────────

  setFont('normal', 8);
  setTextC(C_MUTED);
  var nowStr = new Date().toLocaleDateString('de-DE');
  var metaStr = 'Antrag-Nr.: ' + (data.id || '–') + '   ·   Eingereicht: ' + nowStr +
    (data.zeitraum ? '   ·   ' + data.zeitraum : '');
  text(metaStr, PW - MR, y, { align: 'right' });
  y += 8;

  // ── Block 1: Mitarbeiterdaten ─────────────────────────────────────────────────

  rect(ML, y, W, 28, C_GRAY_50, C_GRAY_200);
  setFont('bold', 8);
  setTextC(C_TEXT);
  text('MITARBEITERDATEN', ML + 4, y + 5);

  var col1 = ML + 4;
  var col2 = ML + W / 2 + 2;
  var ly   = y + 11;

  function kvRow(label, val, cx, cy) {
    setFont('normal', 7);
    setTextC(C_MUTED);
    text(label, cx, cy);
    setFont('normal', 8);
    setTextC(C_TEXT);
    text(val || '–', cx, cy + 4.5);
  }

  var rolleLbl = m.rolle === 'assistenz' ? 'Assistenz' :
                 m.rolle === 'tk'        ? 'Teamkoordination' :
                 m.rolleText || m.rolle || '–';

  kvRow('Name · Funktion',
    (m.vorname || '') + ' ' + (m.nachname || '') + '  ·  ' + rolleLbl,
    col1, ly);
  kvRow('IBAN', m.iban || '–', col2, ly);

  ly += 11;
  kvRow('Wohnort',
    [m.heimStrasse, (m.heimPlz + ' ' + m.heimOrt).trim()].filter(Boolean).join(', ') || '–',
    col1, ly);
  kvRow('Üblicher Arbeitsort',
    [m.arbeitsortName, m.arbeitsortAdresse].filter(Boolean).join('  ·  ') || '–',
    col2, ly);

  y += 28 + 4;

  // Pendelstrecke info bar
  rect(ML, y, W, 8, C_GREEN_LIGHT, C_GRAY_200);
  setFont('normal', 7);
  setTextC(C_GREEN_DARK);
  text(
    'Pendelstrecke einfach: ' + fmtKm(pendelKm) +
    '   ·   Abzug pro Fahrt (Start Zuhause): ' + fmtKm(pendelKm * 2) +
    '  (' + fmt(pendelKm * 2 * 0.30) + ')',
    ML + 4, y + 5.2
  );
  y += 8 + 6;

  // ── Block 2: Fahrten ──────────────────────────────────────────────────────────

  y = checkY(y, 20);

  setFont('bold', 8);
  setTextC(C_TEXT);
  text('DIENSTLICHE FAHRTEN', ML, y);
  y += 5;

  // Table columns: # | Datum | Art | Start | Ziel | km H&R | −Pendel | Erstatt | Betrag
  var COL = {
    nr:     { x: ML,       w: 7  },
    datum:  { x: ML+7,     w: 18 },
    art:    { x: ML+25,    w: 28 },
    start:  { x: ML+53,    w: 28 },
    ziel:   { x: ML+81,    w: 38 },
    kmhr:   { x: ML+119,   w: 16 },
    pendel: { x: ML+135,   w: 16 },
    erstatt:{ x: ML+151,   w: 16 },
    betrag: { x: ML+167,   w: W - 167 }
  };

  var TH = 6;

  function drawTableHeader(ty) {
    rect(ML, ty, W, TH, C_GREEN, C_GREEN);
    setFont('bold', 6.5);
    setTextC(C_WHITE);
    var headers = [
      ['#',          COL.nr],
      ['Datum',      COL.datum],
      ['Art',        COL.art],
      ['Start',      COL.start],
      ['Ziel',       COL.ziel],
      ['km H+R',     COL.kmhr],
      ['−Pendel',    COL.pendel],
      ['Erstatt.km', COL.erstatt],
      ['Betrag',     COL.betrag]
    ];
    headers.forEach(function (h) {
      var label = h[0];
      var col   = h[1];
      var isRight = ['km H+R', '−Pendel', 'Erstatt.km', 'Betrag'].indexOf(label) >= 0;
      if (isRight) text(label, col.x + col.w - 1, ty + 4, { align: 'right' });
      else         text(label, col.x + 1, ty + 4);
    });
    return ty + TH;
  }

  y = drawTableHeader(y);

  var fahrten  = data.fahrten || [];
  var ROW_H    = 7;
  var totKmHR  = 0;
  var totPendel= 0;
  var totErst  = 0;
  var totBetrag= 0;

  fahrten.forEach(function (f, i) {
    y = checkY(y, ROW_H + 1);
    if (y === MT) y = drawTableHeader(y);

    var isEven = i % 2 === 0;
    rect(ML, y, W, ROW_H, isEven ? C_WHITE : C_GRAY_50);

    var kmEinfach = f.kmEinfach || 0;
    var kmHR      = kmEinfach * 2;
    var fromAO    = f.startTyp === 'arbeitsort';
    var pendAbz   = fromAO ? 0 : pendelKm * 2;
    var erstKm    = fromAO ? kmHR : Math.max(0, kmHR - pendelKm * 2);
    var betrag    = erstKm * 0.30;

    totKmHR   += kmHR;
    totPendel += pendAbz;
    totErst   += erstKm;
    totBetrag += betrag;

    var cy = y + 4.8;
    setFont('normal', 7);
    setTextC(C_MUTED);
    text(String(i + 1), COL.nr.x + 1, cy);

    setTextC(C_TEXT);
    text(fmtDate(f.datum), COL.datum.x + 1, cy);

    // Art badge
    var bc   = BADGE_COLORS[f.art] || BADGE_COLORS.sonstiges;
    var artL = (f.artLabel || f.art || '–');
    var bw   = COL.art.w - 2;
    rect(COL.art.x + 1, y + 1.2, bw, 4.5, bc[1], null, 1.5);
    setFont('normal', 6);
    setTextC(bc[0]);
    text(artL, COL.art.x + 1 + bw / 2, cy - 0.2, { align: 'center' });

    setFont('normal', 7);
    setTextC(C_TEXT);

    var startLabel = fromAO ? (m.arbeitsortName || 'Arbeitsort') :
                     f.startTyp === 'zuhause' ? 'Zuhause' :
                     (f.startAdresse || '–');
    // Truncate long strings
    function trunc(s, maxW, fs) {
      doc.setFontSize(fs || 7);
      while (s.length > 3 && doc.getTextWidth(s) > maxW) s = s.slice(0, -1);
      return s.length < (f.startAdresse || startLabel || '').length ? s + '…' : s;
    }
    text(trunc(startLabel, COL.start.w - 2), COL.start.x + 1, cy);
    text(trunc(f.ziel || '–', COL.ziel.w - 2), COL.ziel.x + 1, cy);

    setTextC(C_TEXT);
    text(fmtKm(kmHR),   COL.kmhr.x   + COL.kmhr.w - 1,   cy, { align: 'right' });

    if (fromAO) {
      setTextC(C_GREEN_DARK);
      text('–', COL.pendel.x + COL.pendel.w - 1, cy, { align: 'right' });
    } else {
      setTextC(C_RED);
      text(fmtKm(pendAbz), COL.pendel.x + COL.pendel.w - 1, cy, { align: 'right' });
    }

    setTextC(C_TEXT);
    text(fmtKm(erstKm), COL.erstatt.x + COL.erstatt.w - 1, cy, { align: 'right' });

    setFont('bold', 7);
    setTextC(C_BLUE);
    text(fmt(betrag), COL.betrag.x + COL.betrag.w - 1, cy, { align: 'right' });

    // Start-Arbeitsort green marker
    if (fromAO) {
      setFont('normal', 5.5);
      setTextC(C_GREEN_DARK);
      text('Start Arbeitsort', COL.start.x + 1, y + ROW_H - 1);
    }

    y += ROW_H;
  });

  // Sum row
  y = checkY(y, 8);
  rect(ML, y, W, 7, C_GRAY_100, C_GRAY_200);
  setFont('bold', 7.5);
  setTextC(C_TEXT);
  text('Summe', COL.nr.x + 1, y + 4.8);
  text(fmtKm(totKmHR),   COL.kmhr.x   + COL.kmhr.w - 1,   y + 4.8, { align: 'right' });
  setTextC(C_RED);
  text(fmtKm(totPendel), COL.pendel.x + COL.pendel.w - 1, y + 4.8, { align: 'right' });
  setTextC(C_TEXT);
  text(fmtKm(totErst),   COL.erstatt.x + COL.erstatt.w - 1, y + 4.8, { align: 'right' });
  setTextC(C_BLUE);
  text(fmt(totBetrag),   COL.betrag.x + COL.betrag.w - 1, y + 4.8, { align: 'right' });
  y += 7 + 4;

  // Amber Pendel note
  if (pendelKm > 0) {
    y = checkY(y, 12);
    rect(ML, y, W, 11, C_AMBER_LIGHT, C_AMBER_LIGHT, 2);
    setFont('normal', 7);
    setTextC(C_AMBER);
    text('⚠  Pendelabzug (bei Start von Zuhause): ' + fmtKm(pendelKm * 2) + ' pro Fahrt  ·  ' +
      'Abgezogene km als Entfernungspauschale (Anlage N) in der Steuererklärung geltend machen.',
      ML + 4, y + 4.5);
    setFont('normal', 6.5);
    text('Pendelstrecke einfach ' + fmtKm(pendelKm) + '  ×  2 = ' + fmtKm(pendelKm * 2) + ' (Hin & Zurück)',
      ML + 4, y + 8.5);
    y += 11 + 5;
  }

  // ── Block 3: Spesen ──────────────────────────────────────────────────────────

  var sp = data.spesen || {};
  var spesenSum = data.spesenSum || 0;

  if (spesenSum > 0) {
    y = checkY(y, 32);
    setFont('bold', 8);
    setTextC(C_TEXT);
    text('SPESEN', ML, y);
    y += 5;

    rect(ML, y, W, 24, C_GRAY_50, C_GRAY_200);
    var sx = ML + 4;
    var sy = y + 6;
    var sc = W / 4;

    function spesenCell(label, val, cx) {
      setFont('normal', 6.5);
      setTextC(C_MUTED);
      text(label, cx, sy);
      setFont('bold', 8);
      setTextC(val > 0 ? C_TEXT : C_MUTED);
      text(fmt(val), cx, sy + 5);
    }

    spesenCell('Übernachtung',     sp.uebernacht || 0, sx);
    spesenCell('ÖPNV / Bahn / Taxi', sp.opnv || 0,    sx + sc);
    spesenCell('Parken / Maut',    sp.parken || 0,     sx + sc * 2);
    spesenCell('Sonstige',         sp.sonstige || 0,   sx + sc * 3);

    if (sp.beschr) {
      setFont('normal', 6.5);
      setTextC(C_MUTED);
      text('Beschreibung: ' + sp.beschr, sx, y + 19);
    }
    y += 24 + 6;
  }

  // ── Block 4: Gesamtabrechnung ─────────────────────────────────────────────────

  y = checkY(y, 44);
  setFont('bold', 8);
  setTextC(C_TEXT);
  text('GESAMTABRECHNUNG', ML, y);
  y += 5;

  var bh = spesenSum > 0 ? 38 : 30;
  rect(ML, y, W, bh, C_BLUE_LIGHT, C_BLUE_LIGHT, 2);

  var bx = ML + 6;
  var by = y + 7;

  setFont('normal', 7.5);
  setTextC(C_TEXT);
  text('Fahrtkosten  (' + fmtKm(totErst) + ' × 0,30 €)', bx, by);
  setFont('bold', 7.5);
  text(fmt(totBetrag), PW - MR - 4, by, { align: 'right' });

  if (spesenSum > 0) {
    by += 7;
    setFont('normal', 7.5);
    setTextC(C_TEXT);
    text('Spesen', bx, by);
    setFont('bold', 7.5);
    text(fmt(spesenSum), PW - MR - 4, by, { align: 'right' });
  }

  line(bx, by + 3, PW - MR - 4, by + 3, C_BLUE, 0.4);
  by += 8;

  setFont('bold', 10);
  setTextC(C_BLUE);
  text('Auszahlungsbetrag:', bx, by);
  text(fmt(data.gesamt || 0), PW - MR - 4, by, { align: 'right' });

  by += 7;
  setFont('normal', 7);
  setTextC(C_MUTED);
  text('IBAN:', bx, by);
  setFont('normal', 7);
  setTextC(C_TEXT);
  text(m.iban || '–', bx + 10, by);

  y += bh + 5;

  // Tax hint amber box
  y = checkY(y, 22);
  rect(ML, y, W, 20, C_AMBER_LIGHT, C_AMBER_LIGHT, 2);
  setFont('bold', 7);
  setTextC(C_AMBER);
  text('Für Ihre Steuererklärung (Anlage N):', ML + 4, y + 5);
  setFont('normal', 6.5);
  text(
    'Pendelstrecke pro Fahrt (Start Zuhause): ' + fmtKm(pendelKm * 2) +
    ' → Entfernungspauschale eintragen',
    ML + 4, y + 11
  );
  text(
    'Verpflegungspauschalen: ab 8 Std. 14,00 €  /  ab 24 Std. 28,00 € → Anlage N',
    ML + 4, y + 17
  );
  y += 20 + 6;

  // ── Block 5: Belege ──────────────────────────────────────────────────────────

  if (files && files.length > 0) {
    y = checkY(y, 10 + files.length * 5);
    setFont('bold', 8);
    setTextC(C_TEXT);
    text('BELEGE (' + files.length + ')', ML, y);
    y += 5;
    files.forEach(function (f) {
      y = checkY(y, 5);
      setFont('normal', 7);
      setTextC(C_MUTED);
      var size = f.size < 1024 * 1024
        ? Math.round(f.size / 1024) + ' KB'
        : (f.size / 1024 / 1024).toFixed(1) + ' MB';
      text('📎  ' + f.name + '  (' + size + ')', ML + 4, y);
      y += 5;
    });
    y += 4;
  }

  // ── Block 6: Unterschriften ───────────────────────────────────────────────────

  y = checkY(y, 30);
  setFont('bold', 8);
  setTextC(C_TEXT);
  text('UNTERSCHRIFTEN', ML, y);
  y += 5;

  var sigW = (W - 10) / 3;
  var sigH = 20;
  var sigLabels = ['Mitarbeiter/in', 'Vorgesetzte/r', 'Buchhaltung / Stempel'];

  sigLabels.forEach(function (label, i) {
    var sx2 = ML + i * (sigW + 5);
    rect(sx2, y, sigW, sigH, C_GRAY_50, C_GRAY_200, 2);
    setFont('normal', 6.5);
    setTextC(C_MUTED);
    text('Datum, Unterschrift', sx2 + 4, y + sigH - 4);
    setFont('bold', 7);
    setTextC(C_TEXT);
    text(label, sx2 + 4, y + 6);
  });

  y += sigH + 4;

  // ── Patch footers on all pages ────────────────────────────────────────────────

  var total = doc.getNumberOfPages();
  for (var pg = 1; pg <= total; pg++) {
    doc.setPage(pg);
    drawFooter(pg, total);
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  var fn = 'Reisekosten_' +
    (m.nachname || 'Unbekannt').replace(/\s+/g, '_') + '_' +
    (m.vorname  || '').replace(/\s+/g, '_') + '_' +
    (data.id || 'DRAFT') + '.pdf';

  doc.save(fn);
}
