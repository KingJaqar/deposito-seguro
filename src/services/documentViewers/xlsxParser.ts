// src/services/documentViewers/xlsxParser.ts
// .xlsx -> plain data, parsed with SheetJS (the `xlsx` package) directly in
// the RN/Hermes JS thread — unlike mammoth/pdf.js, SheetJS's core parser is
// pure JS with no DOM dependency (it's routinely used from plain Node
// scripts), so unlike DOCX/PDF this one doesn't need a WebView at all.
// SheetViewer.tsx renders the result as a native scrollable grid.
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';

export interface ParsedSheet {
  name: string;
  rows: string[][];
  columnCount: number;
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
}

const MAX_ROWS_PER_SHEET = 500; // a preview, not a spreadsheet editor — keeps the native grid responsive on huge files
const MAX_COLS_PER_SHEET = 60;

export async function parseXlsx(localPath: string): Promise<ParsedWorkbook> {
  const base64 = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
  const workbook = XLSX.read(base64, { type: 'base64' });

  const sheets: ParsedSheet[] = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false, blankrows: true });
    const truncatedRows = aoa.slice(0, MAX_ROWS_PER_SHEET);
    const columnCount = Math.min(MAX_COLS_PER_SHEET, truncatedRows.reduce((max, row) => Math.max(max, row.length), 0));
    const rows = truncatedRows.map((row) => {
      const cells = row.slice(0, columnCount).map((cell) => (cell == null ? '' : String(cell)));
      while (cells.length < columnCount) cells.push('');
      return cells;
    });
    return { name, rows, columnCount };
  });

  return { sheets };
}

export function columnLabel(index: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA, ... (spreadsheet-style base-26 letters)
  let n = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}
