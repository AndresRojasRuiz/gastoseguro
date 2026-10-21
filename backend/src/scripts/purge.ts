/**
 * Purga bajo demanda de los datos que han superado su plazo de conservación
 * ("npm run db:purge"). La misma tarea se ejecuta automáticamente en el servidor cada
 * RETENTION_PURGE_INTERVAL_HOURS horas.
 */
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { flushAudit } from '../services/audit.service.js';
import { purgeExpiredData } from '../services/retention.service.js';

try {
  const result = await purgeExpiredData();
  console.log(
    `Purga completada (gastos borrados hace más de ${env.RETENTION_DELETED_EXPENSES_DAYS} días; ` +
      `sesiones cerradas hace más de ${env.RETENTION_SESSIONS_DAYS} días):`,
    result,
  );
  await flushAudit();
} finally {
  await prisma.$disconnect();
}
