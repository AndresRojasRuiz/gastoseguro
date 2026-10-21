/**
 * Composición de la aplicación Express. El orden de los middlewares es parte del diseño de
 * seguridad: identificación de la petición -> cabeceras de seguridad -> CORS -> límites de
 * tamaño y tasa -> validación del tipo de contenido -> rutas -> 404 -> gestor de errores.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { requestContext } from './middleware/request-context.js';
import { corsPolicy, noStore, permissionsPolicy, requireJsonBody, securityHeaders } from './middleware/security.js';
import { accountRouter } from './routes/account.routes.js';
import { adminRouter, auditRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { categoriesRouter } from './routes/categories.routes.js';
import { expensesRouter } from './routes/expenses.routes.js';
import { reportsRouter } from './routes/reports.routes.js';

export function createApp(): Express {
  const app = express();

  // No revelar la tecnología del servidor (fingerprinting).
  app.disable('x-powered-by');
  // Solo se confía en X-Forwarded-For si hay un proxy inverso declarado (evita la
  // suplantación de IP que anularía la limitación de tasa y la auditoría).
  app.set('trust proxy', env.TRUST_PROXY);
  // Analizador de query "simple": no admite objetos anidados (evita contaminación de
  // prototipos y confusión de tipos en los filtros).
  app.set('query parser', 'simple');

  app.use(requestContext);
  app.use(securityHeaders);
  app.use(permissionsPolicy);

  const api = express.Router();
  api.use(corsPolicy);
  api.use(noStore);
  api.use(globalLimiter);
  api.use(requireJsonBody);
  api.use(express.json({ limit: '100kb', strict: true, type: 'application/json' }));
  api.use(cookieParser());

  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/auth', authRouter);
  api.use('/account', accountRouter);
  api.use('/categories', categoriesRouter);
  api.use('/expenses', expensesRouter);
  api.use('/reports', reportsRouter);
  api.use('/admin', adminRouter);
  api.use('/audit', auditRouter);
  api.use(notFoundHandler);

  app.use('/api', api);

  // Interfaz web compilada (mismo origen que la API: no se necesita CORS en producción).
  const staticDir = path.resolve(env.STATIC_DIR);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- ruta fija de configuración, no controlada por el usuario
  if (existsSync(path.join(staticDir, 'index.html'))) {
    app.use(
      express.static(staticDir, {
        index: false,
        dotfiles: 'deny',
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get('/{*path}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
