#!/usr/bin/env node
/**
 * Arranca en paralelo la API (puerto 4000) y el servidor de desarrollo de la interfaz
 * (puerto 5173, que redirige /api a la API). Sin dependencias adicionales.
 */
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const processes = [
  ['api', ['run', 'dev', '-w', 'backend']],
  ['web', ['run', 'dev', '-w', 'frontend']],
].map(([name, args]) => {
  const child = spawn(isWindows ? 'npm.cmd' : 'npm', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: isWindows });
  const prefix = name === 'api' ? '\x1b[36m[api]\x1b[0m ' : '\x1b[35m[web]\x1b[0m ';
  const forward = (stream, target) =>
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) target.write(`${prefix}${line}\n`);
    });
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}finalizado (código ${code})`);
    stopAll();
  });
  return child;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of processes) if (!child.killed) child.kill();
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
