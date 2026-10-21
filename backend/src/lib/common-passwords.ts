/**
 * Contraseñas y frases habituales de 15 o más caracteres (NIST SP 800-63B-4, apartado
 * 3.1.1.2, y OWASP ASVS 5.0, requisito 6.2.4: comprobación contra, al menos, las 3000
 * contraseñas más comunes que cumplen la política). Se comparan normalizadas con NFKC y en
 * minúsculas. En producción se complementa con la comprobación por k-anonimato de Have I
 * Been Pwned (variable PASSWORD_BREACH_CHECK=hibp).
 */
import { COMMON_PASSWORDS_DATA } from './common-passwords.data.js';

/** Patrones de teclado, secuencias y frases en español o inglés que completan la lista general. */
const LOCAL_COMMON_PASSWORDS = [
  '123456789012345',
  '1234567890123456',
  '111111111111111',
  '000000000000000',
  'qwertyuiopasdfg',
  'qwerty123456789',
  'abcdefghijklmno',
  'abc123456789012',
  'password1234567',
  'password12345678',
  'p@ssw0rd1234567',
  'contraseña12345',
  'contrasena12345',
  'contraseña123456',
  'micontraseña123',
  'micontrasena123',
  'administrador123',
  'administrator123',
  'iloveyou1234567',
  'iloveyouiloveyou',
  'teamomuchoteamo',
  'tequieromucho123',
  'bienvenido12345',
  'welcome12345678',
  'letmein12345678',
  'changeme1234567',
  'cambiamecambiame',
  'superman1234567',
  'barcelona123456',
  'realmadrid12345',
  'colocolo1234567',
  '1q2w3e4r5t6y7u8i',
  'zaq12wsxcde34rfv',
  'correcthorsebatterystaple',
];

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([...COMMON_PASSWORDS_DATA, ...LOCAL_COMMON_PASSWORDS]);
