import { Injectable } from '@angular/core';

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
    const headers = options.columns.map((column) => `<th>${this.escapeHtml(column.header)}</th>`).join('');
    const body = options.rows
      .map((row) => {
        const cells = options.columns
          .map((column) => {
            const value = column.value(row);
            return `<td>${this.escapeHtml(value === null || value === undefined ? '' : String(value))}</td>`;
          })
          .join('');

        return `<tr>${cells}</tr>`;
      })
      .join('');

    const workbook = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      table { border-collapse: collapse; width: 100%; font-family: Segoe UI, Arial, sans-serif; }
      th, td { border: 1px solid #d7deea; padding: 8px 10px; text-align: left; vertical-align: top; }
      th { background: #f2f6fc; font-weight: 700; }
    </style>
  </head>
  <body>
    <table data-sheet-name="${this.escapeHtml(options.sheetName)}">
      <thead><tr>${headers}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`;

    const blob = new Blob(['\ufeff', workbook], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = options.filename.endsWith('.xls') ? options.filename : `${options.filename}.xls`;
    anchor.style.display = 'none';

    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
