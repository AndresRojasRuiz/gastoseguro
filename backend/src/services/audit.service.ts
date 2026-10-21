/**
 * Registro de auditoría a prueba de manipulaciones (A08 y A09:2025).
 *
 * Cada entrada almacena el hash de la anterior (prevHash) y su propio hash, calculado como
 * HMAC-SHA256(clave_auditoría, contenido_canónico || prevHash). Cualquier modificación,
 * borrado o inserción posterior rompe la cadena y se detecta con verifyAuditChain().
 * Al usar HMAC en lugar de un hash simple, un atacante con acceso de escritura a la base de
 * datos no puede recalcular la cadena sin conocer la clave, que reside fuera de ella.
 *
 * Las escrituras se serializan con una cola en memoria para preservar el orden de la cadena
 * (limitación documentada: con varias réplicas se usaría un almacén de solo anexado).
 */
import { auditHmac } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import type { ClientInfo } from '../middleware/request-context.js';

export const GENESIS_HASH = '0'.repeat(64);

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export type AuditAction =
  | 'AUTH_REGISTER'
  | 'AUTH_LOGIN'
  | 'AUTH_LOGIN_MFA'
  | 'AUTH_LOGOUT'
  | 'AUTH_REFRESH'
  | 'AUTH_TOKEN_REUSE'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_SESSION_REVOKED'
  | 'ACCOUNT_PASSWORD_CHANGE'
  | 'ACCOUNT_PROFILE_UPDATE'
  | 'ACCOUNT_MFA_ENABLE'
  | 'ACCOUNT_MFA_DISABLE'
  | 'ACCOUNT_DELETE'
  | 'ACCESS_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'CATEGORY_CREATE'
  | 'CATEGORY_UPDATE'
  | 'CATEGORY_DELETE'
  | 'EXPENSE_CREATE'
  | 'EXPENSE_UPDATE'
  | 'EXPENSE_DELETE'
  | 'RECEIPT_UPLOAD'
  | 'RECEIPT_DOWNLOAD'
  | 'RECEIPT_DELETE'
  | 'RECEIPT_REJECTED'
  | 'REPORT_EXPORT'
  | 'ADMIN_USER_UPDATE'
  | 'ADMIN_USER_UNLOCK'
  | 'ADMIN_MFA_RESET'
  | 'ADMIN_SESSIONS_REVOKED'
  | 'AUDIT_VERIFY'
  | 'ALERT_RAISED'
  | 'ALERT_ACKNOWLEDGED'
  | 'DATA_RETENTION_PURGE';

export interface AuditEvent {
  action: AuditAction;
  outcome: AuditOutcome;
  userId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
  client?: Partial<ClientInfo>;
}

interface CanonicalEntry {
  createdAt: string;
  action: string;
  outcome: string;
  userId: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  details: string | null;
  prevHash: string;
}

/** Serialización canónica con orden de campos fijo: misma entrada => mismo hash. */
function canonicalize(entry: CanonicalEntry): string {
  return JSON.stringify([
    entry.createdAt,
    entry.action,
    entry.outcome,
    entry.userId,
    entry.actorEmail,
    entry.targetType,
    entry.targetId,
    entry.ip,
    entry.userAgent,
    entry.requestId,
    entry.details,
    entry.prevHash,
  ]);
}

export const computeAuditHash = (entry: CanonicalEntry): string => auditHmac(canonicalize(entry));

let queue: Promise<unknown> = Promise.resolve();

async function writeEntry(event: AuditEvent): Promise<void> {
  const last = await prisma.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
  const createdAt = new Date();
  const entry: CanonicalEntry = {
    createdAt: createdAt.toISOString(),
    action: event.action,
    outcome: event.outcome,
    userId: event.userId ?? null,
    actorEmail: event.actorEmail ?? null,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    ip: event.client?.ip ?? null,
    userAgent: event.client?.userAgent ?? null,
    requestId: event.client?.requestId ?? null,
    details: event.details ? JSON.stringify(event.details).slice(0, 2000) : null,
    prevHash: last?.hash ?? GENESIS_HASH,
  };
  await prisma.auditLog.create({ data: { ...entry, createdAt, hash: computeAuditHash(entry) } });
}

/**
 * Registra un evento de auditoría. Si el almacenamiento falla, el evento completo se envía
 * al logger como canal secundario para no perderlo, y la operación de negocio continúa.
 */
export function audit(event: AuditEvent): Promise<void> {
  const task = queue.then(() => writeEntry(event));
  queue = task.catch(() => undefined);
  return task.catch((error: unknown) => {
    logger.error({ err: error, auditEvent: event }, 'No se pudo persistir el evento de auditoría');
  });
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  brokenAtId?: number;
  reason?: string;
}

/** Recorre toda la cadena en bloques y recalcula cada HMAC. */
export async function verifyAuditChain(): Promise<ChainVerification> {
  await queue;
  let previousHash = GENESIS_HASH;
  let lastId = 0;
  let checked = 0;
  const batchSize = 500;
  for (;;) {
    const rows = await prisma.auditLog.findMany({ where: { id: { gt: lastId } }, orderBy: { id: 'asc' }, take: batchSize });
    if (rows.length === 0) break;
    for (const row of rows) {
      if (row.prevHash !== previousHash) {
        return { valid: false, checked, brokenAtId: row.id, reason: 'El enlace con la entrada anterior no coincide (entrada eliminada o reordenada).' };
      }
      const expected = computeAuditHash({
        createdAt: row.createdAt.toISOString(),
        action: row.action,
        outcome: row.outcome,
        userId: row.userId,
        actorEmail: row.actorEmail,
        targetType: row.targetType,
        targetId: row.targetId,
        ip: row.ip,
        userAgent: row.userAgent,
        requestId: row.requestId,
        details: row.details,
        prevHash: row.prevHash,
      });
      if (expected !== row.hash) {
        return { valid: false, checked, brokenAtId: row.id, reason: 'El contenido de la entrada ha sido modificado.' };
      }
      previousHash = row.hash;
      lastId = row.id;
      checked += 1;
    }
  }
  return { valid: true, checked };
}

/** Espera a que se hayan persistido los eventos pendientes (útil en pruebas y apagado). */
export const flushAudit = () => queue;
