/**
 * Cliente de base de datos.
 *
 * Prisma genera consultas parametrizadas, por lo que los datos de entrada nunca se
 * concatenan en el SQL (A05:2025 - Injection). El uso de $queryRawUnsafe/$executeRawUnsafe
 * está prohibido por la configuración de ESLint del proyecto.
 */
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

function createAdapter(url: string) {
  if (url.startsWith('file:')) return new PrismaLibSql({ url });
  return new PrismaPg({ connectionString: url });
}

export const prisma = new PrismaClient({ adapter: createAdapter(env.DATABASE_URL) });

export { Prisma } from '../generated/prisma/client.js';
