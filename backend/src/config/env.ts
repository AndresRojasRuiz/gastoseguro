/**
 * Carga y validación de la configuración (A02:2025 - Security Misconfiguration).
 *
 * La aplicación falla al arrancar ("fail fast") si falta alguna variable crítica o si los
 * secretos no tienen la entropía mínima exigida. Así se evita desplegar con configuraciones
 * por defecto o inseguras. Los valores de los secretos nunca se imprimen en los mensajes.
 */
import { existsSync } from 'node:fs';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'test' && existsSync('.env')) {
  process.loadEnvFile('.env');
}

/** Secreto codificado en base64 con un número mínimo de bytes aleatorios. */
const base64Secret = (minBytes: number, exactBytes?: number) =>
  z.string().refine(
    (value) => {
      if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return false;
      const length = Buffer.from(value, 'base64').length;
      return exactBytes ? length === exactBytes : length >= minBytes;
    },
    {
      message: exactBytes
        ? `debe ser una clave aleatoria de exactamente ${exactBytes} bytes codificada en base64`
        : `debe ser una clave aleatoria de al menos ${minBytes} bytes codificada en base64`,
    },
  );

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().min(1, 'es obligatoria'),
    /** Orígenes permitidos (CORS y verificación de Origin), separados por comas. */
    APP_ORIGIN: z
      .string()
      .default('http://localhost:5173,http://localhost:4000')
      .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
      .pipe(z.array(z.url()).min(1)),
    /** Número de proxies inversos de confianza delante de la aplicación (0 = ninguno). */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    JWT_SECRET: base64Secret(32),
    DATA_ENCRYPTION_KEY: base64Secret(32, 32),
    AUDIT_HMAC_KEY: base64Secret(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(12),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
    /** Sesiones simultáneas por cuenta; al superarse se cierran las más antiguas. */
    MAX_SESSIONS_PER_USER: z.coerce.number().int().min(1).max(100).default(10),
    MAX_FAILED_LOGINS: z.coerce.number().int().min(3).max(20).default(5),
    LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().min(10).default(600),
    RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().min(1).default(10),
    /** Duración mínima de las respuestas de autenticación (igualación de tiempos, CWE-208). */
    AUTH_MIN_RESPONSE_MS: z.coerce.number().int().min(0).max(2000).default(400),
    PASSWORD_BREACH_CHECK: z.enum(['off', 'hibp']).default('off'),
    COOKIE_SECURE: booleanFromString.default(true),
    UPLOAD_DIR: z.string().default('./storage/receipts'),
    MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(20 * 1024 * 1024).default(5 * 1024 * 1024),
    STATIC_DIR: z.string().default('../frontend/dist'),
    /** Plazos de conservación (RGPD art. 5.1.e) y periodicidad de la purga (0 = desactivada). */
    RETENTION_DELETED_EXPENSES_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    RETENTION_SESSIONS_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    RETENTION_PURGE_INTERVAL_HOURS: z.coerce.number().int().min(0).max(168).default(24),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV !== 'production') return;
    if (cfg.APP_ORIGIN.some((origin) => !origin.startsWith('https://'))) {
      ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'en producción todos los orígenes deben usar https' });
    }
    if (!cfg.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'en producción las cookies deben ser Secure' });
    }
    if (cfg.DATABASE_URL.startsWith('file:')) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'en producción debe usarse PostgreSQL' });
    }
    if (new Set([cfg.JWT_SECRET, cfg.DATA_ENCRYPTION_KEY, cfg.AUDIT_HMAC_KEY]).size !== 3) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'cada secreto debe ser distinto' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Configuración inválida. Revisa el fichero .env:\n${problems}`);
  }
  return Object.freeze(parsed.data);
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
