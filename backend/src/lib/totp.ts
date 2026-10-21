/**
 * TOTP (RFC 6238) para el segundo factor de autenticación (A07:2025).
 *
 * Implementación mínima y auditable basada en HMAC-SHA1 (compatible con Google
 * Authenticator, Microsoft Authenticator, FreeOTP, etc.):
 *  - Secretos de 160 bits generados con CSPRNG (RFC 4226, sección 4).
 *  - Ventana de tolerancia de ±1 paso (30 s) para desfases de reloj.
 *  - Protección anti-repetición: un código ya usado (mismo paso o anterior) se rechaza.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { constantTimeEqual } from './crypto.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Carácter base32 no válido');
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226) con truncado dinámico. */
export function hotp(key: Buffer, counter: number, digits = DIGITS, algorithm = 'sha1'): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(algorithm, key).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export const currentTimeStep = (now = Date.now()) => Math.floor(now / 1000 / PERIOD_SECONDS);

/**
 * Verifica un código TOTP. Devuelve el paso temporal aceptado (para registrar su uso y
 * evitar repeticiones) o null si el código no es válido.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { lastUsedStep?: number | null; window?: number; now?: number } = {},
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretBase32);
  const step = currentTimeStep(options.now);
  const window = options.window ?? 1;
  let matched: number | null = null;
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = step + offset;
    if (options.lastUsedStep != null && candidate <= options.lastUsedStep) continue;
    // Se evalúan todos los pasos de la ventana para no filtrar información por tiempo.
    if (constantTimeEqual(hotp(key, candidate), code) && matched === null) matched = candidate;
  }
  return matched;
}

export function buildOtpAuthUrl(secretBase32: string, accountName: string, issuer = 'GastoSeguro'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
