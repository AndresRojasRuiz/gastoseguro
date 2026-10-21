import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

/**
 * Prepara una base de datos de pruebas limpia antes de ejecutar la batería: un fichero SQLite
 * nuevo o, si TEST_DATABASE_URL apunta a PostgreSQL, una base de datos vacía a la que se
 * aplican las migraciones de PostgreSQL. Nunca se borra una base de datos existente: la base
 * de PostgreSQL debe crearse vacía para cada ejecución (en CI la aporta un contenedor nuevo).
 */
export default function setup(): () => void {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? 'file:./data/test.db';
  rmSync('storage/test-receipts', { recursive: true, force: true });
  if (databaseUrl.startsWith('file:')) {
    rmSync('data/test.db', { force: true });
    mkdirSync('data', { recursive: true });
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'ignore' });
  } else {
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: databaseUrl, DB_PROVIDER: 'postgresql' }, stdio: 'ignore' });
  }
  return () => {
    rmSync('storage/test-receipts', { recursive: true, force: true });
  };
}
