# -*- coding: utf-8 -*-
from .dsl import CODE, F, H2, H3, P, PB, T, UL

BLOCKS = [
    H2('Parte individual 2: control de acceso, validación de entradas y diseño seguro'),
    P('*Autor: Andrés Rojas.* Esta parte aborda las categorías A01:2025 (*Broken Access Control*), A05:2025 (*Injection*) y A06:2025 (*Insecure Design*) y desarrolla los requisitos RS-01 a RS-04 y RS-14 a RS-16. El control de acceso defectuoso ocupa el primer puesto del OWASP Top 10 desde 2021 y la inyección sigue siendo la categoría con más CVE asociados (OWASP Foundation, 2025b). El objetivo de esta parte es garantizar que cada usuario solo pueda ver y modificar lo que le corresponde, que ningún dato de entrada pueda alterar la semántica de una consulta o de una página, y que las reglas de negocio no puedan explotarse.'),

    H3('Modelo de autorización basado en roles'),
    P('La autorización combina dos niveles: un control de acceso basado en roles (RBAC), que determina qué funciones puede usar cada tipo de usuario, y un control a nivel de objeto, que determina sobre qué datos concretos puede actuar. Ambos se aplican siempre en el servidor. La interfaz oculta las opciones no disponibles para cada rol por usabilidad, pero nunca se considera un control de seguridad. La {tab:rbac} muestra la matriz de permisos.'),
    T('rbac', 'Matriz de permisos por rol.',
      ['Recurso / operación', 'USER', 'AUDITOR', 'ADMIN'],
      [
          ['Propios gastos, categorías, justificantes e informes', 'Sí', 'Sí', 'Sí'],
          ['Gastos de otros usuarios', 'No', 'No', 'No'],
          ['Propia cuenta: perfil, contraseña, MFA, sesiones, actividad', 'Sí', 'Sí', 'Sí'],
          ['Listado de usuarios y cambio de rol o estado', 'No', 'No', 'Sí (salvo la propia cuenta)'],
          ['Desbloqueo y reinicio del segundo factor de otros usuarios', 'No', 'No', 'Sí (salvo la propia cuenta)'],
          ['Cierre de las sesiones de un usuario o de toda la plataforma', 'No', 'No', 'Sí (toda la plataforma: con contraseña)'],
          ['Consulta del registro de auditoría y verificación de integridad', 'No', 'Sí', 'Sí'],
          ['Consulta de alertas de seguridad', 'No', 'Sí', 'Sí'],
          ['Marcar alertas como revisadas', 'No', 'No', 'Sí'],
      ],
      widths=[52, 12, 14, 22], align=['left', 'center', 'center', 'center'], size=18),
    P('Las funciones propias de los roles AUDITOR y ADMIN solo se habilitan si la cuenta tiene activado el segundo factor, como se explicó en la parte 1. Destaca además una decisión de diseño: **ni el administrador ni el auditor pueden consultar los gastos de los usuarios**. La administración de cuentas no requiere conocer sus datos financieros, por lo que, aplicando el principio de mínimo privilegio (Saltzer y Schroeder, 1975) y la minimización de datos del RGPD, no se ofrece ninguna ruta que permita ese acceso. Un administrador malicioso o con la cuenta comprometida no puede, por tanto, exfiltrar los datos financieros de los usuarios a través de la aplicación.'),
    P('La autorización por rol se aplica a nivel de enrutador: todas las rutas de `/api/admin` exigen el rol ADMIN y todas las de `/api/audit`, los roles ADMIN o AUDITOR. Cualquier ruta que se añada en el futuro a esos enrutadores queda protegida por defecto (*fail-safe defaults*). El rol se lee de la base de datos en cada petición, como se explicó en la parte 1, por lo que una degradación de privilegios surte efecto inmediato. Las denegaciones se registran como eventos `ACCESS_DENIED` con el rol, el método y la ruta solicitados.'),
    PB('Las operaciones administrativas incorporan dos salvaguardas adicionales frente al error humano y a la escalada de privilegios:'),
    UL(
        'Un administrador **no puede modificar su propia cuenta** desde el panel de administración. Se evitan así tanto la autoescalada o el autobloqueo accidental como el borrado de rastros por un administrador comprometido, que tendría que actuar sobre otra cuenta.',
        'El sistema **impide que el último administrador activo** sea degradado o deshabilitado.',
    ),
    P('Además, cualquier cambio de rol o estado revoca todas las sesiones del usuario afectado y genera una alerta `PRIVILEGE_CHANGE`, de severidad alta si se concede el rol de administrador. La {fig:admin} muestra el panel de administración. La {fig:auditorsinacceso} muestra la respuesta de la aplicación cuando un auditor intenta acceder a él: la interfaz informa de la restricción y la API devuelve HTTP 403.'),
    F('admin', '10-admin-usuarios.png', 'Panel de administración de usuarios.', width=15.0),
    F('auditorsinacceso', '15-auditor-sin-acceso.png', 'Intento de acceso de un auditor al panel de administración.', width=13.0),

    H3('Control de acceso a nivel de objeto'),
    P('La vulnerabilidad de autorización más frecuente en las API es la referencia directa insegura a objetos (IDOR), también denominada *Broken Object Level Authorization* (BOLA): el usuario está autenticado y tiene permiso para la operación, pero no sobre el objeto concreto que solicita. En GastoSeguro, todas las consultas de datos de negocio incluyen el identificador del usuario autenticado como condición, tanto en los listados como en las operaciones sobre un objeto concreto. Este identificador procede siempre del contexto de autenticación y nunca de la petición.'),
    P('Para las operaciones sobre un gasto concreto se ha implementado una función que distingue internamente dos situaciones: que el gasto no exista y que exista pero pertenezca a otro usuario. En ambos casos la respuesta es la misma, HTTP 404 «El gasto no existe», para no confirmar al atacante la existencia del recurso. Sin embargo, el segundo caso se registra como intento de acceso indebido y alimenta la regla de detección de sondeo:'),
    CODE('''async function findOwnedExpense(req: Request, auth: AuthContext, id: string) {
  const expense = await prisma.expense.findUnique({
    where: { id }, select: { id: true, userId: true, deletedAt: true },
  });
  if (!expense || expense.deletedAt) throw notFound('El gasto no existe.');
  if (expense.userId !== auth.userId) {
    await recordAccessDenied(req, 'Acceso a un gasto de otro usuario (IDOR)', { type: 'Expense', id });
    throw notFound('El gasto no existe.');   // misma respuesta: no se confirma la existencia
  }
  return expense;
}'''),
    PB('El mismo principio se aplica a todos los recursos con propietario:'),
    UL(
        'Las **categorías** se consultan con la condición `{ id, userId }`. Al crear o modificar un gasto se verifica que la categoría indicada pertenece al usuario, para impedir que un gasto propio quede asociado a una categoría ajena.',
        'Las **sesiones** solo pueden cerrarse con la condición `{ id, userId }` y tras confirmar la contraseña, de modo que un usuario no puede cerrar las sesiones de otro.',
        'Los **justificantes** se obtienen siempre a partir del gasto y tras verificar su propiedad, nunca por su nombre de fichero.',
        'Los **informes y exportaciones** se calculan exclusivamente sobre los gastos del usuario autenticado.',
    ),
    P('Cuando un mismo usuario provoca diez o más accesos denegados en diez minutos, se genera la alerta `ACCESS_CONTROL_PROBING`, porque ese patrón es característico de la enumeración automatizada de identificadores. Aunque los identificadores UUID v4 hacen impracticable adivinar los recursos ajenos, la defensa no depende de ello: el control de propiedad es efectivo aunque el atacante conozca el identificador, como demuestran las pruebas.'),

    H3('Validación de entradas'),
    P('Toda entrada externa (cuerpo, parámetros de ruta y parámetros de consulta) se valida en el servidor con esquemas declarativos de la biblioteca Zod antes de llegar a la lógica de negocio. Los esquemas siguen un enfoque de lista blanca: definen el tipo, el formato, la longitud y el rango de cada campo, y se declaran como **estrictos**, de modo que cualquier campo no previsto provoca un error 400. Esta última característica neutraliza la asignación masiva (*mass assignment*, CWE-915): aunque un atacante envíe `role`, `userId` o `status` en el cuerpo de una petición, nunca llegan a la base de datos.'),
    CODE('''export const ExpenseCreateSchema = z.object({
  amount: z.string().trim().min(1).max(20),          // se convierte a entero en el servicio
  date: z.iso.date(),                                 // AAAA-MM-DD
  categoryId: z.uuid(),
  description: safeText(200),                         // NFKC, sin caracteres de control
  merchant: safeText(100).nullable().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']),
}).strict();                                          // rechaza cualquier campo adicional'''),
    PB('Otros aspectos de la validación son:'),
    UL(
        '**Textos libres** normalizados con Unicode NFKC, con los espacios consecutivos reducidos, sin caracteres de control y con longitudes máximas en todos los campos.',
        '**Correos electrónicos** recortados y convertidos a minúsculas antes de validarlos, para evitar duplicados por diferencias de mayúsculas.',
        '**Identificadores de ruta** validados como UUID: `GET /api/expenses/1 OR 1=1` devuelve 400 sin llegar a la base de datos.',
        '**Paginación acotada**: como máximo 100 elementos por página y 10.000 páginas.',
        '**Analizador de parámetros simple**: Express se configura para no interpretar objetos anidados en la cadena de consulta, lo que impide la contaminación de prototipos y la inyección de operadores del tipo `q[$ne]=x`. Los parámetros duplicados (`page=1&page=2`) llegan como listas y son rechazados por el esquema (contaminación de parámetros HTTP).',
        '**Tipo y tamaño del cuerpo**: solo se aceptan JSON o `multipart/form-data` (415 en otro caso) y el JSON se limita a 100 KB (413 si se supera).',
    ),
    P('Los errores de validación se devuelven con un código estable (`VALIDATION_ERROR`) y una lista de campos y mensajes en español. Se emplea la localización de Zod para que el usuario pueda corregir sus datos, sin incluir en ningún caso detalles internos de la aplicación.'),

    H3('Prevención de la inyección'),
    P('La inyección se produce cuando un dato se interpreta como código en un intérprete posterior. GastoSeguro interactúa con cinco intérpretes potenciales, y en cada uno se ha aplicado la defensa adecuada, resumida en la {tab:inyeccion}.'),
    T('inyeccion', 'Intérpretes potenciales y defensas frente a la inyección.',
      ['Intérprete', 'Riesgo', 'Defensa aplicada'],
      [
          ['Motor SQL', 'Inyección SQL (CWE-89)', 'Todas las consultas se construyen con Prisma, que usa parámetros enlazados, incluidas las búsquedas con `contains`. ESLint prohíbe `$queryRawUnsafe` y `$executeRawUnsafe`; la única consulta en bruto es una plantilla etiquetada sin datos de entrada.'],
          ['Navegador (HTML/JS)', 'XSS (CWE-79)', 'React codifica todo el contenido dinámico; ESLint prohíbe `dangerouslySetInnerHTML` y la asignación de `innerHTML`; la API responde siempre en JSON; CSP estricta y Trusted Types como defensa en profundidad.'],
          ['Hoja de cálculo (CSV)', 'Inyección de fórmulas (CWE-1236)', 'Los campos que empiezan por `=`, `+`, `-`, `@`, tabulador o retorno de carro se prefijan con una comilla simple y todos los campos se entrecomillan, duplicando las comillas internas (OWASP Foundation, s. f.-c).'],
          ['Sistema de registro', 'Inyección de registros (CWE-117)', 'Registros en JSON estructurado: un salto de línea en un dato no crea entradas falsas. El identificador de petición lo genera el servidor.'],
          ['Cabeceras HTTP', 'Inyección de cabeceras', 'El nombre del justificante se envía en `Content-Disposition` codificado según el RFC 5987 (`filename*=UTF-8\'\'…`) tras sanearlo.'],
      ],
      widths=[18, 20, 62], size=18),
    P('La exportación CSV merece una mención especial porque suele pasarse por alto: un gasto con la descripción `=HYPERLINK("https://evil.example";"Pulsa aquí")` se convertiría, al abrir el fichero exportado en una hoja de cálculo, en un enlace malicioso o en la ejecución de una fórmula. Con la neutralización aplicada, el valor se exporta como `"\'=HYPERLINK(""https://evil.example"";""Pulsa aquí"")"` y se muestra como texto.'),

    H3('Gestión segura de ficheros'),
    P('La subida de justificantes es la funcionalidad con mayor superficie de ataque de la aplicación, porque introduce en el sistema contenido arbitrario controlado por el usuario. Siguiendo la guía de OWASP sobre subida de ficheros (OWASP Foundation, s. f.-d), se aplicaron los controles de la {tab:ficheros}.'),
    T('ficheros', 'Amenazas y controles en la gestión de justificantes.',
      ['Amenaza', 'Control'],
      [
          ['Agotamiento de memoria o disco', 'Máximo 5 MB, un único fichero, sin campos adicionales; límite de 30 subidas cada 15 minutos por IP; el proxy limita el cuerpo a 6 MB.'],
          ['Tipo engañoso (ejecutable renombrado como `.pdf`, HTML o SVG con scripts)', 'El tipo se determina por la firma binaria del contenido (*magic bytes*), no por la extensión ni por el `Content-Type` del cliente. Lista blanca: PDF, PNG, JPEG y WebP. SVG y HTML quedan excluidos por poder contener scripts.'],
          ['Recorrido de directorios (CWE-22)', 'El fichero se guarda con un UUID aleatorio sin extensión. La ruta se resuelve con una función que solo acepta UUID y verifica que el resultado no sale del directorio de almacenamiento.'],
          ['Ejecución en el servidor', 'Almacenamiento fuera de la raíz web; los justificantes nunca se sirven como estáticos.'],
          ['Ejecución en el navegador al descargar', 'Descarga como adjunto, con el tipo real, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src \'none\'; sandbox` y `Cache-Control: private, no-store`.'],
          ['Manipulación del fichero almacenado', 'Huella SHA-256 calculada al subir y verificada en cada descarga.'],
          ['Inconsistencia entre fichero y base de datos', 'Escritura atómica (temporal y renombrado, permisos 0600). Si falla la transacción se elimina el fichero nuevo, y el anterior solo se borra tras confirmar.'],
          ['Exposición del token en URL', 'La descarga se realiza con `fetch` y la cabecera `Authorization`; el fichero se entrega al usuario como objeto *blob*.'],
      ],
      widths=[30, 70], size=18, source='Elaboración propia a partir de OWASP Foundation (s. f.-d).'),
    P('El nombre original del fichero solo se conserva para mostrarlo, tras eliminar cualquier ruta (`../../etc/passwd` se convierte en `passwd.pdf`) y sustituir los caracteres no alfanuméricos. Los ficheros rechazados generan un evento `RECEIPT_REJECTED` con el tipo declarado y el tamaño, lo que permite detectar intentos repetidos. Como limitación, la aplicación no analiza el contenido de los ficheros en busca de *malware*. En un despliegue real se recomienda integrar un motor antivirus como ClamAV, lo que se recoge como trabajo futuro.'),

    H3('Diseño seguro de la lógica de negocio'),
    P('La categoría A06 recuerda que algunos fallos no se deben a errores de implementación, sino a la ausencia de controles en el diseño. En una aplicación financiera, la lógica de negocio debe impedir estados absurdos o explotables aunque la petición sea sintácticamente válida. La {tab:negocio} recoge las reglas implementadas en el servidor.'),
    T('negocio', 'Reglas de negocio con efecto en la seguridad.',
      ['Regla', 'Implementación', 'Riesgo mitigado'],
      [
          ['Importes exactos', 'Texto decimal convertido a entero en la unidad menor; sin coma flotante; sin notación exponencial', 'Errores de redondeo; valores como `1e9`'],
          ['Importes positivos y acotados', 'Mayor que cero y como máximo 1.000.000 EUR/USD o 1.000 millones CLP por gasto', 'Desbordamientos; datos absurdos'],
          ['Decimales según la moneda', 'Hasta 2 decimales en EUR y USD; ninguno en CLP', 'Ambigüedad de importes'],
          ['Fechas en rango', 'Entre el 01/01/2000 y el día siguiente al actual', 'Fechas absurdas que alteran los informes'],
          ['Moneda inmutable con datos', 'Solo puede cambiarse si la cuenta no tiene gastos', 'Reinterpretación de los importes almacenados'],
          ['Categorías acotadas', 'Máximo 50 por usuario; no se elimina una categoría con gastos', 'Consumo de recursos; gastos huérfanos'],
          ['Exportación acotada', 'Máximo 10.000 filas por exportación', 'Denegación de servicio por consultas masivas'],
          ['Borrado lógico', 'Los gastos eliminados se marcan con `deletedAt`', 'Pérdida de trazabilidad'],
          ['Acciones sensibles limitadas', 'Cambio de contraseña, MFA, cierre de sesiones, supresión de la cuenta y exportación: 20 cada 15 minutos', 'Abuso automatizado'],
          ['Supresión de la cuenta', 'Contraseña, TOTP si está activo y confirmación escrita; no permitida al único administrador activo', 'Borrado accidental o malicioso; sistema sin administradores'],
      ],
      widths=[22, 48, 30], size=18),

    H3('Seguridad en el cliente'),
    P('La aplicación web aplica en el navegador una política de seguridad de contenidos estricta servida por la API: solo se admiten scripts, estilos, imágenes y conexiones del propio origen, sin `unsafe-inline` ni `unsafe-eval`. Se prohíben los objetos embebidos y la base de URL, y se impide que la aplicación se cargue en marcos de terceros (`frame-ancestors \'none\'`). La directiva `require-trusted-types-for \'script\'` activa Trusted Types: cualquier intento de asignar una cadena a un sumidero peligroso del DOM provoca un error en lugar de ejecutar código.'),
    P('Para que la aplicación funcione con esta política se tomaron varias decisiones de implementación. La compilación con Vite no genera scripts en línea. No se cargan fuentes, analíticas ni bibliotecas desde terceros. El código QR se dibuja con elementos SVG de React y los gráficos del resumen se generan también como SVG sin bibliotecas externas. La verificación con un navegador real automatizado (Microsoft Edge) recorrió todas las pantallas de los tres roles sin registrar ninguna violación de CSP ni de Trusted Types en la consola. En el mismo recorrido, un gasto cuya descripción contenía `<img src=x onerror=alert(document.domain)>` se mostró como texto literal sin que se abriera ningún diálogo, lo que confirma que el contenido almacenado no se interpreta como código (caso de abuso CA-10).'),

    H3('Verificación y conclusiones de la parte'),
    PB('Los controles de esta parte se verifican con 35 pruebas de integración y 20 pruebas unitarias, todas superadas. Entre ellas destacan:'),
    UL(
        'Un usuario no puede leer, modificar, borrar ni descargar el justificante de un gasto ajeno: las cuatro operaciones devuelven 404, el gasto permanece intacto y los intentos quedan auditados.',
        'Los listados solo devuelven datos propios y no se puede asociar un gasto a una categoría ajena ni revocar sesiones o editar categorías de otro usuario.',
        'El sondeo repetido de identificadores genera la alerta correspondiente.',
        'Un usuario estándar no accede a administración ni a auditoría, un auditor no administra usuarios, la degradación de un administrador surte efecto inmediato y el único administrador activo no puede suprimir su cuenta.',
        'Las cargas de inyección SQL se tratan como texto literal, el HTML se almacena como texto y se devuelve como JSON, y se rechazan los caracteres de control, los importes y fechas no válidos, los campos no permitidos y los parámetros duplicados o anidados.',
        'Se rechazan los ejecutables y HTML disfrazados de PDF y los ficheros de más tamaño del permitido, y la descarga se realiza con las cabeceras de aislamiento.',
        'La exportación CSV neutraliza las fórmulas.',
    ),
    P('Como conclusión, esta parte muestra que el control de acceso robusto no depende de mecanismos complejos, sino de una disciplina sistemática: el propietario de cada dato forma parte de cada consulta, la autorización se decide en el servidor con denegación por defecto y la entrada se valida con esquemas estrictos. La combinación de una respuesta indistinguible (404) con el registro interno del intento permite a la vez no revelar información al atacante y detectar su actividad.'),
]
