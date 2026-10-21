/**
 * Contexto de petición y registro de accesos (A09:2025).
 *
 * Cada petición recibe un identificador UUID generado por el servidor (nunca se reutiliza el
 * que envía el cliente, para evitar inyección en los registros). El identificador se
 * devuelve en la cabecera X-Request-Id y se incluye en logs, auditoría y mensajes de error,
 * lo que permite correlacionar un incidente de extremo a extremo.
 */
import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

export const requestContext: RequestHandler = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/api/health') return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const entry = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.auth?.userId,
      ip: req.ip,
    };
    if (res.statusCode >= 500) logger.error(entry, 'request');
    else if (res.statusCode >= 400) logger.warn(entry, 'request');
    else logger.info(entry, 'request');
  });
  next();
};

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

export function clientInfo(req: Request): ClientInfo {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 256) ?? null,
    requestId: req.requestId,
  };
}
