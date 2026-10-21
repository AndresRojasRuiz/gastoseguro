# -*- coding: utf-8 -*-
import json

from .dsl import CODE, F, H2, H3, P, PB, T, UL

with open('C:/Users/andre/Documents/GastoSeguro/docs/evidencias/rendimiento.json', encoding='utf-8') as _handle:
    _PERF = json.load(_handle)
_ARGON = _PERF['argon2']
_AUTH_QUERY = _PERF['api']['GET /api/expenses (20 elementos, autenticado)']['media']


def _ms(value):
    return f'{value:.1f}'.replace('.', ',')

BLOCKS = [
    H2('Parte individual 1: autenticación, gestión de sesiones y criptografía'),
    P('*Autor: Paul Ormazabal.* Esta parte aborda las categorías A07:2025 (*Authentication Failures*) y A04:2025 (*Cryptographic Failures*) y desarrolla los requisitos RS-05 a RS-13 y RS-17. Su objetivo es que solo el titular legítimo de una cuenta pueda acceder a ella, que la sesión resultante pueda revocarse en cualquier momento y que ningún secreto quede expuesto aunque se comprometa la base de datos. Se describen sucesivamente el almacenamiento de contraseñas, la política de credenciales, la protección frente a ataques automatizados, el segundo factor, la gestión de sesiones y el uso de la criptografía.'),

    H3('Almacenamiento de contraseñas con Argon2id'),
    P('Las contraseñas se almacenan exclusivamente como *hash* Argon2id, mediante la biblioteca `@node-rs/argon2`. Esta biblioteca ofrece la implementación de referencia compilada para cada plataforma y no requiere compilación en la instalación. Los parámetros elegidos son los mínimos recomendados por OWASP: 19 MiB de memoria, dos iteraciones y un grado de paralelismo, con una salida de 32 bytes (OWASP Foundation, s. f.-g). Cada *hash* incluye una sal aleatoria de 16 bytes y codifica sus propios parámetros en el formato estándar `$argon2id$v=19$m=19456,t=2,p=1$…`, lo que permite cambiarlos en el futuro sin invalidar las contraseñas existentes.'),
    CODE('''const ARGON2_OPTIONS = {
  algorithm: 2,        // Argon2id
  memoryCost: 19_456,  // KiB (19 MiB)
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password.normalize('NFKC'), ARGON2_OPTIONS);
}'''),
    P('Para mantener la agilidad criptográfica, en cada inicio de sesión correcto se comprueba si los parámetros del *hash* almacenado coinciden con los vigentes. Si no coinciden, la contraseña, que en ese momento se conoce en claro, se vuelve a derivar con los parámetros actuales (*rehash* transparente). Antes de derivar, la contraseña se normaliza con la forma Unicode NFKC, como recomienda NIST (Temoshok et al., 2025), para que un mismo texto introducido desde teclados o sistemas distintos produzca siempre el mismo *hash*.'),
    P('Para valorar el coste de esta decisión se midió el tiempo de derivación y verificación con tres configuraciones en el equipo de desarrollo (procesador Intel Core i7-1360P, Node.js 26), descartando las dos primeras ejecuciones de cada serie como calentamiento. Los resultados se recogen en la {tab:argon}.'),
    T('argon', 'Coste medido de Argon2id con distintas configuraciones (13 ejecuciones por configuración).',
      ['Configuración', 'Derivación (ms, media)', 'Verificación (ms, media)', 'Observaciones'],
      [
          ['m = 19 MiB, t = 2, p = 1 (**seleccionada**)', _ms(_ARGON[0]['hash']['media']), _ms(_ARGON[0]['verify']['media']), 'Mínimo recomendado por OWASP'],
          ['m = 46 MiB, t = 1, p = 1', _ms(_ARGON[1]['hash']['media']), _ms(_ARGON[1]['verify']['media']), 'Configuración alternativa equivalente de OWASP'],
          ['m = 64 MiB, t = 3, p = 4', _ms(_ARGON[2]['hash']['media']), _ms(_ARGON[2]['verify']['media']), 'Segunda opción recomendada por el RFC 9106'],
      ],
      widths=[34, 18, 18, 30], align=['left', 'center', 'center', 'left'],
      source='Elaboración propia (mediciones en docs/evidencias/rendimiento.json).'),
    P(f'Con la configuración seleccionada, una verificación cuesta unos {round(_ARGON[0]["verify"]["media"])} ms de CPU, por lo que un núcleo puede atender del orden de {round(1000 / _ARGON[0]["verify"]["media"])} verificaciones por segundo. Es un coste asumible para los inicios de sesión legítimos y, combinado con la limitación de tasa descrita más adelante, hace inviable un ataque de fuerza bruta en línea. En caso de robo de la base de datos, la memoria exigida por cada intento limita la ventaja de los atacantes que emplean GPU. La configuración puede endurecerse sin cambios de código si el servidor de producción dispone de más recursos.'),

    H3('Política de contraseñas'),
    P('La política de contraseñas sigue la revisión 4 de NIST SP 800-63B, cuyas recomendaciones se basan en la evidencia de que las reglas de composición tradicionales no mejoran la seguridad real (Weir et al., 2010; Temoshok et al., 2025). Como el segundo factor es opcional para los usuarios estándar (solo es obligatorio para los roles privilegiados), la contraseña puede ser el único factor de autenticación, por lo que se aplica la longitud mínima de 15 caracteres que NIST exige en ese caso. La {tab:politica} detalla las reglas aplicadas.'),
    T('politica', 'Política de contraseñas aplicada.',
      ['Regla', 'Valor en GastoSeguro', 'Fundamento'],
      [
          ['Longitud mínima', '15 caracteres (contados como puntos de código Unicode)', 'NIST SP 800-63B-4: mínimo 15 si es el único factor'],
          ['Longitud máxima', '128 caracteres', 'NIST: admitir al menos 64; el límite evita abusos sobre Argon2'],
          ['Reglas de composición', 'Ninguna; se admiten espacios y cualquier carácter Unicode', 'NIST prohíbe imponerlas; favorece las frases de paso'],
          ['Normalización', 'Unicode NFKC antes de derivar', 'NIST SP 800-63B-4'],
          ['Lista de bloqueo', '10.898 contraseñas habituales de 15 o más caracteres (lista pública SecLists) y patrones locales; menos de 5 caracteres distintos', 'NIST; ASVS 5.0, 6.2.4 (al menos 3000)'],
          ['Datos de contexto', 'Rechazo si contiene el nombre, la parte local del correo o el nombre de la aplicación', 'NIST: valores específicos del contexto'],
          ['Contraseñas filtradas', 'Consulta opcional a Have I Been Pwned por k-anonimato (`PASSWORD_BREACH_CHECK=hibp`)', 'NIST; Li et al. (2019)'],
          ['Caducidad periódica', 'No se fuerza', 'NIST: solo ante indicios de compromiso'],
      ],
      widths=[20, 44, 36], size=18, source='Elaboración propia a partir de Temoshok et al. (2025) y Li et al. (2019).'),
    P('La lista de bloqueo se generó de forma reproducible a partir de la lista pública de un millón de contraseñas más frecuentes del proyecto SecLists (Miessler et al., s. f.), conservando, normalizadas y en minúsculas, todas las que cumplen la longitud mínima de la política. Así se supera ampliamente el mínimo de 3000 contraseñas comunes que exige ASVS 5.0 y se evita bloquear con listas que solo contienen contraseñas cortas, ya rechazadas por la longitud. La comprobación contra contraseñas filtradas solo envía al servicio externo los cinco primeros caracteres del *hash* SHA-1 de la contraseña y compara localmente los sufijos recibidos. Si el servicio no responde en tres segundos, se registra el incidente y se acepta la contraseña. Este comportamiento abierto ante fallos (*fail open*) es una decisión deliberada y documentada: se trata de un control complementario a la longitud mínima y a la lista local, y bloquear el registro de usuarios por la indisponibilidad de un tercero degradaría la disponibilidad sin una ganancia de seguridad proporcional. En cambio, todos los controles de autenticación y autorización fallan de forma cerrada.'),
    P('En la interfaz, un indicador de robustez orienta al usuario mientras escribe y le sugiere usar frases de varias palabras. El indicador es solo orientativo: la decisión de aceptar o rechazar la contraseña la toma siempre el servidor, que devuelve los motivos concretos del rechazo.'),

    H3('Protección frente a ataques automatizados y enumeración'),
    PB('El inicio de sesión es el punto más atacado de cualquier aplicación. Se han implementado cuatro controles complementarios:'),
    UL(
        '**Limitación de tasa en dos niveles.** Se permiten 10 intentos cada 15 minutos por combinación de IP y cuenta, y 50 por IP para cualquier cuenta. Así se dificultan tanto la fuerza bruta contra una víctima como el relleno de credenciales contra muchas cuentas. Las direcciones IPv6 se agrupan por subred /56 para que el atacante no pueda eludir el límite rotando direcciones dentro de su asignación.',
        '**Bloqueo temporal de la cuenta** durante 15 minutos tras 5 intentos fallidos. El contador se incrementa de forma atómica en la base de datos para que las peticiones concurrentes no puedan eludirlo. El bloqueo genera un evento de auditoría y una alerta, y un administrador puede levantarlo anticipadamente.',
        '**Mensajes genéricos.** El usuario inexistente, la contraseña incorrecta, la cuenta bloqueada y la cuenta deshabilitada producen exactamente la misma respuesta: «Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente». El registro de una cuenta con un correo ya existente devuelve la misma respuesta que un registro correcto, sin crear nada y dejando constancia en la auditoría (OWASP Foundation, s. f.-a).',
        '**Igualación de tiempos.** Cuando el usuario no existe, se verifica la contraseña contra un *hash* ficticio para consumir el mismo tiempo de CPU. Además, todas las operaciones de registro, inicio de sesión y verificación del segundo factor tardan un mínimo uniforme de 400 ms, con una fluctuación aleatoria de 0 a 25 ms, sea cual sea su resultado.',
    ),
    P('Este último control no estaba en el diseño inicial: fue el resultado de la evaluación. Las mediciones mostraron que, a pesar del *hash* ficticio, un intento fallido contra una cuenta existente tardaba unos 6 ms más que contra una inexistente, debido a las escrituras adicionales en la base de datos (contador de fallos y auditoría). Esa diferencia permitía distinguir cuentas existentes con un 78,5 % de acierto a partir de una sola petición (Bortz y Boneh, 2007). La duración mínima uniforme eliminó el canal lateral, como se detalla en el apartado de evaluación. La implementación es una función genérica que envuelve la operación y completa el tiempo restante también cuando la operación termina con un error:'),
    CODE('''export async function withMinimumDuration<T>(minimumMs: number, operation: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    const remaining = minimumMs - (performance.now() - startedAt);
    if (remaining > 0) await sleep(remaining + randomInt(0, 25));
  }
}'''),
    P('El bloqueo de cuentas introduce un riesgo conocido: un atacante podría bloquear deliberadamente la cuenta de una víctima. Se ha optado por un bloqueo temporal corto, acompañado de alerta y de la posibilidad de desbloqueo administrativo, en lugar de un bloqueo indefinido. Se han descartado los CAPTCHA por su impacto en la usabilidad y la accesibilidad y porque su resolución automatizada está ampliamente disponible.'),

    H3('Segundo factor de autenticación TOTP'),
    P('El segundo factor se basa en contraseñas de un solo uso basadas en tiempo (TOTP) según el RFC 6238, compatibles con cualquier aplicación de autenticación estándar. El algoritmo se ha implementado sobre las primitivas HMAC del módulo nativo `node:crypto`, sin dependencias adicionales, en menos de cien líneas, y se ha validado con los vectores de prueba del apéndice B del RFC (M’Raihi et al., 2011). La {fig:mfa} muestra la pantalla de configuración, con el código QR y la clave para introducirla manualmente.'),
    F('mfa', '08-seguridad-mfa.png', 'Página de seguridad de la cuenta durante la configuración del segundo factor.', width=14.0, max_height=19.5),
    PB('Los aspectos de seguridad de la implementación son los siguientes:'),
    UL(
        '**Secreto de 160 bits** generado con el generador criptográficamente seguro del sistema, como recomienda el RFC 4226.',
        '**Activación en dos pasos con reautenticación.** El secreto se guarda primero como pendiente y solo se activa cuando el usuario introduce un código válido y su contraseña. El código evita que el usuario quede bloqueado por una configuración errónea, y la contraseña impide que un atacante con un token de acceso robado vincule su propio autenticador y deje al titular fuera de su cuenta (ASVS 5.0, 7.5.1). Tras la activación se cierran las demás sesiones.',
        '**Ventana de tolerancia de ±1 paso** (30 segundos) para absorber el desfase de reloj, con comparación en tiempo constante de todos los candidatos.',
        '**Protección anti-repetición**: se guarda el último paso temporal aceptado y se rechazan los códigos de ese paso o anteriores, de modo que un código interceptado no puede reutilizarse.',
        '**Desafío de un solo uso**: tras validar la contraseña, el servidor no emite ningún token, sino un desafío con una validez de 5 minutos, que admite como máximo 5 intentos y se invalida tras su primer uso correcto. Los códigos erróneos cuentan como intentos fallidos a efectos del bloqueo de la cuenta.',
        '**Secreto cifrado en reposo** con AES-256-GCM, usando como datos asociados el identificador del usuario.',
        '**Desactivación con reautenticación**: requiere la contraseña y un código TOTP vigente.',
        '**Obligatorio para los roles privilegiados.** Las cuentas de administrador y auditor solo pueden ejercer su rol con el segundo factor activado: sin él conservan el acceso a su propia cuenta para configurarlo, pero las funciones privilegiadas responden con HTTP 403 y el código `MFA_REQUIRED`, y la interfaz muestra un aviso persistente ({fig:mfaobligatorio}). Para los usuarios estándar el segundo factor es opcional. ASVS 5.0 (6.3.3) exige MFA a todos los usuarios en el nivel 2, salvo una relajación justificada con controles compensatorios: aquí se justifica por la menor exposición de una cuenta que solo accede a sus propios datos, y se compensa con la longitud mínima de 15 caracteres, la lista de bloqueo, la limitación de tasa, el bloqueo temporal y las alertas.',
        '**Código QR generado en el cliente** como gráfico SVG construido por React, sin `innerHTML` ni URI `data:`, y por tanto compatible con la CSP estricta y con Trusted Types.',
    ),
    F('mfaobligatorio', '16-mfa-obligatorio.png', 'Administrador sin segundo factor: funciones privilegiadas bloqueadas.', width=14.0),
    P('La {fig:secmfa} resume el flujo completo de inicio de sesión con segundo factor, desde la verificación de la contraseña hasta la primera petición autenticada.'),
    F('secmfa', 'd08-secuencia-login-mfa.png', 'Secuencia de inicio de sesión con segundo factor y emisión de tokens.', width=15.8),

    H3('Gestión de sesiones'),
    P('Tras comparar las alternativas (véase la {tab:sesiones}), se adoptó un modelo híbrido que combina un token de acceso de vida corta con una sesión registrada en el servidor y un token de refresco rotatorio.'),
    P('El **token de acceso** es un JWT firmado con HMAC-SHA256 mediante la biblioteca `jose`, con una clave de al menos 256 bits y una validez de 15 minutos. Se emite con el tipo explícito `at+jwt` (Bertocci, 2021) y contiene solo el identificador del usuario (`sub`), el de la sesión (`sid`), el emisor, la audiencia, las fechas de emisión y caducidad y un identificador único (`jti`). La verificación exige ese tipo, de modo que un JWT con otro propósito, aunque estuviera firmado con la misma clave, no se acepta para autorizar peticiones (ASVS 5.0, 9.2.2). No contiene el rol: en cada petición, el servidor verifica la firma con el algoritmo fijado, lo que impide `alg:none` y la confusión de algoritmos (Sheffer et al., 2020), y después consulta la sesión en la base de datos. Así comprueba que no ha sido revocada, que no ha caducado por tiempo absoluto o por inactividad, que la cuenta sigue activa y cuál es su rol actual. El coste de esta consulta es reducido (una petición autenticada típica se resuelve en unos ' + str(round(_AUTH_QUERY)) + ' ms, véase el apartado de evaluación) y se compensa con la revocación inmediata: un cambio de contraseña, un cambio de rol o la detección de un robo surten efecto en la siguiente petición, sin esperar a que caduque el token.'),
    P('En el navegador, el token de acceso se guarda solo en la memoria de la aplicación, nunca en `localStorage` ni en `sessionStorage`, de modo que un posible XSS no puede exfiltrarlo de forma persistente. Se envía en la cabecera `Authorization`, lo que hace que las rutas de la API sean inmunes a CSRF.'),
    P('El **token de refresco** es un valor opaco de 256 bits generado con un CSPRNG. Viaja exclusivamente en la cookie `__Host-gs_rt`, con los atributos de la {tab:cookie}, y en la base de datos solo se guarda su *hash* SHA-256. Cada uso emite un token nuevo y marca el anterior como usado dentro de una transacción. La marca se aplica con una actualización condicional (`usedAt IS NULL`), de modo que dos peticiones concurrentes no pueden consumir el mismo token.'),
    T('cookie', 'Atributos de la cookie del token de refresco.',
      ['Atributo', 'Valor', 'Propósito'],
      [
          ['`HttpOnly`', 'Activado', 'Inaccesible desde JavaScript: no puede robarse mediante XSS'],
          ['`Secure`', 'Activado (obligatorio en producción)', 'Solo se envía por HTTPS'],
          ['`SameSite`', '`Strict`', 'No se envía en peticiones iniciadas desde otros sitios (CSRF)'],
          ['Prefijo `__Host-`', 'En el nombre de la cookie', 'El navegador solo la acepta si es `Secure`, sin `Domain` y con `Path=/`: un subdominio o una conexión sin cifrar no pueden sobrescribirla (ASVS 5.0, 3.3.3)'],
          ['`Path`', '`/` (exigido por el prefijo)', 'Se envía a todo el origen, pero solo la leen las rutas de renovación y cierre de sesión'],
          ['`Expires`', 'Caducidad absoluta de la sesión (12 h)', 'Limita la ventana de exposición'],
      ],
      widths=[18, 34, 48], size=18),
    P('Si se presenta un token de refresco que ya había sido rotado, la única explicación es que existe una copia del token en manos de alguien más. Siguiendo el RFC 9700 (Lodderstedt et al., 2025), el sistema revoca entonces la sesión completa, invalidando tanto el token del atacante como el del usuario legítimo, registra el evento y genera una alerta de severidad alta. El usuario legítimo debe volver a autenticarse, con el segundo factor si lo tiene activado, mientras que el atacante pierde el acceso. La {fig:rotacion} ilustra el escenario.'),
    F('rotacion', 'd09-rotacion-refresh.png', 'Rotación del token de refresco y detección de su reutilización.', width=15.8),
    P('La rotación estricta plantea un problema práctico: si el usuario abre varias pestañas, o si varias peticiones detectan simultáneamente que el token de acceso ha caducado, podrían intentar renovar con el mismo token y desencadenar una falsa detección de robo. El cliente lo evita serializando las renovaciones dentro de cada pestaña, con una única promesa en curso, y entre pestañas mediante la *Web Locks API* del navegador. Así, la segunda pestaña espera a que termine la primera y utiliza ya la cookie renovada.'),
    PB('Las sesiones caducan a las 12 horas, aunque el usuario esté activo, y tras 30 minutos de inactividad, conforme a los valores de NIST para el nivel AAL2 (Grassi et al., 2017). Cada cuenta admite como máximo diez sesiones simultáneas: al iniciar una más se cierra la más antigua, de modo que el titular nunca queda bloqueado y el evento queda en su actividad (ASVS 5.0, 7.1.2). Además, las sesiones se revocan explícitamente:'),
    UL(
        'Al cerrar sesión (la sesión actual).',
        'Al cambiar la contraseña o activar el segundo factor (todas las demás sesiones del usuario).',
        'Cuando un administrador cambia el rol o el estado de la cuenta, o reinicia su segundo factor (todas las sesiones del usuario afectado).',
        'Cuando un administrador las cierra como respuesta a un incidente, para un usuario concreto o para toda la plataforma salvo la suya, en este último caso tras confirmar su contraseña (ASVS 5.0, 7.4.5).',
        'A petición del usuario desde la página de seguridad, que muestra el dispositivo, la IP y la última actividad de cada sesión. Cerrar una sesión o todas las demás exige confirmar la contraseña ({fig:reauth}), para que un token de acceso robado no baste para expulsar al titular (ASVS 5.0, 7.5.2).',
        'Al suprimir la cuenta (todas).',
        'Al detectarse la reutilización de un token de refresco (la sesión afectada).',
    ),
    F('reauth', '17-reautenticacion-sesiones.png', 'Confirmación con la contraseña antes de cerrar las demás sesiones.', width=14.0),
    P('Las dos rutas que se autentican mediante la cookie (renovación y cierre de sesión) son las únicas expuestas a CSRF. Además de `SameSite=Strict`, exigen que la cabecera `Origin` pertenezca a la lista blanca de orígenes configurados y rechazan las peticiones que el navegador declara como `Sec-Fetch-Site: cross-site` (OWASP Foundation, s. f.-b; W3C, s. f.-b).'),

    H3('Criptografía aplicada y gestión de secretos'),
    P('Todos los usos de la criptografía en la aplicación se resumen en la {tab:cripto}. Se emplean exclusivamente algoritmos modernos y normalizados, implementados por el módulo nativo `node:crypto`, que se apoya en OpenSSL, o por bibliotecas de referencia. No se ha implementado ninguna primitiva criptográfica propia: la implementación de TOTP se limita a combinar HMAC según el RFC y se valida con sus vectores oficiales.'),
    T('cripto', 'Usos de la criptografía en GastoSeguro.',
      ['Propósito', 'Algoritmo', 'Clave / parámetros', 'Implementación'],
      [
          ['Contraseñas', 'Argon2id', 'm = 19 MiB, t = 2, p = 1, sal de 16 bytes', '@node-rs/argon2'],
          ['Tokens de acceso', 'HMAC-SHA256 (JWT HS256, tipo `at+jwt`)', 'Clave ≥ 256 bits (`JWT_SECRET`)', 'jose'],
          ['Secretos TOTP en reposo', 'AES-256-GCM', 'Clave de 256 bits (`DATA_ENCRYPTION_KEY`), IV aleatorio de 96 bits, AAD = usuario', 'node:crypto'],
          ['Tokens de refresco', 'SHA-256 (solo el *hash*)', 'Token de 256 bits generado con CSPRNG', 'node:crypto'],
          ['Cadena de auditoría', 'HMAC-SHA256', 'Clave ≥ 256 bits (`AUDIT_HMAC_KEY`)', 'node:crypto'],
          ['Integridad de justificantes', 'SHA-256', 'Huella verificada en cada descarga', 'node:crypto'],
          ['Segundo factor', 'HOTP/TOTP (HMAC-SHA1)', 'Secreto de 160 bits, 6 dígitos, 30 s', 'Propia sobre node:crypto (RFC 6238)'],
          ['Transporte', 'TLS 1.2/1.3 + HSTS', 'Certificados ACME o CA interna', 'Caddy'],
      ],
      widths=[22, 22, 36, 20], size=18),
    P('El uso de HMAC-SHA1 en TOTP no constituye una debilidad. La seguridad de HMAC no depende de la resistencia a colisiones de la función resumen subyacente, y SHA-1 es el algoritmo por defecto que soportan todas las aplicaciones de autenticación del mercado. El cifrado de los secretos TOTP usa un formato versionado (`v1.iv.texto_cifrado.etiqueta`), que permite migrar a otro algoritmo o rotar la clave sin ambigüedad. Los datos asociados (AAD) vinculan cada texto cifrado a su usuario, de forma que un atacante con acceso de escritura a la base de datos no puede copiar el secreto de una cuenta a otra: el descifrado fallaría al verificar la etiqueta de autenticación.'),
    P('Los tres secretos de la aplicación (firma de tokens, cifrado de datos y clave de auditoría) se leen de variables de entorno y se validan al arrancar. Deben estar codificados en base64, tener al menos 256 bits y, en producción, ser distintos entre sí; en caso contrario, la aplicación no arranca. El *script* de instalación los genera con el CSPRNG del sistema en cada equipo, por lo que el código no contiene ningún secreto ni credencial por defecto. En producción se recomienda custodiarlos en un gestor de secretos y rotarlos periódicamente (ASVS 5.0, 13.3.1), lo que no se ha implementado en el despliegue de referencia.'),

    H3('Verificación y conclusiones de la parte'),
    PB('Los controles de esta parte se verifican con 29 pruebas de integración específicas y 16 pruebas unitarias de los módulos criptográficos, todas superadas. Entre otros aspectos, las pruebas comprueban:'),
    UL(
        'Que la contraseña solo se almacena como *hash* Argon2id, que la política rechaza contraseñas cortas, comunes o con datos del usuario y que la lista de bloqueo supera las 3000 entradas.',
        'Que las respuestas de inicio de sesión son idénticas exista o no la cuenta, que su duración no baja del mínimo y que la cuenta se bloquea tras 5 fallos, con auditoría y alerta, incluso ante la contraseña correcta.',
        'Que la limitación de tasa devuelve HTTP 429 en el undécimo intento.',
        'Que se rechazan los tokens con `alg:none`, con la carga manipulada, firmados con otra clave, caducados o no tipados como `at+jwt`, y que una sesión revocada o una cuenta deshabilitada dejan de aceptarse de inmediato.',
        'Que el token de refresco rota en cada uso, que su reutilización revoca la sesión completa y genera la alerta, que se exige un origen de confianza y que la sesión caduca por inactividad.',
        'Que el TOTP cumple los vectores del RFC 6238, rechaza la reutilización de códigos y de desafíos y bloquea el desafío tras 5 códigos erróneos, que su activación exige la contraseña y que los roles privilegiados sin segundo factor reciben `MFA_REQUIRED`.',
        'Que cerrar sesiones exige la contraseña, que un administrador puede cerrar las de un usuario o las de toda la plataforma y que se respeta el máximo de sesiones simultáneas.',
        'Que el cifrado AES-GCM detecta cualquier manipulación del texto cifrado y no permite trasladar un secreto de un usuario a otro.',
    ),
    P('Como conclusión, esta parte demuestra que es posible ofrecer una autenticación robusta frente a los vectores más frecuentes (abuso y relleno de credenciales, robo de sesiones y enumeración) con componentes normalizados y un coste moderado. La lección más relevante es la del canal lateral de temporización: un control correcto en su lógica (mensajes genéricos y *hash* ficticio) resultó insuficiente en la práctica, y solo la medición empírica permitió detectarlo y corregirlo.'),
]
