// Copia las evidencias del análisis dinámico a docs/evidencias/zap y genera resumen.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Carpeta de trabajo del análisis dinámico (configurable con la variable GASTOSEGURO_WORK).
const WORK = (process.env.GASTOSEGURO_WORK ?? path.join(os.tmpdir(), 'gastoseguro')).replaceAll('\\', '/');
const SP = WORK;
const OUT = 'C:/Users/andre/Documents/GastoSeguro/docs/evidencias/zap';
fs.mkdirSync(OUT, { recursive: true });

function traffic(log, from, to) {
  const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).slice(from, to);
  const estados = {};
  const routes = new Set();
  const errores = [];
  let peticiones = 0;
  for (const line of lines) {
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    if (j.status && j.message === 'request') {
      peticiones += 1;
      estados[j.status] = (estados[j.status] ?? 0) + 1;
      routes.add(`${j.method} ${j.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')}`);
    }
    if (j.err && j.status >= 500) {
      const message = String(j.err.message).split('\n').filter((l) => /Database error|Code:/.test(l)).join(' ').trim();
      errores.push({ hora: j.time, metodo: j.method, ruta: j.path, estado: j.status, tipo: j.err.type, detalle: message });
    }
  }
  const sum = (prefix) => Object.entries(estados).filter(([k]) => k.startsWith(prefix)).reduce((t, [, v]) => t + v, 0);
  return { peticiones, rutasDistintas: routes.size, estados, '2xx': sum('2'), '4xx': sum('4'), errores5xx: sum('5'), errores };
}

function alerts(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const list = report.site.flatMap((s) => s.alerts.map((a) => ({ regla: Number(a.pluginid), alerta: a.alert, riesgo: a.riskdesc, instancias: Number(a.count), cwe: Number(a.cweid) })));
  const count = (risk) => list.filter((a) => a.riesgo.startsWith(risk)).length;
  return { alto: count('High'), medio: count('Medium'), bajo: count('Low'), informativas: count('Informational'), alertas: list };
}

const offset = (dir, name) => Number(fs.readFileSync(`${SP}/zap/${dir}/${name}`, 'utf8'));
const final = `${SP}/out/server-zap3.log`;
const usuario = { ...traffic(final, offset('out', 'offset-usuario.txt'), offset('out', 'offset-admin.txt')), ...alerts(`${SP}/zap/out/zap-usuario.json`) };
const admin = { ...traffic(final, offset('out', 'offset-admin.txt'), offset('out', 'offset-fin.txt')), ...alerts(`${SP}/zap/out/zap-admin.json`) };
const previo = { ...traffic(`${SP}/out/server-zap2.log`, offset('out-v2', 'offset-admin.txt'), undefined), ...alerts(`${SP}/zap/out-v2/zap-admin.json`) };
delete usuario.errores;
delete admin.errores;

const resumen = {
  herramienta: 'OWASP ZAP 2.17.0 (Automation Framework), Temurin JRE 21.0.12',
  objetivo: 'Instancia local de GastoSeguro 1.0.0 (http://localhost:4100) sobre PostgreSQL 17.10',
  especificacion: 'docs/openapi.json con identificadores reales de la instancia',
  usuario,
  admin,
  adminAntesDeCorregir: previo,
};
fs.writeFileSync(`${OUT}/resumen.json`, `${JSON.stringify(resumen, null, 2)}\n`);

for (const name of ['zap-usuario.html', 'zap-usuario.json', 'zap-admin.html', 'zap-admin.json']) fs.copyFileSync(`${SP}/zap/out/${name}`, `${OUT}/${name}`);
fs.copyFileSync(`${SP}/zap/out-v2/zap-admin.json`, `${OUT}/zap-admin-antes-de-corregir.json`);
fs.copyFileSync(`${SP}/zap/out-v2/verificacion-path-traversal.txt`, `${OUT}/verificacion-path-traversal.txt`);
for (const profile of ['usuario', 'admin']) {
  const plan = fs.readFileSync(`${SP}/zap/plan-${profile}.yaml`, 'utf8').replaceAll(`${SP}/zap/`, '').replace('apiFile: "openapi-zap.json"', 'apiFile: "openapi-zap.json"  # docs/openapi.json con identificadores reales');
  fs.writeFileSync(`${OUT}/plan-${profile}.yaml`, plan);
}
fs.writeFileSync(
  `${OUT}/hallazgo-byte-nulo.txt`,
  [
    '# Hallazgo del análisis dinámico (perfil administrador, primera ejecución)',
    '# Errores 500 registrados por la API (extracto del registro técnico; el cliente solo recibió un mensaje genérico con requestId)',
    ...previo.errores.map((e) => `${e.hora}  ${e.metodo} ${e.ruta}  ${e.estado}  ${e.tipo}  ${e.detalle}`),
    '',
    '# Causa: byte nulo (%00) en el parámetro de búsqueda "q"; PostgreSQL lo rechaza (código 22021) y SQLite lo acepta.',
    '# Corrección: esquema searchText (backend/src/schemas/common.ts) que rechaza caracteres de control con 400,',
    '# prueba de regresión en tests/input-validation.test.ts y nuevo escaneo completo sin errores 5xx (resumen.json).',
    '',
  ].join('\n'),
);
console.log(JSON.stringify({ usuario: [usuario.peticiones, usuario.errores5xx], admin: [admin.peticiones, admin.errores5xx], previo: [previo.peticiones, previo.errores5xx] }));
