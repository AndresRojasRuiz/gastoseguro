/**
 * A07:2025 - Authentication Failures / A04:2025 - Cryptographic Failures.
 */
import { SignJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, auditEntries, auth, createUser, loginUser, ORIGIN, registerUser, STRONG_PASSWORD, uniqueEmail } from './helpers.js';

const secret = () => new Uint8Array(Buffer.from(process.env.JWT_SECRET!, 'base64'));

describe('Registro', () => {
  it('almacena la contraseña solo como hash Argon2id', async () => {
    const { email } = await registerUser();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(STRONG_PASSWORD);
    expect(user.role).toBe('USER');
  });

  it('rechaza campos no previstos (asignación masiva de rol)', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Intruso', email: uniqueEmail(), password: STRONG_PASSWORD, role: 'ADMIN' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza contraseñas débiles con un mensaje explicativo', async () => {
    const response = await request(app).post('/api/auth/register').send({ name: 'Débil', email: uniqueEmail(), password: 'password12345678' });
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('demasiado común');
  });

  it('responde igual si el correo ya existe (sin enumeración de cuentas)', async () => {
    const { email } = await registerUser();
    const nuevo = await request(app).post('/api/auth/register').send({ name: 'Otra', email: uniqueEmail(), password: STRONG_PASSWORD });
    const repetido = await request(app).post('/api/auth/register').send({ name: 'Otra', email, password: STRONG_PASSWORD });
    expect(repetido.status).toBe(nuevo.status);
    expect(repetido.body).toEqual(nuevo.body);
  });
});

describe('Inicio de sesión', () => {
  it('emite un token de acceso y una cookie de refresco __Host-, HttpOnly, Secure y SameSite=Strict', async () => {
    const { email } = await registerUser();
    const response = await request(app).post('/api/auth/login').send({ email, password: STRONG_PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTypeOf('string');
    expect(response.body.user.passwordHash).toBeUndefined();
    const cookie = ([] as string[]).concat(response.headers['set-cookie'] ?? [])[0] ?? '';
    expect(cookie).toMatch(/^__Host-gs_rt=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    // El prefijo __Host- exige Path=/ y prohíbe el atributo Domain (ASVS 5.0, 3.3.1 y 3.3.3).
    expect(cookie).toContain('Path=/;');
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('usa el mismo mensaje para usuario inexistente y contraseña incorrecta', async () => {
    const { email } = await registerUser();
    const wrongPassword = await request(app).post('/api/auth/login').send({ email, password: 'otra-contraseña-larga' });
    const unknownUser = await request(app).post('/api/auth/login').send({ email: uniqueEmail(), password: 'otra-contraseña-larga' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });

  it('iguala el tiempo de respuesta con independencia de que la cuenta exista (CWE-208)', async () => {
    const { email } = await registerUser();
    const minimum = Number(process.env.AUTH_MIN_RESPONSE_MS);
    const measure = async (body: object) => {
      const start = performance.now();
      const response = await request(app).post('/api/auth/login').send(body);
      return { status: response.status, ms: performance.now() - start };
    };
    const existing = await measure({ email, password: 'contraseña-incorrecta-larga' });
    const unknown = await measure({ email: uniqueEmail(), password: 'contraseña-incorrecta-larga' });
    expect(existing.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(existing.ms).toBeGreaterThanOrEqual(minimum);
    expect(unknown.ms).toBeGreaterThanOrEqual(minimum);
  });

  it('bloquea la cuenta tras 5 intentos fallidos, la audita y genera una alerta', async () => {
    const { email } = await registerUser();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/auth/login').send({ email, password: 'contraseña-equivocada' });
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

    // Incluso con la contraseña correcta, la cuenta bloqueada no puede autenticarse.
    const blocked = await request(app).post('/api/auth/login').send({ email, password: STRONG_PASSWORD });
    expect(blocked.status).toBe(401);

    expect((await auditEntries('AUTH_ACCOUNT_LOCKED', user.id)).length).toBe(1);
    const alert = await prisma.securityAlert.findFirst({ where: { type: 'ACCOUNT_LOCKED', userId: user.id } });
    expect(alert).not.toBeNull();
  });

  it('limita la tasa de intentos por IP y cuenta (HTTP 429)', async () => {
    const email = uniqueEmail('fuerza-bruta');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(app).post('/api/auth/login').send({ email, password: 'probando-contraseñas' });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('Tokens de acceso (JWT)', () => {
  it('rechaza peticiones sin token', async () => {
    expect((await request(app).get('/api/expenses')).status).toBe(401);
  });

  it('rechaza tokens con "alg: none"', async () => {
    const user = await createUser();
    const [, payload] = user.token.split('.');
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const response = await request(app).get('/api/expenses').set('Authorization', `Bearer ${header}.${payload}.`);
    expect(response.status).toBe(401);
  });

  it('rechaza tokens con la carga útil manipulada', async () => {
    const user = await createUser();
    const other = await createUser();
    const [header, payload, signature] = user.token.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    claims.sub = other.id;
    const forged = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
    expect((await request(app).get('/api/expenses').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  it('rechaza tokens firmados con otra clave', async () => {
    const user = await createUser();
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    const forged = await new SignJWT({ sid: session.id })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setSubject(user.id)
      .setIssuer('gastoseguro-api')
      .setAudience('gastoseguro-web')
      .setIssuedAt()
      .setJti('x')
      .setExpirationTime('5m')
      .sign(new Uint8Array(32));
    expect((await request(app).get('/api/expenses').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  it('rechaza tokens caducados', async () => {
    const user = await createUser();
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ sid: session.id })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setSubject(user.id)
      .setIssuer('gastoseguro-api')
      .setAudience('gastoseguro-web')
      .setIssuedAt(now - 3600)
      .setJti('y')
      .setExpirationTime(now - 600)
      .sign(secret());
    expect((await request(app).get('/api/expenses').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
  });

  it('rechaza un JWT válido que no está tipado como token de acceso (at+jwt)', async () => {
    const user = await createUser();
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    const untyped = await new SignJWT({ sid: session.id })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer('gastoseguro-api')
      .setAudience('gastoseguro-web')
      .setIssuedAt()
      .setJti('z')
      .setExpirationTime('5m')
      .sign(secret());
    expect((await request(app).get('/api/expenses').set('Authorization', `Bearer ${untyped}`)).status).toBe(401);
    const [header] = user.token.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString()).typ).toBe('at+jwt');
  });

  it('deja de aceptar el token en cuanto la sesión se revoca o la cuenta se deshabilita', async () => {
    const user = await createUser();
    expect((await request(app).get('/api/expenses').set(auth(user))).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
    expect((await request(app).get('/api/expenses').set(auth(user))).status).toBe(401);
  });
});

describe('Refresh tokens', () => {
  it('rota el token en cada uso y detecta la reutilización revocando la sesión', async () => {
    const user = await createUser();
    const first = await request(app).post('/api/auth/refresh').set('Origin', ORIGIN).set('Cookie', user.cookies);
    expect(first.status).toBe(200);
    const rotatedCookies = ([] as string[]).concat(first.headers['set-cookie'] ?? []);
    expect(rotatedCookies[0]).not.toBe(user.cookies[0]);

    // Un atacante reutiliza el token antiguo robado.
    const reuse = await request(app).post('/api/auth/refresh').set('Origin', ORIGIN).set('Cookie', user.cookies);
    expect(reuse.status).toBe(401);

    // La sesión completa queda revocada: tampoco sirve el token legítimo más reciente.
    const legit = await request(app).post('/api/auth/refresh').set('Origin', ORIGIN).set('Cookie', rotatedCookies);
    expect(legit.status).toBe(401);

    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.revokeReason).toBe('TOKEN_REUSE');
    expect(await prisma.securityAlert.count({ where: { type: 'TOKEN_REUSE', userId: user.id } })).toBe(1);
  });

  it('exige un Origin de confianza (defensa CSRF)', async () => {
    const user = await createUser();
    expect((await request(app).post('/api/auth/refresh').set('Cookie', user.cookies)).status).toBe(403);
    expect((await request(app).post('/api/auth/refresh').set('Origin', 'https://atacante.example').set('Cookie', user.cookies)).status).toBe(403);
    expect(
      (await request(app).post('/api/auth/refresh').set('Origin', ORIGIN).set('Sec-Fetch-Site', 'cross-site').set('Cookie', user.cookies)).status,
    ).toBe(403);
  });

  it('el cierre de sesión revoca la sesión en el servidor', async () => {
    const user = await createUser();
    expect((await request(app).post('/api/auth/logout').set('Origin', ORIGIN).set('Cookie', user.cookies)).status).toBe(204);
    expect((await request(app).get('/api/expenses').set(auth(user))).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Origin', ORIGIN).set('Cookie', user.cookies)).status).toBe(401);
  });

  it('caduca la sesión por inactividad', async () => {
    const user = await createUser();
    await prisma.session.updateMany({ where: { userId: user.id }, data: { lastUsedAt: new Date(Date.now() - 31 * 60 * 1000) } });
    expect((await request(app).get('/api/expenses').set(auth(user))).status).toBe(401);
  });
});

describe('Cambio de contraseña', () => {
  it('exige la contraseña actual y revoca las demás sesiones', async () => {
    const { email } = await registerUser();
    const deviceA = await loginUser(email);
    const deviceB = await loginUser(email);

    const wrong = await request(app).post('/api/account/password').set(auth(deviceA)).send({ currentPassword: 'no-es-la-buena-1', newPassword: 'Nueva frase de paso segura 2026' });
    expect(wrong.status).toBe(400);

    const ok = await request(app).post('/api/account/password').set(auth(deviceA)).send({ currentPassword: STRONG_PASSWORD, newPassword: 'Nueva frase de paso segura 2026' });
    expect(ok.status).toBe(200);
    expect(ok.body.revokedSessions).toBe(1);
    expect((await request(app).get('/api/expenses').set(auth(deviceB))).status).toBe(401);
    expect((await request(app).get('/api/expenses').set(auth(deviceA))).status).toBe(200);
  });
});
