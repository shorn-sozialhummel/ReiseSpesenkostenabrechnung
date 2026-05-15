'use strict';

// ─── PDF Generation ───────────────────────────────────────────────────────────
// Requires jsPDF UMD loaded from CDN (window.jspdf.jsPDF)
// Signature: async function generiereUndLadePDF(data, files)

async function generiereUndLadePDF(data, files) {
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Page dimensions
  var PW = 210;   // page width mm
  var PH = 297;   // page height mm
  var ML = 18;    // margin left
  var MR = 18;    // margin right
  var CW = PW - ML - MR;  // content width = 174mm
  var y = 0;

  var pageCount = 1;
  var pageRefs = [];  // track pages for footer

  function addPage() {
    drawFooter();
    doc.addPage();
    pageCount++;
    y = 20;
  }

  function checkY(needed) {
    if (y + needed > 272) addPage();
  }

  // ─── Colours ─────────────────────────────────────────────────────────────
  function rgb(hex) {
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    return [r,g,b];
  }

  function setFill(hex) { var c = rgb(hex); doc.setFillColor(c[0],c[1],c[2]); }
  function setStroke(hex) { var c = rgb(hex); doc.setDrawColor(c[0],c[1],c[2]); }
  function setTextColor(hex) { var c = rgb(hex); doc.setTextColor(c[0],c[1],c[2]); }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function fmtMoney(n) {
    return (+(n||0)).toFixed(2).replace('.',',') + ' €';
  }

  function fmtDateDE(isoStr) {
    if (!isoStr) return '';
    var p = isoStr.split('-');
    if (p.length !== 3) return isoStr;
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  function artLabel(v) {
    var map = {
      teamtreffen: 'Teamtreffen',
      urlaubsbegl: 'Urlaub',
      helfertreffen: 'Helfer',
      kundenbesuch: 'Kunde',
      fortbildung: 'Fortbildung',
      sonstiges: 'Sonstiges'
    };
    return map[v] || v || '–';
  }

  function artColor(v) {
    var map = {
      teamtreffen:  '#0d9488',
      urlaubsbegl:  '#185FA5',
      helfertreffen:'#db2777',
      fortbildung:  '#7c3aed',
      kundenbesuch: '#1D9E75',
      sonstiges:    '#6b7280'
    };
    return map[v] || '#6b7280';
  }

  function wrapText(text, maxWidth, fontSize) {
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(String(text || ''), maxWidth);
  }

  // ─── Footer (drawn on each page before addPage) ───────────────────────────
  function drawFooter() {
    var ag = getArbeitgeber();
    var footY = PH - 8;
    doc.setFontSize(7);
    setTextColor('#9a9890');
    doc.text(ag.name + ' · ' + ag.strasse + ', ' + ag.plz + ' ' + ag.ort, ML, footY);
    doc.text(
      'Seite ' + doc.getCurrentPageInfo().pageNumber + ' · ' + (data.id || ''),
      PW - MR,
      footY,
      { align: 'right' }
    );
    // Thin gray line
    setStroke('#E2E0DA');
    doc.setLineWidth(0.2);
    doc.line(ML, PH - 11, PW - MR, PH - 11);
  }

  var m = data.mitarbeiter || {};
  var fahrten = data.fahrten || [];
  var pendelEinfach = m.pendelKmEinfach || 0;
  var pendelHR = pendelEinfach * 2;
  var ag = getArbeitgeber();

  // ─── HEADER BAR ──────────────────────────────────────────────────────────
  y = 0;
  setFill('#1D9E75');
  doc.rect(0, 0, PW, 14, 'F');

  // Left: company name + address
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextColor('#FFFFFF');
  doc.text('SOZIALHUMMEL gGmbH', ML, 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  var agAddr = ag.strasse + ', ' + ag.plz + ' ' + ag.ort;
  if (ag.email) agAddr += ' · ' + ag.email;
  if (ag.tel) agAddr += ' · ' + ag.tel;
  doc.text(agAddr, ML, 13);

  // Right: title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('REISEKOSTENABRECHNUNG', PW - MR, 9, { align: 'right' });

  y = 18;

  // ─── META LINE ───────────────────────────────────────────────────────────
  setFill('#F1F0EC');
  setStroke('#E2E0DA');
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, 8, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setTextColor('#6b6a65');

  var metaText = 'Antrag-Nr: ' + (data.id || '–') +
    '   |   Eingereicht: ' + today() +
    '   |   Abrechnungsmonat: ' + (data.zeitraum || '–');
  doc.text(metaText, ML + 3, y + 5.2);

  y += 12;

  // ─── BLOCK 1: Mitarbeiterdaten ────────────────────────────────────────────
  checkY(52);

  // Gray bg box
  setFill('#F8F8F6');
  setStroke('#E2E0DA');
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, 48, 2, 2, 'FD');

  // Section label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setTextColor('#6b6a65');
  doc.text('MITARBEITERDATEN', ML + 3, y + 5);

  // Divider
  setStroke('#E2E0DA');
  doc.setLineWidth(0.2);
  doc.line(ML + 3, y + 7, ML + CW - 3, y + 7);

  // Layout: two columns
  var col1x = ML + 3;
  var col2x = ML + CW / 2 + 2;
  var rowH = 7.5;
  var dataY = y + 11;

  function labelVal(lbl, val, x, ry) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextColor('#9a9890');
    doc.text(lbl, x, ry);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setTextColor('#1a1a18');
    doc.text(String(val || '–'), x, ry + 4);
  }

  var rolleLbl = (function() {
    var map = { assistenz: 'Assistenz', tk: 'Teamkoordination', andere: m.rolleText || 'Andere' };
    return map[m.rolle] || m.rolle || '–';
  })();

  labelVal('Name', (m.vorname || '') + ' ' + (m.nachname || ''), col1x, dataY);
  labelVal('Funktion / Rolle', rolleLbl, col2x, dataY);

  dataY += rowH;
  var heimFull = (m.heimStrasse || '') + ', ' + ((m.heimPlz || '') + ' ' + (m.heimOrt || '')).trim();
  labelVal('Wohnort', heimFull || '–', col1x, dataY);
  labelVal('IBAN', m.iban || '–', col2x, dataY);

  dataY += rowH;
  var arbeitsortFull = [m.arbeitsortName, m.arbeitsortAdresse].filter(Boolean).join(' · ') || '–';
  labelVal('Arbeitsort', arbeitsortFull, col1x, dataY);
  var pendelText = pendelEinfach > 0
    ? pendelEinfach + ' km einfach  |  Abzug pro Fahrt: ' + pendelHR + ' km / ' + fmtMoney(pendelHR * 0.30)
    : 'Nicht berechnet';
  labelVal('Pendelstrecke', pendelText, col2x, dataY);

  dataY += rowH;
  // Berechnet am
  if (pendelEinfach > 0 && m.pendelBerechnetAm) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setTextColor('#9a9890');
    doc.text('Pendelstrecke berechnet am: ' + m.pendelBerechnetAm, col1x, dataY + 3);
  }

  y += 52;

  // ─── BLOCK 2: Fahrten Table ───────────────────────────────────────────────
  y += 4;
  checkY(24);

  // Table header
  var colWidths = [8, 20, 26, 38, 18, 18, 18, 28];
  // # | Datum | Art | Beschreibung/Ziel | Gesamt km H&R | -Pendel km | Erstatt. km | Betrag

  setFill('#1D9E75');
  doc.rect(ML, y, CW, 7, 'F');

  var headers = ['#', 'Datum', 'Art', 'Beschreibung / Ziel', 'Ges. km\n(H&R)', '−Pendel\nkm', 'Erstatt.\nkm', 'Betrag'];
  var cx = ML;
  headers.forEach(function(h, i) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setTextColor('#FFFFFF');
    var align = (i >= 4) ? 'right' : 'left';
    var tx = (align === 'right') ? (cx + colWidths[i] - 1) : (cx + 1);
    doc.text(h, tx, y + 4.5, { align: align, lineHeightFactor: 1.1 });
    cx += colWidths[i];
  });

  y += 7;

  // Table rows
  var totalGesKm = 0;
  var totalPendelKm = 0;
  var totalErstattKm = 0;
  var totalBetrag = 0;

  fahrten.forEach(function(f, idx) {
    var km = +(f.kmEinfach || 0);
    var kmHR = km * 2;
    var usedPendel = Math.min(pendelHR, kmHR);
    var erstattKm = Math.max(0, kmHR - pendelHR);
    var betrag = erstattKm * 0.30;

    totalGesKm += kmHR;
    totalPendelKm += usedPendel;
    totalErstattKm += erstattKm;
    totalBetrag += betrag;

    checkY(9);

    // Zebra
    if (idx % 2 === 1) {
      setFill('#F8F8F6');
      doc.rect(ML, y, CW, 8, 'F');
    }

    var rowY = y + 5;
    cx = ML;

    // #
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextColor('#6b6a65');
    doc.text(String(idx + 1), cx + 1, rowY);
    cx += colWidths[0];

    // Datum
    setTextColor('#1a1a18');
    doc.text(fmtDateDE(f.datum), cx + 1, rowY);
    cx += colWidths[1];

    // Art badge
    var artLbl = artLabel(f.art);
    var artCol = artColor(f.art);
    var badgeW = doc.getTextWidth(artLbl) + 4;
    setFill(artCol);
    doc.roundedRect(cx + 0.5, y + 1.5, badgeW, 5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setTextColor('#FFFFFF');
    doc.text(artLbl, cx + 0.5 + badgeW / 2, rowY, { align: 'center' });
    cx += colWidths[2];

    // Beschreibung / Von → Nach
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextColor('#1a1a18');
    var beschr = '';
    if (f.von && f.nach) beschr = f.von + ' → ' + f.nach;
    else if (f.zweck) beschr = f.zweck;
    else beschr = '–';
    var lines = doc.splitTextToSize(beschr, colWidths[3] - 2);
    doc.text(lines[0], cx + 1, rowY);
    if (lines[1]) {
      doc.setFontSize(6.5);
      setTextColor('#6b6a65');
      doc.text(lines[1], cx + 1, rowY + 3.5);
    }
    if (f.zweck && f.von) {
      doc.setFontSize(6.5);
      setTextColor('#9a9890');
      var zweckLine = doc.splitTextToSize(f.zweck, colWidths[3] - 2);
      doc.text(zweckLine[0], cx + 1, rowY + 3.5);
    }
    cx += colWidths[3];

    // Numeric columns (right-aligned)
    var nums = [kmHR + ' km', usedPendel > 0 ? ('−' + usedPendel + ' km') : '–', erstattKm + ' km', fmtMoney(betrag)];
    doc.setFont('helvetica', 'normal');
    nums.forEach(function(txt, ni) {
      doc.setFontSize(7.5);
      setTextColor(ni === 1 ? '#A32D2D' : (ni === 3 ? '#185FA5' : '#1a1a18'));
      doc.text(txt, cx + colWidths[4 + ni] - 1, rowY, { align: 'right' });
      cx += colWidths[4 + ni];
    });

    // Row bottom border
    setStroke('#E2E0DA');
    doc.setLineWidth(0.15);
    doc.line(ML, y + 8, ML + CW, y + 8);

    y += 8;
  });

  // Footer row (totals)
  checkY(8);
  setFill('#E1F5EE');
  doc.rect(ML, y, CW, 8, 'F');

  cx = ML;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setTextColor('#085041');
  doc.text('Gesamt', cx + 1, y + 5);
  cx += colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3];

  var totals = [totalGesKm + ' km', totalPendelKm > 0 ? ('−' + totalPendelKm + ' km') : '–', totalErstattKm + ' km', fmtMoney(totalBetrag)];
  totals.forEach(function(txt, ni) {
    setTextColor(ni === 1 ? '#A32D2D' : (ni === 3 ? '#185FA5' : '#085041'));
    doc.text(txt, cx + colWidths[4 + ni] - 1, y + 5, { align: 'right' });
    cx += colWidths[4 + ni];
  });

  y += 8;

  // Pendel amber note
  if (pendelEinfach > 0) {
    y += 4;
    checkY(14);
    setFill('#FAEEDA');
    setStroke('#EF9F27');
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, 12, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextColor('#633806');
    var pendelNote = 'Pendelabzug pro Fahrt: ' + pendelHR + ' km (Wohnort → Arbeitsort hin & zurück). ' +
      'Die abgezogenen km können als Entfernungspauschale (Anlage N) in der Steuererklärung geltend gemacht werden.';
    var noteLines = doc.splitTextToSize(pendelNote, CW - 6);
    doc.text(noteLines, ML + 3, y + 5);
    y += 12;
  }

  // ─── BLOCK 3: Spesen ─────────────────────────────────────────────────────
  var s = data.spesen || {};
  var spesenSum = data.spesenSum || 0;

  if (spesenSum > 0) {
    y += 6;
    checkY(40);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setTextColor('#1a1a18');
    doc.text('Spesen & weitere Auslagen', ML, y);
    y += 5;

    // Thin divider
    setStroke('#E2E0DA');
    doc.setLineWidth(0.3);
    doc.line(ML, y, ML + CW, y);
    y += 3;

    var spesenItems = [
      { l: 'Übernachtungskosten', v: s.uebernacht },
      { l: 'ÖPNV / Bahn / Taxi', v: s.opnv },
      { l: 'Parkgebühren / Maut', v: s.parken },
      { l: 'Sonstige Auslagen', v: s.sonstige }
    ].filter(function(si) { return si.v > 0; });

    spesenItems.forEach(function(si) {
      checkY(7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setTextColor('#1a1a18');
      doc.text(si.l, ML + 2, y + 4);
      setTextColor('#185FA5');
      doc.text(fmtMoney(si.v), ML + CW - 1, y + 4, { align: 'right' });
      setStroke('#E2E0DA');
      doc.setLineWidth(0.15);
      doc.line(ML, y + 6, ML + CW, y + 6);
      y += 6;
    });

    if (s.sonstigeText) {
      checkY(8);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      setTextColor('#6b6a65');
      var stLines = doc.splitTextToSize('Beschreibung: ' + s.sonstigeText, CW - 4);
      doc.text(stLines, ML + 2, y + 4);
      y += Math.max(7, stLines.length * 4);
    }

    // Spesen footer
    checkY(8);
    setFill('#F1F0EC');
    doc.rect(ML, y, CW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTextColor('#1a1a18');
    doc.text('Summe Spesen', ML + 2, y + 5);
    setTextColor('#185FA5');
    doc.text(fmtMoney(spesenSum), ML + CW - 1, y + 5, { align: 'right' });
    y += 7;
  }

  // ─── BLOCK 4: Gesamtabrechnung ────────────────────────────────────────────
  y += 8;
  checkY(50);

  // Right-aligned bordered box
  var boxW = 90;
  var boxX = ML + CW - boxW;
  var boxLines = [];
  boxLines.push({ l: 'Erstattungs-km', v: totalErstattKm + ' km × 0,30 €', vv: fmtMoney(data.fahrtBetrag || 0), color: null });
  if (spesenSum > 0) boxLines.push({ l: 'Spesen', v: '', vv: fmtMoney(spesenSum), color: null });
  var boxH = 8 + boxLines.length * 7 + 12;

  setFill('#E6F1FB');
  setStroke('#185FA5');
  doc.setLineWidth(0.4);
  doc.roundedRect(boxX, y, boxW, boxH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setTextColor('#0C447C');
  doc.text('GESAMTABRECHNUNG', boxX + 4, y + 5.5);

  setStroke('#185FA5');
  doc.setLineWidth(0.2);
  doc.line(boxX + 2, y + 7.5, boxX + boxW - 2, y + 7.5);

  var bly = y + 13;
  boxLines.forEach(function(bl) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setTextColor('#1a1a18');
    doc.text(bl.l, boxX + 4, bly);
    if (bl.v) {
      setTextColor('#6b6a65');
      doc.setFontSize(7);
      doc.text(bl.v, boxX + 4, bly + 3.5);
    }
    setTextColor('#185FA5');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(bl.vv, boxX + boxW - 3, bly, { align: 'right' });
    bly += 7;
  });

  // Divider
  setStroke('#185FA5');
  doc.setLineWidth(0.3);
  doc.line(boxX + 2, bly - 1, boxX + boxW - 2, bly - 1);

  // Total line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextColor('#185FA5');
  doc.text('Auszahlungsbetrag', boxX + 4, bly + 6);
  doc.text(fmtMoney(data.gesamtBetrag || 0), boxX + boxW - 3, bly + 6, { align: 'right' });

  // IBAN
  if (m.iban) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextColor('#6b6a65');
    doc.text('IBAN: ' + m.iban, boxX + 4, bly + 11);
  }

  y += boxH + 8;

  // Tax note (amber box)
  checkY(18);
  var taxNote = 'Für Ihre Steuererklärung (Anlage N): Pendelstrecke ' +
    (pendelHR * fahrten.length) + ' km gesamt → Entfernungspauschale. ' +
    'Verpflegungspauschalen: ab 8h 14,00 €, ab 24h 28,00 €.';
  setFill('#FAEEDA');
  setStroke('#EF9F27');
  doc.setLineWidth(0.3);
  var taxLines = doc.splitTextToSize(taxNote, CW - 6);
  var taxH = taxLines.length * 4.5 + 6;
  doc.roundedRect(ML, y, CW, taxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setTextColor('#633806');
  doc.text(taxLines, ML + 3, y + 5);
  y += taxH;

  // ─── BLOCK 5: Belege ─────────────────────────────────────────────────────
  if (files && files.length > 0) {
    y += 6;
    checkY(10 + files.length * 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTextColor('#1a1a18');
    doc.text('Angehängte Belege (' + files.length + '):', ML, y);
    y += 5;
    files.forEach(function(f) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setTextColor('#6b6a65');
      doc.text('📄 ' + f.name, ML + 3, y);
      y += 5;
    });
  }

  // ─── Anmerkungen ─────────────────────────────────────────────────────────
  if (data.anmerkungen) {
    y += 6;
    checkY(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTextColor('#1a1a18');
    doc.text('Anmerkungen', ML, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setTextColor('#6b6a65');
    var anmLines = doc.splitTextToSize(data.anmerkungen, CW);
    doc.text(anmLines, ML, y);
    y += anmLines.length * 4.5;
  }

  // ─── BLOCK 6: Unterschriften ──────────────────────────────────────────────
  var sigY = Math.max(y + 16, 240);
  checkY(35);

  var sig3 = [
    { line: 'Datum, Unterschrift Mitarbeiter/in', sub: (m.vorname || '') + ' ' + (m.nachname || '') },
    { line: 'Datum, Unterschrift Vorgesetzte/r', sub: 'Genehmigung' },
    { line: 'Stempel Buchhaltung', sub: 'Geprüft & angewiesen' }
  ];

  var sigW = CW / 3 - 4;
  var sigX = ML;

  sig3.forEach(function(sig) {
    // Underline
    setStroke('#1a1a18');
    doc.setLineWidth(0.4);
    doc.line(sigX, sigY + 12, sigX + sigW, sigY + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextColor('#1a1a18');
    var llines = doc.splitTextToSize(sig.line, sigW);
    doc.text(llines, sigX, sigY + 16);

    doc.setFontSize(7);
    setTextColor('#9a9890');
    doc.text(sig.sub, sigX, sigY + 20);

    sigX += CW / 3;
  });

  // ─── Draw footer on last page ─────────────────────────────────────────────
  drawFooter();

  // ─── Save ─────────────────────────────────────────────────────────────────
  var fn = 'Reisekosten_' + (m.nachname || 'Unbekannt') + '_' + (m.vorname || '') + '_' + (data.id || 'draft') + '.pdf';
  doc.save(fn);
}
