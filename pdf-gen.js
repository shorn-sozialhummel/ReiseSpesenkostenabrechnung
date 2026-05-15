// PDF Generation – Reisekostenabrechnung Sozialhummel gGmbH
// Requires jsPDF (loaded via CDN)

function generatePDF(formData) {
  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    showToast('PDF-Bibliothek nicht geladen. Bitte Seite neu laden.', 'error');
    return;
  }

  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const margin = 20;
  const pageW = 210;
  const contentW = pageW - margin * 2;
  let y = margin;

  const employer = getEmployer();
  const profile = formData.profile || {};
  const rows = formData.rows || [];
  const commuteKm = formData.commuteKm || 0;
  const commuteTrips = formData.commuteTrips || 0;
  const totalCommuteKm = commuteKm * commuteTrips;
  const totalKm = rows.reduce((s, r) => s + (r.km || 0), 0);
  const reimburseKm = Math.max(0, totalKm - totalCommuteKm);
  const totalAmount = reimburseKm * RATE_PER_KM;

  // ── Header bar ──────────────────────────────────────────────────────────
  doc.setFillColor(42, 122, 79);
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Reisekostenabrechnung', margin, 13);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(employer.name, margin, 20);
  doc.text(`${employer.street}, ${employer.zip} ${employer.city}`, margin, 25);

  // Date top right
  doc.text(`Erstellt: ${new Date().toLocaleDateString('de-DE')}`, pageW - margin, 20, { align: 'right' });

  y = 36;
  doc.setTextColor(33, 37, 41);

  // ── Two-column header ────────────────────────────────────────────────────
  const colW = contentW / 2 - 4;

  function sectionHeader(label, x, yy, w) {
    doc.setFillColor(232, 245, 238);
    doc.rect(x, yy, w, 6, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 92, 58);
    doc.text(label.toUpperCase(), x + 3, yy + 4.2);
    doc.setTextColor(33, 37, 41);
    return yy + 8;
  }

  function fieldRow(label, value, x, yy, w) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(label, x, yy);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(value || '–', w - 30);
    doc.text(lines, x + 30, yy);
    return yy + 5 * lines.length;
  }

  // Left: Mitarbeiterdaten
  let yL = sectionHeader('Mitarbeiter/in', margin, y, colW);
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || '–';
  yL = fieldRow('Name:', fullName, margin, yL, colW);
  yL = fieldRow('Team:', profile.team || '–', margin, yL, colW);
  yL = fieldRow('Adresse:', [profile.street, [profile.zip, profile.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–', margin, yL, colW);
  yL = fieldRow('IBAN:', profile.iban || '–', margin, yL, colW);

  // Right: Abrechnungsdaten
  const rightX = margin + colW + 8;
  let yR = sectionHeader('Abrechnung', rightX, y, colW);
  yR = fieldRow('Zeitraum:', formData.period || '–', rightX, yR, colW);
  yR = fieldRow('Erstattungssatz:', `${RATE_PER_KM.toFixed(2).replace('.', ',')} €/km`, rightX, yR, colW);
  yR = fieldRow('Pendelstrecke:', commuteKm > 0 ? `${commuteKm} km × ${commuteTrips} Fahrten = ${totalCommuteKm} km` : 'keine', rightX, yR, colW);

  y = Math.max(yL, yR) + 8;

  // ── Trip table ───────────────────────────────────────────────────────────
  y = sectionHeader('Fahrten', margin, y, contentW);

  // Table header
  const colDefs = [
    { label: 'Datum', w: 22, align: 'left' },
    { label: 'Von', w: 42, align: 'left' },
    { label: 'Nach', w: 42, align: 'left' },
    { label: 'Zweck', w: 45, align: 'left' },
    { label: 'km', w: 12, align: 'right' },
    { label: 'Betrag', w: 20, align: 'right' },
  ];

  doc.setFillColor(42, 122, 79);
  doc.rect(margin, y, contentW, 6.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');

  let cx = margin + 2;
  colDefs.forEach(col => {
    doc.text(col.label, col.align === 'right' ? cx + col.w - 2 : cx, y + 4.5, { align: col.align });
    cx += col.w;
  });
  y += 6.5;

  doc.setTextColor(33, 37, 41);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  let rowFill = false;
  rows.forEach(row => {
    // Check page overflow
    if (y > 260) {
      doc.addPage();
      y = margin;
    }

    if (rowFill) {
      doc.setFillColor(248, 249, 250);
      doc.rect(margin, y, contentW, 6, 'F');
    }
    rowFill = !rowFill;

    cx = margin + 2;
    const amount = (row.km || 0) * RATE_PER_KM;
    const cells = [
      formatDate(row.date),
      row.from || '–',
      row.to || '–',
      row.purpose || '–',
      String(row.km || 0),
      formatEuro(amount),
    ];

    colDefs.forEach((col, i) => {
      const txt = doc.splitTextToSize(cells[i], col.w - 2);
      doc.text(txt[0], col.align === 'right' ? cx + col.w - 2 : cx, y + 4, { align: col.align });
      cx += col.w;
    });
    y += 6;

    // thin line
    doc.setDrawColor(222, 226, 230);
    doc.line(margin, y, margin + contentW, y);
  });

  y += 4;

  // ── Summary box ──────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = margin; }

  doc.setFillColor(232, 245, 238);
  doc.rect(margin, y, contentW, 30, 'F');
  doc.setDrawColor(42, 122, 79);
  doc.setLineWidth(0.5);
  doc.rect(margin, y, contentW, 30, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 92, 58);

  const sums = [
    ['Gesamtkilometer:', `${totalKm} km`],
    ['Abzug Pendelstrecke:', `${totalCommuteKm} km`],
    ['Erstattungsfähige km:', `${reimburseKm} km`],
  ];

  let sy = y + 8;
  sums.forEach(([l, v]) => {
    doc.setFont('helvetica', 'normal');
    doc.text(l, margin + 5, sy);
    doc.setFont('helvetica', 'bold');
    doc.text(v, margin + contentW - 5, sy, { align: 'right' });
    sy += 6;
  });

  // Total amount highlighted
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Gesamtbetrag:', margin + 5, sy + 1);
  doc.setFontSize(13);
  doc.text(formatEuro(totalAmount), margin + contentW - 5, sy + 1, { align: 'right' });

  y += 38;

  // ── Notes ────────────────────────────────────────────────────────────────
  if (formData.notes) {
    if (y > 250) { doc.addPage(); y = margin; }
    y = sectionHeader('Anmerkungen', margin, y, contentW);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(33, 37, 41);
    const noteLines = doc.splitTextToSize(formData.notes, contentW - 4);
    doc.text(noteLines, margin + 2, y);
    y += noteLines.length * 4.5 + 6;
  }

  // ── Tax info box ─────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = margin; }
  y += 4;
  doc.setFillColor(255, 248, 225);
  const infoLines = doc.splitTextToSize(
    'Hinweis: Die Pendelstrecke (Wohnort → Arbeitsort) wird vom Arbeitgeber abgezogen. Diese kann jedoch als Entfernungspauschale (Anlage N) in der Steuererklärung geltend gemacht werden. ' +
    'Verpflegungspauschalen (ab 8 Std. Abwesenheit: 14,00 €; ab 24 Std.: 28,00 €) sind steuerlich absetzbar.',
    contentW - 8
  );
  doc.rect(margin, y, contentW, infoLines.length * 4 + 8, 'F');
  doc.setDrawColor(255, 193, 7);
  doc.rect(margin, y, contentW, infoLines.length * 4 + 8, 'S');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(93, 64, 55);
  doc.text(infoLines, margin + 4, y + 5);

  y += infoLines.length * 4 + 16;

  // ── Signature lines ──────────────────────────────────────────────────────
  if (y > 255) { doc.addPage(); y = margin; }
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const sigY = Math.max(y + 10, 265);
  const col1 = margin;
  const col2 = margin + contentW / 2 + 5;
  const sigW = contentW / 2 - 10;

  doc.line(col1, sigY, col1 + sigW, sigY);
  doc.text('Datum, Unterschrift Mitarbeiter/in', col1, sigY + 4);

  doc.line(col2, sigY, col2 + sigW, sigY);
  doc.text('Datum, Unterschrift Vorgesetzte/r', col2, sigY + 4);

  // ── Footer ───────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${employer.name}  ·  Reisekostenabrechnung  ·  Seite ${i}/${pageCount}`,
      pageW / 2, 292, { align: 'center' }
    );
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const fname = `Reisekosten_${profile.lastName || 'Mitarbeiter'}_${formData.period?.replace(/\s/g, '_') || new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fname);
  showToast('PDF wurde heruntergeladen.', 'success');
}

// Called from index.html generate button
function generatePDFFromForm() {
  const data = collectFormData();
  if (!data.profile.lastName && !data.profile.firstName) {
    showToast('Bitte Name eingeben.', 'warning');
    return;
  }
  if ((data.rows || []).length === 0) {
    showToast('Keine Fahrten eingetragen.', 'warning');
    return;
  }
  generatePDF(data);
}
