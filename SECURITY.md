# Política de seguridad

## Versiones con soporte

| Versión | Soporte |
|---|---|
| 1.0.x | ✔ |

## Notificación de vulnerabilidades

Si encuentras una vulnerabilidad en GastoSeguro, **no abras una incidencia pública**.
Escribe a los autores del proyecto indicando:

1. Descripción del problema y categoría OWASP/CWE estimada.
2. Pasos para reproducirlo (petición HTTP, versión, configuración).
3. Impacto potencial.

Nos comprometemos a confirmar la recepción en un plazo de 5 días hábiles y a publicar una
corrección coordinada, reconociendo la autoría del hallazgo si así se desea.

## Modelo de amenazas y supuestos

- El servidor de aplicación y la base de datos se consideran zonas de confianza separadas:
  un atacante con acceso de escritura a la base de datos no debe poder ocultar su actividad
  (la cadena de auditoría usa una clave HMAC que no reside en la base de datos).
- Los secretos (`JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `AUDIT_HMAC_KEY`) deben almacenarse en
  un gestor de secretos en producción y rotarse según la política de la organización.
- La limitación de tasa y la cola de auditoría están diseñadas para una instancia; para
  escalar horizontalmente se necesita un almacén compartido (p. ej. Redis) y un registro de
  solo anexado.

## Políticas documentadas (OWASP ASVS 5.0)

- **Plazos de remediación de dependencias vulnerables (15.1.1).** Críticas: 7 días; altas: 30
  días; medias: 90 días; bajas: siguiente versión. Las dependencias se revisan cada semana
  (Dependabot) y se actualizan al menos una vez al mes. Si no existe versión corregida, se
  analiza la explotabilidad y se aplica una mitigación (`overrides`, desactivación) documentada.
- **Sesiones (7.1.1 y 7.1.2).** Token de acceso de 15 minutos; caducidad absoluta de 12 horas y
  por inactividad de 30 minutos; máximo de 10 sesiones simultáneas por cuenta: al superarse se
  cierra la más antigua y el evento queda en la actividad de la cuenta.
- **Palabras de contexto (6.1.2).** Se rechazan las contraseñas que contienen el nombre del
  usuario, la parte local de su correo o el nombre de la aplicación, además de 10.898
  contraseñas comunes de 15 o más caracteres.
- **Conservación de datos.** Gastos borrados y sesiones cerradas: 30 días; desafíos de segundo
  factor: 1 día; auditoría y alertas: 12 meses (archivado); copias de seguridad: 30 días.

## Limitaciones conocidas

- No se realiza análisis antimalware de los justificantes (se recomienda ClamAV en producción).
- El segundo factor es obligatorio para ADMIN y AUDITOR pero opcional para USER (relajación
  documentada de ASVS 6.3.3, compensada con contraseñas de 15 caracteres, lista de bloqueo,
  limitación de tasa, bloqueo temporal y alertas).
- La auditoría se guarda en la misma base de datos que la aplicación; en producción el registro
  técnico y las alertas deben enviarse a un SIEM separado (ASVS 16.4.3).
- Las contraseñas se normalizan con Unicode NFKC antes de derivarlas. NIST SP 800-63B-4
  recomienda NFC, por lo que es una desviación documentada respecto a NIST y a ASVS 6.2.8.
- Se rechazan las contraseñas con menos de cinco caracteres distintos. Es una regla de
  composición adicional que se aparta de NIST SP 800-63B-4 y de ASVS 6.2.5.
- No hay recuperación de cuenta por correo electrónico; el reinicio de MFA lo realiza un
  administrador tras verificar la identidad por un canal externo.
