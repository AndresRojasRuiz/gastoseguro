/**
 * Autenticación y autorización (A01 y A07:2025).
 *
 * authenticate:
 *  - Exige un token Bearer válido (firma, algoritmo, emisor, audiencia y expiración).
 *  - Comprueba en base de datos que la sesión sigue activa (no revocada, no caducada, no
 *    inactiva) y que la cuenta está habilitada: la revocación es inmediata.
 *  - Ante cualquier anomalía deniega el acceso (fallo cerrado / fail closed).
 *
 * requireRole:
 *  - Control de acceso basado en roles (RBAC) con denegación por defecto. Las denegaciones se
 *    auditan y alimentan la regla de detección de sondeo de permisos.
 *  - Los roles privilegiados (ADMIN y AUDITOR) solo pueden ejercerse con el segundo factor
 *    activado (OWASP ASVS 5.0, requisito 6.3.3): sin él, la cuenta mantiene el acceso a sus
 *    propias funciones, pero las privilegiadas responden 403 MFA_REQUIRED.
 */
import type { Request, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { ROLES, type Role } from '../schemas/common.js';
import { detectAccessProbing } from '../services/alert.service.js';
import { audit } from '../services/audit.service.js';
import type { AuthContext } from '../types/express.js';
import { clientInfo } from './request-context.js';

const LAST_USED_UPDATE_MS = 60 * 1000;

/** Roles cuyo ejercicio exige autenticación multifactor. */
export const MFA_REQUIRED_ROLES: readonly Role[] = ['ADMIN', 'AUDITOR'];

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ') || header.length > 4096) throw unauthorized();

  let claims;
  try {
    claims = await verifyAccessToken(header.slice('Bearer '.length).trim());
  } catch {
    throw unauthorized('La sesión no es válida o ha caducado.');
  }

  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    include: { user: { select: { id: true, email: true, role: true, status: true, mfaEnabled: true } } },
  });
  const now = Date.now();
  if (
    !session ||
    session.userId !== claims.sub ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= now ||
    session.user.status !== 'ACTIVE' ||
    !(ROLES as readonly string[]).includes(session.user.role)
  ) {
    throw unauthorized('La sesión no es válida o ha caducado.');
  }

  const idleLimitMs = env.SESSION_IDLE_MINUTES * 60 * 1000;
  if (now - session.lastUsedAt.getTime() > idleLimitMs) {
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokeReason: 'IDLE_TIMEOUT' } });
    throw unauthorized('La sesión ha caducado por inactividad.');
  }
  if (now - session.lastUsedAt.getTime() > LAST_USED_UPDATE_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  }

  req.auth = {
    userId: session.user.id,
    email: session.user.email,
    role: session.user.role as Role,
    sessionId: session.id,
    mfaEnabled: session.user.mfaEnabled,
  };
  next();
};

/** Devuelve el contexto de autenticación o lanza 401 (defensa en profundidad). */
export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** Registra un acceso denegado y evalúa la regla de detección de sondeo. */
export async function recordAccessDenied(req: Request, reason: string, target?: { type: string; id: string }): Promise<void> {
  const info = clientInfo(req);
  await audit({
    action: 'ACCESS_DENIED',
    outcome: 'DENIED',
    userId: req.auth?.userId ?? null,
    actorEmail: req.auth?.email ?? null,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    details: { reason, method: req.method, path: req.originalUrl.split('?')[0] },
    client: info,
  });
  if (req.auth) await detectAccessProbing(req.auth.userId, info.ip);
}

export const requireRole =
  (...allowed: Role[]): RequestHandler =>
  async (req, _res, next) => {
    const auth = requireAuth(req);
    if (!allowed.includes(auth.role)) {
      await recordAccessDenied(req, `Rol ${auth.role} no autorizado`);
      throw forbidden();
    }
    if (MFA_REQUIRED_ROLES.includes(auth.role) && !auth.mfaEnabled) {
      await recordAccessDenied(req, `Rol ${auth.role} sin segundo factor`);
      throw new AppError(403, 'MFA_REQUIRED', 'Tu rol exige un segundo factor de autenticación. Actívalo en Seguridad para continuar.');
    }
    next();
  };
