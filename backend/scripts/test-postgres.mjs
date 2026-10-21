#!/usr/bin/env node
/**
 * Ejecuta la batería de pruebas completa contra PostgreSQL.
 *
 * Uso: TEST_DATABASE_URL=postgresql://usuario:clave@localhost:5432/gastoseguro_test \
 *        npm run test:postgres -w backend
 *
 * La base de datos debe estar vacía (por ejemplo, recién creada o el contenedor de servicio
 * de CI). El cliente de Prisma se genera para PostgreSQL, se aplican las migraciones de
 * prisma/postgres/migrations, se ejecutan las pruebas y al terminar se regenera el cliente de SQLite
 * para dejar el entorno de desarrollo como estaba. Se invoca la CLI con el propio Node y sin
 * shell, de modo que los argumentos no se interpretan.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.TEST_DATABASE_URL ?? '';
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error('Define TEST_DATABASE_URL con la URL postgresql:// de una base de datos de pruebas vacía.');
  process.exit(2);
}

const require = createRequire(import.meta.url);
const bin = (pkg, file) => path.join(path.dirname(require.resolve(`${pkg}/package.json`)), file);
const run = (args, extraEnv) => spawnSync(process.execPath, args, { cwd: backend, stdio: 'inherit', env: { ...process.env, ...extraEnv } }).status ?? 1;

const prismaCli = bin('prisma', 'build/index.js');
const pgEnv = { DB_PROVIDER: 'postgresql', DATABASE_URL: url };
let status = run([prismaCli, 'generate'], pgEnv);
if (status === 0) status = run([bin('vitest', 'vitest.mjs'), 'run', ...process.argv.slice(2)], pgEnv);
const restore = run([prismaCli, 'generate'], { DB_PROVIDER: '' });
process.exit(status || restore);
