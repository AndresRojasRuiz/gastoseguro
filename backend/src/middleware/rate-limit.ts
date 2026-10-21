/**
 * Limitación de tasa (A06 y A07:2025).
 *
 * Mitiga la fuerza bruta, el relleno de credenciales y el consumo excesivo de recursos
 * (CWE-307, CWE-770). Los límites de autenticación se calculan por IP y por cuenta para que
 * un atacante no pueda repartir intentos entre cuentas ni bloquear la IP de otros usuarios.
 * Las IPv6 se agrupan por subred /56 para impedir la evasión rotando direcciones.
 *
 * Nota: el almacén en memoria es válido para una sola instancia; con varias réplicas se
 * usaría un almacén compartido (p. ej. Redis).
 */
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { env } from '../config/env.js';
import { tooManyRequests } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { clientInfo } from './request-context.js';

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown', 56);

const emailKey = (req: Request) => {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
};

function limiter(name: string, options: Partial<Options>): RequestHandler {
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: ipKey,
    ...options,
    handler: (req, _res, next) => {
      void audit({
        action: 'RATE_LIMIT_EXCEEDED',
        outcome: 'DENIED',
        userId: req.auth?.userId ?? null,
        details: { limiter: name, path: req.originalUrl.split('?')[0] },
        client: clientInfo(req),
      });
      next(tooManyRequests());
    },
  });
}

/** Límite general para toda la API. */
export const globalLimiter = limiter('global', { windowMs: 15 * 60 * 1000, limit: env.RATE_LIMIT_GLOBAL_MAX });

/** Inicio de sesión: por IP + cuenta. */
export const loginLimiter = limiter('login', {
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_LOGIN_MAX,
  keyGenerator: (req) => `${ipKey(req)}|${emailKey(req)}`,
});

/** Inicio de sesión: límite agregado por IP (relleno de credenciales contra muchas cuentas). */
export const loginIpLimiter = limiter('login-ip', { windowMs: 15 * 60 * 1000, limit: env.RATE_LIMIT_LOGIN_MAX * 5 });

export const registerLimiter = limiter('register', { windowMs: 60 * 60 * 1000, limit: env.RATE_LIMIT_REGISTER_MAX });

export const mfaLimiter = limiter('mfa', { windowMs: 15 * 60 * 1000, limit: 10 });

export const refreshLimiter = limiter('refresh', { windowMs: 15 * 60 * 1000, limit: 120 });

export const sensitiveActionLimiter = limiter('sensitive', { windowMs: 15 * 60 * 1000, limit: 20 });

export const uploadLimiter = limiter('upload', { windowMs: 15 * 60 * 1000, limit: 30 });
