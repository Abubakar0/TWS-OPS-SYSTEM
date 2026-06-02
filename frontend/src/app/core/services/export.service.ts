import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  exportAsExcelTable<T>(options: {
    filename: string;
    sheetName: string;
    columns: ExportColumn<T>[];
    rows: T[];
  }): void {
    const rows = options.rows.map((row) =>
      Object.fromEntries(
        options.columns.map((column) => {
          const value = column.value(row);
          return [column.header, value ?? ''];
        }),
      ),
    );

    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: options.columns.map((column) => column.header),
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName.slice(0, 31) || 'Sheet1');

    const fileBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([fileBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = this.normalizeExcelFilename(options.filename);
    anchor.style.display = 'none';

    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  exportAsCsv<T>(options: {
    filename: string;
    columns: ExportColumn<T>[];
    rows: T[];
  }): void {
    const lines = [
      options.columns.map((column) => this.escapeCsv(column.header)).join(','),
      ...options.rows.map((row) =>
        options.columns
          .map((column) => {
            const value = column.value(row);
            return this.escapeCsv(value === null || value === undefined ? '' : String(value));
          })
          .join(','),
      ),
    ];

    const blob = new Blob(['\ufeff', lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = options.filename.endsWith('.csv') ? options.filename : `${options.filename}.csv`;
    anchor.style.display = 'none';

    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  private normalizeExcelFilename(filename: string): string {
    const baseName = filename.replace(/\.xls[x]?$/i, '');
    return `${baseName}.xlsx`;
  }

  private escapeCsv(value: string): string {
    const normalized = value.replaceAll('"', '""');
    return /[",\r\n]/.test(normalized) ? `"${normalized}"` : normalized;
  }
}
