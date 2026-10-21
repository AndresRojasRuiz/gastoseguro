/**
 * Errores de aplicación controlados (A10:2025 - Mishandling of Exceptional Conditions).
 *
 * Solo los errores de tipo AppError muestran su mensaje al cliente. Cualquier otra excepción
 * se trata como error interno: se registra con todo el detalle en el servidor y el cliente
 * recibe un mensaje genérico con un identificador de petición para su trazabilidad.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message = 'La petición no es válida.', details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Es necesario iniciar sesión.') => new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'No tienes permisos para realizar esta acción.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'El recurso solicitado no existe.') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export const tooManyRequests = (message = 'Demasiadas peticiones. Espera unos minutos e inténtalo de nuevo.') =>
  new AppError(429, 'TOO_MANY_REQUESTS', message);
