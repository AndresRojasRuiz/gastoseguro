/**
 * Servicio de autenticación y gestión de sesiones (A04, A07 y A09:2025).
 *
 * Controles principales:
 *  - Mensajes de error genéricos y tiempos de respuesta igualados para impedir la
 *    enumeración de cuentas (CWE-203, CWE-204).
 *  - Bloqueo temporal de la cuenta tras N intentos fallidos (CWE-307) con alerta.
 *  - Segundo factor TOTP opcional con desafío de un solo uso y anti-repetición.
 *  - Sesiones con caducidad absoluta (12 h) y por inactividad (30 min).
 *  - Refresh tokens opacos de 256 bits, almacenados como hash, rotados en cada uso y con
 *    detección de reutilización que revoca la sesión completa (RFC 9700, apartado 4.14).
 */
import { env } from '../config/env.js';
import type { User } from '../generated/prisma/client.js';
import { decryptSecret, randomToken, sha256Hex } from '../lib/crypto.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { signAccessToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import type { Currency } from '../lib/money.js';
import { burnPasswordVerification, checkPasswordPolicy, hashPassword, needsRehash, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { verifyTotp } from '../lib/totp.js';
import type { ClientInfo } from '../middleware/request-context.js';
import { detectBruteForceFromIp, raiseAlert } from './alert.service.js';
import { audit } from './audit.service.js';

export const GENERIC_LOGIN_ERROR = 'Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente.';
const INVALID_SESSION = 'La sesión no es válida o ha caducado.';
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_MAX_ATTEMPTS = 5;

const DEFAULT_CATEGORIES = [
  { name: 'Alimentación', color: '#16a34a' },
  { name: 'Transporte', color: '#2563eb' },
  { name: 'Vivienda', color: '#9333ea' },
  { name: 'Salud', color: '#dc2626' },
  { name: 'Ocio', color: '#f59e0b' },
  { name: 'Educación', color: '#0891b2' },
  { name: 'Otros', color: '#64748b' },
];

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  currency: string;
  mfaEnabled: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  currency: user.currency,
  mfaEnabled: user.mfaEnabled,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
});

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionExpiresAt: Date;
  user: PublicUser;
}

export type LoginResult =
  | { kind: 'session'; tokens: SessionTokens }
  | { kind: 'mfa'; challengeId: string; expiresAt: Date };

// --- Registro ------------------------------------------------------------------------------

export async function register(
  input: { name: string; email: string; password: string; currency: Currency },
  client: ClientInfo,
): Promise<void> {
  const problems = await checkPasswordPolicy(input.password, { email: input.email, name: input.name });
  if (problems.length > 0) {
    throw badRequest(
      'La contraseña no cumple la política de seguridad.',
      problems.map((message) => ({ field: 'password', message })),
    );
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    // Misma respuesta y coste temporal que un alta correcta: no se revela si el correo existe.
    await burnPasswordVerification(input.password);
    await audit({
      action: 'AUTH_REGISTER',
      outcome: 'FAILURE',
      actorEmail: input.email,
      details: { reason: 'EMAIL_ALREADY_REGISTERED' },
      client,
    });
    return;
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name: input.name, email: input.email, passwordHash, currency: input.currency },
    });
    await tx.category.createMany({ data: DEFAULT_CATEGORIES.map((category) => ({ ...category, userId: created.id })) });
    return created;
  });
  await audit({ action: 'AUTH_REGISTER', outcome: 'SUCCESS', userId: user.id, actorEmail: user.email, client });
}

// --- Inicio de sesión ----------------------------------------------------------------------

async function registerFailedAttempt(user: User, client: ClientInfo, reason: string): Promise<void> {
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  await audit({ action: 'AUTH_LOGIN', outcome: 'FAILURE', userId: user.id, actorEmail: user.email, details: { reason }, client });

  if (updated.failedLoginCount >= env.MAX_FAILED_LOGINS) {
    const lockedUntil = new Date(Date.now() + env.LOCKOUT_MINUTES * 60 * 1000);
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil } });
    await audit({
      action: 'AUTH_ACCOUNT_LOCKED',
      outcome: 'SUCCESS',
      userId: user.id,
      actorEmail: user.email,
      details: { failedAttempts: updated.failedLoginCount, lockedUntil: lockedUntil.toISOString() },
      client,
    });
    await raiseAlert({
      type: 'ACCOUNT_LOCKED',
      severity: 'MEDIUM',
      message: `Cuenta bloqueada ${env.LOCKOUT_MINUTES} minutos tras ${updated.failedLoginCount} intentos fallidos.`,
      userId: user.id,
      ip: client.ip,
    });
  }
}

export async function login(input: { email: string; password: string }, client: ClientInfo): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user) {
    await burnPasswordVerification(input.password);
    await audit({ action: 'AUTH_LOGIN', outcome: 'FAILURE', actorEmail: input.email, details: { reason: 'UNKNOWN_USER' }, client });
    await detectBruteForceFromIp(client.ip);
    throw unauthorized(GENERIC_LOGIN_ERROR);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await burnPasswordVerification(input.password);
    await audit({ action: 'AUTH_LOGIN', outcome: 'DENIED', userId: user.id, actorEmail: user.email, details: { reason: 'ACCOUNT_LOCKED' }, client });
    await detectBruteForceFromIp(client.ip);
    throw unauthorized(GENERIC_LOGIN_ERROR);
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    await registerFailedAttempt(user, client, 'INVALID_PASSWORD');
    await detectBruteForceFromIp(client.ip);
    throw unauthorized(GENERIC_LOGIN_ERROR);
  }
  if (user.status !== 'ACTIVE') {
    await audit({ action: 'AUTH_LOGIN', outcome: 'DENIED', userId: user.id, actorEmail: user.email, details: { reason: 'ACCOUNT_DISABLED' }, client });
    throw unauthorized(GENERIC_LOGIN_ERROR);
  }

  const rehash = needsRehash(user.passwordHash) ? await hashPassword(input.password) : undefined;
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, ...(rehash ? { passwordHash: rehash } : {}) },
  });

  if (user.mfaEnabled) {
    const challenge = await prisma.loginChallenge.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS) },
    });
    await audit({
      action: 'AUTH_LOGIN',
      outcome: 'SUCCESS',
      userId: user.id,
      actorEmail: user.email,
      details: { stage: 'PASSWORD_OK_MFA_PENDING' },
      client,
    });
    return { kind: 'mfa', challengeId: challenge.id, expiresAt: challenge.expiresAt };
  }

  const tokens = await createSession(user, client);
  await audit({ action: 'AUTH_LOGIN', outcome: 'SUCCESS', userId: user.id, actorEmail: user.email, details: { mfa: false }, client });
  return { kind: 'session', tokens };
}

export async function completeMfaLogin(input: { challengeId: string; code: string }, client: ClientInfo): Promise<SessionTokens> {
  const invalid = () => unauthorized('El código no es válido o el desafío ha caducado. Inicia sesión de nuevo.');
  const challenge = await prisma.loginChallenge.findUnique({ where: { id: input.challengeId }, include: { user: true } });
  const user = challenge?.user;

  if (
    !challenge ||
    !user ||
    challenge.usedAt !== null ||
    challenge.expiresAt.getTime() <= Date.now() ||
    challenge.attempts >= MFA_MAX_ATTEMPTS ||
    !user.mfaEnabled ||
    !user.mfaSecretEnc ||
    user.status !== 'ACTIVE'
  ) {
    await audit({
      action: 'AUTH_LOGIN_MFA',
      outcome: 'FAILURE',
      userId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      details: { reason: 'INVALID_CHALLENGE' },
      client,
    });
    throw invalid();
  }

  const secret = decryptSecret(user.mfaSecretEnc, `mfa:${user.id}`);
  const step = verifyTotp(secret, input.code, { lastUsedStep: user.mfaLastUsedStep });
  if (step === null) {
    await prisma.loginChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    await registerFailedAttempt(user, client, 'INVALID_MFA_CODE');
    throw invalid();
  }

  const marked = await prisma.loginChallenge.updateMany({
    where: { id: challenge.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (marked.count !== 1) throw invalid();

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaLastUsedStep: step, failedLoginCount: 0 },
  });
  const tokens = await createSession(user, client);
  await audit({ action: 'AUTH_LOGIN_MFA', outcome: 'SUCCESS', userId: user.id, actorEmail: user.email, client });
  return tokens;
}

// --- Sesiones ------------------------------------------------------------------------------

/**
 * Límite de sesiones simultáneas por cuenta (OWASP ASVS 5.0, 7.1.2). Al superarse, se
 * revocan las sesiones activas más antiguas: el nuevo inicio de sesión siempre prospera (no
 * se bloquea al titular) y el evento queda auditado para que el usuario lo vea en su
 * actividad y pueda cambiar la contraseña si no lo reconoce.
 */
async function enforceSessionLimit(userId: string, client: ClientInfo): Promise<void> {
  const active = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const excess = active.slice(env.MAX_SESSIONS_PER_USER).map((session) => session.id);
  if (excess.length === 0) return;
  await prisma.session.updateMany({ where: { id: { in: excess } }, data: { revokedAt: new Date(), revokeReason: 'SESSION_LIMIT' } });
  await audit({ action: 'AUTH_SESSION_REVOKED', outcome: 'SUCCESS', userId, details: { reason: 'SESSION_LIMIT', revokedSessions: excess.length }, client });
}

async function createSession(user: User, client: ClientInfo): Promise<SessionTokens> {
  const expiresAt = new Date(Date.now() + env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000);
  const refreshToken = randomToken(32);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt,
      ip: client.ip,
      userAgent: client.userAgent,
      refreshTokens: { create: { tokenHash: sha256Hex(refreshToken), expiresAt } },
    },
  });
  await enforceSessionLimit(user.id, client);
  const updatedUser = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const accessToken = await signAccessToken({ sub: user.id, sid: session.id });
  return {
    accessToken,
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    sessionExpiresAt: expiresAt,
    user: toPublicUser(updatedUser),
  };
}

export async function refreshSession(refreshToken: string | undefined, client: ClientInfo): Promise<SessionTokens> {
  if (!refreshToken || refreshToken.length > 128) throw unauthorized(INVALID_SESSION);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256Hex(refreshToken) },
    include: { session: { include: { user: true } } },
  });
  if (!stored) {
    await audit({ action: 'AUTH_REFRESH', outcome: 'FAILURE', details: { reason: 'UNKNOWN_TOKEN' }, client });
    throw unauthorized(INVALID_SESSION);
  }

  const { session } = stored;
  const { user } = session;

  if (stored.usedAt !== null) {
    // Un refresh token ya rotado se ha vuelto a presentar: el token ha sido copiado.
    // Se revoca la sesión completa para expulsar tanto al atacante como a la víctima.
    if (!session.revokedAt) {
      await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokeReason: 'TOKEN_REUSE' } });
    }
    await audit({
      action: 'AUTH_TOKEN_REUSE',
      outcome: 'DENIED',
      userId: user.id,
      actorEmail: user.email,
      targetType: 'Session',
      targetId: session.id,
      client,
    });
    await raiseAlert({
      type: 'TOKEN_REUSE',
      severity: 'HIGH',
      message: 'Se ha reutilizado un refresh token ya rotado: posible robo de sesión. La sesión ha sido revocada.',
      userId: user.id,
      ip: client.ip,
      details: { sessionId: session.id },
    });
    throw unauthorized(INVALID_SESSION);
  }

  const now = Date.now();
  const idleExceeded = now - session.lastUsedAt.getTime() > env.SESSION_IDLE_MINUTES * 60 * 1000;
  if (session.revokedAt || session.expiresAt.getTime() <= now || stored.expiresAt.getTime() <= now || user.status !== 'ACTIVE' || idleExceeded) {
    if (idleExceeded && !session.revokedAt) {
      await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokeReason: 'IDLE_TIMEOUT' } });
    }
    await audit({
      action: 'AUTH_REFRESH',
      outcome: 'FAILURE',
      userId: user.id,
      details: { reason: idleExceeded ? 'IDLE_TIMEOUT' : 'SESSION_INVALID' },
      client,
    });
    throw unauthorized(INVALID_SESSION);
  }

  const newRefreshToken = randomToken(32);
  await prisma.$transaction(async (tx) => {
    const marked = await tx.refreshToken.updateMany({ where: { id: stored.id, usedAt: null }, data: { usedAt: new Date() } });
    if (marked.count !== 1) throw unauthorized(INVALID_SESSION);
    await tx.refreshToken.create({ data: { sessionId: session.id, tokenHash: sha256Hex(newRefreshToken), expiresAt: session.expiresAt } });
    await tx.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  });

  const accessToken = await signAccessToken({ sub: user.id, sid: session.id });
  logger.debug({ requestId: client.requestId, sessionId: session.id }, 'Sesión renovada');
  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    sessionExpiresAt: session.expiresAt,
    user: toPublicUser(user),
  };
}

export async function logout(refreshToken: string | undefined, client: ClientInfo): Promise<void> {
  if (!refreshToken || refreshToken.length > 128) return;
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256Hex(refreshToken) },
    include: { session: { select: { id: true, userId: true, revokedAt: true } } },
  });
  if (!stored || stored.session.revokedAt) return;
  await prisma.session.update({ where: { id: stored.session.id }, data: { revokedAt: new Date(), revokeReason: 'LOGOUT' } });
  await audit({ action: 'AUTH_LOGOUT', outcome: 'SUCCESS', userId: stored.session.userId, targetType: 'Session', targetId: stored.session.id, client });
}

/** Revoca todas las sesiones activas de un usuario, salvo (opcionalmente) la actual. */
export async function revokeUserSessions(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
  return result.count;
}
