import html2pdf from 'html2pdf.js';
import { SettlementRow } from './settlementParser';

const MONTH_NAMES_PL = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

export function generateSettlementPdf(
  rows: SettlementRow[],
  organists: string[],
) {
  if (rows.length === 0) return;

  const firstDate = new Date(rows[0].date + 'T12:00:00');
  const monthName = MONTH_NAMES_PL[firstDate.getMonth()];
  const year = firstDate.getFullYear();

  let totalMasses = 0;
  let totalAmount = 0;
  const tableRows: string[] = [];

  for (const row of rows) {
    let dayMasses = 0;
    let dayAmount = 0;
    for (const org of organists) {
      const od = row.organistData[org];
      if (od) {
        dayMasses += od.masses;
        dayAmount += od.calculatedAmount;
      }
    }
    if (dayMasses === 0) continue;

    const d = new Date(row.date + 'T12:00:00');
    const dateFormatted = d.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    tableRows.push(`
      <tr>
        <td>${row.dayName}</td>
        <td>${dateFormatted}</td>
        <td>${dayMasses}</td>
        <td>${dayAmount} zł</td>
      </tr>
    `);

    totalMasses += dayMasses;
    totalAmount += dayAmount;
  }

  const container = document.createElement('div');
  container.innerHTML = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #000; padding: 0;">
      <h1 style="text-align: center; font-size: 18pt; margin: 0 0 10mm 0;">Rozliczenie: ${monthName} ${year}</h1>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="border:1px solid #000; padding:6px 10px; text-align:center; font-size:10pt; background:#ddd; font-weight:bold;">Dzień</th>
            <th style="border:1px solid #000; padding:6px 10px; text-align:center; font-size:10pt; background:#ddd; font-weight:bold;">Data</th>
            <th style="border:1px solid #000; padding:6px 10px; text-align:center; font-size:10pt; background:#ddd; font-weight:bold;">Msze</th>
            <th style="border:1px solid #000; padding:6px 10px; text-align:center; font-size:10pt; background:#ddd; font-weight:bold;">Kwota</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows.join('')}
          <tr>
            <td style="border:1px solid #000; padding:6px 10px; text-align:center; font-size:10pt; background:#ddd; font-weight:bold;">RAZEM</td>
            <td style="border:1px solid #000; padding:6px 10px; text-align:center; font-size:10pt; background:#ddd;"></td>
            <td style="border:1px solid #000; padding:6px 10px; text-align:center; font-size:10pt; background:#ddd; font-weight:bold;">${totalMasses}</td>
            <td style="border:1px solid #000; padding:6px 10px; text-align:center; font-size:10pt; background:#ddd; font-weight:bold;">${totalAmount} zł</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // Apply inline styles to all regular td cells
  container.querySelectorAll('tbody tr td').forEach(td => {
    const el = td as HTMLElement;
    if (!el.style.border) {
      el.style.border = '1px solid #000';
      el.style.padding = '6px 10px';
      el.style.textAlign = 'center';
      el.style.fontSize = '10pt';
    }
  });

  const fileName = `rozliczenie-${monthName.toLowerCase()}-${year}.pdf`;

  html2pdf()
    .set({
      margin: 15,
      filename: fileName,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(container)
    .save();
}
