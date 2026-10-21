// Genera los diagramas técnicos de la memoria (SVG -> PNG con Edge headless).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const OUT = 'C:/Users/andre/Documents/GastoSeguro/docs/img';
fs.mkdirSync(OUT, { recursive: true });

const C = {
  ink: '#1e293b', muted: '#64748b', line: '#475569',
  blue: '#0098cd', blueD: '#006f96', blueL: '#e0f4fb',
  teal: '#0f766e', tealL: '#ccfbf1', navy: '#0b1f33',
  red: '#dc2626', redL: '#fee2e2', amber: '#b45309', amberL: '#fef3c7',
  green: '#15803d', greenL: '#dcfce7', purple: '#6d28d9', purpleL: '#ede9fe',
  gray: '#f1f5f9', grayB: '#cbd5e1', white: '#ffffff',
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function text(x, y, lines, { size = 14, weight = 400, anchor = 'middle', fill = C.ink, lh = 1.3, italic = false, family } = {}) {
  const arr = Array.isArray(lines) ? lines : [lines];
  return arr
    .map((line, i) => `<text x="${x}" y="${y + i * size * lh}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}"${italic ? ' font-style="italic"' : ''}${family ? ` font-family="${family}"` : ''}>${esc(line)}</text>`)
    .join('');
}
function rect(x, y, w, h, { fill = C.white, stroke = C.grayB, rx = 10, sw = 1.5, dash } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
function box(x, y, w, h, title, body = [], { fill = C.white, stroke = C.blue, titleFill = stroke, size = 13, titleSize = 15, rx = 10, align = 'middle' } = {}) {
  const tx = align === 'middle' ? x + w / 2 : x + 14;
  let out = rect(x, y, w, h, { fill, stroke, rx });
  const bodyHeight = body.length * size * 1.35;
  const titleHeight = title ? titleSize * 1.3 : 0;
  const total = titleHeight + (body.length ? bodyHeight + 4 : 0);
  let cy = y + (h - total) / 2 + titleSize * 0.95;
  if (title) out += text(tx, cy, title, { size: titleSize, weight: 700, fill: titleFill, anchor: align === 'middle' ? 'middle' : 'start' });
  if (body.length) out += text(tx, cy + titleHeight + 2, body, { size, fill: C.ink, lh: 1.35, anchor: align === 'middle' ? 'middle' : 'start' });
  return out;
}
function zone(x, y, w, h, label, color = C.red, { fill = 'none', labelX } = {}) {
  return rect(x, y, w, h, { fill, stroke: color, rx: 14, sw: 2, dash: '8 6' }) + text(labelX ?? x + 14, y - 8, label, { size: 13, weight: 700, fill: color, anchor: 'start' });
}
function arrow(points, { color = C.line, label, lx, ly, both = false, dash, size = 12.5, width = 1.8, labelFill = C.ink, anchor = 'middle', bg = true } = {}) {
  const d = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
  const id = color.replace('#', '');
  let out = `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} marker-end="url(#a${id})"${both ? ` marker-start="url(#s${id})"` : ''}/>`;
  if (label) {
    const lines = Array.isArray(label) ? label : [label];
    const tw = Math.max(...lines.map((l) => l.length)) * size * 0.52 + 10;
    const th = lines.length * size * 1.3 + 4;
    const bx = anchor === 'middle' ? lx - tw / 2 : anchor === 'start' ? lx - 5 : lx - tw + 5;
    if (bg) out += `<rect x="${bx}" y="${ly - size - 2}" width="${tw}" height="${th}" fill="#ffffff" opacity="0.92" rx="3"/>`;
    out += text(lx, ly, lines, { size, fill: labelFill, anchor });
  }
  return out;
}
const markers = () =>
  [C.line, C.blue, C.red, C.green, C.teal, C.amber, C.purple, C.muted]
    .map((c) => {
      const id = c.replace('#', '');
      return `<marker id="a${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker><marker id="s${id}" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`;
    })
    .join('');
const svg = (w, h, content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Segoe UI, Calibri, Arial, sans-serif"><defs>${markers()}</defs><rect width="${w}" height="${h}" fill="#fff"/>${content}</svg>`;

const diagrams = {};

// ---------------------------------------------------------------------------------------------
// D1. OWASP Top 10: 2021 -> 2025
{
  const y0 = 70, rowH = 46, colW = 360, lx = 30, rx = 610;
  const left = ['A01 Broken Access Control', 'A02 Cryptographic Failures', 'A03 Injection', 'A04 Insecure Design', 'A05 Security Misconfiguration', 'A06 Vulnerable & Outdated Components', 'A07 Identification & Authentication Failures', 'A08 Software & Data Integrity Failures', 'A09 Security Logging & Monitoring Failures', 'A10 Server-Side Request Forgery (SSRF)'];
  const right = ['A01 Broken Access Control', 'A02 Security Misconfiguration', 'A03 Software Supply Chain Failures', 'A04 Cryptographic Failures', 'A05 Injection', 'A06 Insecure Design', 'A07 Authentication Failures', 'A08 Software or Data Integrity Failures', 'A09 Security Logging & Alerting Failures', 'A10 Mishandling of Exceptional Conditions'];
  const map = [[0, 0], [1, 3], [2, 4], [3, 5], [4, 1], [5, 2], [6, 6], [7, 7], [8, 8], [9, 0]];
  const isNew = [false, false, true, false, false, false, false, false, false, true];
  let c = text(lx + colW / 2, 38, 'OWASP Top 10:2021', { size: 19, weight: 700, fill: C.muted }) + text(rx + colW / 2, 38, 'OWASP Top 10:2025', { size: 19, weight: 700, fill: C.blueD });
  left.forEach((t, i) => (c += box(lx, y0 + i * rowH, colW, 36, null, [t], { stroke: C.grayB, fill: C.gray, size: 14, align: 'start' })));
  right.forEach((t, i) => (c += box(rx, y0 + i * rowH, colW, 36, null, [t], { stroke: isNew[i] ? C.teal : C.blue, fill: isNew[i] ? C.tealL : C.blueL, size: 14, align: 'start' })));
  map.forEach(([a, b]) => {
    const merged = a === 9;
    c += arrow([[lx + colW, y0 + a * rowH + 18], [lx + colW + 110, y0 + a * rowH + 18], [rx - 110, y0 + b * rowH + 18], [rx - 4, y0 + b * rowH + 18]], { color: merged ? C.amber : a === 5 ? C.teal : C.line, dash: merged ? '6 4' : undefined, width: 1.6 });
  });
  c += text(rx + colW + 8, y0 + 2 * rowH + 24, 'nueva*', { size: 12, fill: C.teal, anchor: 'start', weight: 700 });
  c += text(rx + colW + 8, y0 + 9 * rowH + 24, 'nueva', { size: 12, fill: C.teal, anchor: 'start', weight: 700 });
  const ly = y0 + 10 * rowH + 24;
  c += text(lx, ly, '* A03:2025 amplía A06:2021 a toda la cadena de suministro.   - - -  SSRF se integra en A01:2025.', { size: 13, anchor: 'start', fill: C.muted });
  diagrams['d01-owasp-2021-2025'] = svg(1060, ly + 18, c);
}

// ---------------------------------------------------------------------------------------------
// D2. Metodología S-SDLC
{
  const phases = [
    ['1. Requisitos y', 'amenazas', ['Requisitos ASVS 5.0', 'STRIDE y casos de abuso', 'SSDF PO.1 / PW.1'], C.blue, C.blueL],
    ['2. Diseño', 'seguro', ['Arquitectura por capas', 'Mínimo privilegio', 'SSDF PW.1 / PW.2'], C.purple, C.purpleL],
    ['3. Implementación', 'segura', ['Controles OWASP Top 10', 'Revisión por pares', 'SSDF PW.4 / PW.5'], C.teal, C.tealL],
    ['4. Verificación', '', ['110 pruebas, SAST, SCA, DAST', 'Casos de abuso simulados', 'SSDF PW.7 / PW.8'], C.amber, C.amberL],
    ['5. Despliegue y', 'operación', ['Contenedores endurecidos', 'Registro y alertas', 'SSDF PS / RV'], C.green, C.greenL],
  ];
  const w = 210, h = 170, gap = 34, y = 70;
  let c = text(613, 34, 'Ciclo de vida de desarrollo seguro aplicado (iterativo, por incrementos)', { size: 17, weight: 700, fill: C.ink });
  phases.forEach(([t1, t2, body, stroke, fill], i) => {
    const x = 20 + i * (w + gap);
    c += rect(x, y, w, h, { fill, stroke, rx: 14, sw: 2 });
    c += text(x + w / 2, y + 32, [t1, t2].filter(Boolean), { size: 16, weight: 700, fill: stroke, lh: 1.2 });
    c += text(x + w / 2, y + (t2 ? 92 : 80), body, { size: 13, fill: C.ink, lh: 1.4 });
    if (i < phases.length - 1) c += arrow([[x + w + 3, y + h / 2], [x + w + gap - 3, y + h / 2]], { color: C.line });
  });
  const lastX = 20 + 4 * (w + gap) + w / 2;
  c += arrow([[lastX, y + h + 4], [lastX, y + h + 52], [20 + w / 2, y + h + 52], [20 + w / 2, y + h + 6]], { color: C.blue, dash: '7 5', label: 'Retroalimentación: hallazgos de verificación, alertas y nuevas amenazas', lx: 613, ly: y + h + 57 });
  c += box(20, y + h + 82, 1186, 54, null, ['Transversal: gestión de la cadena de suministro (lockfile, auditoría, SBOM, Dependabot) · CI/CD con controles automáticos · documentación de decisiones'], { stroke: C.grayB, fill: C.gray, size: 14 });
  diagrams['d02-metodologia'] = svg(1226, y + h + 150, c);
}

// ---------------------------------------------------------------------------------------------
// D3. Planificación (Gantt)
{
  const weeks = 16, x0 = 330, cw = 46, y0 = 70, rh = 34;
  const tasks = [
    ['Estado del arte y análisis normativo', 1, 3, C.blue, 'Común'],
    ['Requisitos y modelado de amenazas', 3, 5, C.blue, 'Común'],
    ['Arquitectura y modelo de datos', 4, 6, C.purple, 'Común'],
    ['P1 · Autenticación, sesiones y criptografía', 6, 10, C.teal, 'P. Ormazabal'],
    ['P2 · Control de acceso, entradas y ficheros', 6, 10, C.teal, 'A. Rojas'],
    ['P3 · Configuración, cadena de suministro y registro', 6, 11, C.teal, 'J. Ruz'],
    ['Interfaz web e integración', 9, 12, C.purple, 'Común'],
    ['Pruebas, simulación de ataques y evaluación', 11, 14, C.amber, 'Común'],
    ['Redacción de la memoria', 3, 15, C.green, 'Común'],
    ['Revisión con la dirección y entrega', 15, 16, C.red, 'Común'],
  ];
  let c = text(20, 32, 'Planificación del trabajo (semanas)', { size: 17, weight: 700, anchor: 'start' });
  for (let wk = 1; wk <= weeks; wk += 1) {
    c += text(x0 + (wk - 0.5) * cw, y0 - 12, String(wk), { size: 12, fill: C.muted });
    c += `<line x1="${x0 + (wk - 1) * cw}" y1="${y0 - 4}" x2="${x0 + (wk - 1) * cw}" y2="${y0 + tasks.length * rh}" stroke="#e2e8f0"/>`;
  }
  c += `<line x1="${x0 + weeks * cw}" y1="${y0 - 4}" x2="${x0 + weeks * cw}" y2="${y0 + tasks.length * rh}" stroke="#e2e8f0"/>`;
  tasks.forEach(([name, s, e, color, who], i) => {
    const y = y0 + i * rh;
    if (i % 2 === 0) c += `<rect x="10" y="${y}" width="${x0 + weeks * cw}" height="${rh}" fill="#f8fafc"/>`;
    c += text(18, y + 22, name, { size: 13, anchor: 'start' });
    c += rect(x0 + (s - 1) * cw + 3, y + 7, (e - s + 1) * cw - 6, rh - 14, { fill: color, stroke: color, rx: 6 });
    c += text(x0 + (s - 1) * cw + 10, y + 22, who, { size: 11.5, anchor: 'start', fill: '#fff', weight: 600 });
  });
  diagrams['d03-planificacion'] = svg(x0 + weeks * cw + 20, y0 + tasks.length * rh + 16, c);
}

// ---------------------------------------------------------------------------------------------
// D4. Arquitectura y zonas de confianza
{
  let c = '';
  c += zone(20, 50, 250, 400, 'Zona no confiable: cliente', C.red);
  c += box(40, 80, 210, 170, 'Navegador', ['SPA React 19', 'Token de acceso en memoria', 'Cookie de refresco HttpOnly', 'CSP + Trusted Types'], { stroke: C.navy });
  c += box(40, 280, 210, 140, 'App autenticadora', ['TOTP (RFC 6238)', 'Google/Microsoft', 'Authenticator, FreeOTP'], { stroke: C.muted, titleFill: C.muted });
  c += zone(310, 50, 230, 400, 'Perímetro (DMZ)', C.amber);
  c += box(330, 140, 190, 200, 'Proxy inverso', ['Caddy', 'TLS 1.2/1.3 automático', 'HSTS, compresión', 'Límite de cuerpo 6 MB', 'Logs JSON'], { stroke: C.amber });
  c += zone(580, 50, 420, 400, 'Zona de aplicación', C.blue);
  c += rect(600, 75, 380, 355, { fill: C.blueL, stroke: C.blue, rx: 12 });
  c += text(790, 102, 'API GastoSeguro (Node.js · Express 5)', { size: 15, weight: 700, fill: C.blueD });
  const layers = [
    ['Middlewares de seguridad', 'helmet · CORS · límites · request-id'],
    ['Autenticación y autorización', 'JWT + sesión en BD · RBAC · propiedad'],
    ['Validación (Zod) y rutas', 'objetos estrictos · tipos · rangos'],
    ['Servicios de negocio', 'gastos · informes · cuenta · admin'],
    ['Auditoría y alertas', 'cadena HMAC · 6 reglas de detección'],
    ['Acceso a datos (Prisma 7)', 'consultas parametrizadas'],
  ];
  layers.forEach(([t, b], i) => (c += box(618, 118 + i * 50, 344, 44, null, [t, b], { stroke: C.blue, size: 12.5 })));
  c += zone(1040, 50, 270, 400, 'Zona de datos (red interna)', C.green);
  c += box(1060, 80, 230, 110, 'PostgreSQL 17', ['usuarios, sesiones, gastos', 'auditoría y alertas'], { stroke: C.green });
  c += box(1060, 210, 230, 100, 'Justificantes', ['volumen fuera de la raíz web', 'nombres UUID + SHA-256'], { stroke: C.green });
  c += box(1060, 330, 230, 100, 'Secretos', ['JWT, AES-256-GCM, HMAC', 'variables de entorno / gestor'], { stroke: C.green });
  c += arrow([[250, 165], [330, 210]], { both: true, label: 'HTTPS', lx: 290, ly: 175, color: C.navy });
  c += arrow([[520, 240], [600, 240]], { both: true, label: 'HTTP interno', lx: 560, ly: 230 });
  c += arrow([[980, 135], [1060, 135]], { both: true, label: 'TCP 5432', lx: 1020, ly: 125 });
  c += arrow([[980, 260], [1060, 260]], { both: true });
  c += arrow([[1060, 380], [980, 380]], { dash: '5 4', label: 'carga al arrancar', lx: 1020, ly: 405, size: 11.5 });
  c += arrow([[145, 280], [145, 252]], { dash: '5 4', label: 'código', lx: 175, ly: 270, size: 11.5, color: C.muted });
  c += box(600, 478, 380, 58, 'Servicios externos opcionales', ['Have I Been Pwned (k-anonimato) · SIEM (logs JSON)'], { stroke: C.muted, titleFill: C.muted, fill: C.gray, size: 12.5, titleSize: 13 });
  c += arrow([[790, 432], [790, 476]], { dash: '5 4', color: C.muted });
  diagrams['d04-arquitectura'] = svg(1330, 555, c);
}

// ---------------------------------------------------------------------------------------------
// D5. Diagrama de flujo de datos con límites de confianza (STRIDE)
{
  let c = '';
  const ent = (x, y, w, h, t, b) => rect(x, y, w, h, { fill: C.gray, stroke: C.navy, rx: 2, sw: 2 }) + text(x + w / 2, y + h / 2 - (b ? 4 : -5), t, { size: 14, weight: 700 }) + (b ? text(x + w / 2, y + h / 2 + 15, b, { size: 12, fill: C.muted }) : '');
  const proc = (cx, cy, r, n, t) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.blueL}" stroke="${C.blue}" stroke-width="2"/>` + text(cx, cy - 6, n, { size: 13, weight: 700, fill: C.blueD }) + text(cx, cy + 13, t, { size: 13, lh: 1.25 });
  const store = (x, y, w, id, t) => `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${C.green}" stroke-width="2"/><line x1="${x}" y1="${y + 44}" x2="${x + w}" y2="${y + 44}" stroke="${C.green}" stroke-width="2"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y + 44}" stroke="${C.green}" stroke-width="2"/>` + text(x + 10, y + 28, id, { size: 13, weight: 700, fill: C.green, anchor: 'start' }) + text(x + 48, y + 28, t, { size: 13, anchor: 'start' });
  c += ent(40, 210, 170, 64, 'Usuario', '(rol USER)');
  c += ent(40, 515, 170, 64, 'Administrador /', 'Auditor');
  c += `<path d="M 300 30 L 300 610" stroke="${C.red}" stroke-width="2.5" stroke-dasharray="10 7"/>` + text(308, 48, 'TB1 · Internet / servidor', { size: 13, weight: 700, fill: C.red, anchor: 'start' });
  c += `<path d="M 820 30 L 820 610" stroke="${C.red}" stroke-width="2.5" stroke-dasharray="10 7"/>` + text(828, 48, 'TB2 · Aplicación / datos', { size: 13, weight: 700, fill: C.red, anchor: 'start' });
  c += proc(560, 100, 58, '1.0', ['Autenticación', 'y sesiones']);
  c += proc(560, 245, 58, '2.0', ['Gastos y', 'justificantes']);
  c += proc(560, 390, 58, '3.0', ['Informes y', 'exportación']);
  c += proc(560, 545, 58, '4.0', ['Administración', 'y auditoría']);
  c += store(870, 78, 280, 'D1', 'Usuarios y sesiones');
  c += store(870, 200, 280, 'D2', 'Gastos y categorías');
  c += store(870, 290, 280, 'D3', 'Justificantes (ficheros)');
  c += store(870, 505, 280, 'D4', 'Auditoría y alertas');
  c += arrow([[210, 214], [503, 92]], { label: 'credenciales, TOTP', lx: 318, ly: 146 });
  c += arrow([[505, 122], [212, 232]], { label: 'JWT + cookie', lx: 405, ly: 206 });
  c += arrow([[210, 245], [500, 245]], { label: 'gastos, justificantes', lx: 405, ly: 236 });
  c += arrow([[210, 262], [507, 372]], { label: 'consultas, CSV', lx: 318, ly: 334 });
  c += arrow([[210, 547], [500, 547]], { label: 'gestión, auditoría', lx: 405, ly: 538 });
  c += arrow([[620, 100], [868, 100]], { both: true, label: 'hash Argon2id, sesiones', lx: 742, ly: 92 });
  c += arrow([[618, 236], [868, 222]], { both: true, label: 'CRUD de gastos', lx: 742, ly: 216 });
  c += arrow([[612, 268], [868, 312]], { both: true, label: 'fichero + SHA-256', lx: 770, ly: 320 });
  c += arrow([[868, 236], [612, 368]], { label: 'lectura', lx: 668, ly: 362, size: 12 });
  c += arrow([[612, 410], [868, 515]], { dash: '6 4', color: C.muted, label: 'eventos de seguridad', lx: 690, ly: 472, size: 12 });
  c += arrow([[618, 527], [868, 527]], { both: true, label: 'consulta, verificación', lx: 742, ly: 520 });
  c += arrow([[610, 575], [845, 575], [845, 122], [868, 122]], { label: 'gestión de cuentas', lx: 735, ly: 594, size: 12 });
  diagrams['d05-dfd'] = svg(1180, 620, c);
}

// ---------------------------------------------------------------------------------------------
// D6. Modelo entidad-relación
{
  let c = '';
  const ent = (x, y, w, name, fields, color = C.blue) => {
    const h = 36 + fields.length * 21 + 10;
    let o = rect(x, y, w, h, { fill: C.white, stroke: color, rx: 8, sw: 1.8 });
    o += `<path d="M${x} ${y + 8} q0 -8 8 -8 h${w - 16} q8 0 8 8 v26 h-${w} z" fill="${color}"/>`;
    o += text(x + w / 2, y + 23, name, { size: 15, weight: 700, fill: '#fff' });
    fields.forEach((f, i) => (o += text(x + 12, y + 56 + i * 21, f, { size: 12.5, anchor: 'start', family: 'Consolas, monospace', fill: f.startsWith('PK') ? C.blueD : f.startsWith('FK') ? C.purple : C.ink })));
    return { svg: o, h };
  };
  const user = ent(470, 20, 270, 'User', ['PK id (UUID)', 'email (único)', 'passwordHash (Argon2id)', 'role · status · currency', 'failedLoginCount · lockedUntil', 'mfaEnabled · mfaSecretEnc (AES-GCM)', 'mfaLastUsedStep']);
  const session = ent(30, 20, 260, 'Session', ['PK id (UUID)', 'FK userId', 'expiresAt · lastUsedAt', 'revokedAt · revokeReason', 'ip · userAgent']);
  const rt = ent(30, 245, 260, 'RefreshToken', ['PK id', 'FK sessionId', 'tokenHash (SHA-256, único)', 'expiresAt · usedAt']);
  const ch = ent(30, 430, 260, 'LoginChallenge', ['PK id (UUID)', 'FK userId', 'expiresAt · usedAt · attempts']);
  const cat = ent(920, 20, 250, 'Category', ['PK id (UUID)', 'FK userId', 'name (único por usuario)', 'color (#RRGGBB)']);
  const exp = ent(920, 220, 250, 'Expense', ['PK id (UUID)', 'FK userId · FK categoryId', 'amountMinor (entero)', 'date · description', 'merchant · paymentMethod', 'deletedAt (borrado lógico)']);
  const rec = ent(920, 445, 250, 'Receipt', ['PK id', 'FK expenseId (único)', 'storedName (UUID)', 'originalName (saneado)', 'mimeType · sizeBytes · sha256']);
  const audit = ent(470, 300, 270, 'AuditLog', ['PK id (autoincremental)', 'createdAt · action · outcome', 'userId · actorEmail', 'targetType · targetId', 'ip · userAgent · requestId', 'details (JSON)', 'prevHash · hash (HMAC-SHA256)']);
  const alert = ent(470, 520, 270, 'SecurityAlert', ['PK id (UUID)', 'type · severity · message', 'userId · ip · details', 'acknowledgedAt · acknowledgedBy']);
  c += [user, session, rt, ch, cat, exp, rec, audit, alert].map((e) => e.svg).join('');
  const rel = (pts, l1, l2, p1, p2) => arrow(pts, { color: C.line, width: 1.5 }) + text(p1[0], p1[1], l1, { size: 13, weight: 700, fill: C.muted }) + text(p2[0], p2[1], l2, { size: 13, weight: 700, fill: C.muted });
  c += rel([[470, 80], [290, 80]], '1', 'N', [460, 72], [302, 72]);
  c += rel([[160, 152], [160, 245]], '1', 'N', [172, 168], [172, 238]);
  c += rel([[470, 200], [380, 200], [380, 470], [290, 470]], '1', 'N', [458, 192], [302, 462]);
  c += rel([[740, 80], [920, 80]], '1', 'N', [752, 72], [910, 72]);
  c += rel([[740, 160], [830, 160], [830, 300], [920, 300]], '1', 'N', [752, 152], [910, 292]);
  c += rel([[1045, 146], [1045, 220]], '1', 'N', [1058, 162], [1058, 214]);
  c += rel([[1045, 390], [1045, 445]], '1', '0..1', [1058, 405], [1068, 440]);
  c += text(605, 292, 'cadena: hash(n) = HMAC(K, contenido(n) ‖ hash(n-1))', { size: 12, fill: C.muted, italic: true });
  diagrams['d06-modelo-datos'] = svg(1200, 650, c);
}

// ---------------------------------------------------------------------------------------------
// D7. Cadena de middlewares
{
  const steps = [
    ['request-context', ['X-Request-Id', 'log de acceso']],
    ['helmet + políticas', ['CSP, HSTS, COOP', 'Permissions-Policy']],
    ['CORS + no-store', ['lista blanca', 'sin caché']],
    ['Límite global', ['600 / 15 min', 'por IP (/56)']],
    ['Tipo y tamaño', ['JSON ≤ 100 KB', '415 / 413']],
    ['Limitador ruta', ['login, MFA,', 'subida, export']],
    ['authenticate', ['JWT HS256', '+ sesión en BD']],
    ['requireRole', ['RBAC', 'denegar por defecto']],
    ['Validación Zod', ['objetos estrictos', 'listas blancas']],
    ['Servicio', ['propiedad del objeto', 'reglas de negocio']],
    ['Prisma', ['consultas', 'parametrizadas']],
  ];
  const w = 150, h = 92, gx = 26, perRow = 6;
  let c = text(20, 30, 'Petición HTTP', { size: 14, weight: 700, anchor: 'start', fill: C.blueD });
  steps.forEach(([t, b], i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    const x = 20 + (row === 0 ? col : perRow - 1 - col) * (w + gx);
    const y = 46 + row * (h + 70);
    c += box(x, y, w, h, t, b, { stroke: i >= 6 ? C.teal : C.blue, fill: i >= 6 ? C.tealL : C.blueL, size: 12, titleSize: 13.5 });
    if (i < steps.length - 1) {
      const nrow = Math.floor((i + 1) / perRow);
      if (nrow === row) {
        if (row === 0) c += arrow([[x + w + 2, y + h / 2], [x + w + gx - 2, y + h / 2]]);
        else c += arrow([[x - 2, y + h / 2], [x - gx + 2, y + h / 2]]);
      } else c += arrow([[x + w / 2, y + h + 2], [x + w / 2, y + h + 68]]);
    }
  });
  const errY = 46 + 2 * (h + 70) - 30;
  c += box(20, errY, 1076, 60, 'errorHandler (A10)', ['Cualquier excepción en la cadena → respuesta JSON controlada (400/401/403/404/409/413/415/429/500) sin trazas internas + requestId; detalle completo solo en el log'], { stroke: C.red, fill: C.redL, size: 12.5, titleSize: 14 });
  c += arrow([[271, 46 + h + 70 + h + 2], [271, errY - 2]], { color: C.red, dash: '6 4', label: 'excepción en cualquier paso', lx: 285, ly: errY - 10, anchor: 'start', labelFill: C.red, size: 12 });
  diagrams['d07-middlewares'] = svg(1116, errY + 76, c);
}

// ---------------------------------------------------------------------------------------------
// Diagramas de secuencia
function sequence(name, actors, msgs, height, width = 1150) {
  const xs = actors.map((_, i) => 110 + i * ((width - 220) / (actors.length - 1)));
  let c = '';
  actors.forEach(([t, color], i) => {
    c += box(xs[i] - 85, 14, 170, 46, null, [t], { stroke: color, fill: C.white, size: 14 });
    c += `<line x1="${xs[i]}" y1="60" x2="${xs[i]}" y2="${height - 10}" stroke="${C.grayB}" stroke-width="1.5" stroke-dasharray="6 5"/>`;
  });
  let y = 96;
  msgs.forEach((m) => {
    if (m.note) {
      const x1 = xs[m.from] - 80, x2 = xs[m.to ?? m.from] + 80;
      const lines = Array.isArray(m.note) ? m.note : [m.note];
      c += box(x1, y - 16, x2 - x1, lines.length * 18 + 14, null, lines, { stroke: m.color ?? C.amber, fill: m.fill ?? C.amberL, size: 12.5, rx: 6 });
      y += lines.length * 18 + 26;
      return;
    }
    const a = xs[m.from], b = xs[m.to];
    if (m.from === m.to) {
      c += arrow([[a, y], [a + 46, y], [a + 46, y + 24], [a + 4, y + 24]], { color: m.color ?? C.line });
      c += text(a + 56, y + 12, m.label, { size: 12.5, anchor: 'start', fill: m.color ?? C.ink });
      y += 66;
      return;
    }
    const labels = Array.isArray(m.label) ? m.label : [m.label];
    c += text((a + b) / 2, y - 8 - (labels.length - 1) * 16, labels, { size: 12.5, fill: m.color ?? C.ink, lh: 1.25 });
    c += arrow([[a, y], [b + (b > a ? -3 : 3), y]], { color: m.color ?? C.line, dash: m.dash });
    y += 44 + (labels.length - 1) * 8;
  });
  diagrams[name] = svg(width, height, c);
}

sequence(
  'd08-secuencia-login-mfa',
  [['Navegador (SPA)', C.navy], ['API GastoSeguro', C.blue], ['Base de datos', C.green], ['App TOTP del usuario', C.muted]],
  [
    { from: 0, to: 1, label: '1. POST /api/auth/login {email, contraseña}' },
    { from: 1, to: 2, label: '2. buscar usuario por email' },
    { from: 1, to: 1, label: '3. verificar Argon2id · tiempo mínimo uniforme' },
    { from: 1, to: 2, label: '4. crear LoginChallenge (5 min, un solo uso)' },
    { from: 1, to: 0, label: '5. 200 {mfaRequired, challengeId}  — sin tokens', dash: '6 4' },
    { from: 3, to: 0, label: '6. el usuario lee el código de 6 dígitos', dash: '6 4', color: C.muted },
    { from: 0, to: 1, label: '7. POST /api/auth/login/mfa {challengeId, código}' },
    { from: 1, to: 1, label: '8. descifrar secreto (AES-256-GCM) · TOTP ±1 paso · anti-repetición' },
    { from: 1, to: 2, label: '9. marcar desafío usado · crear Session + RefreshToken (hash SHA-256)' },
    { from: 1, to: 0, label: ['10. 200 {accessToken: JWT at+jwt, 15 min}', 'Set-Cookie: __Host-gs_rt (HttpOnly; Secure; SameSite=Strict; Path=/)'], dash: '6 4' },
    { from: 0, to: 1, label: '11. GET /api/expenses · Authorization: Bearer <JWT>' },
    { from: 1, to: 2, label: '12. verificar firma y tipo + sesión activa + rol y MFA actuales' },
    { from: 1, to: 0, label: '13. 200 datos del propio usuario', dash: '6 4' },
  ],
  760,
);

sequence(
  'd09-rotacion-refresh',
  [['Cliente legítimo', C.navy], ['API GastoSeguro', C.blue], ['Base de datos', C.green], ['Atacante', C.red]],
  [
    { from: 0, to: 1, label: '1. POST /api/auth/refresh (cookie RT1)' },
    { from: 1, to: 2, label: '2. RT1 válido → marcar usado, emitir RT2' },
    { from: 1, to: 0, label: '3. nuevo JWT + cookie RT2', dash: '6 4' },
    { note: ['El atacante obtuvo una copia de RT1 (malware, proxy, copia de seguridad...)'], from: 2, to: 3, color: C.red, fill: C.redL },
    { from: 3, to: 1, label: '4. POST /api/auth/refresh (cookie RT1 robada)', color: C.red },
    { from: 1, to: 2, label: '5. RT1 ya usado → REUTILIZACIÓN', color: C.red },
    { from: 1, to: 2, label: '6. revocar la sesión completa (TOKEN_REUSE)', color: C.red },
    { from: 1, to: 1, label: '7. auditoría + alerta de severidad alta', color: C.red },
    { from: 1, to: 3, label: '8. 401 sesión no válida', dash: '6 4', color: C.red },
    { from: 0, to: 1, label: '9. siguiente refresh con RT2' },
    { from: 1, to: 0, label: '10. 401 → el usuario vuelve a autenticarse (con MFA)', dash: '6 4' },
  ],
  600,
);

// ---------------------------------------------------------------------------------------------
// D10. Cadena de auditoría
{
  let c = '';
  const blk = (x, title, fields, hashL, color = C.blue) => {
    let o = rect(x, 60, 250, 190, { fill: C.white, stroke: color, rx: 10, sw: 2 });
    o += text(x + 125, 86, title, { size: 15, weight: 700, fill: color });
    fields.forEach((f, i) => (o += text(x + 14, 114 + i * 20, f, { size: 12.5, anchor: 'start', family: 'Consolas, monospace' })));
    o += rect(x + 10, 200, 230, 40, { fill: color === C.red ? C.redL : C.blueL, stroke: color, rx: 6 });
    o += text(x + 125, 225, hashL, { size: 12.5, family: 'Consolas, monospace', fill: color === C.red ? C.red : C.blueD });
    return o;
  };
  c += text(20, 32, 'Registro de auditoría encadenado (HMAC-SHA256 con clave fuera de la base de datos)', { size: 16, weight: 700, anchor: 'start' });
  c += blk(20, 'Entrada n-1', ['action: AUTH_LOGIN', 'outcome: FAILURE', 'ip: 203.0.113.7', 'prevHash: 9f3a…'], 'hash: 4c1e…');
  c += blk(330, 'Entrada n', ['action: EXPENSE_DELETE', 'outcome: SUCCESS', 'userId: 7b2d…', 'prevHash: 4c1e…'], 'hash: a87b…');
  c += blk(640, 'Entrada n+1', ['action: ADMIN_USER_UPDATE', 'outcome: SUCCESS', 'targetId: 51ce…', 'prevHash: a87b…'], 'hash: 0d92…');
  c += arrow([[270, 220], [342, 172]], { color: C.blue });
  c += arrow([[580, 220], [652, 172]], { color: C.blue });
  c += box(930, 60, 300, 190, 'Verificación', ['recorrer en orden y, para cada entrada:', '1) prevHash = hash anterior', '2) hash = HMAC(K, canónico ‖ prevHash)', 'Si falla → cadena rota en la', 'entrada n · alerta CRÍTICA'], { stroke: C.green, size: 12.5 });
  c += box(20, 280, 600, 92, 'Modificar la entrada n', ['un atacante cambia el contenido → el HMAC recalculado no coincide', 'y no puede regenerarlo sin la clave K (AUDIT_HMAC_KEY)'], { stroke: C.red, fill: C.redL, size: 13 });
  c += box(640, 280, 590, 92, 'Borrar o reordenar entradas', ['el prevHash de la entrada siguiente deja de coincidir', 'con el hash de su predecesora → se detecta el hueco'], { stroke: C.red, fill: C.redL, size: 13 });
  diagrams['d10-cadena-auditoria'] = svg(1250, 392, c);
}

// ---------------------------------------------------------------------------------------------
// D11. Pipeline CI/CD
{
  let c = '';
  c += box(20, 150, 140, 80, 'push / PR', ['o semanal (cron)'], { stroke: C.navy, size: 12.5 });
  c += zone(190, 40, 1040, 180, 'Job 1 · build-test (bloqueante)', C.blue);
  const s1 = [['npm ci', 'lockfile'], ['npm audit', 'SCA ≥ high'], ['audit signatures', 'firmas/procedencia'], ['ESLint security', 'SAST ligero'], ['tsc estricto', 'tipos'], ['110 pruebas', 'Vitest+Supertest'], ['build', 'API + SPA'], ['SBOM', 'CycloneDX']];
  s1.forEach(([t, b], i) => {
    const x = 205 + i * 127;
    c += box(x, 85, 112, 80, t, [b], { stroke: C.blue, fill: C.blueL, size: 11.5, titleSize: 13 });
    if (i < s1.length - 1) c += arrow([[x + 113, 125], [x + 126, 125]]);
  });
  c += text(710, 200, 'Cualquier fallo detiene el canal (fail closed)', { size: 12.5, fill: C.blueD, italic: true });
  c += zone(190, 260, 334, 110, 'Job 2 · PostgreSQL (paralelo)', C.green);
  c += box(207, 285, 300, 70, 'Pruebas en PostgreSQL 17', ['contenedor de servicio · npm run test:postgres'], { stroke: C.green, fill: C.greenL, size: 12 });
  c += zone(543, 260, 334, 110, 'Job 3 · CodeQL (paralelo)', C.purple);
  c += box(560, 285, 300, 70, 'SAST semántico', ['consultas security-extended'], { stroke: C.purple, fill: C.purpleL, size: 12 });
  c += zone(896, 260, 334, 110, 'Job 4 · DAST (tras Job 1)', C.amber);
  c += box(913, 285, 300, 70, 'OWASP ZAP baseline', ['app real con datos de demostración'], { stroke: C.amber, fill: C.amberL, size: 12 });
  c += arrow([[160, 190], [190, 190]]);
  c += arrow([[160, 210], [176, 210], [176, 320], [190, 320]]);
  c += arrow([[176, 240], [530, 240], [530, 320], [543, 320]]);
  c += arrow([[1185, 222], [1185, 258]], { color: C.amber });
  c += box(20, 400, 1210, 64, 'Endurecimiento del propio canal', ['acciones fijadas por SHA de commit · permisos mínimos del GITHUB_TOKEN · persist-credentials: false · Dependabot semanal (npm, Actions, Docker) · imágenes por digest'], { stroke: C.green, fill: C.greenL, size: 12.5 });
  diagrams['d11-pipeline'] = svg(1250, 480, c);
}

// ---------------------------------------------------------------------------------------------
// D12. Despliegue con contenedores
{
  let c = '';
  c += box(20, 170, 140, 70, 'Internet', ['clientes HTTPS'], { stroke: C.navy, size: 12.5 });
  c += zone(190, 50, 330, 330, 'red "frontend"', C.amber);
  c += box(210, 80, 290, 130, 'proxy · caddy:2-alpine@sha256', ['puertos 80/443 (único expuesto)', 'TLS automático + HSTS', 'cap_drop ALL (+NET_BIND_SERVICE)'], { stroke: C.amber, size: 12.5, titleSize: 13.5 });
  c += zone(560, 50, 670, 330, 'red "backend" (internal: sin salida a Internet)', C.green);
  c += box(380, 250, 380, 115, 'app · imagen multi-etapa', ['usuario "node" (no root) · FS solo lectura', 'sin capacidades · no-new-privileges', 'límite 1 CPU / 512 MB · healthcheck'], { stroke: C.blue, fill: C.blueL, size: 12.5, titleSize: 13.5 });
  c += box(860, 80, 340, 115, 'db · postgres:17-alpine@sha256', ['credenciales en deploy/db.env', 'volumen db-data', 'healthcheck pg_isready'], { stroke: C.green, size: 12.5, titleSize: 13.5 });
  c += box(860, 245, 340, 120, 'migrate (efímero)', ['imagen de compilación', 'prisma migrate deploy', 'termina antes de arrancar app'], { stroke: C.muted, titleFill: C.muted, fill: C.gray, size: 12.5, titleSize: 13.5 });
  c += arrow([[160, 205], [210, 160]], { both: true, label: '443', lx: 185, ly: 165 });
  c += arrow([[355, 212], [480, 248]], { label: 'app:4000', lx: 460, ly: 225 });
  c += arrow([[760, 285], [860, 160]], { label: 'db:5432', lx: 805, ly: 200 });
  c += arrow([[1030, 245], [1030, 197]], { dash: '5 4', color: C.muted });
  c += box(380, 400, 820, 56, 'Volúmenes persistentes', ['db-data (PostgreSQL) · receipts (justificantes, único punto escribible de app) · caddy-data (certificados)'], { stroke: C.grayB, titleFill: C.muted, fill: C.gray, size: 12.5, titleSize: 13 });
  diagrams['d12-despliegue'] = svg(1250, 472, c);
}

// ---------------------------------------------------------------------------------------------
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const [name, markup] of Object.entries(diagrams)) {
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${markup}</body></html>`);
  const element = await page.$('svg');
  await element.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('diagrama', name);
}
await browser.close();
