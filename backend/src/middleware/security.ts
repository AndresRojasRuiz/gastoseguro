/**
 * Cabeceras y controles HTTP de seguridad (A02 y A05:2025).
 */
import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { env, isProduction } from '../config/env.js';
import { AppError, forbidden } from '../lib/errors.js';

/**
 * Política de seguridad de contenido estricta: solo recursos del propio origen, sin scripts
 * ni estilos en línea, sin objetos embebidos y sin permitir que la aplicación se cargue en
 * marcos de terceros (clickjacking). Trusted Types bloquea los sumideros DOM peligrosos.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      requireTrustedTypesFor: ["'script'"],
      ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  crossOriginEmbedderPolicy: { policy: 'require-corp' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: isProduction ? { maxAge: 63_072_000, includeSubDomains: true, preload: false } : false,
  xFrameOptions: { action: 'deny' },
});

/** Desactiva APIs del navegador que la aplicación no necesita. */
export const permissionsPolicy: RequestHandler = (_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  );
  next();
};

/** Las respuestas de la API contienen datos personales: no deben almacenarse en cachés. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
};

/** CORS con lista blanca explícita de orígenes; el resto no recibe cabeceras CORS. */
export const corsPolicy = cors({
  origin: env.APP_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  maxAge: 600,
});

/**
 * Defensa CSRF para los endpoints que se autentican con cookie (refresh y logout):
 * además de SameSite=Strict, se exige que la cabecera Origin pertenezca a la lista blanca y
 * que el navegador no declare la petición como "cross-site" (Fetch Metadata).
 */
export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (!origin || !env.APP_ORIGIN.includes(origin) || fetchSite === 'cross-site') {
    throw forbidden('Origen de la petición no permitido.');
  }
  next();
};

/** Solo se aceptan cuerpos JSON en las rutas que reciben JSON (evita confusión de tipos). */
export const requireJsonBody: RequestHandler = (req, _res, next) => {
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') !== undefined;
  if (['POST', 'PATCH', 'PUT'].includes(req.method) && hasBody && !req.is('application/json') && !req.is('multipart/form-data')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Tipo de contenido no admitido.');
  }
  next();
};
