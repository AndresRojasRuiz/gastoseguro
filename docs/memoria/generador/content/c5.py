# -*- coding: utf-8 -*-
from .dsl import H1, H2, P, PB, T, UL

BLOCKS = [
    H1('Conclusiones y trabajo futuro'),
    P('Este capítulo resume el trabajo, valora el cumplimiento de los objetivos, recoge las contribuciones y lecciones aprendidas y propone líneas de continuación.'),

    H2('Conclusiones'),
    P('El trabajo partía de una constatación: el OWASP Top 10 es el marco de referencia más conocido sobre riesgos de seguridad en aplicaciones web, pero es un documento de concienciación y no una guía de implementación. La distancia entre sus categorías y el código debe recorrerla cada equipo de desarrollo, y la edición de 2025, con sus dos categorías nuevas, aún no contaba con implementaciones de referencia documentadas. Al mismo tiempo, los datos de incidentes muestran que los vectores más frecuentes (abuso de credenciales, explotación de vulnerabilidades y compromisos de terceros) siguen explotando debilidades conocidas.'),
    P('Para abordar ese problema se ha desarrollado GastoSeguro, una aplicación web completa de registro de gastos personales, siguiendo un ciclo de vida de desarrollo seguro alineado con NIST SSDF. El proceso partió de un modelado de amenazas STRIDE, del que se derivaron veinte amenazas y veinticuatro requisitos de seguridad trazados a OWASP ASVS 5.0. Esos requisitos se tradujeron en controles concretos para cada una de las diez categorías del OWASP Top 10:2025, repartidos en tres partes individuales: autenticación, sesiones y criptografía; control de acceso, entradas y diseño seguro; y configuración, cadena de suministro, registro y gestión de errores.'),
    P('La evaluación aporta evidencias favorables, dentro del alcance y con las limitaciones de entorno indicadas. Las 110 pruebas automatizadas se superan tanto sobre SQLite como sobre PostgreSQL. Los casos de abuso simulados contra la aplicación en ejecución fueron bloqueados, registrados y, cuando correspondía, alertados. El análisis dinámico autenticado con OWASP ZAP detectó un fallo real, un error 500 provocado por un byte nulo en las búsquedas sobre PostgreSQL, que se corrigió y se verificó con un nuevo escaneo; el resto de sus hallazgos resultaron falsos positivos o informativos. La revisión sistemática con OWASP ASVS 5.0 identificó ocho desviaciones respecto al nivel 2, que se corrigieron, y deja documentados los requisitos que no se cumplen. El coste en rendimiento es moderado, con percentiles 95 de las consultas muy por debajo del umbral de 100 ms fijado en los requisitos.'),
    P('Más allá de confirmar el diseño, la verificación aportó hallazgos que no se habrían detectado con una revisión puramente documental: un canal lateral de temporización que permitía enumerar cuentas con un 78,5 % de acierto, corregido hasta el nivel del azar; cuatro vulnerabilidades de severidad alta heredadas de la cadena de suministro, analizadas y remediadas antes de la entrega; las desviaciones de ASVS; y el fallo dependiente del motor de base de datos encontrado por el análisis dinámico. Que la verificación encontrara problemas reales y que estos se corrigieran es, precisamente, el argumento principal a favor de la metodología seguida.'),

    H2('Grado de cumplimiento de los objetivos'),
    P('La {tab:cumplimiento} relaciona cada objetivo específico con el resultado obtenido.'),
    T('cumplimiento', 'Grado de cumplimiento de los objetivos específicos.',
      ['Objetivo', 'Resultado', 'Grado'],
      [
          ['OE1. Analizar el marco de referencia', 'Estado del arte con fuentes primarias (OWASP, NIST, IETF, W3C, normativa europea y española) y conclusiones aplicadas al diseño (capítulo 2).', 'Cumplido'],
          ['OE2. Identificar requisitos', 'Diecisiete requisitos funcionales, ocho no funcionales, veinte amenazas STRIDE con su valoración de riesgo, diez casos de abuso y veinticuatro requisitos de seguridad trazados a requisitos concretos de ASVS 5.0 (apartado 4.1).', 'Cumplido'],
          ['OE3. Diseñar la arquitectura', 'Arquitectura por capas con zonas de confianza, modelo de datos, cadena de controles y API documentados (apartado 4.2).', 'Cumplido'],
          ['OE4. Autenticación, sesiones y criptografía', 'Argon2id, política NIST, bloqueo, igualación de tiempos, TOTP obligatorio para los roles privilegiados, sesión híbrida con refresco rotatorio, reautenticación y criptografía normalizada (apartado 4.3).', 'Cumplido'],
          ['OE5. Control de acceso, entradas y ficheros', 'RBAC y control por objeto, validación estricta, defensas frente a la inyección, gestión segura de ficheros y reglas de negocio (apartado 4.4).', 'Cumplido'],
          ['OE6. Configuración, cadena de suministro, registro y errores', 'Configuración validada, cabeceras, gestión de dependencias con SBOM, auditoría encadenada, seis reglas de alerta, gestión de errores y canal de CI (apartado 4.5).', 'Cumplido; ejecución del canal de CI y del despliegue con contenedores pendiente'],
          ['OE7. Verificar y medir', '110 pruebas superadas sobre SQLite y PostgreSQL, simulación de casos de abuso, análisis dinámico con ZAP, experimento de temporización, análisis estático y de dependencias, verificación ASVS y mediciones de rendimiento (apartado 4.6).', 'Cumplido; CodeQL, prueba de carga y validación con usuarios pendientes'],
          ['OE8. Documentar', 'README, política de seguridad, manual de instalación y despliegue (Anexo A), catálogo y especificación OpenAPI de la API (Anexo B) y evidencias con sus huellas SHA-256 (Anexo F).', 'Cumplido; publicación del repositorio pendiente'],
      ],
      widths=[27, 55, 18], size=18),
    P('El objetivo general, que la aplicación mitigue de forma demostrable los diez riesgos del OWASP Top 10:2025, se considera alcanzado en el alcance definido. Esta valoración no equivale a afirmar que la aplicación carezca de vulnerabilidades: la verificación se realizó en un entorno local, por el propio equipo y sin auditoría externa; el canal de integración continua, CodeQL y el despliegue con contenedores están definidos pero no se han ejecutado; y la usabilidad solo se ha evaluado de forma heurística. Estas limitaciones se detallan en la discusión de la evaluación.'),

    H2('Contribuciones del trabajo'),
    PB('Las principales contribuciones del TFE son:'),
    UL(
        '**Una implementación de referencia** de código abierto, completa y desplegable, que muestra cómo abordar cada categoría del OWASP Top 10:2025 en una aplicación web real con tecnologías actuales.',
        '**Una metodología trazable** que conecta cada amenaza con un requisito de ASVS, un control, una prueba y una evidencia. Puede reutilizarse en otros proyectos.',
        '**Una batería de pruebas de seguridad** que se ejecuta en cada cambio y codifica los ataques más habituales como pruebas de regresión.',
        '**Un caso documentado de canal lateral de temporización** en la autenticación web, con un diseño experimental reproducible para cuantificarlo y una mitigación de coste bajo.',
        '**Un caso real de gestión de la cadena de suministro**: detección, análisis de riesgo y remediación de vulnerabilidades transitivas en una herramienta de uso masivo.',
        '**Un diseño de auditoría a prueba de manipulaciones** sencillo de integrar en aplicaciones convencionales, con verificación y alerta.',
    ),
    P('Desde el punto de vista formativo, el carácter grupal del trabajo ha permitido a cada integrante profundizar en un área de la seguridad del software y, al mismo tiempo, comprender cómo sus controles dependen de los del resto: la detección de accesos indebidos de la parte 2 alimenta las alertas de la parte 3, cuya respuesta se apoya en la revocación inmediata de sesiones de la parte 1.'),

    H2('Lecciones aprendidas'),
    UL(
        '**La verificación debe ser empírica.** Los hallazgos más relevantes (el canal de temporización, las vulnerabilidades heredadas y el error con el byte nulo) aparecieron al medir, analizar y atacar, no al diseñar. Un control que parece correcto en su lógica puede no serlo en la práctica.',
        '**El OWASP Top 10 orienta, pero no basta para verificar.** La revisión requisito a requisito con ASVS 5.0 descubrió desviaciones concretas, como el prefijo de la cookie o la reautenticación al cerrar sesiones, que la lectura de las categorías de riesgo no hacía evidentes.',
        '**El entorno de pruebas debe parecerse al de producción.** El fallo del byte nulo solo se manifestaba con PostgreSQL: las pruebas sobre SQLite no podían detectarlo.',
        '**La defensa en profundidad funciona.** Ningún control es suficiente por sí solo. Por ejemplo, el robo de una sesión requeriría eludir a la vez la CSP, Trusted Types, el almacenamiento del token en memoria, la cookie `HttpOnly` y la detección de reutilización.',
        '**Menos dependencias, menos riesgo.** Implementar funciones pequeñas sobre las primitivas de la plataforma, en lugar de añadir bibliotecas, redujo la superficie de la cadena de suministro sin aumentar significativamente el esfuerzo.',
        '**Seguridad y usabilidad no están reñidas.** Las decisiones de seguridad mejor valoradas en la evaluación heurística, como los mensajes claros, el aviso para activar MFA o las frases de paso, son también decisiones de usabilidad.',
        '**La seguridad es un proceso.** El canal de integración continua, Dependabot y las alertas convierten los controles en prácticas sostenidas en el tiempo, lo que exigen tanto el OWASP Top 10:2025 como la regulación europea emergente.',
    ),

    H2('Líneas de trabajo futuro'),
    PB('El trabajo abre varias líneas de continuación, ordenadas según su impacto en la seguridad:'),
    UL(
        '**Autenticación resistente al *phishing*.** Incorporar llaves FIDO2/WebAuthn y *passkeys* como segundo factor o como sustituto de la contraseña, extender el segundo factor obligatorio a todos los usuarios y añadir un proceso seguro de recuperación de la cuenta (ASVS 5.0, 6.4.3) con códigos de un solo uso.',
        '**Validación externa y ejecución del canal.** Publicar el repositorio para ejecutar el canal de integración continua, CodeQL y el despliegue con contenedores; encargar una prueba de penetración independiente; y valorar un programa de divulgación responsable de vulnerabilidades.',
        '**Escalado horizontal seguro.** Trasladar la limitación de tasa a un almacén compartido (por ejemplo, Redis) y la auditoría a un almacén de solo anexado, con anclaje periódico del último *hash* en un sistema externo para detectar también el truncamiento.',
        '**Operación de la seguridad.** Enviar los registros y las alertas a un SIEM separado de la aplicación (ASVS 5.0, 16.4.3), custodiar los secretos en un gestor de secretos (13.3.1), notificar las alertas por correo o mensajería y definir procedimientos de respuesta para cada regla.',
        '**Análisis de ficheros.** Integrar un motor antivirus como ClamAV y eliminar los metadatos de las imágenes subidas (por ejemplo, la geolocalización EXIF).',
        '**Privacidad avanzada.** Estudiar el cifrado de los datos de gastos por usuario con claves derivadas en el cliente, de modo que ni siquiera el operador del servicio pueda leerlos.',
        '**Validación con usuarios.** Aplicar el protocolo SUS del Anexo E con usuarios reales y medir el efecto de los controles de seguridad en la experiencia de uso.',
        '**Cumplimiento regulatorio.** Completar la gestión de vulnerabilidades exigida por el Reglamento de Ciberresiliencia, por ejemplo con documentos VEX asociados al SBOM y con un proceso formal de notificación.',
        '**Ampliación funcional.** Añadir presupuestos, gastos recurrentes y reconocimiento automático de justificantes, aplicando a cada novedad el mismo ciclo de amenazas, requisitos, pruebas y evidencias.',
    ),
    P('En definitiva, el trabajo muestra que una aplicación construida desde el diseño conforme al OWASP Top 10:2025 es viable con recursos modestos y puede acompañarse de evidencias objetivas y reproducibles sobre sus controles. Ese es, quizá, el cambio de enfoque más importante que propone: pasar de afirmar que una aplicación es segura a aportar evidencias verificables de cómo se protege, sin que ello equivalga a garantizar la ausencia de vulnerabilidades.'),
]
