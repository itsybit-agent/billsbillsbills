/**
 * Excel file parser with configurable column mapping
 */

import { CONFIG, getColumnMapping } from './config.js';

export async function parseExcelFile(file, mapping = null) {
  mapping = mapping || getColumnMapping();
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Find header row using configured pattern
      let startRow = 0;
      if (mapping.headerPattern) {
        const headerIdx = rows.findIndex((row, i) => 
          i < 10 && row?.some(c => String(c).toLowerCase().includes(mapping.headerPattern.toLowerCase()))
        );
        startRow = headerIdx >= 0 ? headerIdx + 1 : 0;
      }

      const transactions = [];
      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row?.[mapping.dateCol]) continue;

        let date = row[mapping.dateCol];
        if (typeof date === 'number') {
          date = XLSX.SSF.format('yyyy-mm-dd', date);
        }
        
        // Skip rows matching skip patterns
        if (mapping.skipPatterns?.some(p => String(date).includes(p))) continue;

        // Get amount
        let amount = parseFloat(row[mapping.amountCol]) || 0;
        
        // Filter by expenses only if configured
        if (mapping.expensesOnly && amount <= 0) continue;

        transactions.push({
          id: crypto.randomUUID(),
          date: String(date).substring(0, 10),
          description: String(row[mapping.descriptionCol] || '').trim(),
          location: mapping.locationCol != null ? String(row[mapping.locationCol] || '').trim() : '',
          currency: CONFIG.currency,
          amount: Math.abs(amount)
        });
      }
      resolve(transactions);
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read file and return raw rows for preview
 */
export async function readFileRows(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      resolve(rows);
    };
    reader.readAsArrayBuffer(file);
  });
}
