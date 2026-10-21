// Recorrido E2E de GastoSeguro con Edge headless: genera tráfico real (incluidos ataques
// simulados que disparan las alertas) y captura pantallas para la memoria del TFE.
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'C:/Users/andre/Documents/GastoSeguro';
const OUT = path.join(ROOT, 'docs/img');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:4000';
const ORIGIN = BASE;

const env = Object.fromEntries(
  fs
    .readFileSync(`${ROOT}/backend/.env`, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);
const DEMO = { email: env.SEED_USER_EMAIL, password: env.SEED_USER_PASSWORD };
const ADMIN = { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD };
const AUDITOR = { email: env.SEED_AUDITOR_EMAIL, password: env.SEED_AUDITOR_PASSWORD };

const require = createRequire(`${ROOT}/backend/package.json`);
const { createClient } = require('@libsql/client');
const db = createClient({ url: `file:${ROOT}/backend/data/gastoseguro.db` });

// TOTP (RFC 6238) para completar en el navegador la activación del segundo factor.
const base32Decode = (text) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of text.replace(/[\s=]/g, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};
const totp = (secret, offset = 0) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const start = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(start) & 0x7fffffff) % 1_000_000).padStart(6, '0');
};

const consoleErrors = [];
const log = (...args) => console.log('·', ...args);

// ---------- utilidades API (Node fetch) ----------
async function apiLogin(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
}
async function apiRegister(email, password, name) {
  return fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name }) });
}
const authed = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

// ---------- navegador ----------
const browser = await chromium.launch({ channel: 'msedge', headless: true });
async function newContext(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1.5, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  return context;
}
async function newPage(context) {
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' && !/401 \(Unauthorized\)/.test(message.text())) consoleErrors.push(`${page.url()} :: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`${page.url()} :: PAGEERROR ${error.message}`));
  return page;
}
async function uiLogin(page, { email, password }) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/`);
  await page.waitForSelector('.kpi-grid, .page-header');
}
async function shot(page, name, options = {}) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: options.fullPage ?? false, ...(options.clip ? { clip: options.clip } : {}) });
  log('captura', name);
}

async function enableMfaInUi(page, password) {
  await page.goto(`${BASE}/seguridad`);
  await page.click('button:has-text("Configurar")');
  const secret = (await page.textContent('code.secret')).replace(/\s/g, '');
  await page.fill('.mfa-setup input[type=password]', password);
  await page.fill('.mfa-setup input.otp-input', totp(secret));
  await page.click('.mfa-setup button[type=submit]');
  await page.waitForSelector('.badge:has-text("Activada")');
  log('MFA activado en la interfaz');
}

if (!process.env.SKIP_UI) {
// 1. Pantallas públicas
{
  const context = await newContext();
  const page = await newPage(context);
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('form');
  await shot(page, '01-login');
  await page.goto(`${BASE}/registro`);
  await page.fill('input[autocomplete=name]', 'Ana Martínez');
  await page.fill('input[type=email]', 'ana.martinez@ejemplo.es');
  await page.fill('input[autocomplete=new-password] >> nth=0', 'Correcto caballo batería grapa');
  await page.fill('input[autocomplete=new-password] >> nth=1', 'Correcto caballo batería grapa');
  await shot(page, '02-registro');
  await context.close();
}

// 2. Usuario de demostración
{
  const context = await newContext();
  const page = await newPage(context);
  await uiLogin(page, DEMO);
  await page.waitForSelector('.bar-chart');
  await shot(page, '03-resumen', { fullPage: true });

  await page.goto(`${BASE}/gastos`);
  await page.waitForSelector('table');
  await shot(page, '04-gastos', { fullPage: true });

  await page.click('button:has-text("Nuevo gasto")');
  await page.waitForSelector('.modal');
  await page.fill('.modal input[inputmode=decimal]', '23,90');
  await page.fill('.modal .field:has-text("Descripción") input', 'Material de oficina');
  await page.fill('.modal .field:has-text("Comercio") input', 'Papelería Central');
  await shot(page, '05-nuevo-gasto');
  // Se guarda con un justificante PNG real para demostrar la subida segura.
  const pngPath = path.join(OUT, '..', 'ticket-demo.png');
  await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: 200, height: 120 } });
  await page.setInputFiles('.modal input[type=file]', pngPath);
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('.notice-success');
  fs.rmSync(pngPath, { force: true });
  await shot(page, '06-gasto-guardado');

  await page.goto(`${BASE}/categorias`);
  await page.waitForSelector('.list');
  await shot(page, '07-categorias');

  await page.goto(`${BASE}/seguridad`);
  await page.waitForSelector('.list-row');
  await page.click('button:has-text("Configurar")');
  await page.waitForSelector('svg.qr');
  await shot(page, '08-seguridad-mfa', { fullPage: true });
  await page.click('.mfa-setup button:has-text("Cancelar")');

  // Una segunda sesión del mismo usuario permite mostrar el cierre con reautenticación.
  await apiLogin(DEMO.email, DEMO.password);
  await page.reload();
  await page.waitForSelector('.list-row >> nth=1');
  await page.click('button:has-text("Cerrar las demás sesiones")');
  await page.waitForSelector('.modal input[type=password]');
  await shot(page, '17-reautenticacion-sesiones');
  await page.fill('.modal input[type=password]', DEMO.password);
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('.modal', { state: 'detached' });

  // Vista móvil
  await context.close();
  const mobile = await newContext({ width: 390, height: 844 });
  const mobilePage = await newPage(mobile);
  await uiLogin(mobilePage, DEMO);
  await mobilePage.waitForSelector('.bar-chart');
  await shot(mobilePage, '09-movil');
  await mobile.close();

  // Supresión de la cuenta con una cuenta creada para la ocasión.
  const ana = { email: `ana.martinez.${Date.now()}@ejemplo.es`, password: 'Correcto caballo batería grapa' };
  await apiRegister(ana.email, ana.password, 'Ana Martínez');
  const anaContext = await newContext();
  const anaPage = await newPage(anaContext);
  await uiLogin(anaPage, ana);
  await anaPage.goto(`${BASE}/seguridad`);
  await anaPage.click('button:has-text("Eliminar mi cuenta")');
  await anaPage.fill('.danger-zone input[type=password]', ana.password);
  await anaPage.fill('.danger-zone .field:has-text("ELIMINAR") input', 'ELIMINAR');
  await anaPage.locator('.danger-zone').scrollIntoViewIfNeeded();
  await shot(anaPage, '18-eliminar-cuenta');
  await anaPage.click('.danger-zone button[type=submit]');
  await anaPage.waitForURL(`${BASE}/login`);
  await anaPage.waitForSelector('.notice-success');
  log('cuenta suprimida', (await apiLogin(ana.email, ana.password)).status);
  await anaContext.close();
}

}
if (!process.env.SKIP_ATTACKS)
{
  const stamp = Date.now();
  const victim = { email: `lucia.perez.${stamp}@ejemplo.es`, password: 'Frase de paso de Lucia 2026' };
  const attacker = { email: `intruso.${stamp}@ejemplo.es`, password: 'Cuatro palabras al azar 77' };
  await apiRegister(victim.email, victim.password, 'Lucía Pérez');
  await apiRegister(attacker.email, attacker.password, 'Usuario Intruso');

  // a) Fuerza bruta contra la cuenta de la víctima -> bloqueo + alerta ACCOUNT_LOCKED
  for (let i = 0; i < 5; i += 1) await apiLogin(victim.email, `contraseña-incorrecta-${i}`);
  // b) Relleno de credenciales contra cuentas inexistentes -> alerta BRUTE_FORCE_IP
  for (let i = 0; i < 16; i += 1) await apiLogin(`usuario${i}@filtrado.example`, 'Verano2024!');
  log('fuerza bruta simulada');

  // c) Robo de refresh token -> reutilización -> alerta TOKEN_REUSE
  const session = await apiLogin(attacker.email, attacker.password);
  const refresh = (cookie) => fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { Origin: ORIGIN, Cookie: cookie } });
  const first = await refresh(session.cookie);
  const reuse = await refresh(session.cookie);
  log('refresh legítimo', first.status, 'reutilización', reuse.status);

  // d) IDOR: el intruso intenta leer un gasto del usuario demo -> alerta ACCESS_CONTROL_PROBING
  const demo = await apiLogin(DEMO.email, DEMO.password);
  const list = await (await fetch(`${BASE}/api/expenses?pageSize=1`, { headers: authed(demo.body.accessToken) })).json();
  const targetId = list.items[0].id;
  const intruder = await apiLogin(attacker.email, attacker.password);
  const statuses = [];
  for (let i = 0; i < 10; i += 1) statuses.push((await fetch(`${BASE}/api/expenses/${targetId}`, { headers: authed(intruder.body.accessToken) })).status);
  log('IDOR', statuses.join(','));

  // e) Escalada vertical: el intruso intenta usar la API de administración
  const adminTry = await fetch(`${BASE}/api/admin/users`, { headers: authed(intruder.body.accessToken) });
  log('acceso admin por usuario estándar', adminTry.status);

  // f) Subida maliciosa: ejecutable disfrazado de PDF
  const form = new FormData();
  form.append('receipt', new Blob([Buffer.from('MZ\x90\x00\x03\x00\x00\x00')], { type: 'application/pdf' }), 'factura.pdf');
  const intruderExpense = await (
    await fetch(`${BASE}/api/expenses`, {
      method: 'POST',
      headers: authed(intruder.body.accessToken),
      body: JSON.stringify({ amount: '10', date: new Date().toISOString().slice(0, 10), categoryId: (await (await fetch(`${BASE}/api/categories`, { headers: authed(intruder.body.accessToken) })).json())[0].id, description: 'Prueba', paymentMethod: 'CASH' }),
    })
  ).json();
  const upload = await fetch(`${BASE}/api/expenses/${intruderExpense.id}/receipt`, { method: 'POST', headers: { Authorization: `Bearer ${intruder.body.accessToken}` }, body: form });
  log('subida de ejecutable', upload.status);

  // g) XSS almacenado: el intruso guarda HTML activo en sus propios datos y se comprueba en el
  //    navegador que la interfaz lo muestra como texto, sin ejecutarlo.
  const xssPayload = '<img src=x onerror=alert(document.domain)>';
  const xssCategory = (await (await fetch(`${BASE}/api/categories`, { headers: authed(intruder.body.accessToken) })).json())[0].id;
  const xssCreate = await fetch(`${BASE}/api/expenses`, {
    method: 'POST',
    headers: authed(intruder.body.accessToken),
    body: JSON.stringify({ amount: '1', date: new Date().toISOString().slice(0, 10), categoryId: xssCategory, description: xssPayload, paymentMethod: 'CASH' }),
  });
  const xssContext = await newContext();
  const xssPage = await newPage(xssContext);
  let dialogs = 0;
  xssPage.on('dialog', (dialog) => {
    dialogs += 1;
    void dialog.dismiss();
  });
  await uiLogin(xssPage, attacker);
  await xssPage.goto(`${BASE}/gastos`);
  await xssPage.waitForSelector('table');
  const renderedAsText = (await xssPage.getByText(xssPayload, { exact: true }).count()) > 0;
  log('XSS almacenado: alta', xssCreate.status, 'diálogos', dialogs, 'mostrado como texto', renderedAsText);
  await xssContext.close();

  // h) Token de acceso robado: sin la contraseña no puede vincularse un autenticador del
  //    atacante ni expulsarse al titular cerrando sus sesiones (ASVS 5.0, 7.5.1 y 7.5.2).
  const stolen = authed(intruder.body.accessToken);
  const mfaSetup = await (await fetch(`${BASE}/api/account/mfa/setup`, { method: 'POST', headers: stolen })).json();
  const mfaBind = await fetch(`${BASE}/api/account/mfa/enable`, { method: 'POST', headers: stolen, body: JSON.stringify({ code: totp(mfaSetup.secret) }) });
  const kickOut = await fetch(`${BASE}/api/account/sessions/revoke-others`, { method: 'POST', headers: stolen, body: JSON.stringify({}) });
  log('token robado: vincular MFA', mfaBind.status, 'cerrar sesiones', kickOut.status);
  fs.writeFileSync(path.join(OUT, '..', 'simulacion-ataques.json'), JSON.stringify({ refresh: first.status, reuse: reuse.status, idor: statuses, adminTry: adminTry.status, upload: upload.status, xss: { alta: xssCreate.status, dialogos: dialogs, mostradoComoTexto: renderedAsText }, tokenRobado: { vincularMfa: mfaBind.status, cerrarSesiones: kickOut.status } }, null, 2));
}

// 4. Administración y auditoría
{
  const context = await newContext();
  const page = await newPage(context);
  // Estado inicial reproducible: los roles privilegiados empiezan sin segundo factor.
  await db.execute("UPDATE User SET mfaEnabled = 0, mfaSecretEnc = NULL, mfaPendingSecretEnc = NULL, mfaLastUsedStep = NULL WHERE role IN ('ADMIN', 'AUDITOR')");
  await uiLogin(page, ADMIN);
  await page.goto(`${BASE}/admin/usuarios`);
  await page.waitForSelector('.notice-warning');
  await page.waitForSelector('.notice-error');
  await shot(page, '16-mfa-obligatorio');
  await enableMfaInUi(page, ADMIN.password);
  await page.goto(`${BASE}/admin/usuarios`);
  await page.waitForSelector('table');
  await shot(page, '10-admin-usuarios', { fullPage: true });

  await page.goto(`${BASE}/alertas`);
  await page.waitForSelector('.alert-list');
  await shot(page, '11-alertas', { fullPage: true });

  await page.goto(`${BASE}/auditoria`);
  await page.waitForSelector('table');
  await page.click('button:has-text("Verificar integridad")');
  await page.waitForSelector('.notice-success');
  await shot(page, '12-auditoria-integra');

  // Manipulación directa de la base de datos (atacante con acceso al SGBD)
  const target = (await db.execute("SELECT id, ip FROM AuditLog WHERE action = 'AUTH_LOGIN' AND outcome = 'FAILURE' ORDER BY id DESC LIMIT 1")).rows[0];
  await db.execute({ sql: 'UPDATE AuditLog SET ip = ? WHERE id = ?', args: ['10.66.66.66', target.id] });
  await page.click('button:has-text("Verificar integridad")');
  await page.waitForSelector('.notice-error');
  await shot(page, '13-auditoria-manipulada');
  await db.execute({ sql: 'UPDATE AuditLog SET ip = ? WHERE id = ?', args: [target.ip, target.id] });
  await page.click('button:has-text("Verificar integridad")');
  await page.waitForSelector('.notice-success');
  log('cadena restaurada');
  await context.close();
}

// 5. Vista del auditor (solo lectura)
{
  const context = await newContext();
  const page = await newPage(context);
  await uiLogin(page, AUDITOR);
  await enableMfaInUi(page, AUDITOR.password);
  await page.goto(`${BASE}/alertas`);
  await page.waitForSelector('.alert-list');
  await shot(page, '14-alertas-auditor');
  await page.goto(`${BASE}/admin/usuarios`);
  await page.waitForSelector('.empty-state');
  await shot(page, '15-auditor-sin-acceso');
  await context.close();
}

await browser.close();
db.close();
console.log('\nErrores de consola (CSP/Trusted Types/JS):', consoleErrors.length ? consoleErrors : 'ninguno');
