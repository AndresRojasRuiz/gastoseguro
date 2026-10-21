import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { flushAudit } from '../src/services/audit.service.js';

export const app = createApp();
export const ORIGIN = 'http://localhost:5173';
export const STRONG_PASSWORD = 'Correcto-Caballo-Bateria-42';

let counter = 0;
export const uniqueEmail = (prefix = 'usuario') => `${prefix}.${Date.now()}.${(counter += 1)}@pruebas.local`;

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  cookies: string[];
}

export async function registerUser(email = uniqueEmail(), password = STRONG_PASSWORD) {
  const response = await request(app).post('/api/auth/register').send({ name: 'Persona de Pruebas', email, password });
  if (response.status !== 201) throw new Error(`Registro fallido: ${response.status} ${JSON.stringify(response.body)}`);
  return { email, password };
}

export async function loginUser(email: string, password = STRONG_PASSWORD): Promise<TestUser> {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  if (response.status !== 200) throw new Error(`Login fallido: ${response.status} ${JSON.stringify(response.body)}`);
  const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  return { id: response.body.user.id, email, password, token: response.body.accessToken, cookies };
}

/**
 * Crea un usuario con el rol indicado y una sesión iniciada. Los roles privilegiados exigen
 * MFA, por lo que por defecto se marcan con el segundo factor activado tras el inicio de
 * sesión (equivale a activarlo durante la sesión); { mfa: false } permite probar el bloqueo.
 */
export async function createUser(role: 'USER' | 'AUDITOR' | 'ADMIN' = 'USER', options: { mfa?: boolean } = {}): Promise<TestUser> {
  const { email, password } = await registerUser();
  if (role !== 'USER') await prisma.user.update({ where: { email }, data: { role } });
  const user = await loginUser(email, password);
  if (options.mfa ?? role !== 'USER') await prisma.user.update({ where: { email }, data: { mfaEnabled: true } });
  return user;
}

export const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

export async function firstCategoryId(user: TestUser): Promise<string> {
  const response = await request(app).get('/api/categories').set(auth(user));
  return response.body[0].id as string;
}

export async function createExpense(user: TestUser, overrides: Record<string, unknown> = {}) {
  const categoryId = await firstCategoryId(user);
  const response = await request(app)
    .post('/api/expenses')
    .set(auth(user))
    .send({ amount: '42.50', date: '2026-01-15', categoryId, description: 'Gasto de prueba', paymentMethod: 'CARD', ...overrides });
  if (response.status !== 201) throw new Error(`Alta de gasto fallida: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body as { id: string };
}

export async function auditEntries(action: string, userId?: string) {
  await flushAudit();
  return prisma.auditLog.findMany({ where: { action, ...(userId ? { userId } : {}) }, orderBy: { id: 'desc' } });
}
