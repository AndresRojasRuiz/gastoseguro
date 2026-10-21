// Mediciones de rendimiento y coste de los controles de seguridad (evidencias para la memoria).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

const ROOT = 'C:/Users/andre/Documents/GastoSeguro';
// PERF_BASE permite medir otra instancia (p. ej., la desplegada sobre PostgreSQL) y PERF_OUT
// elegir el fichero de resultados.
const BASE = process.env.PERF_BASE ?? 'http://localhost:4000';
const OUT_FILE = process.env.PERF_OUT ?? 'rendimiento.json';
const require = createRequire(`${ROOT}/backend/package.json`);
const { hash, verify } = require('@node-rs/argon2');

const env = Object.fromEntries(
  fs.readFileSync(`${ROOT}/backend/.env`, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return { n: values.length, media: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1), p50: +pick(50).toFixed(1), p95: +pick(95).toFixed(1), max: +sorted.at(-1).toFixed(1) };
};

const results = { entorno: { cpu: os.cpus()[0].model, nucleos: os.cpus().length, memoriaGB: +(os.totalmem() / 2 ** 30).toFixed(1), so: `${os.type()} ${os.release()}`, node: process.version, baseDatos: process.env.PERF_DB ?? 'SQLite (libSQL)' } };

// 1. Coste de Argon2id con distintos parámetros
const configs = [
  { nombre: 'OWASP mínimo (m=19 MiB, t=2, p=1) [usado]', memoryCost: 19456, timeCost: 2, parallelism: 1 },
  { nombre: 'Alternativa OWASP (m=46 MiB, t=1, p=1)', memoryCost: 47104, timeCost: 1, parallelism: 1 },
  { nombre: 'RFC 9106 segunda opción (m=64 MiB, t=3, p=4)', memoryCost: 65536, timeCost: 3, parallelism: 4 },
];
results.argon2 = [];
for (const config of configs) {
  const times = [];
  let last;
  for (let i = 0; i < 15; i += 1) {
    const start = performance.now();
    last = await hash('Una frase de paso de prueba 2026', { algorithm: 2, memoryCost: config.memoryCost, timeCost: config.timeCost, parallelism: config.parallelism, outputLen: 32 });
    times.push(performance.now() - start);
  }
  const verifyTimes = [];
  for (let i = 0; i < 15; i += 1) {
    const start = performance.now();
    await verify(last, 'Una frase de paso de prueba 2026');
    verifyTimes.push(performance.now() - start);
  }
  results.argon2.push({ ...config, hash: stats(times.slice(2)), verify: stats(verifyTimes.slice(2)) });
}

// 2. Latencia de la API (peticiones secuenciales, servidor local)
async function timed(fn) {
  const start = performance.now();
  const res = await fn();
  await res.arrayBuffer();
  return { ms: performance.now() - start, status: res.status, res };
}
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_USER_EMAIL, password: env.SEED_USER_PASSWORD }) });
const session = await login.json();
let cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
const auth = { Authorization: `Bearer ${session.accessToken}` };

const scenarios = {
  'GET /api/health (sin autenticación)': () => fetch(`${BASE}/api/health`),
  'GET /api/expenses (20 elementos, autenticado)': () => fetch(`${BASE}/api/expenses?pageSize=20`, { headers: auth }),
  'GET /api/expenses?q=… (búsqueda)': () => fetch(`${BASE}/api/expenses?q=Farmacia`, { headers: auth }),
  'GET /api/reports/summary (agregados 12 meses)': () => fetch(`${BASE}/api/reports/summary`, { headers: auth }),
};
results.api = {};
for (const [name, fn] of Object.entries(scenarios)) {
  const times = [];
  for (let i = 0; i < 60; i += 1) times.push((await timed(fn)).ms);
  results.api[name] = stats(times.slice(5));
}
// Rotación de refresh token (cada petición rota y devuelve una cookie nueva)
const refreshTimes = [];
for (let i = 0; i < 30; i += 1) {
  const start = performance.now();
  const res = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { Origin: BASE, Cookie: cookie } });
  await res.arrayBuffer();
  refreshTimes.push(performance.now() - start);
  cookie = (res.headers.get('set-cookie') ?? cookie).split(';')[0];
}
results.api['POST /api/auth/refresh (rotación)'] = stats(refreshTimes.slice(2));
// Inicio de sesión (incluye Argon2id): limitado por la tasa (10 por cuenta e IP en 15 min)
const loginTimes = [];
for (let i = 0; i < 6; i += 1) {
  const start = performance.now();
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_AUDITOR_EMAIL, password: env.SEED_AUDITOR_PASSWORD }) });
  await res.arrayBuffer();
  loginTimes.push(performance.now() - start);
}
results.api['POST /api/auth/login (con Argon2id)'] = stats(loginTimes);
// Inicio de sesión con usuario inexistente (tiempo igualado)
const unknownTimes = [];
for (let i = 0; i < 6; i += 1) {
  const start = performance.now();
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `noexiste${i}@ejemplo.es`, password: 'Una contraseña cualquiera 1' }) });
  await res.arrayBuffer();
  unknownTimes.push(performance.now() - start);
}
results.api['POST /api/auth/login (usuario inexistente)'] = stats(unknownTimes);

fs.mkdirSync(`${ROOT}/docs/evidencias`, { recursive: true });
fs.writeFileSync(`${ROOT}/docs/evidencias/${OUT_FILE}`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
