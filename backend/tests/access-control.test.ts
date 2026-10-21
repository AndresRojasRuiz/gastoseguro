/**
 * A01:2025 - Broken Access Control.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, auditEntries, auth, createExpense, createUser, firstCategoryId } from './helpers.js';

describe('Control de acceso a nivel de objeto (IDOR / BOLA)', () => {
  it('un usuario no puede leer, modificar ni borrar gastos de otro', async () => {
    const alice = await createUser();
    const mallory = await createUser();
    const expense = await createExpense(alice);

    const read = await request(app).get(`/api/expenses/${expense.id}`).set(auth(mallory));
    const update = await request(app).patch(`/api/expenses/${expense.id}`).set(auth(mallory)).send({ amount: '0.01' });
    const remove = await request(app).delete(`/api/expenses/${expense.id}`).set(auth(mallory));
    const receipt = await request(app).get(`/api/expenses/${expense.id}/receipt`).set(auth(mallory));

    // Se responde 404 (no 403) para no confirmar la existencia del recurso.
    for (const response of [read, update, remove, receipt]) expect(response.status).toBe(404);

    const unchanged = await request(app).get(`/api/expenses/${expense.id}`).set(auth(alice));
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.amount).toBe('42.50');

    // Los intentos quedan auditados como accesos denegados.
    const denied = await auditEntries('ACCESS_DENIED', mallory.id);
    expect(denied.length).toBeGreaterThanOrEqual(4);
  });

  it('los listados solo devuelven datos del propio usuario', async () => {
    const alice = await createUser();
    const bob = await createUser();
    await createExpense(alice, { description: 'Privado de Alice' });
    const list = await request(app).get('/api/expenses').set(auth(bob));
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('no permite asociar un gasto a una categoría ajena', async () => {
    const alice = await createUser();
    const mallory = await createUser();
    const aliceCategory = await firstCategoryId(alice);
    const response = await request(app)
      .post('/api/expenses')
      .set(auth(mallory))
      .send({ amount: '10', date: '2026-02-01', categoryId: aliceCategory, description: 'x', paymentMethod: 'CASH' });
    expect(response.status).toBe(400);
  });

  it('no permite revocar sesiones ni editar categorías de otro usuario', async () => {
    const alice = await createUser();
    const mallory = await createUser();
    const aliceSession = await prisma.session.findFirstOrThrow({ where: { userId: alice.id } });
    const revoke = await request(app).post(`/api/account/sessions/${aliceSession.id}/revoke`).set(auth(mallory)).send({ password: mallory.password });
    expect(revoke.status).toBe(404);
    const category = await firstCategoryId(alice);
    expect((await request(app).patch(`/api/categories/${category}`).set(auth(mallory)).send({ name: 'Hackeada' })).status).toBe(404);
  });

  it('genera una alerta ante un sondeo repetido de identificadores', async () => {
    const victim = await createUser();
    const attacker = await createUser();
    const expense = await createExpense(victim);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).get(`/api/expenses/${expense.id}`).set(auth(attacker));
    }
    const alert = await prisma.securityAlert.findFirst({ where: { type: 'ACCESS_CONTROL_PROBING', userId: attacker.id } });
    expect(alert).not.toBeNull();
  });
});

describe('Control de acceso basado en roles (RBAC)', () => {
  it('un usuario estándar no accede a administración ni auditoría', async () => {
    const user = await createUser('USER');
    expect((await request(app).get('/api/admin/users').set(auth(user))).status).toBe(403);
    expect((await request(app).get('/api/audit/logs').set(auth(user))).status).toBe(403);
  });

  it('un auditor lee la auditoría pero no administra usuarios', async () => {
    const auditor = await createUser('AUDITOR');
    expect((await request(app).get('/api/audit/logs').set(auth(auditor))).status).toBe(200);
    expect((await request(app).get('/api/admin/users').set(auth(auditor))).status).toBe(403);
  });

  it('el rol se lee del servidor: degradar a un administrador surte efecto inmediato', async () => {
    const admin = await createUser('ADMIN');
    expect((await request(app).get('/api/admin/users').set(auth(admin))).status).toBe(200);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
    expect((await request(app).get('/api/admin/users').set(auth(admin))).status).toBe(403);
  });

  it('un administrador no puede modificar su propia cuenta ni dejar el sistema sin administradores', async () => {
    await prisma.user.updateMany({ where: { role: 'ADMIN' }, data: { role: 'USER' } });
    const admin = await createUser('ADMIN');
    const self = await request(app).patch(`/api/admin/users/${admin.id}`).set(auth(admin)).send({ role: 'USER' });
    expect(self.status).toBe(403);

    const target = await createUser('USER');
    const promote = await request(app).patch(`/api/admin/users/${target.id}`).set(auth(admin)).send({ role: 'ADMIN' });
    expect(promote.status).toBe(200);
    expect(await prisma.securityAlert.count({ where: { type: 'PRIVILEGE_CHANGE', userId: target.id } })).toBe(1);
    // Las sesiones del usuario modificado se invalidan.
    expect((await request(app).get('/api/expenses').set(auth(target))).status).toBe(401);
  });

  it('el panel de administración no expone hashes ni secretos', async () => {
    const admin = await createUser('ADMIN');
    const response = await request(app).get('/api/admin/users').set(auth(admin));
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('mfaSecretEnc');
    expect(body).not.toContain('$argon2id$');
  });
});
