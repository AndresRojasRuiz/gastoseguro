#!/usr/bin/env node
/**
 * Instalación local de GastoSeguro en un solo paso:
 *   1. Comprueba la versión de Node.js.
 *   2. Genera backend/.env con secretos aleatorios (si no existe).
 *   3. Aplica las migraciones y genera el cliente de base de datos.
 *   4. Carga las cuentas y datos de demostración.
 *
 * Uso: npm install && npm run setup
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const envFile = path.join(backend, '.env');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`Se necesita Node.js 22.12 o superior (versión actual: ${process.versions.node}).`);
  process.exit(1);
}

const secret = (bytes = 32) => randomBytes(bytes).toString('base64');
// Sin el carácter "#", que el analizador de ficheros .env interpreta como inicio de comentario.
const demoPassword = () => `gs.${randomBytes(15).toString('base64url')}`;

if (existsSync(envFile)) {
  console.log('• backend/.env ya existe: se conserva.');
} else {
  const template = readFileSync(path.join(backend, '.env.example'), 'utf8');
  const values = {
    JWT_SECRET: secret(),
    DATA_ENCRYPTION_KEY: secret(32),
    AUDIT_HMAC_KEY: secret(),
    SEED_ADMIN_PASSWORD: demoPassword(),
    SEED_AUDITOR_PASSWORD: demoPassword(),
    SEED_USER_PASSWORD: demoPassword(),
  };
  const content = template.replace(/^([A-Z_]+)=$/gm, (line, key) => (key in values ? `${key}=${values[key]}` : line));
  writeFileSync(envFile, content, { mode: 0o600 });
  console.log('• backend/.env creado con secretos aleatorios.');
}

const run = (command, cwd = backend) => {
  console.log(`\n$ ${command}`);
  execSync(command, { cwd, stdio: 'inherit', env: { ...process.env } });
};

mkdirSync(path.join(backend, 'data'), { recursive: true });
run('npx prisma migrate deploy');
run('npx prisma generate');
run('npx tsx src/scripts/seed.ts');

console.log(`
Instalación completada.
  • Desarrollo (API + interfaz con recarga):  npm run dev   ->  http://localhost:5173
  • Producción local (compilado):             npm run build && npm start  ->  http://localhost:4000
  • Credenciales de demostración: variables SEED_* de backend/.env
`);
