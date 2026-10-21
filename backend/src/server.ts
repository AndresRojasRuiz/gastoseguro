/**
 * Punto de entrada del servidor.
 *
 * A10:2025 - Gestión de condiciones excepcionales a nivel de proceso:
 *  - Comprobación de la base de datos y del almacenamiento antes de aceptar tráfico.
 *  - Tiempos máximos de cabeceras, petición y keep-alive (mitiga Slowloris y conexiones
 *    colgadas que agotarían recursos).
 *  - Ante una excepción no capturada o una promesa rechazada sin gestionar, se registra el
 *    error y se detiene el proceso de forma ordenada: un estado desconocido no es seguro y
 *    el orquestador (Docker/systemd) lo reiniciará limpio.
 *  - Apagado ordenado con SIGTERM/SIGINT y tiempo límite.
 */
import type { Server } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { ensureUploadDir } from './lib/files.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { flushAudit } from './services/audit.service.js';
import { scheduleRetentionPurge } from './services/retention.service.js';

let server: Server | undefined;
let shuttingDown = false;

async function shutdown(code: number, reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, 'Deteniendo el servidor');
  const forceExit = setTimeout(() => {
    logger.error('Apagado forzado por tiempo de espera');
    process.exit(code || 1);
  }, 10_000);
  forceExit.unref();
  try {
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    await flushAudit();
    await prisma.$disconnect();
  } catch (error) {
    logger.error({ err: error }, 'Error durante el apagado');
  } finally {
    process.exit(code);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Promesa rechazada sin gestionar');
  void shutdown(1, 'unhandledRejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Excepción no capturada');
  void shutdown(1, 'uncaughtException');
});
process.on('SIGTERM', () => void shutdown(0, 'SIGTERM'));
process.on('SIGINT', () => void shutdown(0, 'SIGINT'));

async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  await ensureUploadDir();

  const app = createApp();
  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, `GastoSeguro API escuchando en http://localhost:${env.PORT}`);
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  scheduleRetentionPurge();
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'No se pudo iniciar el servidor');
  void shutdown(1, 'startup-failure');
});
