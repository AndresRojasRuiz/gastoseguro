#!/usr/bin/env node
/**
 * Genera los ficheros de configuración de producción para docker compose con secretos
 * aleatorios (nunca se versionan: están en .gitignore).
 *
 *   deploy/db.env   -> credenciales de PostgreSQL
 *   deploy/app.env  -> configuración y secretos de la aplicación
 *
 * Uso: node scripts/production-env.mjs [https://dominio]
 */
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = process.argv[2] ?? 'https://gastoseguro.localhost';
const isValidOrigin = (() => {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.origin === origin;
  } catch {
    return false;
  }
})();
if (!isValidOrigin) {
  console.error('El origen debe ser una URL https:// sin ruta, p. ej. https://gastos.midominio.es');
  process.exit(1);
}

const dbEnv = path.join(root, 'deploy', 'db.env');
const appEnv = path.join(root, 'deploy', 'app.env');
if (existsSync(dbEnv) || existsSync(appEnv)) {
  console.error('deploy/db.env o deploy/app.env ya existen. Bórralos manualmente si quieres regenerarlos.');
  process.exit(1);
}

const secret = (bytes = 32) => randomBytes(bytes).toString('base64');
const dbPassword = randomBytes(24).toString('base64url');

writeFileSync(
  dbEnv,
  ['POSTGRES_DB=gastoseguro', 'POSTGRES_USER=gastoseguro', `POSTGRES_PASSWORD=${dbPassword}`, ''].join('\n'),
  { mode: 0o600 },
);

writeFileSync(
  appEnv,
  [
    'NODE_ENV=production',
    'PORT=4000',
    `DATABASE_URL=postgresql://gastoseguro:${dbPassword}@db:5432/gastoseguro`,
    `APP_ORIGIN=${origin}`,
    'TRUST_PROXY=1',
    `JWT_SECRET=${secret()}`,
    `DATA_ENCRYPTION_KEY=${secret(32)}`,
    `AUDIT_HMAC_KEY=${secret()}`,
    'COOKIE_SECURE=true',
    'PASSWORD_BREACH_CHECK=hibp',
    'LOG_LEVEL=info',
    '',
  ].join('\n'),
  { mode: 0o600 },
);

console.log(`Ficheros creados: deploy/db.env y deploy/app.env (origen ${origin}).`);
console.log('Siguiente paso: docker compose up -d --build');
