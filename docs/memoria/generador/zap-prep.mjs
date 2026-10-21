// Prepara el escaneo DAST: obtiene tokens (usuario y administrador con MFA activado por la
// API), crea un justificante y genera una copia de la especificación OpenAPI con
// identificadores reales de la instancia de pruebas para que ZAP ejercite objetos existentes.
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Carpeta de trabajo del análisis dinámico (configurable con la variable GASTOSEGURO_WORK).
const WORK = (process.env.GASTOSEGURO_WORK ?? path.join(os.tmpdir(), 'gastoseguro')).replaceAll('\\', '/');
const SP = WORK;
const ROOT = 'C:/Users/andre/Documents/GastoSeguro';
const BASE = 'http://localhost:4100';
const env = Object.fromEntries(
  fs.readFileSync(`${ROOT}/backend/.env`, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const base32Decode = (text) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of text.replace(/[\s=]/g, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};
const totp = (secret) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const start = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(start) & 0x7fffffff) % 1_000_000).padStart(6, '0');
};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return data;
}

const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).accessToken;

const userToken = await login(env.SEED_USER_EMAIL, env.SEED_USER_PASSWORD);
const adminToken = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
// El administrador activa el segundo factor por el flujo normal de la API.
const setup = await call('POST', '/api/account/mfa/setup', { token: adminToken });
await call('POST', '/api/account/mfa/enable', { token: adminToken, body: { code: totp(setup.secret), password: env.SEED_ADMIN_PASSWORD } });

const expenses = await call('GET', '/api/expenses?pageSize=5', { token: userToken });
const expenseId = expenses.items[0].id;
const form = new FormData();
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
form.append('receipt', new Blob([png], { type: 'image/png' }), 'ticket.png');
await call('POST', `/api/expenses/${expenseId}/receipt`, { token: userToken, body: form });
const categoryId = (await call('GET', '/api/categories', { token: userToken }))[0].id;
const sessionId = (await call('GET', '/api/account/sessions', { token: userToken }))[0].id;
const users = await call('GET', '/api/admin/users?pageSize=50', { token: adminToken });
const auditorId = users.items.find((user) => user.role === 'AUDITOR').id;

// Una alerta real para ejercitar /api/audit/alerts/{id}/ack.
for (let i = 0; i < 6; i += 1) await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_AUDITOR_EMAIL, password: `incorrecta-${i}-xxxxxxxx` }) });
const alerts = await call('GET', '/api/audit/alerts?status=all', { token: adminToken });
const alertId = alerts.items[0]?.id ?? auditorId;

const spec = JSON.parse(fs.readFileSync(`${ROOT}/docs/openapi.json`, 'utf8'));
spec.servers = [{ url: BASE }];
const ids = {
  '/api/expenses/{id}': expenseId,
  '/api/expenses/{id}/receipt': expenseId,
  '/api/categories/{id}': categoryId,
  '/api/account/sessions/{id}/revoke': sessionId,
  '/api/admin/users/{id}': auditorId,
  '/api/admin/users/{id}/unlock': auditorId,
  '/api/admin/users/{id}/reset-mfa': auditorId,
  '/api/admin/users/{id}/revoke-sessions': auditorId,
  '/api/audit/alerts/{id}/ack': alertId,
};
for (const [path, id] of Object.entries(ids)) {
  for (const operation of Object.values(spec.paths[path])) {
    for (const parameter of operation.parameters ?? []) if (parameter.name === 'id') parameter.schema = { ...parameter.schema, example: id, default: id };
  }
}
// La categoría de los gastos de ejemplo debe existir.
spec.components.schemas.Expense.properties.categoryId = { type: 'string', format: 'uuid', example: categoryId, default: categoryId };
fs.mkdirSync(`${SP}/zap`, { recursive: true });
fs.writeFileSync(`${SP}/zap/openapi-zap.json`, JSON.stringify(spec, null, 2));
fs.writeFileSync(`${SP}/zap/tokens.json`, JSON.stringify({ user: userToken, admin: adminToken }));
console.log('Preparado: justificante creado, MFA del administrador activado, alerta', alerts.items.length ? 'disponible' : 'no generada', '- IDs sustituidos:', Object.keys(ids).length);
