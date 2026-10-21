/**
 * Tokens de acceso JWT (A07 y A08:2025).
 *
 * - Firma HMAC-SHA256 con una clave de al menos 256 bits validada al arrancar.
 * - En la verificación se fija la lista de algoritmos aceptados (evita "alg: none" y la
 *   confusión de algoritmos, RFC 8725) y se exigen emisor, audiencia y expiración.
 * - Tipado explícito "at+jwt" (RFC 9068 y RFC 8725, apartado 3.11; ASVS 5.0, requisito
 *   9.2.2): para autorizar solo se aceptan tokens emitidos como tokens de acceso.
 * - Vida corta (15 minutos por defecto). El token solo contiene el identificador de usuario
 *   y de sesión: el rol y el estado se leen siempre de la base de datos, de modo que una
 *   revocación o un cambio de permisos tiene efecto inmediato.
 */
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

const SECRET = new Uint8Array(Buffer.from(env.JWT_SECRET, 'base64'));
const ISSUER = 'gastoseguro-api';
const AUDIENCE = 'gastoseguro-web';
const ALGORITHM = 'HS256';
const TOKEN_TYPE = 'at+jwt';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: ALGORITHM, typ: TOKEN_TYPE })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(SECRET);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
    typ: TOKEN_TYPE,
    requiredClaims: ['sub', 'sid', 'exp', 'iat', 'jti'],
    clockTolerance: 5,
  });
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    throw new Error('Token sin las claims requeridas');
  }
  return { sub: payload.sub, sid: payload.sid };
}
