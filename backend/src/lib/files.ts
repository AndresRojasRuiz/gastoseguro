/**
 * Validación y almacenamiento seguro de justificantes (A01, A05 y A08:2025).
 *
 * - El tipo de fichero se determina por su firma ("magic bytes"), nunca por la extensión ni
 *   por el Content-Type declarado por el cliente (CWE-434).
 * - Solo se admite una lista blanca de formatos: PDF, PNG, JPEG y WebP.
 * - Se almacenan fuera de la raíz web con un nombre aleatorio (UUID) sin extensión, de forma
 *   que el nombre facilitado por el usuario nunca interviene en la ruta (CWE-22).
 * - Se calcula la huella SHA-256 para verificar la integridad en cada descarga.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- Hallazgo SAST revisado (falso
   positivo): las rutas proceden de la configuración (UPLOAD_DIR) o de resolveStoredPath(), que
   solo acepta UUID y comprueba que la ruta resuelta no sale del directorio de almacenamiento. */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { sha256Hex } from './crypto.js';
import { logger } from './logger.js';

export const ALLOWED_TYPES = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

export type AllowedMimeType = keyof typeof ALLOWED_TYPES;

const startsWith = (buffer: Buffer, signature: number[], offset = 0) =>
  buffer.length >= offset + signature.length && signature.every((byte, index) => buffer[offset + index] === byte);

/** Detecta el tipo real del fichero a partir de su contenido. */
export function detectFileType(buffer: Buffer): AllowedMimeType | null {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

/** Sanea el nombre original para mostrarlo: sin rutas, sin caracteres de control y acotado. */
export function sanitizeFileName(name: string, mimeType: AllowedMimeType): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  const withoutExtension = base.replace(/\.[^.]*$/, '');
  const safe = withoutExtension
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _().-]/gu, '_')
    .replace(/^[.\s]+/, '')
    .slice(0, 80)
    .trim();
  return `${safe || 'justificante'}.${ALLOWED_TYPES[mimeType]}`;
}

const uploadRoot = path.resolve(env.UPLOAD_DIR);

/** Resuelve la ruta física de un fichero almacenado garantizando que no sale del directorio. */
export function resolveStoredPath(storedName: string): string {
  if (!/^[0-9a-f-]{36}$/.test(storedName)) throw new Error('Nombre de fichero almacenado no válido');
  const fullPath = path.resolve(uploadRoot, storedName);
  if (path.dirname(fullPath) !== uploadRoot) throw new Error('Ruta fuera del directorio de almacenamiento');
  return fullPath;
}

export async function ensureUploadDir(): Promise<void> {
  await mkdir(uploadRoot, { recursive: true });
}

/** Escribe el fichero de forma atómica (fichero temporal + renombrado). */
export async function storeFile(content: Buffer): Promise<{ storedName: string; sha256: string }> {
  await ensureUploadDir();
  const storedName = randomUUID();
  const finalPath = resolveStoredPath(storedName);
  const temporaryPath = `${finalPath}.tmp`;
  await writeFile(temporaryPath, content, { flag: 'wx', mode: 0o600 });
  await rename(temporaryPath, finalPath);
  return { storedName, sha256: sha256Hex(content) };
}

export async function readStoredFile(storedName: string, expectedSha256: string): Promise<Buffer> {
  const content = await readFile(resolveStoredPath(storedName));
  if (sha256Hex(content) !== expectedSha256) {
    throw new Error('La huella del justificante no coincide: posible manipulación');
  }
  return content;
}

/** Elimina un fichero almacenado; los fallos se registran pero no interrumpen la operación. */
export async function deleteStoredFile(storedName: string): Promise<void> {
  try {
    await unlink(resolveStoredPath(storedName));
  } catch (error) {
    logger.warn({ err: error, storedName }, 'No se pudo eliminar el fichero almacenado');
  }
}
