/**
 * Gestión de contraseñas (A04 y A07:2025).
 *
 * - Hash Argon2id con los parámetros mínimos recomendados por la OWASP Password Storage
 *   Cheat Sheet (m=19 MiB, t=2, p=1). Cada hash incluye su propia sal aleatoria.
 * - Política referenciada a NIST SP 800-63B-4 y OWASP ASVS 5.0: longitud mínima de 15 caracteres
 *   (exigida por NIST cuando la contraseña es el único factor) y máxima de 128, sin exigir
 *   mayúsculas, números ni símbolos, y rechazo de contraseñas comunes, triviales o relacionadas
 *   con el usuario. Desviaciones documentadas en SECURITY.md: normalización Unicode NFKC (NIST
 *   recomienda NFC; ASVS 6.2.8) y mínimo de cinco caracteres distintos (ASVS 6.2.5).
 * - Rehash transparente si los parámetros del hash almacenado quedan obsoletos (agilidad
 *   criptográfica).
 */
import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { env } from '../config/env.js';
import { COMMON_PASSWORDS } from './common-passwords.js';
import { logger } from './logger.js';

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456, // KiB (19 MiB)
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

const normalize = (password: string) => password.normalize('NFKC');

export async function hashPassword(password: string): Promise<string> {
  return hash(normalize(password), ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, normalize(password));
  } catch (error) {
    // Un hash corrupto nunca debe permitir el acceso (fallo seguro).
    logger.error({ err: error }, 'Error verificando hash de contraseña');
    return false;
  }
}

/**
 * Hash de referencia para igualar el tiempo de respuesta cuando el usuario no existe y
 * evitar así la enumeración de cuentas por temporización.
 */
let dummyHashPromise: Promise<string> | undefined;
export async function burnPasswordVerification(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString('base64'));
  await verifyPassword(await dummyHashPromise, password);
}

export function needsRehash(passwordHash: string): boolean {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(passwordHash);
  if (!match) return true;
  const [m, t, p] = match.slice(1).map(Number);
  return m !== ARGON2_OPTIONS.memoryCost || t !== ARGON2_OPTIONS.timeCost || p !== ARGON2_OPTIONS.parallelism;
}

export interface PasswordContext {
  email?: string | undefined;
  name?: string | undefined;
}

/** Devuelve la lista de problemas de la contraseña (vacía si es aceptable). */
export async function checkPasswordPolicy(password: string, context: PasswordContext = {}): Promise<string[]> {
  const problems: string[] = [];
  const value = normalize(password);
  const length = [...value].length;
  if (length < PASSWORD_MIN_LENGTH) problems.push(`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  if (length > PASSWORD_MAX_LENGTH) problems.push(`No puede superar ${PASSWORD_MAX_LENGTH} caracteres.`);
  if (problems.length > 0) return problems;

  const lower = value.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) problems.push('Es una contraseña demasiado común.');
  if (new Set(value).size < 5) problems.push('Contiene muy pocos caracteres distintos.');

  const contextWords = [context.email?.split('@')[0], ...(context.name?.split(/\s+/) ?? []), 'gastoseguro']
    .filter((word): word is string => Boolean(word && word.length >= 4))
    .map((word) => word.toLowerCase());
  if (contextWords.some((word) => lower.includes(word))) {
    problems.push('No debe contener tu nombre, tu correo ni el nombre de la aplicación.');
  }

  if (problems.length === 0 && env.PASSWORD_BREACH_CHECK === 'hibp' && (await isBreachedPassword(value))) {
    problems.push('Esta contraseña aparece en filtraciones de datos conocidas. Elige otra.');
  }
  return problems;
}

/**
 * Consulta Have I Been Pwned mediante k-anonimato: solo se envían los 5 primeros caracteres
 * del SHA-1 de la contraseña. Si el servicio no responde se registra el incidente y no se
 * bloquea al usuario: es un control complementario (decisión documentada de "fail-open").
 */
async function isBreachedPassword(password: string): Promise<boolean> {
  const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'GastoSeguro' },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    return body.split('\n').some((line) => {
      const [hashSuffix, count] = line.trim().split(':');
      return hashSuffix === suffix && Number(count) > 0;
    });
  } catch (error) {
    logger.warn({ err: error }, 'No se pudo consultar el servicio de contraseñas filtradas');
    return false;
  }
}
