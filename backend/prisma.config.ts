/**
 * Configuración de Prisma (v7).
 *
 * - En desarrollo se usa SQLite (archivo local) para que la aplicación funcione sin instalar
 *   ningún servidor de base de datos.
 * - En producción (DB_PROVIDER=postgresql) se usa el esquema y las migraciones de PostgreSQL.
 *
 * La URL de conexión nunca se escribe en el repositorio: se lee de la variable DATABASE_URL.
 */
import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

if (existsSync('.env')) process.loadEnvFile('.env');

const isPostgres = process.env.DB_PROVIDER === 'postgresql';

export default defineConfig({
  schema: isPostgres ? 'prisma/postgres/schema.prisma' : 'prisma/schema.prisma',
  migrations: { path: isPostgres ? 'prisma/postgres/migrations' : 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
