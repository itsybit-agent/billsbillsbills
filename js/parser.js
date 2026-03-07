/**
 * Excel file parser
 */

import { CONFIG } from './config.js';

export async function parseExcelFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Find header row
      let startRow = rows.findIndex((row, i) => 
        i < 10 && row?.some(c => String(c).includes('Datum'))
      );
      startRow = startRow >= 0 ? startRow + 1 : 0;

      const transactions = [];
      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row?.[0]) continue;

        let date = row[0];
        if (typeof date === 'number') {
          date = XLSX.SSF.format('yyyy-mm-dd', date);
        }
        if (String(date).match(/Totalt|Valutakurs/)) continue;

        const amount = parseFloat(row[6]) || parseFloat(row[5]) || 0;
        if (amount <= 0) continue;

        transactions.push({
          id: crypto.randomUUID(),
          date: String(date).substring(0, 10),
          description: String(row[2] || '').trim(),
          location: String(row[3] || '').trim(),
          currency: String(row[4] || CONFIG.currency),
          amount
        });
      }
      resolve(transactions);
    };
    reader.readAsArrayBuffer(file);
  });
}
