// Lightweight CSV helpers for client-side data export. No dependency — the
// data sets exported from SmartKey dashboards are small enough to build in memory.

type CsvCell = string | number | null | undefined;

const escapeCell = (value: CsvCell): string => {
  const s = value == null ? '' : String(value);
  // Quote any cell containing a comma, quote, or newline; double up inner quotes.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

export const toCsv = (headers: string[], rows: CsvCell[][]): string =>
  [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');

export const downloadCsv = (filename: string, csv: string): void => {
  // Prepend a UTF-8 BOM so Excel opens accented names correctly.
  const blob = new Blob(['﻿', csv], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
