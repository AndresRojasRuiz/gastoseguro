/**
 * Conservación y supresión de datos (RGPD arts. 5.1.c, 5.1.e y 17).
 *
 * - purgeExpiredData(): elimina definitivamente los gastos borrados lógicamente (y sus
 *   justificantes) una vez superado el plazo de conservación, las sesiones caducadas o
 *   revocadas y los desafíos de segundo factor vencidos. Se ejecuta al arrancar el servidor y
 *   periódicamente, y también bajo demanda con "npm run db:purge".
 * - deleteUserData(): supresión completa de una cuenta y de todos sus datos personales.
 *
 * El registro de auditoría y las alertas no se purgan aquí: su conservación se basa en el
 * interés legítimo en la seguridad de la red y de la información (RGPD considerando 49 y
 * art. 17.3), y su borrado parcial rompería la cadena HMAC. Su plazo (12 meses) se aplica
 * mediante archivado y rotación, como se documenta en la memoria.
 */
import { env } from '../config/env.js';
import { deleteStoredFile } from '../lib/files.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import type { ClientInfo } from '../middleware/request-context.js';
import { audit } from './audit.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_RETENTION_MS = DAY_MS;

export interface PurgeResult {
  expenses: number;
  receipts: number;
  sessions: number;
  loginChallenges: number;
}

const SYSTEM_CLIENT: ClientInfo = { ip: null, userAgent: null, requestId: 'retention-job' };

export async function purgeExpiredData(now = new Date(), client: ClientInfo = SYSTEM_CLIENT): Promise<PurgeResult> {
  const expenseCutoff = new Date(now.getTime() - env.RETENTION_DELETED_EXPENSES_DAYS * DAY_MS);
  const sessionCutoff = new Date(now.getTime() - env.RETENTION_SESSIONS_DAYS * DAY_MS);
  const challengeCutoff = new Date(now.getTime() - CHALLENGE_RETENTION_MS);

  const expired = await prisma.expense.findMany({
    where: { deletedAt: { lt: expenseCutoff } },
    select: { id: true, receipt: { select: { storedName: true } } },
  });
  const expenseIds = expired.map((expense) => expense.id);
  const storedNames = expired.flatMap((expense) => (expense.receipt ? [expense.receipt.storedName] : []));

  const [, expenses, sessions, loginChallenges] = await prisma.$transaction([
    prisma.receipt.deleteMany({ where: { expenseId: { in: expenseIds } } }),
    prisma.expense.deleteMany({ where: { id: { in: expenseIds } } }),
    prisma.session.deleteMany({ where: { OR: [{ revokedAt: { lt: sessionCutoff } }, { expiresAt: { lt: sessionCutoff } }] } }),
    prisma.loginChallenge.deleteMany({ where: { expiresAt: { lt: challengeCutoff } } }),
  ]);
  // Los ficheros se eliminan tras confirmar la transacción: si esta fallase, no se pierde
  // ningún justificante que la base de datos aún referencie.
  await Promise.all(storedNames.map((storedName) => deleteStoredFile(storedName)));

  const result = { expenses: expenses.count, receipts: storedNames.length, sessions: sessions.count, loginChallenges: loginChallenges.count };
  if (Object.values(result).some((count) => count > 0)) {
    await audit({ action: 'DATA_RETENTION_PURGE', outcome: 'SUCCESS', details: { ...result }, client });
  }
  return result;
}

/** Programa la purga periódica. Devuelve una función para detenerla. */
export function scheduleRetentionPurge(): () => void {
  if (env.RETENTION_PURGE_INTERVAL_HOURS === 0) return () => undefined;
  const run = () => {
    purgeExpiredData().then(
      (result) => logger.info({ result }, 'Purga de datos caducados completada'),
      (error: unknown) => logger.error({ err: error }, 'Error en la purga de datos caducados'),
    );
  };
  run();
  const timer = setInterval(run, env.RETENTION_PURGE_INTERVAL_HOURS * 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}

/**
 * Supresión completa de una cuenta (derecho de supresión, RGPD art. 17). Los borrados se
 * ordenan explícitamente (justificantes, gastos, categorías y cuenta) para no depender del
 * orden de las acciones en cascada de cada motor de base de datos.
 */
export async function deleteUserData(userId: string): Promise<{ expenses: number; receipts: number }> {
  const receipts = await prisma.receipt.findMany({ where: { expense: { userId } }, select: { storedName: true } });
  const [, expenses] = await prisma.$transaction([
    prisma.receipt.deleteMany({ where: { expense: { userId } } }),
    prisma.expense.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  await Promise.all(receipts.map((receipt) => deleteStoredFile(receipt.storedName)));
  return { expenses: expenses.count, receipts: receipts.length };
}
