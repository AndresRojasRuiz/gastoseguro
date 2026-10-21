# -*- coding: utf-8 -*-
import json
import os

from .dsl import CODE, F, H3A, OL, P, PB, T, UL

EVIDENCE_DIR = 'C:/Users/andre/Documents/GastoSeguro/docs/evidencias'
EVIDENCE = f'{EVIDENCE_DIR}/pruebas-vitest.json'


def test_rows():
    with open(EVIDENCE, encoding='utf-8') as handle:
        report = json.load(handle)
    order = ['unit.test.ts', 'auth.test.ts', 'mfa.test.ts', 'privacy-sessions.test.ts', 'access-control.test.ts', 'input-validation.test.ts', 'files-reports.test.ts', 'logging-config.test.ts']
    files = sorted(report['testResults'], key=lambda r: order.index(os.path.basename(r['name'])) if os.path.basename(r['name']) in order else 99)
    rows = []
    number = 0
    for result in files:
        name = os.path.basename(result['name'])
        for assertion in result['assertionResults']:
            number += 1
            group = ' › '.join(assertion.get('ancestorTitles') or [])
            status = 'Superada' if assertion['status'] == 'passed' else assertion['status']
            title = assertion['title'].replace('\\"', '"').replace('\t', '\t').replace('*', '∗')
            rows.append([str(number), name.replace('.test.ts', ''), group, title, status])
    return rows


ENDPOINTS_AUTH = [
    ['GET', '/api/health', 'Pública', 'Comprobación de salud'],
    ['POST', '/api/auth/register', 'Pública (10/h por IP)', 'Registro de cuenta'],
    ['POST', '/api/auth/login', 'Pública (10/15 min por IP+cuenta; 50 por IP)', 'Inicio de sesión'],
    ['POST', '/api/auth/login/mfa', 'Pública (10/15 min)', 'Verificación del segundo factor'],
    ['POST', '/api/auth/refresh', 'Cookie + origen de confianza', 'Renovación de la sesión'],
    ['POST', '/api/auth/logout', 'Cookie + origen de confianza', 'Cierre de sesión'],
    ['GET', '/api/account/me', 'Autenticado', 'Perfil propio'],
    ['PATCH', '/api/account/me', 'Autenticado', 'Modificar nombre o moneda'],
    ['POST', '/api/account/password', 'Autenticado (20/15 min)', 'Cambio de contraseña (contraseña actual)'],
    ['POST', '/api/account/mfa/setup', 'Autenticado (20/15 min)', 'Iniciar configuración de TOTP'],
    ['POST', '/api/account/mfa/enable', 'Autenticado (20/15 min)', 'Activar TOTP (código + contraseña)'],
    ['POST', '/api/account/mfa/disable', 'Autenticado (20/15 min)', 'Desactivar TOTP (contraseña + código)'],
    ['GET', '/api/account/sessions', 'Autenticado', 'Sesiones activas propias'],
    ['POST', '/api/account/sessions/revoke-others', 'Autenticado (20/15 min)', 'Cerrar las demás sesiones (contraseña)'],
    ['POST', '/api/account/sessions/:id/revoke', 'Autenticado (propia; 20/15 min)', 'Cerrar una sesión (contraseña)'],
    ['POST', '/api/account/delete', 'Autenticado (20/15 min)', 'Suprimir la cuenta (contraseña, TOTP y confirmación)'],
    ['GET', '/api/account/activity', 'Autenticado', 'Actividad reciente propia'],
]

ENDPOINTS_DATA = [
    ['GET', '/api/categories', 'Autenticado (propias)', 'Listar categorías'],
    ['POST', '/api/categories', 'Autenticado', 'Crear categoría'],
    ['PATCH', '/api/categories/:id', 'Autenticado (propia)', 'Modificar categoría'],
    ['DELETE', '/api/categories/:id', 'Autenticado (propia)', 'Eliminar categoría sin gastos'],
    ['GET', '/api/expenses', 'Autenticado (propios)', 'Listar con filtros, orden y paginación'],
    ['POST', '/api/expenses', 'Autenticado', 'Crear gasto'],
    ['GET', '/api/expenses/:id', 'Autenticado (propio)', 'Consultar gasto'],
    ['PATCH', '/api/expenses/:id', 'Autenticado (propio)', 'Modificar gasto'],
    ['DELETE', '/api/expenses/:id', 'Autenticado (propio)', 'Eliminar gasto (lógico)'],
    ['POST', '/api/expenses/:id/receipt', 'Autenticado (propio; 30/15 min)', 'Subir justificante'],
    ['GET', '/api/expenses/:id/receipt', 'Autenticado (propio)', 'Descargar justificante'],
    ['DELETE', '/api/expenses/:id/receipt', 'Autenticado (propio)', 'Eliminar justificante'],
    ['GET', '/api/reports/summary', 'Autenticado (propios)', 'Resumen mensual y anual'],
    ['GET', '/api/reports/export.csv', 'Autenticado (propios; 20/15 min)', 'Exportación CSV'],
    ['GET', '/api/admin/users', 'ADMIN con MFA', 'Listar usuarios'],
    ['PATCH', '/api/admin/users/:id', 'ADMIN con MFA (no la propia)', 'Cambiar rol o estado'],
    ['POST', '/api/admin/users/:id/unlock', 'ADMIN con MFA (no la propia)', 'Desbloquear cuenta'],
    ['POST', '/api/admin/users/:id/reset-mfa', 'ADMIN con MFA (no la propia)', 'Reiniciar segundo factor'],
    ['POST', '/api/admin/users/:id/revoke-sessions', 'ADMIN con MFA (no la propia)', 'Cerrar las sesiones de un usuario'],
    ['POST', '/api/admin/sessions/revoke-all', 'ADMIN con MFA (contraseña; 20/15 min)', 'Cerrar todas las sesiones salvo la propia'],
    ['GET', '/api/audit/logs', 'ADMIN o AUDITOR con MFA', 'Registro de auditoría con filtros'],
    ['GET', '/api/audit/verify', 'ADMIN o AUDITOR con MFA', 'Verificar integridad de la cadena'],
    ['GET', '/api/audit/alerts', 'ADMIN o AUDITOR con MFA', 'Listar alertas'],
    ['POST', '/api/audit/alerts/:id/ack', 'ADMIN con MFA', 'Marcar alerta como revisada'],
]

ENV_VARS = [
    ['NODE_ENV', 'development', 'Entorno (`development`, `test`, `production`). En producción se aplican reglas adicionales.'],
    ['PORT', '4000', 'Puerto de la API.'],
    ['DATABASE_URL', '— (obligatoria)', 'Conexión: `file:./data/…` (SQLite) o `postgresql://…`.'],
    ['DB_PROVIDER', 'sqlite', '`postgresql` para usar el esquema y las migraciones de PostgreSQL.'],
    ['APP_ORIGIN', 'http://localhost:5173,http://localhost:4000', 'Orígenes permitidos (CORS y verificación de origen).'],
    ['TRUST_PROXY', '0', 'Número de proxies inversos de confianza.'],
    ['JWT_SECRET', '— (obligatoria)', 'Clave de firma de tokens (≥ 256 bits, base64).'],
    ['DATA_ENCRYPTION_KEY', '— (obligatoria)', 'Clave AES-256-GCM (exactamente 256 bits, base64).'],
    ['AUDIT_HMAC_KEY', '— (obligatoria)', 'Clave HMAC de la auditoría (≥ 256 bits, base64).'],
    ['ACCESS_TOKEN_TTL_SECONDS', '900', 'Vida del token de acceso (60–3600 s).'],
    ['SESSION_ABSOLUTE_HOURS', '12', 'Caducidad absoluta de la sesión (1–24 h).'],
    ['SESSION_IDLE_MINUTES', '30', 'Caducidad por inactividad (5–120 min).'],
    ['MAX_SESSIONS_PER_USER', '10', 'Sesiones simultáneas por cuenta; al superarse se cierran las más antiguas.'],
    ['MAX_FAILED_LOGINS / LOCKOUT_MINUTES', '5 / 15', 'Umbral y duración del bloqueo de cuenta.'],
    ['RATE_LIMIT_LOGIN_MAX', '10', 'Intentos de inicio de sesión por IP y cuenta cada 15 min (×5 por IP).'],
    ['RATE_LIMIT_GLOBAL_MAX', '600', 'Peticiones a la API por IP cada 15 min.'],
    ['RATE_LIMIT_REGISTER_MAX', '10', 'Registros por IP y hora.'],
    ['AUTH_MIN_RESPONSE_MS', '400', 'Duración mínima uniforme de las operaciones de autenticación.'],
    ['PASSWORD_BREACH_CHECK', 'off', '`hibp` para comprobar contraseñas filtradas por k-anonimato.'],
    ['COOKIE_SECURE', 'true', 'Atributo `Secure` de la cookie (obligatorio en producción).'],
    ['UPLOAD_DIR / MAX_UPLOAD_BYTES', './storage/receipts / 5 MB', 'Directorio y tamaño máximo de los justificantes.'],
    ['STATIC_DIR', '../frontend/dist', 'Interfaz compilada que sirve la API.'],
    ['RETENTION_DELETED_EXPENSES_DAYS / RETENTION_SESSIONS_DAYS', '30 / 30', 'Conservación de gastos borrados y de sesiones cerradas antes de su purga.'],
    ['RETENTION_PURGE_INTERVAL_HOURS', '24', 'Periodicidad de la purga automática (0 la desactiva).'],
    ['LOG_LEVEL', 'info', 'Nivel de registro.'],
]

def evidence_rows():
    """Filas de la tabla de huellas a partir de los manifiestos generados antes de compilar."""
    rows = []
    for manifest in ('MANIFIESTO-EVIDENCIAS.sha256',):
        with open(f'{EVIDENCE_DIR}/{manifest}', encoding='utf-8') as handle:
            for line in handle:
                digest, name = line.strip().split(None, 1)
                rows.append([f'`{name.lstrip("*")}`', f'`{digest}`'])
    with open(f'{EVIDENCE_DIR}/HUELLA-MANIFIESTO-FUENTES.txt', encoding='utf-8') as handle:
        digest = handle.read().split()[0]
    rows.append(['`MANIFIESTO-FUENTES.sha256` (versión 1.0.0)', f'`{digest}`'])
    return rows


SUS_ITEMS = [
    'Creo que me gustaría usar esta aplicación con frecuencia.',
    'He encontrado la aplicación innecesariamente compleja.',
    'Me ha parecido que la aplicación era fácil de usar.',
    'Creo que necesitaría la ayuda de una persona con conocimientos técnicos para poder usar esta aplicación.',
    'He encontrado que las distintas funciones de la aplicación estaban bien integradas.',
    'Me ha parecido que la aplicación tenía demasiadas incoherencias.',
    'Imagino que la mayoría de las personas aprendería a usar esta aplicación muy rápidamente.',
    'He encontrado la aplicación muy engorrosa de usar.',
    'Me he sentido muy seguro/a usando la aplicación.',
    'He necesitado aprender muchas cosas antes de poder manejarme con la aplicación.',
]

BLOCKS = [
    # --------------------------------------------------------------------------------------
    ('anexo', 'Manual de instalación y despliegue'),
    P('Este anexo describe cómo instalar, ejecutar, verificar y desplegar GastoSeguro. El repositorio incluye además un fichero README con la misma información resumida.'),
    H3A('Requisitos'),
    UL(
        'Node.js 22.12 o superior (probado con Node.js 26.2) y npm 10 o superior.',
        'Para el despliegue con contenedores: Docker Engine con Docker Compose v2.',
        'No se necesita ningún servidor de base de datos en desarrollo: se usa SQLite.',
    ),
    H3A('Instalación y ejecución en desarrollo'),
    P('Desde la raíz del repositorio:'),
    CODE('''npm install          # instala las dependencias de la API y de la interfaz (lockfile)
npm run setup        # genera backend/.env con secretos aleatorios, migra la BD y carga datos demo
npm run dev          # API en http://localhost:4000 e interfaz con recarga en http://localhost:5173'''),
    P('El *script* `setup` crea tres cuentas de demostración (administrador, auditor y un usuario con doce meses de gastos) con contraseñas aleatorias propias de cada instalación, que pueden consultarse en las variables `SEED_*` del fichero `backend/.env`. El fichero `.env` nunca se versiona. Las cuentas de administrador y auditor deben activar el segundo factor en su primer acceso: hasta entonces, sus funciones privilegiadas permanecen bloqueadas.'),
    H3A('Ejecución en modo de producción local'),
    CODE('''npm run build        # compila la interfaz (Vite) y la API (TypeScript)
npm start            # la API sirve también la interfaz compilada en http://localhost:4000'''),
    H3A('Verificación'),
    CODE('''npm test                  # 110 pruebas automatizadas (SQLite)
npm run test:postgres -w backend   # la misma batería en PostgreSQL (TEST_DATABASE_URL, BD vacía)
npm run lint              # ESLint con reglas de seguridad
npm run typecheck         # TypeScript estricto en API e interfaz
npm run audit:deps        # npm audit (umbral high)
npm audit signatures      # firmas y procedencia de los paquetes
npm run sbom              # SBOM CycloneDX en docs/sbom.cdx.json
npm run db:purge -w backend        # purga manual de los datos caducados'''),
    H3A('Despliegue con contenedores'),
    CODE('''node scripts/production-env.mjs https://gastos.midominio.es   # genera deploy/app.env y deploy/db.env
docker compose up -d --build                                  # proxy TLS + app + PostgreSQL
docker compose ps                                             # estado y comprobaciones de salud'''),
    P('El primer arranque construye las imágenes, aplica las migraciones de PostgreSQL en un contenedor efímero y, si el dominio es público, obtiene el certificado TLS. Para el dominio de laboratorio `gastoseguro.localhost`, Caddy usa su autoridad de certificación interna.'),
    H3A('Variables de configuración'),
    T('envvars', 'Variables de configuración de la API.',
      ['Variable', 'Valor por defecto', 'Descripción'],
      ENV_VARS, widths=[30, 24, 46], size=17),

    # --------------------------------------------------------------------------------------
    ('anexo', 'Catálogo de la API'),
    P('La {tab:endpoints} y la {tab:endpoints2} enumeran las 41 operaciones de la API REST con su método, ruta, requisito de autorización (y límite de tasa específico, cuando existe) y descripción. Todas las rutas aplican además el límite global de 600 peticiones cada 15 minutos por IP. La especificación OpenAPI 3.1 equivalente se encuentra en `docs/openapi.json`.'),
    T('endpoints', 'Catálogo de la API: salud, autenticación y cuenta.',
      ['Método', 'Ruta', 'Autorización', 'Descripción'],
      ENDPOINTS_AUTH, widths=[11, 35, 28, 26], size=16),
    ('pagebreak',),
    T('endpoints2', 'Catálogo de la API: datos, informes, administración y auditoría.',
      ['Método', 'Ruta', 'Autorización', 'Descripción'],
      ENDPOINTS_DATA, widths=[11, 35, 28, 26], size=16),

    # --------------------------------------------------------------------------------------
    ('anexo', 'Listado de pruebas automatizadas'),
    P('La {tab:listapruebas} recoge las 110 pruebas automatizadas de la versión entregada y su resultado, extraído del informe de ejecución de Vitest (`docs/evidencias/pruebas-vitest.json`). Las pruebas se ejecutan con `npm test` y forman parte del canal de integración continua; la misma batería se superó también sobre PostgreSQL (Anexo F).'),
    T('listapruebas', 'Listado de las pruebas automatizadas y su resultado.',
      ['N.º', 'Fichero', 'Grupo', 'Prueba', 'Resultado'],
      test_rows(), widths=[6, 14, 24, 44, 12], size=15, align=['center', 'left', 'left', 'left', 'center'],
      source='Elaboración propia a partir del informe de Vitest.'),

    # --------------------------------------------------------------------------------------
    ('anexo', 'Fragmentos de código relevantes'),
    P('Se incluyen a continuación fragmentos significativos del código fuente, simplificados en algunos casos eliminando comentarios. El código completo se encuentra en el repositorio del proyecto.'),
    H3A('Rotación del token de refresco con detección de reutilización'),
    CODE('''if (stored.usedAt !== null) {
  // Un token ya rotado se ha vuelto a presentar: existe una copia en manos de un tercero.
  if (!session.revokedAt) {
    await prisma.session.update({ where: { id: session.id },
      data: { revokedAt: new Date(), revokeReason: 'TOKEN_REUSE' } });
  }
  await audit({ action: 'AUTH_TOKEN_REUSE', outcome: 'DENIED', userId: user.id, targetId: session.id, client });
  await raiseAlert({ type: 'TOKEN_REUSE', severity: 'HIGH', userId: user.id, ip: client.ip,
    message: 'Se ha reutilizado un refresh token ya rotado: posible robo de sesión.' });
  throw unauthorized(INVALID_SESSION);
}
const newRefreshToken = randomToken(32);
await prisma.$transaction(async (tx) => {
  const marked = await tx.refreshToken.updateMany({ where: { id: stored.id, usedAt: null },
    data: { usedAt: new Date() } });
  if (marked.count !== 1) throw unauthorized(INVALID_SESSION);   // uso concurrente
  await tx.refreshToken.create({ data: { sessionId: session.id,
    tokenHash: sha256Hex(newRefreshToken), expiresAt: session.expiresAt } });
  await tx.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
});'''),
    H3A('Escritura y verificación de la cadena de auditoría'),
    CODE('''async function writeEntry(event: AuditEvent): Promise<void> {
  const last = await prisma.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
  const createdAt = new Date();
  const entry: CanonicalEntry = { createdAt: createdAt.toISOString(), action: event.action,
    outcome: event.outcome, /* … resto de campos … */ prevHash: last?.hash ?? GENESIS_HASH };
  await prisma.auditLog.create({ data: { ...entry, createdAt, hash: computeAuditHash(entry) } });
}

export const computeAuditHash = (entry: CanonicalEntry): string =>
  createHmac('sha256', AUDIT_KEY).update(canonicalize(entry), 'utf8').digest('hex');

// Verificación: para cada entrada en orden ascendente
if (row.prevHash !== previousHash) return { valid: false, brokenAtId: row.id, reason: 'enlace roto' };
if (computeAuditHash(toCanonical(row)) !== row.hash) return { valid: false, brokenAtId: row.id, reason: 'contenido modificado' };'''),
    H3A('Detección del tipo real de un fichero'),
    CODE('''export function detectFileType(buffer: Buffer): AllowedMimeType | null {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';             // %PDF-
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp';
  return null;   // cualquier otro contenido se rechaza
}'''),
    H3A('Neutralización de fórmulas en la exportación CSV'),
    CODE('''const FORMULA_TRIGGERS = /^[=+\\-@\\t\\r]/;

export function escapeCsvField(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_TRIGGERS.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}'''),
    H3A('Verificación de origen en las rutas autenticadas con cookie'),
    CODE('''export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (!origin || !env.APP_ORIGIN.includes(origin) || fetchSite === 'cross-site') {
    throw forbidden('Origen de la petición no permitido.');
  }
  next();
};'''),
    H3A('Validación de la configuración al arrancar (extracto)'),
    CODE('''const EnvSchema = z.object({
  JWT_SECRET: base64Secret(32),              // al menos 256 bits
  DATA_ENCRYPTION_KEY: base64Secret(32, 32), // exactamente 256 bits
  AUDIT_HMAC_KEY: base64Secret(32),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  /* … */
}).superRefine((cfg, ctx) => {
  if (cfg.NODE_ENV !== 'production') return;
  if (cfg.APP_ORIGIN.some((o) => !o.startsWith('https://')))
    ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'en producción todos los orígenes deben usar https' });
  /* cookies Secure, PostgreSQL obligatorio, secretos distintos … */
});'''),

    # --------------------------------------------------------------------------------------
    ('anexo', 'Protocolo propuesto de validación de usabilidad (SUS)'),
    P('Este anexo describe un protocolo que **no se ha ejecutado** en el marco de este trabajo: se propone como trabajo futuro para completar la evaluación heurística del apartado 4.6 con una validación con usuarios, basada en el cuestionario *System Usability Scale* (SUS) de Brooke (1996), ampliamente utilizado por su sencillez y su fiabilidad con muestras pequeñas.'),
    H3A('Procedimiento'),
    OL(
        'Seleccionar entre 8 y 12 participantes sin conocimientos de seguridad, mayores de edad, que lleven o quieran llevar un registro de sus gastos. Recabar su consentimiento informado conforme al RGPD, usar solo datos ficticios en la aplicación y seudonimizar las respuestas.',
        'Pedir a cada participante que realice, sin ayuda, las siguientes tareas en la aplicación de demostración: crear una cuenta; activar el segundo factor con una aplicación de autenticación; registrar un gasto con su justificante; filtrar los gastos del último mes y exportarlos a CSV; cerrar las sesiones abiertas en otros dispositivos.',
        'Registrar para cada tarea si se completa, el tiempo empleado y los errores cometidos, prestando especial atención a la fricción introducida por los controles de seguridad (política de contraseñas, segundo factor, caducidad de la sesión).',
        'Al terminar, aplicar el cuestionario SUS y una breve entrevista sobre la percepción de seguridad y la claridad de los mensajes.',
    ),
    H3A('Cuestionario'),
    P('Cada afirmación se valora en una escala de 1 (totalmente en desacuerdo) a 5 (totalmente de acuerdo):'),
    T('sus', 'Cuestionario System Usability Scale (adaptación al castellano).',
      ['N.º', 'Afirmación', '1', '2', '3', '4', '5'],
      [[str(i + 1), item, '☐', '☐', '☐', '☐', '☐'] for i, item in enumerate(SUS_ITEMS)],
      widths=[6, 64, 6, 6, 6, 6, 6], align=['center', 'left', 'center', 'center', 'center', 'center', 'center'], size=18,
      source='Adaptado de Brooke (1996).'),
    H3A('Cálculo de la puntuación'),
    P('Para los ítems impares se resta 1 a la respuesta y para los pares se resta la respuesta de 5. La suma de los diez valores resultantes, multiplicada por 2,5, proporciona una puntuación de 0 a 100. La puntuación media de los participantes, junto con los tiempos de las tareas y las observaciones de la entrevista, permitiría valorar si los controles de seguridad de GastoSeguro son aceptables para los usuarios y priorizar las mejoras de usabilidad. Las respuestas y grabaciones se suprimirían al terminar el análisis.'),

    # --------------------------------------------------------------------------------------
    ('anexo', 'Evidencias de la verificación'),
    P('Este anexo reúne las evidencias que respaldan la evaluación. Las capturas reproducen, sin modificar su contenido, las salidas guardadas en `docs/evidencias` (se omiten líneas intermedias, indicadas con «…»). La {tab:huellas} identifica cada evidencia con su huella SHA-256, de modo que pueda comprobarse que no se ha alterado: basta con ejecutar `sha256sum -c MANIFIESTO-EVIDENCIAS.sha256` en ese directorio.'),
    F('evtest', 'ev-01-npm-test.png', 'Ejecución de la batería de pruebas sobre SQLite.', width=15.5),
    F('evpg', 'ev-02-postgresql.png', 'Batería de pruebas sobre PostgreSQL 17.10 y comprobación de los datos.', width=15.5),
    F('evaudit', 'ev-03-npm-audit.png', 'Análisis de dependencias y verificación de firmas y procedencia.', width=15.5),
    F('evsbom', 'ev-04-sbom.png', 'Generación del SBOM CycloneDX (extracto).', width=15.5),
    F('evzap', 'ev-05-zap.png', 'Resumen de los informes de OWASP ZAP (perfiles de usuario y de administrador).', width=15.5),
    T('huellas', 'Huellas SHA-256 de las evidencias y del manifiesto de fuentes.',
      ['Fichero', 'SHA-256'],
      evidence_rows(), widths=[30, 70], size=15,
      source='Elaboración propia (manifiestos en docs/evidencias).'),
]

