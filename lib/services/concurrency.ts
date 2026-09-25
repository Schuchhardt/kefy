// ─── Concurrencia limitada ────────────────────────────────────────────────────
//
// Ejecuta tareas asíncronas con como mucho `n` en vuelo a la vez. Sirve para
// recorrer listas contra APIs externas (Zernio, métricas) sin lanzar cientos
// de peticiones simultáneas desde una función serverless.
//
//   const limit = pLimit(5);
//   await Promise.all(ids.map((id) => limit.run(() => fetchMetrics(id))));

export interface Limiter {
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Tareas ejecutándose ahora mismo. */
  readonly active: number;
  /** Tareas esperando turno. */
  readonly pending: number;
}

export function pLimit(n: number): Limiter {
  const max = Math.max(1, Math.floor(n));
  const queue: Array<() => void> = [];
  let active = 0;

  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (start) start();
  };

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          active++;
          // Una excepción síncrona de `fn` también libera el hueco.
          Promise.resolve()
            .then(fn)
            .then(resolve, reject)
            .finally(() => {
              active--;
              next();
            });
        });
        next();
      });
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  };
}
