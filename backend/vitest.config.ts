import { randomBytes } from 'node:crypto';
import { defineConfig } from 'vitest/config';

// Secretos efímeros generados para cada ejecución de la batería de pruebas.
// Por defecto se usa SQLite; con TEST_DATABASE_URL (postgresql://...) la misma batería se
// ejecuta contra PostgreSQL (véase scripts/test-postgres.mjs).
const key = () => randomBytes(32).toString('base64');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'file:./data/test.db',
      JWT_SECRET: key(),
      DATA_ENCRYPTION_KEY: key(),
      AUDIT_HMAC_KEY: key(),
      APP_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
      UPLOAD_DIR: './storage/test-receipts',
      STATIC_DIR: './__sin_interfaz__',
      RATE_LIMIT_LOGIN_MAX: '10',
      RATE_LIMIT_GLOBAL_MAX: '100000',
      RATE_LIMIT_REGISTER_MAX: '1000',
      AUTH_MIN_RESPONSE_MS: '120',
      MAX_UPLOAD_BYTES: String(1024 * 1024),
      MAX_SESSIONS_PER_USER: '3',
      COOKIE_SECURE: 'true',
    },
  },
});
