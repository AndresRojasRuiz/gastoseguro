// Experimento controlado: ¿se puede distinguir por el tiempo de respuesta si una cuenta existe?
// Se levantan dos instancias aisladas (base de datos propia) que solo difieren en
// AUTH_MIN_RESPONSE_MS (0 = sin mitigación, 400 = con mitigación) y se lanzan 200 intentos
// fallidos contra cuentas existentes y 200 contra cuentas inexistentes, intercalados.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const ROOT = 'C:/Users/andre/Documents/GastoSeguro';
const BACKEND = `${ROOT}/backend`;
const N = 200;
const USERS = 20;
const require = createRequire(`${BACKEND}/package.json`);
const prismaCli = path.join(path.dirname(require.resolve('prisma/package.json')), 'build', 'index.js');

const stats = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
  return { n: values.length, media: +mean.toFixed(1), desviacion: +sd.toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1) };
};

/** Mejor clasificador de umbral posible (cota superior de la ventaja del atacante). */
function bestThresholdAccuracy(existing, unknown) {
  const all = [...existing.map((v) => [v, 1]), ...unknown.map((v) => [v, 0])].sort((a, b) => a[0] - b[0]);
  let best = 0.5;
  for (const [threshold] of all) {
    const accAbove = (existing.filter((v) => v > threshold).length + unknown.filter((v) => v <= threshold).length) / all.length;
    best = Math.max(best, accAbove, 1 - accAbove);
  }
  return +(best * 100).toFixed(1);
}

async function runScenario(label, minMs, port) {
  const dbFile = `./data/experimento-${minMs}.db`;
  fs.rmSync(path.join(BACKEND, dbFile), { force: true });
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: `file:${dbFile}`,
    AUTH_MIN_RESPONSE_MS: String(minMs),
    RATE_LIMIT_LOGIN_MAX: '100000',
    RATE_LIMIT_GLOBAL_MAX: '100000',
    RATE_LIMIT_REGISTER_MAX: '1000',
    MAX_FAILED_LOGINS: '20',
    LOG_LEVEL: 'error',
    STATIC_DIR: './__sin_interfaz__',
  };
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: BACKEND, env, stdio: 'ignore' });
  const server = spawn(process.execPath, ['dist/server.js'], { cwd: BACKEND, env, stdio: 'ignore' });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 50; i += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      /* esperando al servidor */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const post = (body) => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const emails = [];
  for (let i = 0; i < USERS; i += 1) {
    const email = `cuenta${i}.${minMs}@experimento.es`;
    await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Cuenta ${i}`, email, password: `Frase de paso secreta número ${i}` }) });
    emails.push(email);
  }
  // Calentamiento
  for (let i = 0; i < 5; i += 1) await (await post({ email: `calentamiento${i}@x.es`, password: 'cualquier cosa larga' })).arrayBuffer();
  const existing = [];
  const unknown = [];
  for (let i = 0; i < N; i += 1) {
    const order = i % 2 === 0 ? ['e', 'u'] : ['u', 'e'];
    for (const kind of order) {
      const email = kind === 'e' ? emails[i % USERS] : `inexistente${i}.${minMs}@experimento.es`;
      const start = performance.now();
      const res = await post({ email, password: `Intento erróneo ${i} con frase larga` });
      await res.arrayBuffer();
      (kind === 'e' ? existing : unknown).push(performance.now() - start);
      if (res.status !== 401) throw new Error(`Respuesta inesperada ${res.status}`);
    }
  }
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill();
  await exited;
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    fs.rmSync(path.join(BACKEND, dbFile), { force: true });
  } catch {
    /* el fichero se elimina en la siguiente ejecución */
  }
  const e = stats(existing);
  const u = stats(unknown);
  return {
    escenario: label,
    AUTH_MIN_RESPONSE_MS: minMs,
    usuarioExistente: e,
    usuarioInexistente: u,
    diferenciaMedias: +(e.media - u.media).toFixed(1),
    diferenciaMedianas: +(e.p50 - u.p50).toFixed(1),
    exactitudMejorUmbral: bestThresholdAccuracy(existing, unknown),
  };
}

const results = [await runScenario('Sin igualación de tiempos', 0, 4100), await runScenario('Con igualación de tiempos', 400, 4101)];
fs.writeFileSync(`${ROOT}/docs/evidencias/experimento-temporizacion.json`, JSON.stringify(results, null, 2));
fs.rmSync(`${ROOT}/docs/evidencias/temporizacion-login.json`, { force: true });
console.log(JSON.stringify(results, null, 2));
