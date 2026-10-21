#!/usr/bin/env node
/**
 * Genera la lista de materiales de software (SBOM) en formato CycloneDX con las dependencias
 * de producción (A03:2025). Resultado: docs/sbom.cdx.json
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs', 'sbom.cdx.json');
const sbom = execSync('npm sbom --sbom-format cyclonedx --omit dev', { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const parsed = JSON.parse(sbom);
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`SBOM CycloneDX ${parsed.specVersion} con ${parsed.components?.length ?? 0} componentes -> ${path.relative(root, output)}`);
