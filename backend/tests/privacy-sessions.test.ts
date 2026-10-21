/**
 * Requisitos incorporados tras la verificación con OWASP ASVS 5.0 y la revisión de protección
 * de datos: MFA obligatorio para roles privilegiados (6.3.3), cierre de sesiones con
 * reautenticación (7.5.2) y por administradores (7.4.5), lista de contraseñas comunes
 * (6.2.4), supresión de la cuenta (RGPD art. 17) y purga por conservación (RGPD art. 5.1.e).
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { COMMON_PASSWORDS } from '../src/lib/common-passwords.js';
import { checkPasswordPolicy } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { base32Decode, hotp } from '../src/lib/totp.js';
import { purgeExpiredData } from '../src/services/retention.service.js';
import { app, auditEntries, auth, createExpense, createUser, loginUser } from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

describe('MFA obligatorio para roles privilegiados', () => {
  it('un administrador o auditor sin segundo factor no ejerce su rol, pero sí accede a su cuenta', async () => {
    const admin = await createUser('ADMIN', { mfa: false });
    const auditor = await createUser('AUDITOR', { mfa: false });
    const adminResponse = await request(app).get('/api/admin/users').set(auth(admin));
    expect(adminResponse.status).toBe(403);
    expect(adminResponse.body.error.code).toBe('MFA_REQUIRED');
    expect((await request(app).get('/api/audit/logs').set(auth(auditor))).body.error.code).toBe('MFA_REQUIRED');
    expect((await request(app).get('/api/account/me').set(auth(admin))).status).toBe(200);
    expect((await request(app).post('/api/account/mfa/setup').set(auth(admin))).status).toBe(200);
    const denied = await auditEntries('ACCESS_DENIED', admin.id);
    expect(denied.some((entry) => entry.details?.includes('sin segundo factor'))).toBe(true);
  });

  it('con el segundo factor activado el rol privilegiado funciona', async () => {
    const admin = await createUser('ADMIN');
    expect((await request(app).get('/api/admin/users').set(auth(admin))).status).toBe(200);
  });
});

describe('Cierre de sesiones', () => {
  it('exige la contraseña para cerrar una sesión propia o las demás', async () => {
    const user = await createUser();
    const second = await loginUser(user.email, user.password);
    const secondSession = await prisma.session.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });

    const noPassword = await request(app).post(`/api/account/sessions/${secondSession.id}/revoke`).set(auth(user)).send({});
    expect(noPassword.status).toBe(400);
    const wrong = await request(app).post(`/api/account/sessions/${secondSession.id}/revoke`).set(auth(user)).send({ password: 'otra-contraseña-larga' });
    expect(wrong.status).toBe(400);
    expect((await request(app).get('/api/expenses').set(auth(second))).status).toBe(200);

    const ok = await request(app).post(`/api/account/sessions/${secondSession.id}/revoke`).set(auth(user)).send({ password: user.password });
    expect(ok.status).toBe(204);
    expect((await request(app).get('/api/expenses').set(auth(second))).status).toBe(401);

    const third = await loginUser(user.email, user.password);
    expect((await request(app).post('/api/account/sessions/revoke-others').set(auth(user)).send({ password: 'otra-contraseña-larga' })).status).toBe(400);
    const others = await request(app).post('/api/account/sessions/revoke-others').set(auth(user)).send({ password: user.password });
    expect(others.body.revokedSessions).toBe(1);
    expect((await request(app).get('/api/expenses').set(auth(third))).status).toBe(401);
    expect((await request(app).get('/api/expenses').set(auth(user))).status).toBe(200);
  });

  it('un administrador cierra las sesiones de un usuario o de toda la plataforma', async () => {
    const admin = await createUser('ADMIN');
    const victim = await createUser();
    const bystander = await createUser();

    const single = await request(app).post(`/api/admin/users/${victim.id}/revoke-sessions`).set(auth(admin));
    expect(single.status).toBe(200);
    expect(single.body.revokedSessions).toBe(1);
    expect((await request(app).get('/api/expenses').set(auth(victim))).status).toBe(401);
    expect((await request(app).get('/api/expenses').set(auth(bystander))).status).toBe(200);
    expect(await auditEntries('ADMIN_SESSIONS_REVOKED', admin.id)).toHaveLength(1);

    expect((await request(app).post('/api/admin/sessions/revoke-all').set(auth(admin)).send({ password: 'otra-contraseña-larga' })).status).toBe(400);
    const all = await request(app).post('/api/admin/sessions/revoke-all').set(auth(admin)).send({ password: admin.password });
    expect(all.status).toBe(200);
    expect(all.body.revokedSessions).toBeGreaterThanOrEqual(1);
    expect((await request(app).get('/api/expenses').set(auth(bystander))).status).toBe(401);
    // La sesión del propio administrador se mantiene.
    expect((await request(app).get('/api/admin/users').set(auth(admin))).status).toBe(200);
    // Un usuario estándar no puede usar estas operaciones.
    const user = await createUser();
    expect((await request(app).post(`/api/admin/users/${victim.id}/revoke-sessions`).set(auth(user))).status).toBe(403);
  });
});

describe('Sesiones simultáneas (ASVS 5.0, 7.1.2)', () => {
  it('al superar el máximo de sesiones se cierran las más antiguas', async () => {
    const first = await createUser();
    const max = Number(process.env.MAX_SESSIONS_PER_USER ?? 10);
    let latest = first;
    for (let i = 0; i < max; i += 1) latest = await loginUser(first.email, first.password);
    expect(await prisma.session.count({ where: { userId: first.id, revokedAt: null } })).toBe(max);
    expect((await request(app).get('/api/expenses').set(auth(first))).status).toBe(401);
    expect((await request(app).get('/api/expenses').set(auth(latest))).status).toBe(200);
    const revoked = await prisma.session.findMany({ where: { userId: first.id, revokeReason: 'SESSION_LIMIT' } });
    expect(revoked).toHaveLength(1);
  });
});

describe('Lista de contraseñas comunes', () => {
  it('contiene al menos las 3000 contraseñas comunes que cumplen la política y las rechaza', async () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(3000);
    for (const value of COMMON_PASSWORDS) expect([...value].length).toBeGreaterThanOrEqual(15);
    expect(await checkPasswordPolicy('QazWsxEdcRfvTgb')).toContain('Es una contraseña demasiado común.');
    expect(await checkPasswordPolicy('123456789qwerty')).toContain('Es una contraseña demasiado común.');
  });
});

describe('Supresión de la cuenta (RGPD art. 17)', () => {
  it('elimina la cuenta, sus datos y sus justificantes tras reautenticar', async () => {
    const user = await createUser();
    const expense = await createExpense(user);
    const upload = await request(app).post(`/api/expenses/${expense.id}/receipt`).set(auth(user)).attach('receipt', PNG, { filename: 'ticket.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);

    expect((await request(app).post('/api/account/delete').set(auth(user)).send({ password: user.password })).status).toBe(400);
    expect((await request(app).post('/api/account/delete').set(auth(user)).send({ password: 'otra-contraseña-larga', confirm: 'ELIMINAR' })).status).toBe(400);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);

    const response = await request(app).post('/api/account/delete').set(auth(user)).send({ password: user.password, confirm: 'ELIMINAR' });
    expect(response.status).toBe(204);
    expect(([] as string[]).concat(response.headers['set-cookie'] ?? [])[0]).toMatch(/^__Host-gs_rt=;/);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    expect(await prisma.expense.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.category.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.receipt.count({ where: { expenseId: expense.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);

    // El token anterior deja de ser válido y no puede iniciarse sesión de nuevo.
    expect((await request(app).get('/api/account/me').set(auth(user))).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })).status).toBe(401);
    const [entry] = await auditEntries('ACCOUNT_DELETE');
    expect(entry?.targetId).toBe(user.id);
    expect(entry?.actorEmail).toBeNull();
  });

  it('exige el código TOTP si el segundo factor está activo', async () => {
    const user = await createUser();
    const setup = await request(app).post('/api/account/mfa/setup').set(auth(user));
    const key = base32Decode(setup.body.secret as string);
    const step = Math.floor(Date.now() / 30_000);
    await request(app).post('/api/account/mfa/enable').set(auth(user)).send({ code: hotp(key, step), password: user.password });

    expect((await request(app).post('/api/account/delete').set(auth(user)).send({ password: user.password, confirm: 'ELIMINAR' })).status).toBe(400);
    const ok = await request(app).post('/api/account/delete').set(auth(user)).send({ password: user.password, confirm: 'ELIMINAR', code: hotp(key, step + 1) });
    expect(ok.status).toBe(204);
  });

  it('impide que el único administrador activo elimine su cuenta', async () => {
    await prisma.user.updateMany({ where: { role: 'ADMIN' }, data: { role: 'USER' } });
    const admin = await createUser('ADMIN');
    const response = await request(app).post('/api/account/delete').set(auth(admin)).send({ password: admin.password, confirm: 'ELIMINAR' });
    expect(response.status).toBe(409);
  });
});

describe('Conservación de datos (RGPD art. 5.1.e)', () => {
  it('purga los gastos borrados y las sesiones cerradas una vez vencido su plazo', async () => {
    const user = await createUser();
    const old = await createExpense(user);
    const recent = await createExpense(user);
    const kept = await createExpense(user);
    await request(app).delete(`/api/expenses/${old.id}`).set(auth(user));
    await request(app).delete(`/api/expenses/${recent.id}`).set(auth(user));
    await prisma.expense.update({ where: { id: old.id }, data: { deletedAt: new Date(Date.now() - 31 * DAY_MS) } });
    const oldSession = await loginUser(user.email, user.password);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date(Date.now() - 31 * DAY_MS), revokeReason: 'LOGOUT' } });

    const result = await purgeExpiredData();
    expect(result.expenses).toBeGreaterThanOrEqual(1);
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(await prisma.expense.count({ where: { id: old.id } })).toBe(0);
    expect(await prisma.expense.count({ where: { id: recent.id } })).toBe(1);
    expect(await prisma.expense.count({ where: { id: kept.id } })).toBe(1);
    expect(await prisma.session.count({ where: { id: session.id } })).toBe(0);
    expect((await request(app).get('/api/expenses').set(auth(oldSession))).status).toBe(401);
    expect((await request(app).get('/api/expenses').set(auth(user))).status).toBe(200);
    expect((await auditEntries('DATA_RETENTION_PURGE')).length).toBeGreaterThanOrEqual(1);
  });
});

