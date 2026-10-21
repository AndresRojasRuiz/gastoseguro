/**
 * Administración de usuarios y consulta de auditoría (A01 y A09:2025).
 *
 * Principio de mínimo privilegio y minimización de datos (RGPD art. 5.1.c): los
 * administradores gestionan cuentas (rol, estado, desbloqueo, reinicio de MFA) pero no
 * tienen acceso a los gastos de los usuarios. Los auditores solo pueden leer el registro de
 * auditoría y las alertas.
 *
 * Salvaguardas: un administrador no puede modificar su propia cuenta desde este panel (evita
 * la auto-escalada o el auto-bloqueo) y siempre debe quedar al menos un administrador activo.
 *
 * Los administradores pueden cerrar las sesiones de un usuario o de todos los usuarios (OWASP
 * ASVS 5.0, 7.4.5), por ejemplo ante una alerta de reutilización de tokens o una brecha.
 */
import type { Prisma as PrismaTypes } from '../generated/prisma/client.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import type { ClientInfo } from '../middleware/request-context.js';
import type { AuthContext } from '../types/express.js';
import { raiseAlert } from './alert.service.js';
import { audit, verifyAuditChain } from './audit.service.js';
import { revokeUserSessions } from './auth.service.js';

const adminUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  mfaEnabled: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies PrismaTypes.UserSelect;

export async function listUsers(query: { q?: string | undefined; page: number; pageSize: number }) {
  const where: PrismaTypes.UserWhereInput = query.q ? { OR: [{ email: { contains: query.q.toLowerCase() } }, { name: { contains: query.q } }] } : {};
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: adminUserSelect }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function loadTarget(auth: AuthContext, userId: string) {
  if (userId === auth.userId) throw forbidden('No puedes modificar tu propia cuenta desde el panel de administración.');
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound('El usuario no existe.');
  return target;
}

export async function updateUser(
  auth: AuthContext,
  userId: string,
  input: { role?: 'USER' | 'AUDITOR' | 'ADMIN' | undefined; status?: 'ACTIVE' | 'DISABLED' | undefined },
  client: ClientInfo,
) {
  const target = await loadTarget(auth, userId);
  const losesAdmin = target.role === 'ADMIN' && ((input.role && input.role !== 'ADMIN') || input.status === 'DISABLED');
  if (losesAdmin) {
    const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    if (activeAdmins <= 1) throw conflict('Debe existir al menos un administrador activo.');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ...(input.role ? { role: input.role } : {}), ...(input.status ? { status: input.status } : {}) },
    select: adminUserSelect,
  });
  // Cualquier cambio de privilegios o estado invalida las sesiones del usuario afectado.
  const revoked = await revokeUserSessions(userId, 'ADMIN_CHANGE');
  const changes = {
    ...(input.role && input.role !== target.role ? { role: { from: target.role, to: input.role } } : {}),
    ...(input.status && input.status !== target.status ? { status: { from: target.status, to: input.status } } : {}),
  };
  await audit({
    action: 'ADMIN_USER_UPDATE',
    outcome: 'SUCCESS',
    userId: auth.userId,
    actorEmail: auth.email,
    targetType: 'User',
    targetId: userId,
    details: { changes, revokedSessions: revoked },
    client,
  });
  if (Object.keys(changes).length > 0) {
    await raiseAlert({
      type: 'PRIVILEGE_CHANGE',
      severity: input.role === 'ADMIN' ? 'HIGH' : 'MEDIUM',
      message: `El administrador ${auth.email} ha modificado la cuenta ${target.email}.`,
      userId,
      ip: client.ip,
      details: changes,
    });
  }
  return updated;
}

export async function unlockUser(auth: AuthContext, userId: string, client: ClientInfo) {
  await loadTarget(auth, userId);
  const updated = await prisma.user.update({ where: { id: userId }, data: { lockedUntil: null, failedLoginCount: 0 }, select: adminUserSelect });
  await audit({ action: 'ADMIN_USER_UNLOCK', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'User', targetId: userId, client });
  return updated;
}

export async function resetUserMfa(auth: AuthContext, userId: string, client: ClientInfo) {
  await loadTarget(auth, userId);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaLastUsedStep: null },
    select: adminUserSelect,
  });
  const revoked = await revokeUserSessions(userId, 'ADMIN_MFA_RESET');
  await audit({ action: 'ADMIN_MFA_RESET', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'User', targetId: userId, details: { revokedSessions: revoked }, client });
  return updated;
}

export async function revokeSessionsOfUser(auth: AuthContext, userId: string, client: ClientInfo) {
  await loadTarget(auth, userId);
  const revoked = await revokeUserSessions(userId, 'ADMIN_REVOKED');
  await audit({ action: 'ADMIN_SESSIONS_REVOKED', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'User', targetId: userId, details: { revokedSessions: revoked }, client });
  return { revokedSessions: revoked };
}

/** Cierre de todas las sesiones de la plataforma salvo la del propio administrador. */
export async function revokeAllSessions(auth: AuthContext, password: string, client: ClientInfo) {
  const admin = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!admin || !(await verifyPassword(admin.passwordHash, password))) {
    await audit({ action: 'ADMIN_SESSIONS_REVOKED', outcome: 'FAILURE', userId: auth.userId, actorEmail: auth.email, details: { scope: 'all', reason: 'REAUTHENTICATION_FAILED' }, client });
    throw badRequest('La contraseña no es correcta.');
  }
  const result = await prisma.session.updateMany({
    where: { revokedAt: null, id: { not: auth.sessionId } },
    data: { revokedAt: new Date(), revokeReason: 'ADMIN_REVOKED_ALL' },
  });
  await audit({ action: 'ADMIN_SESSIONS_REVOKED', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, details: { scope: 'all', revokedSessions: result.count }, client });
  await raiseAlert({
    type: 'PRIVILEGE_CHANGE',
    severity: 'HIGH',
    message: `El administrador ${auth.email} ha cerrado todas las sesiones de la plataforma (${result.count}).`,
    userId: auth.userId,
    ip: client.ip,
    details: { revokedSessions: result.count },
  });
  return { revokedSessions: result.count };
}

// --- Auditoría y alertas ------------------------------------------------------------------

export async function listAuditLogs(query: { action?: string | undefined; outcome?: string | undefined; userId?: string | undefined; page: number; pageSize: number }) {
  const where: PrismaTypes.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function verifyChain(auth: AuthContext, client: ClientInfo) {
  const result = await verifyAuditChain();
  await audit({ action: 'AUDIT_VERIFY', outcome: result.valid ? 'SUCCESS' : 'FAILURE', userId: auth.userId, actorEmail: auth.email, details: { ...result }, client });
  if (!result.valid) {
    await raiseAlert({
      type: 'AUDIT_TAMPERING',
      severity: 'CRITICAL',
      message: `La cadena de auditoría está rota en la entrada ${result.brokenAtId}: ${result.reason}`,
      ip: client.ip,
      details: { ...result },
    });
  }
  return result;
}

export async function listAlerts(query: { status: 'open' | 'all'; page: number; pageSize: number }) {
  const where: PrismaTypes.SecurityAlertWhereInput = query.status === 'open' ? { acknowledgedAt: null } : {};
  const [total, items] = await Promise.all([
    prisma.securityAlert.count({ where }),
    prisma.securityAlert.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function acknowledgeAlert(auth: AuthContext, alertId: string, client: ClientInfo) {
  const result = await prisma.securityAlert.updateMany({
    where: { id: alertId, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedBy: auth.email },
  });
  if (result.count === 0) throw notFound('La alerta no existe o ya fue revisada.');
  await audit({ action: 'ALERT_ACKNOWLEDGED', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'SecurityAlert', targetId: alertId, client });
}
