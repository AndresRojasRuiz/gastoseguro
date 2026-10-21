/**
 * Generación de CSV resistente a "CSV/Formula Injection" (A05:2025 - Injection, CWE-1236).
 *
 * Si un campo comienza por =, +, -, @, tabulador o retorno de carro, una hoja de cálculo
 * podría interpretarlo como fórmula y ejecutar acciones (p. ej. =HYPERLINK o DDE). Siguiendo
 * la recomendación de OWASP, esos valores se prefijan con una comilla simple y todos los
 * campos se encierran entre comillas dobles, duplicando las comillas internas.
 */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;
const UTF8_BOM = String.fromCharCode(0xfeff);

export function escapeCsvField(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_TRIGGERS.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvField).join(';'));
  // BOM UTF-8 para que las hojas de cálculo detecten correctamente la codificación.
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
