/**
 * Conversión segura de importes (A06:2025 - Insecure Design).
 *
 * Los importes se reciben como texto decimal y se almacenan como enteros en la unidad
 * monetaria menor (céntimos), lo que evita los errores de redondeo de la coma flotante y
 * permite fijar límites de negocio exactos.
 */
export const CURRENCIES = ['EUR', 'USD', 'CLP'] as const;
export type Currency = (typeof CURRENCIES)[number];

const DECIMALS: Record<Currency, number> = { EUR: 2, USD: 2, CLP: 0 };

/** Importe máximo por gasto, expresado en unidades mayores. */
const MAX_MAJOR_UNITS: Record<Currency, number> = { EUR: 1_000_000, USD: 1_000_000, CLP: 1_000_000_000 };

export function currencyDecimals(currency: Currency): number {
  return DECIMALS[currency];
}

/** Convierte "1234.56" o "1234,56" en unidades menores. Devuelve null si el formato no es válido. */
export function parseAmount(input: string, currency: Currency): number | null {
  const decimals = DECIMALS[currency];
  const parts = input.trim().replace(',', '.').split('.');
  if (parts.length > 2) return null;
  const [integerPart = '', fractionPart = ''] = parts;
  // Expresiones acotadas y sin grupos anidados: tiempo de evaluación lineal (sin ReDoS).
  if (!/^\d{1,10}$/.test(integerPart)) return null;
  if (parts.length === 2 && (decimals === 0 || !/^\d{1,2}$/.test(fractionPart))) return null;
  const minor = Number(integerPart) * 10 ** decimals + Number(fractionPart.padEnd(decimals, '0') || '0');
  if (!Number.isSafeInteger(minor) || minor <= 0) return null;
  if (minor > MAX_MAJOR_UNITS[currency] * 10 ** decimals) return null;
  return minor;
}

export function formatAmount(minor: number, currency: Currency): string {
  const decimals = DECIMALS[currency];
  if (decimals === 0) return String(minor);
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  const integerPart = Math.floor(absolute / 10 ** decimals);
  const fractionPart = String(absolute % 10 ** decimals).padStart(decimals, '0');
  return `${sign}${integerPart}.${fractionPart}`;
}
