#!/usr/bin/env node
/**
 * Genera los manifiestos de integridad de la versión entregada (formato de `sha256sum`):
 *
 *  - docs/evidencias/MANIFIESTO-FUENTES.sha256: huella SHA-256 de cada fichero fuente
 *    (código, configuración, migraciones, pruebas y especificación de la API). Mientras el
 *    repositorio no se publique, su propia huella identifica la versión evaluada.
 *  - docs/evidencias/MANIFIESTO-EVIDENCIAS.sha256: huella de cada evidencia de la evaluación.
 *
 * Uso: npm run manifest      Verificación: cd docs/evidencias && sha256sum -c MANIFIESTO-EVIDENCIAS.sha256
 */
/* eslint-disable security/detect-non-literal-fs-filename -- solo se recorre el árbol del propio
   repositorio a partir de su raíz; ninguna ruta procede de una entrada externa. */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'docs', 'evidencias');
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const toPosix = (file) => path.relative(root, file).split(path.sep).join('/');

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'data', 'storage', 'generated', '.git', 'docs', 'deploy-secrets']);
const EXCLUDED_FILES = new Set(['.env']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) walk(full, out);
    } else if (!EXCLUDED_FILES.has(entry.name) && !/^(app|db)\.env$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const sources = [...walk(root), path.join(root, 'docs', 'openapi.json')].sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
const sourceManifest = path.join(evidence, 'MANIFIESTO-FUENTES.sha256');
writeFileSync(sourceManifest, sources.map((file) => `${sha256(file)}  ${toPosix(file)}`).join('\n') + '\n');
writeFileSync(path.join(evidence, 'HUELLA-MANIFIESTO-FUENTES.txt'), `${sha256(sourceManifest)}  MANIFIESTO-FUENTES.sha256\n`);

const SKIP = new Set(['MANIFIESTO-EVIDENCIAS.sha256', 'MANIFIESTO-FUENTES.sha256', 'HUELLA-MANIFIESTO-FUENTES.txt']);
const evidenceFiles = [];
(function collect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (!SKIP.has(entry.name)) evidenceFiles.push(full);
  }
})(evidence);
const rel = (file) => path.relative(evidence, file).split(path.sep).join('/');
evidenceFiles.sort((a, b) => rel(a).localeCompare(rel(b)));
writeFileSync(path.join(evidence, 'MANIFIESTO-EVIDENCIAS.sha256'), evidenceFiles.map((file) => `${sha256(file)}  ${rel(file)}`).join('\n') + '\n');

const size = sources.reduce((total, file) => total + statSync(file).size, 0);
console.log(`Fuentes: ${sources.length} ficheros (${(size / 1024).toFixed(0)} KiB); huella del manifiesto ${sha256(sourceManifest)}`);
console.log(`Evidencias: ${evidenceFiles.length} ficheros`);
