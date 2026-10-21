/**
 * Igualación de tiempos de respuesta (A07:2025, CWE-208 - Observable Timing Discrepancy).
 *
 * Durante la evaluación se midió que un inicio de sesión fallido con un usuario existente
 * tardaba algo más que uno con un usuario inexistente (escrituras adicionales en la base de
 * datos), lo que permitiría enumerar cuentas estadísticamente. Para eliminar ese canal
 * lateral, las operaciones de autenticación tardan siempre, como mínimo, un tiempo fijo con
 * una pequeña fluctuación aleatoria, independientemente del resultado.
 */
import { randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

export async function withMinimumDuration<T>(minimumMs: number, operation: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    const remaining = minimumMs - (performance.now() - startedAt);
    if (remaining > 0) await sleep(remaining + randomInt(0, 25));
  }
}
