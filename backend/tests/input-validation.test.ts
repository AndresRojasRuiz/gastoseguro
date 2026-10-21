/**
 * A05:2025 - Injection, A06:2025 - Insecure Design y A10:2025 - Mishandling of Exceptional Conditions.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, auth, createExpense, createUser, firstCategoryId } from './helpers.js';

describe('Inyección y validación de entradas', () => {
  it.each([
    "' OR '1'='1",
    "1; DROP TABLE Expense; --",
    "%' UNION SELECT passwordHash FROM User --",
  ])('trata la carga %j como texto literal en la búsqueda', async (payload) => {
    const user = await createUser();
    await createExpense(user, { description: 'Compra normal' });
    const response = await request(app).get('/api/expenses').query({ q: payload }).set(auth(user));
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(0);
    // La tabla sigue existiendo y los datos intactos.
    const all = await request(app).get('/api/expenses').set(auth(user));
    expect(all.body.items).toHaveLength(1);
  });

  it('almacena el HTML como texto y responde siempre JSON (sin XSS reflejado)', async () => {
    const user = await createUser();
    const payload = '<img src=x onerror=alert(document.cookie)>';
    const expense = await createExpense(user, { description: payload });
    const response = await request(app).get(`/api/expenses/${expense.id}`).set(auth(user));
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body.description).toBe(payload);
  });

  it('rechaza caracteres de control en textos', async () => {
    const user = await createUser();
    const categoryId = await firstCategoryId(user);
    const response = await request(app)
      .post('/api/expenses')
      .set(auth(user))
      .send({ amount: '1', date: '2026-01-01', categoryId, description: 'linea\u0000nula', paymentMethod: 'CARD' });
    expect(response.status).toBe(400);
  });

  it('rechaza el byte nulo en los parámetros de búsqueda (hallazgo del análisis dinámico)', async () => {
    const user = await createUser();
    const admin = await createUser('ADMIN');
    expect((await request(app).get('/api/expenses?q=a%00b').set(auth(user))).status).toBe(400);
    expect((await request(app).get('/api/admin/users?q=%00').set(auth(admin))).status).toBe(400);
    expect((await request(app).get('/api/expenses?q=Farmacia').set(auth(user))).status).toBe(200);
  });

  it.each([
    ['importe negativo', { amount: '-10' }],
    ['importe con exponente', { amount: '1e9' }],
    ['importe excesivo', { amount: '99999999' }],
    ['fecha futura', { date: '2999-01-01' }],
    ['fecha inválida', { date: '2026-02-30x' }],
    ['método de pago desconocido', { paymentMethod: 'CRYPTO' }],
    ['campo no permitido', { userId: '00000000-0000-4000-8000-000000000000' }],
    ['descripción demasiado larga', { description: 'a'.repeat(201) }],
  ])('rechaza %s', async (_name, override) => {
    const user = await createUser();
    const categoryId = await firstCategoryId(user);
    const response = await request(app)
      .post('/api/expenses')
      .set(auth(user))
      .send({ amount: '10', date: '2026-01-01', categoryId, description: 'Prueba', paymentMethod: 'CARD', ...override });
    expect(response.status).toBe(400);
  });

  it('rechaza parámetros duplicados o anidados en la query (HPP / contaminación)', async () => {
    const user = await createUser();
    expect((await request(app).get('/api/expenses?page=1&page=2').set(auth(user))).status).toBe(400);
    expect((await request(app).get('/api/expenses?q[$ne]=x').set(auth(user))).status).toBe(400);
    expect((await request(app).get('/api/expenses?pageSize=100000').set(auth(user))).status).toBe(400);
  });

  it('rechaza identificadores que no son UUID', async () => {
    const user = await createUser();
    expect((await request(app).get('/api/expenses/1%20OR%201=1').set(auth(user))).status).toBe(400);
  });
});

describe('Gestión de condiciones excepcionales', () => {
  it('un JSON malformado devuelve 400 sin trazas internas', async () => {
    const response = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": "x",');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MALFORMED_JSON');
    expect(JSON.stringify(response.body)).not.toMatch(/at .*\.(ts|js):\d+/);
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('un cuerpo demasiado grande devuelve 413', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'x'.repeat(200_000) });
    expect(response.status).toBe(413);
  });

  it('un tipo de contenido no admitido devuelve 415', async () => {
    const response = await request(app).post('/api/auth/login').set('Content-Type', 'text/xml').send('<login/>');
    expect(response.status).toBe(415);
  });

  it('las rutas inexistentes devuelven 404 en JSON', async () => {
    const response = await request(app).get('/api/no-existe');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
