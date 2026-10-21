/**
 * Logger estructurado (A09:2025 - Security Logging & Alerting Failures).
 *
 * - Formato JSON: cada evento es un objeto, lo que impide la inyección de líneas falsas en
 *   los registros (log injection / CWE-117) y facilita su ingesta en un SIEM.
 * - Redacción automática de campos sensibles (contraseñas, tokens, cookies, códigos MFA)
 *   para no exponer secretos en los registros (CWE-532).
 */
import { pino } from 'pino';
import { env } from '../config/env.js';

const SENSITIVE_KEYS = [
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'code',
  'secret',
  'mfaSecretEnc',
  'mfaPendingSecretEnc',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'gastoseguro-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: 'message',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      ...SENSITIVE_KEYS,
      ...SENSITIVE_KEYS.map((key) => `*.${key}`),
    ],
    censor: '[REDACTED]',
  },
});
