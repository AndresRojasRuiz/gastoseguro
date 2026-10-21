/**
 * Gestión centralizada de errores (A10:2025 - Mishandling of Exceptional Conditions).
 *
 * - Toda excepción termina aquí (Express 5 propaga también los rechazos de promesas).
 * - Los errores esperados (validación, permisos, no encontrado...) se traducen a códigos HTTP
 *   con mensajes controlados.
 * - Los inesperados devuelven un 500 genérico: nunca se exponen trazas, consultas SQL,
 *   rutas internas ni versiones (CWE-209). El detalle completo queda en el log del servidor,
 *   correlacionado mediante el requestId que también recibe el cliente.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { Prisma } from '../lib/prisma.js';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
}

export const notFoundHandler: RequestHandler = () => {
  throw notFound('La ruta solicitada no existe.');
};

function classify(error: unknown): { status: number; body: Omit<ErrorBody, 'requestId'> } {
  if (error instanceof AppError) {
    return { status: error.status, body: { code: error.code, message: error.message, details: error.details } };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son válidos.',
        details: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
      },
    };
  }
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return {
      status: tooLarge ? 413 : 400,
      body: { code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR', message: tooLarge ? 'El fichero supera el tamaño máximo permitido.' : 'El envío del fichero no es válido.' },
    };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return { status: 409, body: { code: 'CONFLICT', message: 'Ya existe un registro con esos datos.' } };
    if (error.code === 'P2025') return { status: 404, body: { code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' } };
  }
  const httpError = error as { type?: string; status?: number } | null;
  if (httpError?.type === 'entity.parse.failed') {
    return { status: 400, body: { code: 'MALFORMED_JSON', message: 'El cuerpo de la petición no es un JSON válido.' } };
  }
  if (httpError?.type === 'entity.too.large') {
    return { status: 413, body: { code: 'PAYLOAD_TOO_LARGE', message: 'La petición es demasiado grande.' } };
  }
  if (httpError?.type === 'encoding.unsupported' || httpError?.type === 'charset.unsupported') {
    return { status: 415, body: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Codificación no admitida.' } };
  }
  return {
    status: 500,
    body: { code: 'INTERNAL_ERROR', message: 'Se ha producido un error inesperado. Inténtalo de nuevo más tarde.' },
  };
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    // La respuesta ya empezó a enviarse: se delega en Express para cerrar la conexión.
    next(error);
    return;
  }
  const { status, body } = classify(error);
  const logContext = { requestId: req.requestId, method: req.method, path: req.originalUrl.split('?')[0], status };
  if (status >= 500) logger.error({ ...logContext, err: error }, 'Error no controlado');
  else logger.debug({ ...logContext, code: body.code }, 'Error controlado');

  res.status(status).json({ error: { ...body, requestId: req.requestId } });
};
