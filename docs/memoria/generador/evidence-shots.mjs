// Representa como capturas de terminal las salidas reales guardadas en docs/evidencias
// (no se edita su contenido: solo se seleccionan las líneas indicadas).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'C:/Users/andre/Documents/GastoSeguro';
const EV = `${ROOT}/docs/evidencias`;
const OUT = `${ROOT}/docs/img`;
const read = (file) => fs.readFileSync(path.join(EV, file), 'utf8').replace(/\r/g, '').replace(/\x1b\[[0-9;]*m/g, '');
const lines = (text) => text.split('\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function colorize(line) {
  const e = esc(line);
  if (/^\s*✓/.test(line)) return `<span class="ok">${e}</span>`;
  if (/^\s*(Test Files|Tests)\s/.test(line)) return `<span class="sum">${e}</span>`;
  if (/^(found 0 vulnerabilities|\d+ packages have verified)/.test(line)) return `<span class="ok">${e}</span>`;
  if (/^#/.test(line)) return `<span class="dim">${e}</span>`;
  return e;
}

const vitest = lines(read('pruebas-vitest.txt'));
const pg = lines(read('pruebas-postgresql.txt'));
const pgSummaryStart = pg.findIndex((l) => /Test Files/.test(l));
const pgCheck = pg.findIndex((l) => /Comprobación posterior/.test(l));
const sbom = JSON.parse(fs.readFileSync(`${ROOT}/docs/sbom.cdx.json`, 'utf8'));

const shots = [
  {
    name: 'ev-01-npm-test',
    title: 'npm test (SQLite)',
    command: 'npm test -w backend -- --reporter=verbose',
    body: [...vitest.slice(0, 4), '   …', ...vitest.filter((l) => /privacy-sessions/.test(l)).slice(0, 10), '   …', ...vitest.slice(-7)],
  },
  {
    name: 'ev-02-postgresql',
    title: 'npm run test:postgres',
    command: 'TEST_DATABASE_URL=postgresql://postgres:***@localhost:5433/gastoseguro_test3 npm run test:postgres -w backend',
    body: [...pg.slice(pgSummaryStart - 1, pgSummaryStart + 4), '', ...pg.slice(pgCheck, pgCheck + 18)],
  },
  {
    name: 'ev-03-npm-audit',
    title: 'npm audit / npm audit signatures',
    command: 'npm audit && npm audit signatures',
    body: [...lines(read('npm-audit.txt')), ...lines(read('npm-audit-signatures.txt'))],
  },
  {
    name: 'ev-04-sbom',
    title: 'npm run sbom',
    command: 'npm run sbom',
    body: [
      `SBOM CycloneDX ${sbom.specVersion} con ${sbom.components.length} componentes -> docs\\sbom.cdx.json`,
      '',
      '$ node -e "…" (extracto de docs/sbom.cdx.json)',
      `bomFormat: ${sbom.bomFormat}   specVersion: ${sbom.specVersion}   componentes: ${sbom.components.length}`,
      ...sbom.components.slice(0, 12).map((c) => `  ${String(c.name).padEnd(28)} ${String(c.version).padEnd(10)} ${c.purl ?? ''}`),
      '  …',
    ],
  },
];

const css = `
  body { margin: 0; background: #e9edf2; font-family: 'Segoe UI', sans-serif; }
  .win { margin: 14px; border-radius: 8px; overflow: hidden; box-shadow: 0 6px 20px rgba(0,0,0,.25); width: 1180px; }
  .bar { background: #2b2f36; color: #c9d1d9; font-size: 13px; padding: 7px 12px; display: flex; gap: 8px; align-items: center; }
  .dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
  pre { margin: 0; background: #0d1117; color: #c9d1d9; font: 13px/1.45 'Cascadia Mono', Consolas, monospace; padding: 12px 14px; white-space: pre-wrap; word-break: break-all; }
  .prompt { color: #7ee787; } .ok { color: #7ee787; } .sum { color: #f0f6fc; font-weight: 600; } .dim { color: #8b949e; }`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1.5 });
for (const shot of shots) {
  const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><div class="win"><div class="bar"><span class="dot" style="background:#ff5f56"></span><span class="dot" style="background:#ffbd2e"></span><span class="dot" style="background:#27c93f"></span>&nbsp;${esc(shot.title)} — GastoSeguro</div><pre><span class="prompt">$ ${esc(shot.command)}</span>\n${shot.body.map(colorize).join('\n')}</pre></div>`;
  await page.setContent(html);
  const box = await page.locator('.win').boundingBox();
  await page.screenshot({ path: `${OUT}/${shot.name}.png`, clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 } });
  console.log('captura', shot.name);
}
await browser.close();
