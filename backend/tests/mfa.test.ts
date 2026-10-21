/**
 * Segundo factor TOTP (A07:2025).
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { base32Decode, hotp } from '../src/lib/totp.js';
import { app, auth, createUser, STRONG_PASSWORD } from './helpers.js';

const codeFor = (secret: string, offsetSteps = 0) => hotp(base32Decode(secret), Math.floor(Date.now() / 30_000) + offsetSteps);

describe('Segundo factor de autenticación (TOTP)', () => {
  it('activa MFA, lo exige en el login y rechaza la reutilización de códigos', async () => {
    const user = await createUser();

    const setup = await request(app).post('/api/account/mfa/setup').set(auth(user));
    expect(setup.status).toBe(200);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/GastoSeguro:/);
    const secret: string = setup.body.secret;

    // El secreto nunca se guarda en claro.
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.mfaPendingSecretEnc).not.toContain(secret);
    expect(stored.mfaPendingSecretEnc?.startsWith('v1.')).toBe(true);

    expect((await request(app).post('/api/account/mfa/enable').set(auth(user)).send({ code: '000000', password: STRONG_PASSWORD })).status).toBe(400);
    // Vincular un autenticador exige la contraseña: un token de acceso robado no basta (ASVS 7.5.1).
    expect((await request(app).post('/api/account/mfa/enable').set(auth(user)).send({ code: codeFor(secret) })).status).toBe(400);
    expect((await request(app).post('/api/account/mfa/enable').set(auth(user)).send({ code: codeFor(secret), password: 'otra-contraseña-larga' })).status).toBe(400);
    expect((await request(app).post('/api/account/mfa/enable').set(auth(user)).send({ code: codeFor(secret), password: STRONG_PASSWORD })).status).toBe(204);

    // La contraseña ya no basta: se emite un desafío y no se entrega ningún token.
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: STRONG_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBe(true);
    expect(login.body.accessToken).toBeUndefined();
    expect(login.headers['set-cookie']).toBeUndefined();

    // El código usado al activar (mismo paso temporal) no puede reutilizarse.
    const { mfaLastUsedStep } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const key = base32Decode(secret);
    const replay = await request(app).post('/api/auth/login/mfa').send({ challengeId: login.body.challengeId, code: hotp(key, mfaLastUsedStep!) });
    expect(replay.status).toBe(401);

    // El siguiente paso temporal (dentro de la ventana de tolerancia) sí es válido.
    const nextCode = hotp(key, mfaLastUsedStep! + 1);
    const login2 = await request(app).post('/api/auth/login').send({ email: user.email, password: STRONG_PASSWORD });
    const ok = await request(app).post('/api/auth/login/mfa').send({ challengeId: login2.body.challengeId, code: nextCode });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTypeOf('string');

    // El desafío es de un solo uso.
    const again = await request(app).post('/api/auth/login/mfa').send({ challengeId: login2.body.challengeId, code: nextCode });
    expect(again.status).toBe(401);
  });

  it('invalida el desafío tras 5 códigos erróneos', async () => {
    const user = await createUser();
    const setup = await request(app).post('/api/account/mfa/setup').set(auth(user));
    await request(app).post('/api/account/mfa/enable').set(auth(user)).send({ code: codeFor(setup.body.secret), password: STRONG_PASSWORD });
    await prisma.user.update({ where: { id: user.id }, data: { mfaLastUsedStep: null } });

    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: STRONG_PASSWORD });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/auth/login/mfa').send({ challengeId: login.body.challengeId, code: '123456' });
    }
    const valid = await request(app).post('/api/auth/login/mfa').send({ challengeId: login.body.challengeId, code: codeFor(setup.body.secret) });
    expect(valid.status).toBe(401);
  });
});
