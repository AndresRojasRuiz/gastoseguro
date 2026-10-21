// Captura la cabecera, el resumen de alertas y la lista de alertas de los dos informes HTML
// de ZAP (sin modificarlos) y los compone en una sola imagen para el Anexo F.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'C:/Users/andre/Documents/GastoSeguro';
const DIR = `${ROOT}/docs/evidencias/zap`;
// Carpeta de trabajo del análisis dinámico (configurable con la variable GASTOSEGURO_WORK).
const WORK = (process.env.GASTOSEGURO_WORK ?? path.join(os.tmpdir(), 'gastoseguro')).replaceAll('\\', '/');
const TMP = `${WORK}/shots`;
fs.mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1.5 });
const parts = [];
for (const profile of ['usuario', 'admin']) {
  await page.goto(`file:///${DIR}/zap-${profile}.html`);
  // Se ocultan las secciones de detalle para que la captura muestre el resumen completo.
  await page.evaluate(() => {
    const stop = [...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Alert Detail');
    let node = stop;
    while (node) {
      const next = node.nextElementSibling;
      node.style.display = 'none';
      node = next;
    }
    for (const h of document.querySelectorAll('h3')) if (/Insights|Sequence/.test(h.textContent)) {
      h.style.display = 'none';
      if (h.nextElementSibling) h.nextElementSibling.style.display = 'none';
    }
  });
  const file = `${TMP}/zap-${profile}.png`;
  await page.screenshot({ path: file, fullPage: true });
  parts.push(file);
}
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:'Segoe UI',sans-serif}
.row{display:flex;gap:16px;padding:12px}.col{flex:1;border:1px solid #ccd3db;border-radius:6px;overflow:hidden}
.t{background:#2b2f36;color:#fff;font-size:15px;padding:6px 10px}img{width:100%;display:block}</style>
<div class="row">${parts.map((p, i) => `<div class="col"><div class="t">Perfil ${i === 0 ? 'usuario estándar' : 'administrador con MFA'}</div><img src="file:///${p}"></div>`).join('')}</div>`;
fs.writeFileSync(`${TMP}/zap-compose.html`, html);
const composer = await browser.newPage({ viewport: { width: 1800, height: 800 }, deviceScaleFactor: 1 });
await composer.goto(`file:///${TMP}/zap-compose.html`);
await composer.waitForLoadState('load');
const box = await composer.locator('.row').boundingBox();
await composer.screenshot({ path: `${ROOT}/docs/img/ev-05-zap.png`, clip: box });
await browser.close();
console.log('captura ev-05-zap');
