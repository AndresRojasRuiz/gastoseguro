/**
 * Gestión de la propia cuenta: perfil, contraseña, segundo factor y sesiones (A07:2025).
 *
 * Las operaciones sensibles (cambiar contraseña, desactivar MFA, cerrar sesiones o suprimir
 * la cuenta) exigen reautenticación con la contraseña actual y, en su caso, un código TOTP
 * válido. Tras cambiar la contraseña o activar MFA se revocan las demás sesiones abiertas
 * para expulsar a un posible atacante.
 */
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import type { Currency } from '../lib/money.js';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { buildOtpAuthUrl, generateTotpSecret, verifyTotp } from '../lib/totp.js';
import type { ClientInfo } from '../middleware/request-context.js';
import type { AuthContext } from '../types/express.js';
import { audit } from './audit.service.js';
import { revokeUserSessions, toPublicUser } from './auth.service.js';
import { deleteUserData } from './retention.service.js';

const mfaAad = (userId: string) => `mfa:${userId}`;

async function loadUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  return user;
}

export async function getProfile(auth: AuthContext) {
  return toPublicUser(await loadUser(auth.userId));
}

export async function updateProfile(auth: AuthContext, input: { name?: string | undefined; currency?: Currency | undefined }, client: ClientInfo) {
  const user = await loadUser(auth.userId);
  if (input.currency && input.currency !== user.currency) {
    // Los importes se guardan en unidades menores de la moneda: cambiarla con gastos
    // registrados alteraría su valor, por lo que solo se permite con la cuenta vacía.
    const expenses = await prisma.expense.count({ where: { userId: user.id, deletedAt: null } });
    if (expenses > 0) throw conflict('No se puede cambiar la moneda cuando ya hay gastos registrados.');
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { ...(input.name ? { name: input.name } : {}), ...(input.currency ? { currency: input.currency } : {}) },
  });
  await audit({
    action: 'ACCOUNT_PROFILE_UPDATE',
    outcome: 'SUCCESS',
    userId: user.id,
    actorEmail: user.email,
    details: { fields: Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined) },
    client,
  });
  return toPublicUser(updated);
}

export async function changePassword(auth: AuthContext, input: { currentPassword: string; newPassword: string }, client: ClientInfo) {
  const user = await loadUser(auth.userId);
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    await audit({ action: 'ACCOUNT_PASSWORD_CHANGE', outcome: 'FAILURE', userId: user.id, actorEmail: user.email, details: { reason: 'INVALID_CURRENT_PASSWORD' }, client });
    throw badRequest('La contraseña actual no es correcta.');
  }
  if (input.currentPassword === input.newPassword) {
    throw badRequest('La nueva contraseña debe ser distinta de la actual.');
  }
  const problems = await checkPasswordPolicy(input.newPassword, { email: user.email, name: user.name });
  if (problems.length > 0) {
    throw badRequest('La contraseña no cumple la política de seguridad.', problems.map((message) => ({ field: 'newPassword', message })));
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date() },
  });
  const revoked = await revokeUserSessions(user.id, 'PASSWORD_CHANGED', auth.sessionId);
  await audit({ action: 'ACCOUNT_PASSWORD_CHANGE', outcome: 'SUCCESS', userId: user.id, actorEmail: user.email, details: { revokedSessions: revoked }, client });
  return { revokedSessions: revoked };
}

// --- Segundo factor (TOTP) -----------------------------------------------------------------

export async function startMfaSetup(auth: AuthContext) {
  const user = await loadUser(auth.userId);
  if (user.mfaEnabled) throw conflict('El segundo factor ya está activado.');
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: user.id }, data: { mfaPendingSecretEnc: encryptSecret(secret, mfaAad(user.id)) } });
  return { secret, otpauthUrl: buildOtpAuthUrl(secret, user.email) };
}

export async function enableMfa(auth: AuthContext, code: string, password: string, client: ClientInfo) {
  const user = await loadUser(auth.userId);
  if (user.mfaEnabled) throw conflict('El segundo factor ya está activado.');
  if (!user.mfaPendingSecretEnc) throw badRequest('Primero debes iniciar la configuración del segundo factor.');
  // Con un token de acceso robado no debe poder vincularse un autenticador del atacante.
  if (!(await verifyPassword(user.passwordHash, password))) {
    await audit({ action: 'ACCOUNT_MFA_ENABLE', outcome: 'FAILURE', userId: user.id, actorEmail: user.email, details: { reason: 'REAUTHENTICATION_FAILED' }, client });
    throw badRequest('La contraseña no es correcta.');
  }
  const secret = decryptSecret(user.mfaPendingSecretEnc, mfaAad(user.id));
  const step = verifyTotp(secret, code);
  if (step === null) {
    await audit({ action: 'ACCOUNT_MFA_ENABLE', outcome: 'FAILURE', userId: user.id, actorEmail: user.email, details: { reason: 'INVALID_CODE' }, client });
    throw badRequest('El código no es válido. Comprueba la hora de tu dispositivo e inténtalo de nuevo.');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true, mfaSecretEnc: user.mfaPendingSecretEnc, mfaPendingSecretEnc: null, mfaLastUsedStep: step },
  });
  const revoked = await revokeUserSessions(user.id, 'MFA_ENABLED', auth.sessionId);
  await audit({ action: 'ACCOUNT_MFA_ENABLE', outcome: 'SUCCESS', userId: user.id, actorEmail: user.email, details: { revokedSessions: revoked }, client });
}

export async function disableMfa(auth: AuthContext, input: { password: string; code: string }, client: ClientInfo) {
  const user = await loadUser(auth.userId);
  if (!user.mfaEnabled || !user.mfaSecretEnc) throw conflict('El segundo factor no está activado.');
  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  const step = passwordOk ? verifyTotp(decryptSecret(user.mfaSecretEnc, mfaAad(user.id)), input.code, { lastUsedStep: user.mfaLastUsedStep }) : null;
  if (!passwordOk || step === null) {
    await audit({ action: 'ACCOUNT_MFA_DISABLE', outcome: 'FAILURE', userId: user.id, actorEmail: user.email, details: { reason: 'REAUTHENTICATION_FAILED' }, client });
    throw badRequest('La contraseña o el código no son correctos.');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaLastUsedStep: null },
  });
  await audit({ action: 'ACCOUNT_MFA_DISABLE', outcome: 'SUCCESS', userId: user.id, actorEmail: user.email, client });
}

// --- Sesiones y actividad ------------------------------------------------------------------

export async function listSessions(auth: AuthContext) {
  const sessions = await prisma.session.findMany({
    where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
    select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true, ip: true, userAgent: true },
  });
  return sessions.map((session) => ({ ...session, current: session.id === auth.sessionId }));
}

/**
 * Reautenticación con la contraseña antes de cerrar sesiones (OWASP ASVS 5.0, 7.5.2): un
 * token de acceso robado no basta para expulsar al titular legítimo de la cuenta.
 */
async function reauthenticate(auth: AuthContext, password: string, client: ClientInfo, scope: string) {
  const user = await loadUser(auth.userId);
  if (!(await verifyPassword(user.passwordHash, password))) {
    await audit({ action: 'AUTH_SESSION_REVOKED', outcome: 'FAILURE', userId: user.id, actorEmail: user.email, details: { reason: 'REAUTHENTICATION_FAILED', scope }, client });
    throw badRequest('La contraseña no es correcta.');
  }
}

export async function revokeSession(auth: AuthContext, sessionId: string, password: string, client: ClientInfo) {
  await reauthenticate(auth, password, client, 'single');
  // La condición userId impide revocar sesiones ajenas (control de acceso a nivel de objeto).
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId: auth.userId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: 'USER_REVOKED' },
  });
  if (result.count === 0) throw notFound('La sesión no existe o ya fue cerrada.');
  await audit({ action: 'AUTH_SESSION_REVOKED', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'Session', targetId: sessionId, client });
}

export async function revokeOtherSessions(auth: AuthContext, password: string, client: ClientInfo) {
  await reauthenticate(auth, password, client, 'others');
  const revoked = await revokeUserSessions(auth.userId, 'USER_REVOKED_ALL', auth.sessionId);
  await audit({ action: 'AUTH_SESSION_REVOKED', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, details: { revokedSessions: revoked, scope: 'others' }, client });
  return { revokedSessions: revoked };
}

// --- Supresión de la cuenta (RGPD art. 17) --------------------------------------------------

export async function deleteAccount(auth: AuthContext, input: { password: string; code?: string | undefined }, client: ClientInfo) {
  const user = await loadUser(auth.userId);
  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  let factorsOk = passwordOk;
  if (passwordOk && user.mfaEnabled && user.mfaSecretEnc) {
    factorsOk = Boolean(input.code) && verifyTotp(decryptSecret(user.mfaSecretEnc, mfaAad(user.id)), input.code ?? '', { lastUsedStep: user.mfaLastUsedStep }) !== null;
  }
  if (!factorsOk) {
    await audit({ action: 'ACCOUNT_DELETE', outcome: 'FAILURE', userId: user.id, actorEmail: user.email, details: { reason: 'REAUTHENTICATION_FAILED' }, client });
    throw badRequest(user.mfaEnabled ? 'La contraseña o el código no son correctos.' : 'La contraseña no es correcta.');
  }
  if (user.role === 'ADMIN') {
    const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    if (activeAdmins <= 1) throw conflict('Eres el único administrador activo: asigna antes el rol a otra persona.');
  }
  const removed = await deleteUserData(user.id);
  // La entrada de auditoría conserva solo el identificador seudónimo de la cuenta suprimida;
  // las anteriores se mantienen durante su plazo por interés legítimo (RGPD art. 17.3).
  await audit({ action: 'ACCOUNT_DELETE', outcome: 'SUCCESS', targetType: 'User', targetId: user.id, details: { ...removed }, client });
}

export async function listOwnActivity(auth: AuthContext) {
  return prisma.auditLog.findMany({
    where: { userId: auth.userId },
    orderBy: { id: 'desc' },
    take: 50,
    select: { id: true, createdAt: true, action: true, outcome: true, ip: true, userAgent: true },
  });
}
