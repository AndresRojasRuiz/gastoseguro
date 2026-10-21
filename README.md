# GastoSeguro

Aplicación web de **registro de gastos personales** desarrollada con un enfoque de
**seguridad por diseño**, tomando como marco de referencia el **OWASP Top 10:2025** y los
requisitos de verificación de **OWASP ASVS 5.0**.

> Trabajo Fin de Estudios (TFE) grupal · Máster Universitario en Ciberseguridad · UNIR
> Autores: Paul Ormazabal, Andrés Rojas y José Ruz

---

## Funcionalidades

| Área | Descripción |
|---|---|
| Gastos | Alta, edición, borrado lógico, búsqueda, filtros por fecha y categoría, paginación |
| Justificantes | Adjuntar PDF/PNG/JPEG/WebP (validados por firma binaria), descarga aislada |
| Categorías | Categorías propias con color; protección frente a borrado con gastos asociados |
| Informes | Resumen mensual, evolución de 12 meses, gasto por categoría, exportación CSV segura |
| Cuenta | Perfil, cambio de contraseña, segundo factor TOTP, sesiones activas (cierre con reautenticación), actividad, supresión de la cuenta |
| Administración | Gestión de roles y estado de cuentas, desbloqueo, reinicio de MFA, cierre de sesiones de un usuario o de toda la plataforma |
| Auditoría | Registro encadenado con HMAC-SHA256, verificación de integridad y alertas |
| Privacidad | Plazos de conservación con purga automática, supresión de la cuenta (RGPD art. 17), minimización de datos |

Roles: **USER** (sus propios gastos), **AUDITOR** (lectura de auditoría y alertas) y
**ADMIN** (gestión de cuentas). Los roles AUDITOR y ADMIN solo pueden ejercerse con el segundo
factor activado. Los administradores **no** pueden ver los gastos de los
usuarios (mínimo privilegio y minimización de datos, RGPD art. 5.1.c).

## Controles de seguridad por categoría OWASP Top 10:2025

| Categoría | Controles implementados |
|---|---|
| **A01** Broken Access Control | Autorización en servidor con denegación por defecto; RBAC; control de propiedad en cada objeto (anti-IDOR/BOLA) con respuesta 404; UUID no secuenciales; rol leído siempre de la BD; detección de sondeo de identificadores |
| **A02** Security Misconfiguration | Validación de configuración al arrancar (*fail fast*); CSP estricta con Trusted Types; HSTS, COOP/CORP/COEP, `X-Frame-Options`, `Permissions-Policy`; CORS con lista blanca; `trust proxy` explícito; sin `X-Powered-By`; contenedor sin privilegios y de solo lectura |
| **A03** Software Supply Chain Failures | Versiones exactas + `package-lock.json`; `npm audit` y `npm audit signatures` en CI; `overrides` para dependencias transitivas vulnerables; SBOM CycloneDX; Dependabot; acciones de CI fijadas por SHA; imágenes Docker fijadas por digest; dependencias mínimas |
| **A04** Cryptographic Failures | Argon2id (m=19 MiB, t=2, p=1); AES-256-GCM con AAD para secretos TOTP; tokens de 256 bits con CSPRNG; refresh tokens almacenados como SHA-256; TLS 1.2/1.3 en el proxy |
| **A05** Injection | Validación con Zod (listas blancas, objetos estrictos); ORM con consultas parametrizadas y prohibición de SQL "unsafe" por ESLint; React sin `dangerouslySetInnerHTML`; CSV con neutralización de fórmulas; analizador de query "simple" |
| **A06** Insecure Design | Modelado de amenazas STRIDE y casos de abuso; importes en enteros (céntimos); límites de negocio; limitación de tasa; paginación acotada; sesiones con caducidad absoluta e inactividad |
| **A07** Authentication Failures | Política NIST SP 800-63B con 10.898 contraseñas comunes bloqueadas; mensajes genéricos y tiempos igualados (anti-enumeración); bloqueo temporal; MFA TOTP con anti-repetición, obligatorio para roles privilegiados; JWT `at+jwt` de 15 min + refresh rotatorio con detección de reutilización; cookie `__Host-` HttpOnly/Secure/SameSite=Strict; reautenticación para cerrar sesiones o activar MFA; máximo de 10 sesiones; sin credenciales por defecto |
| **A08** Software or Data Integrity Failures | Cadena de auditoría HMAC verificable; huella SHA-256 de justificantes verificada en cada descarga; verificación estricta de firma JWT (algoritmo fijo); integridad del lockfile y de las firmas del registro |
| **A09** Security Logging & Alerting Failures | Logs JSON estructurados con redacción de secretos; ID de correlación por petición; auditoría de eventos de seguridad; 6 reglas de detección con alertas y panel de revisión |
| **A10** Mishandling of Exceptional Conditions | Gestor de errores centralizado sin fuga de información; fallo cerrado en autenticación/autorización; transacciones y limpieza de ficheros huérfanos; tiempos máximos del servidor; parada ordenada ante excepciones no capturadas |

## Arquitectura

```
Navegador (SPA React)  ──HTTPS──▶  Caddy (TLS, HSTS)  ──▶  API Express 5 + TypeScript  ──▶  PostgreSQL / SQLite
   token en memoria                                        │ helmet · CORS · rate limit         (Prisma 7, consultas
   cookie HttpOnly (refresh)                               │ Zod · RBAC · auditoría            parametrizadas)
                                                           └─▶ almacenamiento de justificantes (fuera de la raíz web)
```

| Capa | Tecnología |
|---|---|
| Interfaz | React 19, React Router 7, Vite 8, TypeScript 5.9 (sin librerías de UI externas) |
| API | Node.js ≥ 22.12, Express 5, Zod 4, Prisma 7, jose (JWT), @node-rs/argon2, multer, pino |
| Datos | SQLite (desarrollo) · PostgreSQL 17 (producción) |
| Pruebas | Vitest + Supertest (110 pruebas, la mayoría de seguridad; SQLite y PostgreSQL) |
| CI/CD | GitHub Actions: npm audit, firmas, ESLint security, pruebas en SQLite y PostgreSQL, CodeQL, OWASP ZAP, SBOM |

## Puesta en marcha (desarrollo)

Requisitos: **Node.js 22.12 o superior** (probado con Node 26) y npm 10+.

```bash
npm install          # instala las dependencias de API e interfaz (lockfile)
npm run setup        # genera backend/.env con secretos aleatorios, migra la BD y carga datos demo
npm run dev          # API en :4000 + interfaz con recarga en http://localhost:5173
```

Modo producción local (interfaz compilada servida por la API, mismo origen):

```bash
npm run build
npm start            # http://localhost:4000
```

### Cuentas de demostración

`npm run setup` crea tres cuentas con contraseñas **aleatorias** propias de cada instalación
(no hay credenciales por defecto en el código). Consulta las variables `SEED_*` de
`backend/.env`:

| Rol | Correo |
|---|---|
| Administrador | `admin@gastoseguro.local` |
| Auditor | `auditor@gastoseguro.local` |
| Usuario (con 12 meses de gastos) | `demo@gastoseguro.local` |

## Verificación de seguridad

```bash
npm test                 # 110 pruebas automatizadas (unitarias y de integración, SQLite)
npm run test:postgres -w backend   # misma batería en PostgreSQL (TEST_DATABASE_URL, BD vacía)
npm run lint             # ESLint + eslint-plugin-security + reglas propias
npm run typecheck        # TypeScript estricto
npm run audit:deps       # npm audit (umbral: high)
npm audit signatures     # firmas y procedencia de los paquetes
npm run sbom             # SBOM CycloneDX en docs/sbom.cdx.json
npm run manifest         # huellas SHA-256 de fuentes y evidencias (docs/evidencias)
npm run db:purge -w backend        # purga manual de datos caducados
```

Las pruebas cubren, entre otros: IDOR/BOLA, RBAC, asignación masiva, inyección SQL y XSS,
contaminación de parámetros, manipulación de JWT (`alg:none`, firma, caducidad), rotación y
reutilización de refresh tokens, CSRF por Origin/Fetch Metadata, bloqueo de cuentas,
limitación de tasa, MFA y anti-repetición, subida de ficheros maliciosos, inyección CSV,
cabeceras de seguridad, detección de manipulaciones en la auditoría, MFA obligatorio para roles
privilegiados, reautenticación, límite de sesiones, supresión de la cuenta y purga por conservación.

Además se realizó un análisis dinámico autenticado con OWASP ZAP 2.17 (especificación
`docs/openapi.json`, perfiles de usuario y de administrador). Los planes, informes y el triaje están
en `docs/evidencias/zap/`.

## Despliegue de referencia (Docker)

```bash
node scripts/production-env.mjs https://gastos.midominio.es   # genera deploy/app.env y deploy/db.env
docker compose up -d --build
```

Servicios: `proxy` (Caddy, TLS automático) → `app` (usuario sin privilegios, sistema de
ficheros de solo lectura, sin capacidades) → `db` (PostgreSQL en red interna sin salida).
Las migraciones se aplican en un contenedor efímero (`migrate`).

## Estructura

```
backend/            API REST (Express + Prisma)
  prisma/           esquema, migraciones SQLite y PostgreSQL
  src/config        validación de configuración
  src/lib           criptografía, contraseñas, TOTP, JWT, ficheros, CSV, logger
  src/middleware    autenticación, autorización, cabeceras, límites, errores
  src/services      lógica de negocio, auditoría y alertas
  src/routes        rutas HTTP
  tests/            pruebas de seguridad (Vitest + Supertest)
frontend/           SPA React
deploy/             Caddyfile y ficheros de entorno de producción (no versionados)
docs/               memoria del TFE, capturas, SBOM
.github/            CI de seguridad y Dependabot
```

## Licencia

MIT. Proyecto académico sin garantía; antes de un uso real, consulte `SECURITY.md`.
