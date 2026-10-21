# -*- coding: utf-8 -*-
import json

from .dsl import F, H2, H3, P, PB, T, UL

EV = 'C:/Users/andre/Documents/GastoSeguro/docs/evidencias'


def _load(name):
    with open(f'{EV}/{name}', encoding='utf-8') as handle:
        return json.load(handle)


PERF = _load('rendimiento.json')
PERF_PG = _load('rendimiento-postgresql.json')
ZAP = _load('zap/resumen.json')


def num(value, decimals=1):
    """Número con coma decimal y punto de millares (formato español)."""
    text = f'{value:,.{decimals}f}' if decimals else f'{value:,.0f}'
    return text.replace(',', ' ').replace('.', ',').replace(' ', '.')


def latency_rows():
    labels = [
        ('GET /api/health (sin autenticación)', 'GET /api/health (sin autenticación)'),
        ('GET /api/expenses (20 elementos, autenticado)', 'GET /api/expenses (20 elementos)'),
        ('GET /api/expenses?q=… (búsqueda)', 'GET /api/expenses?q=… (búsqueda)'),
        ('GET /api/reports/summary (agregados 12 meses)', 'GET /api/reports/summary (12 meses)'),
        ('POST /api/auth/refresh (rotación)', 'POST /api/auth/refresh (rotación)'),
        ('POST /api/auth/login (con Argon2id)', 'POST /api/auth/login (Argon2id + mínimo)'),
        ('POST /api/auth/login (usuario inexistente)', 'POST /api/auth/login (usuario inexistente)'),
    ]
    rows = []
    for key, label in labels:
        a, b = PERF['api'][key], PERF_PG['api'][key]
        rows.append([label, str(a['n']), num(a['media']), num(a['p95']), num(b['media']), num(b['p95'])])
    return rows


QUERY_KEYS = ['GET /api/expenses (20 elementos, autenticado)', 'GET /api/expenses?q=… (búsqueda)', 'GET /api/reports/summary (agregados 12 meses)', 'POST /api/auth/refresh (rotación)']
MAX_P95 = max(max(PERF['api'][k]['p95'], PERF_PG['api'][k]['p95']) for k in QUERY_KEYS)
ARGON = PERF['argon2'][0]
U, A, PRE = ZAP['usuario'], ZAP['admin'], ZAP['adminAntesDeCorregir']
TOTAL_REQ = U['peticiones'] + A['peticiones']
WORDS = {1: 'una', 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco'}

BLOCKS = [
    H2('Evaluación'),
    P('La evaluación persigue determinar si los controles implementados son eficaces, es decir, si los casos de abuso representativos de cada categoría del OWASP Top 10:2025 son bloqueados, registrados y alertados, y con qué coste. Se ha planteado como una evaluación multidimensional en la que cada técnica compensa las limitaciones de las demás: pruebas automatizadas sobre los dos motores de base de datos, simulación de casos de abuso contra la aplicación en ejecución, un experimento controlado sobre el canal lateral de temporización, análisis estático y de dependencias, análisis dinámico con OWASP ZAP, verificación frente a ASVS 5.0, mediciones de rendimiento y una evaluación heurística de usabilidad. Las evidencias se conservan en `docs/evidencias`, identificadas con su huella SHA-256 (Anexo F), de modo que cualquier evaluador pueda reproducirlas y comprobar su integridad.'),
    T('entorno', 'Entorno de evaluación.',
      ['Elemento', 'Valor'],
      [
          ['Equipo', 'Portátil con procesador Intel Core i7-1360P (16 hilos), 15,6 GB de RAM'],
          ['Sistema operativo', 'Windows 11 (compilación 26200)'],
          ['Entorno de ejecución', 'Node.js 26.2.0, npm 11.13.0'],
          ['Bases de datos', 'SQLite (cliente libsql) y PostgreSQL 17.10 local; 3 usuarios de demostración y 220 gastos de 12 meses'],
          ['Navegador automatizado', 'Microsoft Edge (Chromium) sin interfaz, controlado con Playwright Core 1.64'],
          ['Análisis dinámico', 'OWASP ZAP 2.17.0 (Automation Framework) sobre Temurin JRE 21.0.12'],
          ['Modo de la aplicación', 'Compilación de producción (API compilada e interfaz servida desde el mismo origen)'],
      ],
      widths=[28, 72]),

    H3('Pruebas automatizadas'),
    P('La batería de pruebas consta de 110 pruebas distribuidas en ocho ficheros. Las pruebas de integración se ejecutan contra la aplicación Express real mediante Supertest, con una base de datos de pruebas creada desde cero en cada ejecución mediante las migraciones y con secretos efímeros generados en cada ejecución. La mayoría de las pruebas son casos negativos: describen un ataque y comprueban que falla. La {tab:pruebas} resume su distribución y resultado, y el listado completo figura en el Anexo C.'),
    T('pruebas', 'Resultados de la batería de pruebas automatizadas.',
      ['Fichero', 'Ámbito', 'Categorías', 'Pruebas', 'Superadas'],
      [
          ['unit.test.ts', 'TOTP (vectores RFC 6238), AES-GCM, Argon2id, política de contraseñas, importes, CSV, tipos de fichero y rutas', 'A04, A05, A06, A07', '36', '36'],
          ['auth.test.ts', 'Registro, inicio de sesión, enumeración, tiempos, bloqueo, tasa, JWT y su tipo, refresco, CSRF, cierre, inactividad, cambio de contraseña', 'A01, A07, A08', '21', '21'],
          ['input-validation.test.ts', 'Inyección SQL, XSS, caracteres de control y byte nulo, reglas de negocio, HPP, UUID, errores', 'A05, A06, A10', '20', '20'],
          ['access-control.test.ts', 'IDOR/BOLA, categorías y sesiones ajenas, sondeo, RBAC, salvaguardas de administración', 'A01', '10', '10'],
          ['privacy-sessions.test.ts', 'MFA obligatorio para roles privilegiados, cierre de sesiones con reautenticación y por administradores, límite de sesiones, lista de contraseñas, supresión de la cuenta, purga por conservación', 'A01, A06, A07', '10', '10'],
          ['logging-config.test.ts', 'Cabeceras, CORS, cadena de auditoría, manipulación y borrado, secretos en registros', 'A02, A08, A09', '7', '7'],
          ['files-reports.test.ts', 'Subida y descarga de justificantes, ficheros disfrazados, tamaño, CSV', 'A01, A05', '4', '4'],
          ['mfa.test.ts', 'Activación de MFA con reautenticación, desafío, anti-repetición, límite de intentos', 'A07', '2', '2'],
          ['**Total**', '', '', '**110**', '**110**'],
      ],
      widths=[20, 45, 13, 10, 12], align=['left', 'left', 'left', 'center', 'center'], size=17,
      source='Elaboración propia (informes en docs/evidencias/pruebas-vitest.txt y pruebas-postgresql.txt).'),
    P('Las 110 pruebas se superan en una ejecución completa de unos 50 segundos, de los que la mayor parte corresponde al coste deliberado de Argon2id y a la duración mínima de las operaciones de autenticación. Al formar parte del canal de integración continua, cualquier cambio que debilite un control (por ejemplo, eliminar la condición de propietario de una consulta o aceptar un campo adicional en un esquema) rompe al menos una prueba y bloquea su integración, de modo que las pruebas actúan también como pruebas de regresión de seguridad.'),

    H3('Validación sobre PostgreSQL'),
    P('La aplicación usa SQLite en desarrollo y PostgreSQL en producción. Como la configuración de producción no se ha desplegado con contenedores, se verificó por separado que la aplicación funciona sobre el motor de producción. Para ello se añadió la orden `npm run test:postgres`, que genera el cliente de Prisma para PostgreSQL, aplica las migraciones de `prisma/postgres/migrations` a una base de datos vacía, ejecuta la batería completa y restaura después el cliente de SQLite. La orden no borra ninguna base de datos: exige una vacía, que en el canal de CI aporta un contenedor de servicio de PostgreSQL 17 nuevo en cada ejecución.'),
    P('En local se empleó un servidor PostgreSQL 17.10 con los binarios oficiales empaquetados por el proyecto *embedded-postgres*, escuchando solo en la interfaz local y con autenticación SCRAM-SHA-256. Las 110 pruebas se superaron también sobre PostgreSQL, y una consulta posterior confirmó que los datos de la ejecución (usuarios, sesiones, gastos y entradas de auditoría) se habían escrito en PostgreSQL y no en SQLite ({fig:evpg}, en el Anexo F). La validación sobre el motor de producción resultó relevante: el análisis dinámico descrito más adelante encontró un fallo que solo se manifestaba con PostgreSQL.'),

    H3('Simulación de casos de abuso sobre la aplicación en ejecución'),
    P('Para validar el comportamiento extremo a extremo, los casos de abuso del apartado 4.1 se reprodujeron contra la aplicación compilada en ejecución mediante un *script* que actúa como atacante, combinado con un navegador automatizado que recorre la interfaz con los tres roles. A diferencia de las pruebas automatizadas, esta simulación usa la configuración real, como los límites de tasa de producción y los 400 ms de duración mínima, y permite observar el efecto conjunto de los controles, incluidas las alertas en el panel. La {tab:simulacion} recoge los resultados observados.'),
    T('simulacion', 'Resultados de la simulación de casos de abuso contra la aplicación en ejecución.',
      ['Caso', 'Abuso ejecutado', 'Resultado observado', 'Detección'],
      [
          ['CA-01', '5 contraseñas erróneas contra la cuenta de una víctima', '401 genérico en todos los intentos; cuenta bloqueada 15 min', 'Alerta ACCOUNT_LOCKED'],
          ['CA-02', '16 intentos contra cuentas inexistentes, que suman 21 fallos desde la misma IP junto con CA-01', '401 genérico en todos los intentos', 'Alerta BRUTE_FORCE_IP al alcanzar 20 fallos'],
          ['CA-04', 'Renovación legítima y reutilización posterior de la cookie robada', 'Renovación legítima 200; reutilización 401; sesión revocada', 'Alerta TOKEN_REUSE'],
          ['CA-05', '10 lecturas de un gasto de otro usuario por su identificador', '404 en los 10 intentos; datos intactos', 'Alerta ACCESS_CONTROL_PROBING'],
          ['CA-06', 'Usuario estándar contra la API de administración', '403', 'Evento ACCESS_DENIED'],
          ['CA-07', 'Ejecutable con cabecera MZ enviado como `factura.pdf`', '400 «Formato de fichero no permitido»', 'Evento RECEIPT_REJECTED'],
          ['CA-08', 'Modificación directa en la BD de la IP de un evento de auditoría', 'La verificación localiza la entrada alterada', 'Alerta AUDIT_TAMPERING (crítica)'],
          ['CA-09', 'Con un token de acceso robado, vincular un autenticador propio y cerrar las sesiones del titular', '400 en ambos casos (exigen la contraseña)', 'Eventos de reautenticación fallida'],
          ['CA-10', 'Descripción de gasto con `<img src=x onerror=…>` mostrada en el navegador', 'Se muestra como texto; 0 diálogos ejecutados', '—'],
          ['—', 'Administrador sin segundo factor en el panel de administración', '403 `MFA_REQUIRED` y aviso en la interfaz', 'Evento ACCESS_DENIED'],
          ['—', 'Recorrido completo de la interfaz con los tres roles', 'Funcionamiento correcto', '0 violaciones de CSP o Trusted Types'],
      ],
      widths=[8, 34, 34, 24], size=17, source='Elaboración propia (resultados en docs/simulacion-ataques.json).'),
    P('Los casos de abuso simulados fueron bloqueados y todos dejaron rastro en la auditoría. Las cinco reglas de detección implicadas generaron su alerta: las cuatro primeras aparecen en el panel de la {fig:alertaspanel} y la de manipulación de la auditoría se generó al verificar la cadena alterada. En una ejecución preliminar, la repetición de la simulación agotó además el límite agregado de 50 intentos por IP, y el propio inicio de sesión del administrador desde esa IP recibió un HTTP 429, lo que confirmó en condiciones reales el funcionamiento de ese límite. El caso CA-08 se completó restaurando el valor original de la entrada manipulada; la verificación posterior confirmó de nuevo la integridad de la cadena, lo que indica que la detección se basa en el contenido y no en un estado persistente. La única petición fallida registrada en la consola del navegador fue el 403 esperado del administrador sin segundo factor. La {fig:auditoriaok} muestra el registro de auditoría tras una verificación correcta. El caso CA-03, la enumeración por tiempo, requirió un tratamiento específico que se describe a continuación.'),
    F('auditoriaok', '12-auditoria-integra.png', 'Registro de auditoría tras una verificación de integridad correcta.', width=15.0),

    H3('Experimento controlado sobre el canal lateral de temporización'),
    P('Las primeras mediciones de rendimiento revelaron que los intentos fallidos de inicio de sesión no tardaban lo mismo si la cuenta existía que si no existía, a pesar de que los mensajes eran idénticos y de que se verificaba un *hash* ficticio para las cuentas inexistentes. Para cuantificar el riesgo y validar la mitigación se diseñó un experimento controlado.'),
    PB('El diseño del experimento fue el siguiente:'),
    UL(
        'Se levantaron dos instancias aisladas de la aplicación compilada, cada una con su propia base de datos, que solo diferían en el parámetro `AUTH_MIN_RESPONSE_MS`: 0 (sin mitigación) y 400 ms (con mitigación). Los límites de tasa se elevaron para no interferir en la medición.',
        'En cada instancia se registraron 20 cuentas y, tras cinco peticiones de calentamiento, se lanzaron 200 intentos de inicio de sesión fallidos contra cuentas existentes y 200 contra cuentas inexistentes, intercalados y en orden alterno para neutralizar los efectos de deriva temporal. Cada cuenta recibió 10 intentos, por debajo del umbral de bloqueo configurado.',
        'Como métrica de la ventaja del atacante se usó la exactitud del mejor clasificador de umbral posible, es decir, la proporción de peticiones que un atacante clasificaría correctamente como «cuenta existente» o «inexistente» con el umbral de tiempo óptimo elegido *a posteriori*. Es una cota superior de lo que podría lograr un atacante con una sola petición por cuenta: el 50 % equivale al azar.',
    ),
    T('timing', 'Resultados del experimento de temporización (200 intentos por grupo y escenario).',
      ['Escenario', 'Cuenta', 'Media (ms)', 'Desv. típica', 'P50 (ms)', 'P95 (ms)', 'Exactitud del mejor umbral'],
      [
          ['Sin igualación', 'Existente', '74,3', '5,2', '73,2', '83,8', '**78,5 %**'],
          ['Sin igualación', 'Inexistente', '68,1', '4,6', '68,1', '73,5', ''],
          ['Con igualación (400 ms)', 'Existente', '423,3', '8,1', '428,4', '432,4', '**53,0 %**'],
          ['Con igualación (400 ms)', 'Inexistente', '423,2', '7,9', '427,7', '432,4', ''],
      ],
      widths=[22, 14, 12, 13, 11, 11, 17], align=['left', 'left', 'center', 'center', 'center', 'center', 'center'], size=17,
      source='Elaboración propia (datos en docs/evidencias/experimento-temporizacion.json).'),
    P('Sin la mitigación, la diferencia media era de 6,2 ms, pequeña en términos absolutos pero muy consistente frente a la dispersión de las medidas. Un atacante podía clasificar correctamente el 78,5 % de las cuentas con una única petición por cuenta, y con varias peticiones por cuenta la exactitud crecería aún más. La causa era el trabajo adicional que se realiza para una cuenta existente: el incremento atómico del contador de fallos y un acceso más a la base de datos. Con la duración mínima uniforme de 400 ms y la fluctuación aleatoria de 0 a 25 ms, la diferencia media se reduce a 0,1 ms y la exactitud del mejor umbral al 53,0 %. El pequeño exceso sobre el 50 % es esperable, porque el umbral se elige *a posteriori* sobre una muestra finita y sobreajusta el ruido.'),
    P('El coste de la mitigación es que el registro, el inicio de sesión y la verificación del segundo factor tardan alrededor de 0,42 s. Es un retardo imperceptible para el usuario en operaciones que se realizan una vez por sesión y que, además, reduce marginalmente la velocidad de los ataques de fuerza bruta. Este resultado justifica la inclusión de la medición de tiempos como parte de la verificación de los controles de autenticación.'),

    H3('Análisis estático y de dependencias'),
    P('El análisis estático con ESLint, el complemento `eslint-plugin-security` y las reglas propias del proyecto produjo quince hallazgos a lo largo del desarrollo. Todos se revisaron manualmente y se clasificaron según la {tab:sast}. Cinco correspondían a problemas reales o mejorables y se corrigieron en el código; los otros diez eran falsos positivos y se documentaron en el propio código con la justificación de la decisión. La versión entregada no produce ningún aviso.'),
    T('sast', 'Hallazgos del análisis estático y su tratamiento.',
      ['Regla', 'N.º', 'Ubicación', 'Clasificación', 'Tratamiento'],
      [
          ['no-irregular-whitespace', '1', 'Generación de CSV', 'Real (carácter BOM literal en el código)', 'Sustituido por una constante explícita'],
          ['security/detect-non-literal-regexp', '1', 'Conversión de importes', 'Mejorable (expresión construida dinámicamente)', 'Sustituida por expresiones estáticas'],
          ['security/detect-unsafe-regex', '2', 'Importes y *script* de producción', 'Potencial ReDoS señalado por la heurística', 'Reescritas sin grupos opcionales; validación de URL con el analizador nativo'],
          ['eslint-comments (directiva sin uso)', '1', 'Tipos de Express', 'Mejorable', 'Directiva eliminada'],
          ['security/detect-non-literal-fs-filename', '10', 'Almacenamiento de ficheros, interfaz estática y *script* de manifiestos', 'Falso positivo: rutas de configuración, validadas como UUID o internas del repositorio', 'Justificación documentada junto al código'],
      ],
      widths=[25, 6, 20, 27, 22], size=17, align=['left', 'center', 'left', 'left', 'left']),
    P('El análisis de dependencias se ha descrito en la parte 3. En la versión entregada, `npm audit` no informa de vulnerabilidades, las firmas de los 433 paquetes del árbol son válidas, 121 paquetes aportan atestaciones de procedencia verificadas y el SBOM CycloneDX recoge 112 componentes de producción ({fig:evaudit} y {fig:evsbom}, en el Anexo F). El análisis semántico con CodeQL está configurado en el canal de integración continua, pero no se ha ejecutado, porque requiere publicar el repositorio en GitHub.'),

    H3('Análisis dinámico con OWASP ZAP'),
    P('El análisis dinámico se realizó con OWASP ZAP 2.17.0 (ZAP Development Team, s. f.) mediante su marco de automatización. Para que el escáner recorriera toda la API, y no solo las páginas que enlaza la interfaz, se redactó la especificación OpenAPI 3.1 de la aplicación (`docs/openapi.json`), con las restricciones de los esquemas de validación. El escaneo se ejecutó contra una instancia dedicada sobre una base de datos PostgreSQL nueva, con los límites de tasa elevados y un token de acceso de una hora, solo para permitir el recorrido completo. Cada plan importa la especificación, sustituida con identificadores reales de la instancia, ejecuta la araña, el análisis pasivo y el escaneo activo con la política por defecto, y genera los informes. Se usaron dos perfiles: un usuario estándar y un administrador con el segundo factor activado por el flujo normal de la aplicación.'),
    T('zap', 'Resultados del análisis dinámico con OWASP ZAP sobre la versión final.',
      ['Indicador', 'Perfil usuario', 'Perfil administrador'],
      [
          ['Peticiones recibidas por la API', num(U['peticiones'], 0), num(A['peticiones'], 0)],
          ['Rutas distintas ejercitadas (con sus variantes)', num(U['rutasDistintas'], 0), num(A['rutasDistintas'], 0)],
          ['Respuestas 2xx / 4xx', f"{num(U['2xx'], 0)} / {num(U['4xx'], 0)}", f"{num(A['2xx'], 0)} / {num(A['4xx'], 0)}"],
          ['Respuestas 429 (limitación de acciones sensibles)', num(U['estados'].get('429', 0), 0), num(A['estados'].get('429', 0), 0)],
          ['Errores del servidor (5xx)', num(U['errores5xx'], 0), num(A['errores5xx'], 0)],
          ['Alertas de riesgo alto / medio / bajo', f"{U['alto']} / {U['medio']} / {U['bajo']}", f"{A['alto']} / {A['medio']} / {A['bajo']}"],
          ['Alertas informativas', str(U['informativas']), str(A['informativas'])],
      ],
      widths=[52, 24, 24], size=18, align=['left', 'center', 'center'],
      source='Elaboración propia (informes y registros en docs/evidencias/zap).'),
    P(f"En total, el escáner envió {num(TOTAL_REQ, 0)} peticiones. La mayoría de las respuestas son 400, 403 y 404: son los rechazos esperados de los esquemas estrictos, del control de acceso y del control de propiedad ante cargas manipuladas. La {{tab:zaptriaje}} recoge el triaje de las alertas. Ninguna corresponde a una vulnerabilidad explotable: la de riesgo alto tiene confianza baja y se reprodujo manualmente para confirmar que es un falso positivo, y la de riesgo bajo refleja el diseño ya descrito, en el que los datos se almacenan como texto literal y se codifican al mostrarse."),
    T('zaptriaje', 'Triaje de las alertas de OWASP ZAP.',
      ['Alerta (regla)', 'Riesgo (confianza)', 'Clasificación y justificación'],
      [
          ['Path Traversal (6) en `POST /api/categories`, parámetro `name`', 'Alto (baja)', 'Falso positivo. La regla envía el nombre del recurso (`categories`) como valor y compara respuestas. El nombre solo se guarda como texto con Prisma y nunca se usa como ruta: la reproducción manual con `../../../../etc/passwd` y `..\\..\\..\\windows\\win.ini` almacena y devuelve el texto literal.'],
          ['XSS persistente en respuesta JSON (40014) en categorías y gastos', 'Bajo (baja)', 'Aceptado por diseño. La API responde siempre `application/json` con `nosniff`; la interfaz lo muestra como texto (caso CA-10, sin ejecución) bajo CSP y Trusted Types.'],
          ['Información sensible en URL (10024)', 'Informativo', 'Falso positivo: el parámetro `userId` de los filtros de auditoría es un identificador seudónimo, no un secreto.'],
          ['Comentarios sospechosos (10027)', 'Informativo', 'Falso positivo: palabra «select» en el JavaScript minificado de la interfaz.'],
          ['Aplicación web moderna (10109), solicitud de autenticación (10111), *fuzzer* de agente de usuario (10104)', 'Informativo', 'Avisos de contexto sin impacto; las diferencias de respuesta del *fuzzer* se deben a la limitación de tasa de las acciones sensibles.'],
      ],
      widths=[30, 14, 56], size=17),
    P(f"El análisis dinámico sí encontró un fallo real. En la primera ejecución del perfil de administrador, {WORDS.get(PRE['errores5xx'], PRE['errores5xx'])} peticiones a `GET /api/admin/users` terminaron con un error 500. La causa era un byte nulo (`%00`) en el parámetro de búsqueda `q`, que PostgreSQL rechaza al no ser un carácter válido en UTF-8 y que SQLite, en cambio, acepta. El gestor de errores funcionó como estaba previsto, con una respuesta genérica, un identificador de correlación y el detalle solo en el registro del servidor, de modo que no se reveló información. Pero la validación era incompleta: a diferencia de los textos del cuerpo, los parámetros de búsqueda no rechazaban caracteres de control. Se corrigió con un esquema común para todas las búsquedas, se añadió una prueba de regresión y se repitió el escaneo completo con los dos perfiles, ya sin ningún error 5xx. El hallazgo ilustra el valor de validar sobre el motor de producción: las pruebas sobre SQLite no podían detectarlo."),

    H3('Verificación frente a OWASP ASVS 5.0'),
    P('Además de trazar los requisitos de seguridad a ASVS ({tab:rs}), se revisaron uno a uno los requisitos de nivel 1 y 2 de los capítulos aplicables (V1 a V9 y V11 a V16; el capítulo V10, OAuth y OIDC, no aplica porque la aplicación no delega la autenticación). La revisión detectó ocho desviaciones respecto al nivel 2 en una versión que ya superaba todas sus pruebas, lo que confirma la utilidad de una lista de verificación detallada frente a la lectura de las categorías del Top 10. Todas se corrigieron y cuentan con pruebas, como resume la {tab:asvsdesv}.'),
    T('asvsdesv', 'Desviaciones de ASVS 5.0 detectadas en la revisión y corregidas.',
      ['Requisito', 'Desviación detectada', 'Corrección'],
      [
          ['3.3.1, 3.3.3', 'La cookie de refresco no usaba un prefijo de nombre', 'Prefijo `__Host-` con `Path=/` y sin `Domain`'],
          ['6.2.4', 'La lista de contraseñas comunes tenía menos de 3000 entradas', '10.898 contraseñas de 15 o más caracteres (SecLists)'],
          ['6.3.3', 'El segundo factor no era obligatorio para nadie', 'Obligatorio para ADMIN y AUDITOR; relajación documentada para USER'],
          ['7.1.2', 'Sesiones simultáneas ilimitadas y sin política documentada', 'Máximo de 10; se cierran las más antiguas'],
          ['7.4.5', 'Los administradores no podían cerrar sesiones de terceros', 'Cierre por usuario y para toda la plataforma'],
          ['7.5.1', 'Activar el segundo factor no exigía reautenticación', 'Se exige la contraseña'],
          ['7.5.2', 'Cerrar sesiones no exigía reautenticación', 'Se exige la contraseña'],
          ['9.2.2', 'El token de acceso no declaraba su tipo', 'Tipo `at+jwt` exigido en la verificación'],
      ],
      widths=[16, 44, 40], size=17),
    P('La {tab:asvsno} recoge los requisitos de nivel 2 que no se cumplen o se cumplen parcialmente, con su justificación y la línea de trabajo futuro asociada. Se documentan para que el alcance de la verificación quede claro.'),
    T('asvsno', 'Requisitos de ASVS 5.0 no cumplidos o cumplidos parcialmente.',
      ['Requisito', 'Estado', 'Justificación'],
      [
          ['5.4.3 Antivirus de ficheros', 'No cumplido', 'Mitigado con lista blanca por firma, aislamiento y descarga como adjunto; se propone ClamAV.'],
          ['6.3.3 MFA para todos los usuarios', 'Parcial', 'Obligatorio solo para roles privilegiados, con relajación justificada y controles compensatorios (apartado 4.3).'],
          ['6.4.3 Recuperación de contraseña', 'No implementado', 'No existe canal de correo; el administrador reinicia el segundo factor tras verificar la identidad por otra vía.'],
          ['6.2.8 Contraseña sin modificar', 'Desviación deliberada', 'Normalización NFKC recomendada por NIST para que un mismo texto produzca siempre el mismo *hash*.'],
          ['12.3.1 TLS en conexiones internas', 'Parcial', 'TLS en el acceso externo; la conexión con PostgreSQL usa una red interna aislada sin TLS.'],
          ['13.3.1 Gestor de secretos', 'No cumplido', 'Secretos en variables de entorno validadas; gestor recomendado en producción.'],
          ['16.4.3 Registros en sistema separado', 'Parcial', 'Registro técnico preparado para un SIEM; la auditoría reside en la base de datos de la aplicación.'],
      ],
      widths=[28, 18, 54], size=17),
    P('La {tab:asvs} recoge, por último, el estado de cada requisito de seguridad del apartado 4.1.6 y la evidencia que lo respalda. Se distingue entre requisitos *verificados*, con una prueba automatizada o una evidencia reproducible, e *implementados*, cuyo control existe pero cuya verificación completa depende del entorno de producción.'),
    T('asvs', 'Estado de los requisitos de seguridad.',
      ['ID', 'Requisito (resumen)', 'Estado', 'Evidencia'],
      [
          ['RS-01', 'Validación estricta de entradas', 'Verificado', 'input-validation (12 pruebas de validación); asignación masiva; byte nulo'],
          ['RS-02', 'Codificación de salidas; SQL parametrizado', 'Verificado', 'Pruebas de inyección SQL, XSS y CSV; regla ESLint; CA-10'],
          ['RS-03', 'CSP estricta, Trusted Types y anti-*clickjacking*', 'Verificado', 'Prueba de cabeceras; 0 violaciones en navegador'],
          ['RS-04', 'Gestión segura de ficheros', 'Verificado (sin antivirus)', 'files-reports (3 pruebas); CA-07'],
          ['RS-05', 'Política de contraseñas NIST', 'Verificado', 'Pruebas de política, de registro y de la lista de bloqueo'],
          ['RS-06', 'Argon2id con parámetros OWASP', 'Verificado', 'Prueba del formato del *hash*; medición de coste'],
          ['RS-07', 'Limitación y bloqueo', 'Verificado', 'Pruebas de bloqueo y 429; CA-01 y CA-02'],
          ['RS-08', 'Respuestas idénticas en contenido y tiempo', 'Verificado', 'Pruebas de mensaje y tiempo; experimento controlado'],
          ['RS-09', 'TOTP cifrado, anti-repetición y obligatorio para roles privilegiados', 'Verificado', 'mfa y privacy-sessions; vectores RFC 6238; AES-GCM'],
          ['RS-10', 'JWT tipado con algoritmo fijo y caducidad', 'Verificado', '5 pruebas de manipulación y tipo de token'],
          ['RS-11', 'Refresco rotatorio con detección de reutilización', 'Verificado', 'Prueba de reutilización; CA-04'],
          ['RS-12', 'Caducidad, límite y cierre de sesiones', 'Verificado', 'Pruebas de inactividad, cierre, reautenticación, límite y cierre administrativo; CA-09'],
          ['RS-13', 'Cookie `__Host-` y verificación de origen', 'Verificado', 'Pruebas de atributos de cookie y de origen; navegador real'],
          ['RS-14', 'Autorización por rol y propiedad', 'Verificado', 'access-control (10 pruebas); CA-05 y CA-06'],
          ['RS-15', 'Salvaguardas administrativas', 'Verificado', 'Pruebas de automodificación y último administrador'],
          ['RS-16', 'Límites de recursos', 'Verificado', 'Pruebas 413, paginación y tamaño de fichero; 429 en el escaneo'],
          ['RS-17', 'TLS y HSTS', 'Implementado', 'Configuración de Caddy y HSTS en producción (pendiente de despliegue)'],
          ['RS-18', 'Configuración validada al arrancar', 'Verificado', 'Esquema de configuración; arranque rechazado sin secretos'],
          ['RS-19', 'Dependencias auditadas y SBOM', 'Verificado', '`npm audit`, firmas y SBOM (Anexo F)'],
          ['RS-20', 'Minimización, conservación y supresión de datos', 'Verificado', 'Prueba de ausencia de secretos; supresión de cuenta; purga por conservación'],
          ['RS-21', 'Registro estructurado con correlación', 'Verificado', 'Prueba de `requestId` en errores; registros JSON'],
          ['RS-22', 'Auditoría a prueba de manipulaciones', 'Verificado', '3 pruebas de cadena; CA-08'],
          ['RS-23', 'Detección y alertas', 'Verificado', 'Pruebas de alertas; 5 alertas en la simulación'],
          ['RS-24', 'Errores centralizados y fallo seguro', 'Verificado', '4 pruebas de condiciones excepcionales; 0 errores 5xx en el escaneo final'],
      ],
      widths=[9, 35, 19, 37], size=17),

    H3('Cobertura del OWASP Top 10:2025'),
    P('La {tab:cobertura} sintetiza, para cada categoría del OWASP Top 10:2025, los controles principales implementados y el número de pruebas automatizadas que los verifican. Una prueba puede verificar controles de más de una categoría. Las diez categorías cuentan con controles implementados y evidencias de verificación.'),
    T('cobertura', 'Cobertura de las categorías del OWASP Top 10:2025.',
      ['Categoría', 'Controles principales', 'Pruebas', 'Parte'],
      [
          ['A01 Broken Access Control', 'RBAC en servidor; MFA para roles privilegiados; propiedad en cada consulta; 404 indistinguible; CORS restringido; CSRF por origen', '20', 'P2'],
          ['A02 Security Misconfiguration', 'Validación de configuración; cabeceras; `trust proxy`; *timeouts*; contenedor endurecido', '3', 'P3'],
          ['A03 Software Supply Chain Failures', 'Versiones exactas; lockfile; `audit` y firmas; `overrides`; SBOM; Dependabot; fijación de acciones e imágenes', 'Canal CI', 'P3'],
          ['A04 Cryptographic Failures', 'Argon2id; AES-256-GCM con AAD; CSPRNG; HMAC; secretos validados; TLS', '9', 'P1'],
          ['A05 Injection', 'Prisma parametrizado; React; CSP y Trusted Types; neutralización CSV; registros JSON; byte nulo', '18', 'P2'],
          ['A06 Insecure Design', 'Modelado STRIDE y matriz de riesgos; importes enteros; límites de negocio; tasa; paginación; conservación', '25', 'P2'],
          ['A07 Authentication Failures', 'Política NIST; bloqueo; tasa; igualación de tiempos; TOTP; reautenticación; sesiones revocables y limitadas; refresco rotatorio', '33', 'P1'],
          ['A08 Software or Data Integrity Failures', 'Firma y tipo JWT; SHA-256 de justificantes; cadena HMAC; firmas de paquetes', '7', 'P3'],
          ['A09 Security Logging & Alerting Failures', 'Auditoría de 34 tipos de evento; redacción de secretos; 6 reglas de alerta; panel', '9', 'P3'],
          ['A10 Mishandling of Exceptional Conditions', 'Gestor centralizado; fallo cerrado; transacciones; apagado ordenado; 0 errores 5xx en DAST', '5', 'P3'],
      ],
      widths=[25, 53, 10, 12], size=17, align=['left', 'left', 'center', 'center']),

    H3('Rendimiento'),
    P('Para comprobar el requisito RNF-03 se midió la latencia de las operaciones principales de la API compilada con peticiones secuenciales desde el mismo equipo, descartando las primeras de cada serie como calentamiento, con SQLite y con PostgreSQL. La {tab:latencia} muestra los resultados. Las consultas autenticadas incluyen la verificación del JWT, la consulta de la sesión, la limitación de tasa, la validación y el registro de la petición.'),
    T('latencia', 'Latencia de la API en milisegundos (peticiones secuenciales en local).',
      ['Operación', 'n', 'SQLite media', 'SQLite P95', 'PostgreSQL media', 'PostgreSQL P95'],
      latency_rows(),
      widths=[40, 7, 13, 13, 14, 13], align=['left', 'center', 'center', 'center', 'center', 'center'], size=17,
      source='Elaboración propia (datos en docs/evidencias/rendimiento.json y rendimiento-postgresql.json).'),
    P(f'Todas las operaciones de consulta tienen un percentil 95 igual o inferior a {num(MAX_P95)} ms con ambos motores, muy por debajo del umbral de 100 ms del requisito RNF-03, y PostgreSQL se comporta de forma similar a SQLite. Las operaciones de autenticación tardan alrededor de 0,42 s por diseño. La derivación Argon2id seleccionada cuesta {num(ARGON["hash"]["media"])} ms de media en este equipo. En cuanto al cliente, la interfaz compilada ocupa 345 KB de JavaScript (107 KB comprimidos con gzip) y 17 KB de hojas de estilo (5 KB comprimidos), sin recursos de terceros. Debe tenerse en cuenta que las mediciones se realizaron en un equipo de desarrollo y sin concurrencia, por lo que no sustituyen a una prueba de carga en el entorno de producción.'),

    H3('Evaluación heurística de usabilidad'),
    P('La seguridad que dificulta el uso tiende a ser eludida por los usuarios, como anticipaba el principio de aceptabilidad psicológica (Saltzer y Schroeder, 1975). Para valorar la usabilidad se realizó una evaluación heurística siguiendo los diez principios de Nielsen y Molich (1990). Cada integrante revisó la interfaz de forma independiente y los hallazgos se consolidaron. La {tab:heuristica} recoge las observaciones principales con su severidad, en una escala de 0 (sin problema) a 4 (catastrófico).'),
    T('heuristica', 'Evaluación heurística de la interfaz.',
      ['Heurística', 'Observación', 'Sev.'],
      [
          ['Visibilidad del estado del sistema', 'Indicadores de carga, mensajes de confirmación tras cada acción y avisos persistentes mientras el MFA no está activo.', '0'],
          ['Relación con el mundo real', 'Terminología cotidiana (gasto, justificante, comercio), importes con formato local y fechas en español.', '0'],
          ['Control y libertad del usuario', 'Las acciones destructivas piden confirmación (la supresión de la cuenta, además, escribir «ELIMINAR»); el borrado de gastos es lógico, pero la interfaz no ofrece «deshacer».', '1'],
          ['Consistencia y estándares', 'Patrones de interfaz homogéneos; iconografía coherente en todas las pantallas.', '0'],
          ['Prevención de errores', 'Validación inmediata en el cliente, confirmación de contraseña, límites en los campos y bloqueo de acciones no permitidas (p. ej., borrar categorías con gastos).', '0'],
          ['Reconocer antes que recordar', 'Filtros y categorías visibles; la clave TOTP se muestra en grupos de cuatro caracteres para facilitar su transcripción.', '0'],
          ['Flexibilidad y eficiencia', 'Búsqueda con espera para no saturar la API y paginación; faltan atajos de teclado para usuarios expertos.', '1'],
          ['Diseño estético y minimalista', 'Pantallas despejadas con la información esencial; el resumen prioriza los indicadores clave.', '0'],
          ['Ayuda ante los errores', 'Mensajes en español con el motivo concreto del rechazo de una contraseña o de un dato; los errores internos incluyen una referencia para el soporte.', '0'],
          ['Ayuda y documentación', 'Textos de ayuda contextuales (política de contraseñas, configuración de MFA); no existe una sección de ayuda general.', '1'],
      ],
      widths=[24, 68, 8], size=17, align=['left', 'left', 'center']),
    P('No se identificaron problemas de severidad alta, y los tres de severidad baja se recogen como mejoras futuras. La evaluación heurística la realizó el propio equipo y no sustituye a una validación con usuarios reales, que no se ha llevado a cabo: el Anexo E describe el protocolo propuesto para hacerlo en el futuro, basado en el cuestionario SUS (Brooke, 1996).'),

    H3('Discusión y limitaciones'),
    P(f'Los resultados permiten responder a las preguntas planteadas en la introducción. Para cada categoría del OWASP Top 10:2025 se han identificado e implementado controles concretos. Su eficacia se ha verificado con evidencias reproducibles y su coste es moderado: percentiles 95 de las consultas no superiores a {num(MAX_P95, 0)} ms, un retardo deliberado de 0,42 s en la autenticación y una interfaz sin fricciones significativas según la evaluación heurística. Los hallazgos del canal de temporización, de las vulnerabilidades heredadas de la cadena de suministro, de las desviaciones de ASVS y del byte nulo en PostgreSQL muestran, además, el valor de una verificación empírica y continua frente a la simple revisión del diseño.'),
    PB('El trabajo presenta, no obstante, limitaciones que deben tenerse en cuenta al interpretar los resultados:'),
    UL(
        '**Entorno de evaluación.** Las pruebas, las mediciones y el análisis dinámico se realizaron en un equipo de desarrollo, sin concurrencia y con instancias locales. El canal de integración continua, incluido CodeQL, el despliegue con contenedores y el TLS de Caddy están definidos, pero no se han ejecutado.',
        '**Alcance del análisis dinámico.** ZAP aplica reglas genéricas: no conoce la lógica de negocio ni encadena ataques, y se ejecutó con límites de tasa elevados. Su resultado complementa, pero no sustituye, a una prueba de penetración manual.',
        '**Ausencia de auditoría externa.** Las pruebas y simulaciones las diseñó el propio equipo, que conoce la implementación. Una revisión independiente podría descubrir vectores no contemplados en el modelo de amenazas.',
        '**Escalabilidad horizontal.** La limitación de tasa y la cola de auditoría funcionan en memoria y son válidas para una única instancia.',
        '**Requisitos de ASVS no cumplidos.** Los recogidos en la {tab:asvsno}, entre ellos el antivirus de ficheros, la recuperación de contraseña y el gestor de secretos.',
        '**Autenticación.** El TOTP no es resistente al *phishing* en tiempo real y es opcional para los usuarios estándar.',
        '**Auditoría.** El truncamiento de las últimas entradas no se detecta sin un anclaje externo del último *hash*.',
        '**Usabilidad.** La evaluación es heurística y no se ha validado con usuarios finales.',
    ),
]
