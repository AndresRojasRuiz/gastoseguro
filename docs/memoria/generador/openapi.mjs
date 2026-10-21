// Genera docs/openapi.json (OpenAPI 3.1) a partir de la descripción de las rutas de la API.
// Las restricciones reflejan los esquemas Zod del backend (src/schemas) para que el
// escáner DAST (OWASP ZAP) construya peticiones válidas y explore toda la superficie.
import fs from 'node:fs';

const ROOT = 'C:/Users/andre/Documents/GastoSeguro';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const body = (schema) => ({ required: true, ...json(schema) });
const ok = (description, schema) => ({ description, ...(schema ? json(schema) : {}) });
const errors = (...codes) =>
  Object.fromEntries(
    codes.map((code) => [
      String(code),
      {
        description: {
          400: 'Entrada no válida',
          401: 'No autenticado o sesión no válida',
          403: 'Sin permisos, origen no confiable o segundo factor obligatorio no activado',
          404: 'No existe o no pertenece al usuario',
          409: 'Conflicto con el estado actual',
          413: 'Cuerpo o fichero demasiado grande',
          415: 'Tipo de contenido no admitido',
          429: 'Límite de peticiones superado',
        }[code],
        ...json(ref('Error')),
      },
    ]),
  );
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];
const bearer = [{ bearerAuth: [] }];
const op = (tag, summary, extra = {}) => ({ tags: [tag], summary, security: bearer, ...extra });
const pub = (tag, summary, extra = {}) => ({ tags: [tag], summary, security: [], ...extra });

const password = { type: 'string', minLength: 1, maxLength: 256, format: 'password' };
const totp = { type: 'string', pattern: '^\\d{6}$', example: '123456' };
const date = { type: 'string', format: 'date', example: '2026-10-14' };

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'GastoSeguro API',
    version: '1.0.0',
    description:
      'API REST de GastoSeguro. Autenticación con token de acceso JWT (at+jwt, 15 minutos) en la cabecera Authorization y refresco mediante cookie __Host-gs_rt (HttpOnly, Secure, SameSite=Strict). Todas las entradas se validan con esquemas estrictos: los campos no declarados se rechazan con 400.',
  },
  servers: [{ url: 'http://localhost:4000' }],
  tags: ['Salud', 'Autenticación', 'Cuenta', 'Categorías', 'Gastos', 'Informes', 'Administración', 'Auditoría'].map((name) => ({ name })),
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: '__Host-gs_rt' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              requestId: { type: 'string' },
              details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
            },
          },
        },
      },
      Register: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 80, example: 'Ana Martínez' },
          email: { type: 'string', format: 'email', maxLength: 254, example: 'ana@ejemplo.es' },
          password: { ...password, minLength: 15, maxLength: 128, example: 'Correcto caballo batería grapa' },
          currency: { type: 'string', enum: ['EUR', 'USD', 'CLP'], default: 'EUR' },
        },
      },
      Login: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email', maxLength: 254 }, password },
      },
      MfaLogin: { type: 'object', additionalProperties: false, required: ['challengeId', 'code'], properties: { challengeId: { type: 'string', format: 'uuid' }, code: totp } },
      Session: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          tokenType: { type: 'string', const: 'Bearer' },
          expiresIn: { type: 'integer' },
          sessionExpiresAt: { type: 'string', format: 'date-time' },
          user: ref('User'),
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['USER', 'AUDITOR', 'ADMIN'] },
          currency: { type: 'string', enum: ['EUR', 'USD', 'CLP'] },
          mfaEnabled: { type: 'boolean' },
        },
      },
      Reauth: { type: 'object', additionalProperties: false, required: ['password'], properties: { password } },
      Category: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'color'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 40, example: 'Viajes' }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', example: '#0f766e' } },
      },
      Expense: {
        type: 'object',
        additionalProperties: false,
        required: ['amount', 'date', 'categoryId', 'description', 'paymentMethod'],
        properties: {
          amount: { type: 'string', maxLength: 20, example: '42.50' },
          date,
          categoryId: { type: 'string', format: 'uuid' },
          description: { type: 'string', minLength: 1, maxLength: 200, example: 'Compra semanal' },
          merchant: { type: ['string', 'null'], maxLength: 100, example: 'Mercado' },
          paymentMethod: { type: 'string', enum: ['CASH', 'CARD', 'TRANSFER', 'OTHER'] },
        },
      },
    },
  },
  paths: {
    '/api/health': { get: pub('Salud', 'Estado del servicio', { responses: { 200: ok('Servicio disponible') } }) },
    '/api/auth/register': {
      post: pub('Autenticación', 'Registro de cuenta (respuesta uniforme, anti-enumeración)', { requestBody: body(ref('Register')), responses: { 201: ok('Solicitud aceptada'), ...errors(400, 429) } }),
    },
    '/api/auth/login': {
      post: pub('Autenticación', 'Inicio de sesión (paso 1: contraseña)', { requestBody: body(ref('Login')), responses: { 200: ok('Sesión o desafío MFA', ref('Session')), ...errors(400, 401, 429) } }),
    },
    '/api/auth/login/mfa': {
      post: pub('Autenticación', 'Inicio de sesión (paso 2: código TOTP)', { requestBody: body(ref('MfaLogin')), responses: { 200: ok('Sesión', ref('Session')), ...errors(400, 401, 429) } }),
    },
    '/api/auth/refresh': {
      post: { tags: ['Autenticación'], summary: 'Renovación con rotación del refresh token (exige Origin de confianza)', security: [{ refreshCookie: [] }], responses: { 200: ok('Sesión renovada', ref('Session')), ...errors(401, 403, 429) } },
    },
    '/api/auth/logout': { post: { tags: ['Autenticación'], summary: 'Cierre de sesión', security: [{ refreshCookie: [] }], responses: { 204: ok('Sesión cerrada'), ...errors(403) } } },
    '/api/account/me': {
      get: op('Cuenta', 'Perfil propio', { responses: { 200: ok('Perfil', ref('User')), ...errors(401) } }),
      patch: op('Cuenta', 'Actualizar perfil', {
        requestBody: body({ type: 'object', additionalProperties: false, properties: { name: { type: 'string', minLength: 2, maxLength: 80 }, currency: { type: 'string', enum: ['EUR', 'USD', 'CLP'] } } }),
        responses: { 200: ok('Perfil actualizado', ref('User')), ...errors(400, 401, 409) },
      }),
    },
    '/api/account/password': {
      post: op('Cuenta', 'Cambiar contraseña (reautenticación)', {
        requestBody: body({ type: 'object', additionalProperties: false, required: ['currentPassword', 'newPassword'], properties: { currentPassword: password, newPassword: { ...password, minLength: 15, maxLength: 128 } } }),
        responses: { 200: ok('Contraseña cambiada; otras sesiones revocadas'), ...errors(400, 401, 429) },
      }),
    },
    '/api/account/mfa/setup': { post: op('Cuenta', 'Iniciar configuración TOTP', { responses: { 200: ok('Secreto y URI otpauth'), ...errors(401, 409, 429) } }) },
    '/api/account/mfa/enable': {
      post: op('Cuenta', 'Activar TOTP', { requestBody: body({ type: 'object', additionalProperties: false, required: ['code'], properties: { code: totp } }), responses: { 204: ok('Activado'), ...errors(400, 401, 409, 429) } }),
    },
    '/api/account/mfa/disable': {
      post: op('Cuenta', 'Desactivar TOTP (contraseña y código)', {
        requestBody: body({ type: 'object', additionalProperties: false, required: ['password', 'code'], properties: { password, code: totp } }),
        responses: { 204: ok('Desactivado'), ...errors(400, 401, 409, 429) },
      }),
    },
    '/api/account/sessions': { get: op('Cuenta', 'Sesiones activas', { responses: { 200: ok('Lista de sesiones'), ...errors(401) } }) },
    '/api/account/sessions/revoke-others': {
      post: op('Cuenta', 'Cerrar las demás sesiones (reautenticación)', { requestBody: body(ref('Reauth')), responses: { 200: ok('Sesiones cerradas'), ...errors(400, 401, 429) } }),
    },
    '/api/account/sessions/{id}/revoke': {
      post: op('Cuenta', 'Cerrar una sesión propia (reautenticación)', { parameters: [idParam], requestBody: body(ref('Reauth')), responses: { 204: ok('Sesión cerrada'), ...errors(400, 401, 404, 429) } }),
    },
    '/api/account/delete': {
      post: op('Cuenta', 'Suprimir la cuenta y sus datos (RGPD art. 17)', {
        requestBody: body({ type: 'object', additionalProperties: false, required: ['password', 'confirm'], properties: { password, code: totp, confirm: { type: 'string', const: 'ELIMINAR' } } }),
        responses: { 204: ok('Cuenta eliminada'), ...errors(400, 401, 409, 429) },
      }),
    },
    '/api/account/activity': { get: op('Cuenta', 'Actividad reciente propia', { responses: { 200: ok('Eventos de auditoría propios'), ...errors(401) } }) },
    '/api/categories': {
      get: op('Categorías', 'Listar categorías propias', { responses: { 200: ok('Categorías'), ...errors(401) } }),
      post: op('Categorías', 'Crear categoría', { requestBody: body(ref('Category')), responses: { 201: ok('Creada'), ...errors(400, 401, 409) } }),
    },
    '/api/categories/{id}': {
      patch: op('Categorías', 'Modificar categoría', {
        parameters: [idParam],
        requestBody: body({ type: 'object', additionalProperties: false, properties: { name: { type: 'string', minLength: 1, maxLength: 40 }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } } }),
        responses: { 200: ok('Modificada'), ...errors(400, 401, 404, 409) },
      }),
      delete: op('Categorías', 'Eliminar categoría sin gastos', { parameters: [idParam], responses: { 204: ok('Eliminada'), ...errors(401, 404, 409) } }),
    },
    '/api/expenses': {
      get: op('Gastos', 'Listar gastos propios con filtros', {
        parameters: [
          { name: 'from', in: 'query', schema: date },
          { name: 'to', in: 'query', schema: date },
          { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] } },
          ...pageParams,
        ],
        responses: { 200: ok('Página de gastos'), ...errors(400, 401) },
      }),
      post: op('Gastos', 'Registrar gasto', { requestBody: body(ref('Expense')), responses: { 201: ok('Creado'), ...errors(400, 401) } }),
    },
    '/api/expenses/{id}': {
      get: op('Gastos', 'Consultar gasto propio', { parameters: [idParam], responses: { 200: ok('Gasto'), ...errors(401, 404) } }),
      patch: op('Gastos', 'Modificar gasto propio', { parameters: [idParam], requestBody: body({ ...ref('Expense') }), responses: { 200: ok('Modificado'), ...errors(400, 401, 404) } }),
      delete: op('Gastos', 'Borrado lógico de gasto propio', { parameters: [idParam], responses: { 204: ok('Borrado'), ...errors(401, 404) } }),
    },
    '/api/expenses/{id}/receipt': {
      post: op('Gastos', 'Adjuntar justificante (PDF, PNG, JPEG o WebP validado por firma)', {
        parameters: [idParam],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['receipt'], properties: { receipt: { type: 'string', format: 'binary' } } } } } },
        responses: { 201: ok('Adjuntado'), ...errors(400, 401, 404, 413, 429) },
      }),
      get: op('Gastos', 'Descargar justificante como adjunto aislado', { parameters: [idParam], responses: { 200: ok('Fichero'), ...errors(401, 404) } }),
      delete: op('Gastos', 'Eliminar justificante', { parameters: [idParam], responses: { 204: ok('Eliminado'), ...errors(401, 404) } }),
    },
    '/api/reports/summary': {
      get: op('Informes', 'Resumen mensual y evolución de 12 meses', {
        parameters: [{ name: 'month', in: 'query', schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', example: '2026-10' } }],
        responses: { 200: ok('Resumen'), ...errors(400, 401) },
      }),
    },
    '/api/reports/export.csv': {
      get: op('Informes', 'Exportación CSV con neutralización de fórmulas', {
        parameters: [
          { name: 'from', in: 'query', schema: date },
          { name: 'to', in: 'query', schema: date },
        ],
        responses: { 200: { description: 'CSV', content: { 'text/csv': { schema: { type: 'string' } } } }, ...errors(400, 401, 429) },
      }),
    },
    '/api/admin/users': {
      get: op('Administración', 'Listar cuentas (ADMIN con MFA)', { parameters: [{ name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } }, ...pageParams], responses: { 200: ok('Página de cuentas'), ...errors(401, 403) } }),
    },
    '/api/admin/users/{id}': {
      patch: op('Administración', 'Cambiar rol o estado de una cuenta', {
        parameters: [idParam],
        requestBody: body({ type: 'object', additionalProperties: false, properties: { role: { type: 'string', enum: ['USER', 'AUDITOR', 'ADMIN'] }, status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] } } }),
        responses: { 200: ok('Cuenta modificada'), ...errors(400, 401, 403, 404, 409) },
      }),
    },
    '/api/admin/users/{id}/unlock': { post: op('Administración', 'Desbloquear cuenta', { parameters: [idParam], responses: { 200: ok('Desbloqueada'), ...errors(401, 403, 404) } }) },
    '/api/admin/users/{id}/reset-mfa': { post: op('Administración', 'Reiniciar segundo factor', { parameters: [idParam], responses: { 200: ok('Reiniciado'), ...errors(401, 403, 404) } }) },
    '/api/admin/users/{id}/revoke-sessions': { post: op('Administración', 'Cerrar las sesiones de un usuario', { parameters: [idParam], responses: { 200: ok('Sesiones cerradas'), ...errors(401, 403, 404) } }) },
    '/api/admin/sessions/revoke-all': {
      post: op('Administración', 'Cerrar todas las sesiones de la plataforma (reautenticación)', { requestBody: body(ref('Reauth')), responses: { 200: ok('Sesiones cerradas'), ...errors(400, 401, 403, 429) } }),
    },
    '/api/audit/logs': {
      get: op('Auditoría', 'Consultar el registro de auditoría (ADMIN o AUDITOR con MFA)', {
        parameters: [
          { name: 'action', in: 'query', schema: { type: 'string', pattern: '^[A-Z_]{3,40}$' } },
          { name: 'outcome', in: 'query', schema: { type: 'string', enum: ['SUCCESS', 'FAILURE', 'DENIED'] } },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          ...pageParams,
        ],
        responses: { 200: ok('Página de eventos'), ...errors(400, 401, 403) },
      }),
    },
    '/api/audit/verify': { get: op('Auditoría', 'Verificar la integridad de la cadena HMAC', { responses: { 200: ok('Resultado de la verificación'), ...errors(401, 403) } }) },
    '/api/audit/alerts': {
      get: op('Auditoría', 'Listar alertas de seguridad', { parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'all'] } }, ...pageParams], responses: { 200: ok('Página de alertas'), ...errors(400, 401, 403) } }),
    },
    '/api/audit/alerts/{id}/ack': { post: op('Auditoría', 'Marcar una alerta como revisada (ADMIN)', { parameters: [idParam], responses: { 204: ok('Revisada'), ...errors(401, 403, 404) } }) },
  },
};

const out = `${ROOT}/docs/openapi.json`;
fs.writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`);
const operations = Object.values(spec.paths).reduce((total, item) => total + Object.keys(item).length, 0);
console.log(`OpenAPI escrito en ${out}: ${Object.keys(spec.paths).length} rutas, ${operations} operaciones`);
