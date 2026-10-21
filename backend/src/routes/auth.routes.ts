/**
 * Rutas de autenticación. El refresh token viaja únicamente en una cookie HttpOnly, Secure y
 * SameSite=Strict, de modo que no es accesible desde JavaScript (mitiga el robo por XSS) ni
 * se envía en peticiones de terceros (mitiga CSRF).
 *
 * La cookie usa el prefijo "__Host-" (OWASP ASVS 5.0, requisitos 3.3.1 y 3.3.3): el
 * navegador solo la acepta si es Secure, sin atributo Domain y con Path=/, lo que impide que
 * un subdominio o una conexión sin cifrar la sobrescriban (cookie tossing). Como el prefijo
 * exige Path=/, la cookie acompaña a toda petición al mismo origen, pero solo la leen
 * /api/auth/refresh y /api/auth/logout, protegidos además por la comprobación de origen.
 * Sin Secure (solo admisible fuera de producción) el prefijo no es válido y se omite.
 */
import { Router, type CookieOptions, type Response } from 'express';
import { env } from '../config/env.js';
import { withMinimumDuration } from '../lib/timing.js';
import { refreshLimiter, loginIpLimiter, loginLimiter, mfaLimiter, registerLimiter } from '../middleware/rate-limit.js';
import { clientInfo } from '../middleware/request-context.js';
import { requireTrustedOrigin } from '../middleware/security.js';
import { LoginSchema, MfaLoginSchema, RegisterSchema } from '../schemas/index.js';
import * as authService from '../services/auth.service.js';

export const REFRESH_COOKIE = env.COOKIE_SECURE ? '__Host-gs_rt' : 'gs_rt';

export const refreshCookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'strict',
  path: '/',
  ...(expires ? { expires } : {}),
});

function sendSession(res: Response, tokens: authService.SessionTokens, status = 200) {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions(tokens.sessionExpiresAt));
  res.status(status).json({
    accessToken: tokens.accessToken,
    tokenType: 'Bearer',
    expiresIn: tokens.expiresIn,
    sessionExpiresAt: tokens.sessionExpiresAt,
    user: tokens.user,
  });
}

const readRefreshCookie = (cookies: unknown): string | undefined => {
  const value = (cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
};

export const authRouter = Router();

// Las tres operaciones se ejecutan con una duración mínima uniforme (éxito o fallo) para que
// el tiempo de respuesta no revele si una cuenta existe (CWE-208).
const uniformTiming = <T>(operation: () => Promise<T>) => withMinimumDuration(env.AUTH_MIN_RESPONSE_MS, operation);

authRouter.post('/register', registerLimiter, async (req, res) => {
  const input = RegisterSchema.parse(req.body);
  await uniformTiming(() => authService.register(input, clientInfo(req)));
  res.status(201).json({ message: 'Si los datos son válidos, la cuenta ha quedado registrada. Ya puedes iniciar sesión.' });
});

authRouter.post('/login', loginIpLimiter, loginLimiter, async (req, res) => {
  const input = LoginSchema.parse(req.body);
  const result = await uniformTiming(() => authService.login(input, clientInfo(req)));
  if (result.kind === 'mfa') {
    res.status(200).json({ mfaRequired: true, challengeId: result.challengeId, expiresAt: result.expiresAt });
    return;
  }
  sendSession(res, result.tokens);
});

authRouter.post('/login/mfa', mfaLimiter, async (req, res) => {
  const input = MfaLoginSchema.parse(req.body);
  const tokens = await uniformTiming(() => authService.completeMfaLogin(input, clientInfo(req)));
  sendSession(res, tokens);
});

authRouter.post('/refresh', requireTrustedOrigin, refreshLimiter, async (req, res) => {
  try {
    const tokens = await authService.refreshSession(readRefreshCookie(req.cookies), clientInfo(req));
    sendSession(res, tokens);
  } catch (error) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    throw error;
  }
});

authRouter.post('/logout', requireTrustedOrigin, async (req, res) => {
  await authService.logout(readRefreshCookie(req.cookies), clientInfo(req));
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  res.status(204).end();
});
