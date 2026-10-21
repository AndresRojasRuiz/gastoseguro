/**
 * Primitivas criptográficas (A04:2025 - Cryptographic Failures).
 *
 * Solo se usan algoritmos modernos del módulo nativo node:crypto (OpenSSL):
 *  - AES-256-GCM (cifrado autenticado) para secretos en reposo, con IV aleatorio de 96 bits
 *    y datos asociados (AAD) que vinculan el texto cifrado a su propietario.
 *  - SHA-256 / HMAC-SHA256 para huellas de tokens y la cadena de auditoría.
 *  - CSPRNG (randomBytes) para todos los valores secretos.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

const DATA_KEY = Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64');
const AUDIT_KEY = Buffer.from(env.AUDIT_HMAC_KEY, 'base64');
const FORMAT_VERSION = 'v1';

/** Cifra un texto con AES-256-GCM. El resultado tiene el formato v1.iv.ciphertext.tag (base64url). */
export function encryptSecret(plaintext: string, associatedData: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', DATA_KEY, iv);
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join('.');
}

/** Descifra y verifica la integridad. Lanza una excepción si el dato ha sido alterado. */
export function decryptSecret(payload: string, associatedData: string): string {
  const [version, iv, ciphertext, tag] = payload.split('.');
  if (version !== FORMAT_VERSION || !iv || !ciphertext || !tag) {
    throw new Error('Formato de dato cifrado no reconocido');
  }
  const decipher = createDecipheriv('aes-256-gcm', DATA_KEY, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

/** Token aleatorio criptográficamente seguro (por defecto 256 bits). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sha256Hex = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

export const auditHmac = (value: string): string => createHmac('sha256', AUDIT_KEY).update(value, 'utf8').digest('hex');

/** Comparación en tiempo constante para evitar ataques de temporización. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
