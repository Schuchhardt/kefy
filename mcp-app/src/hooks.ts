import { useCallback, useEffect, useRef, useState } from 'react';
import { useEnv } from './context';
import type { ToolOutcome } from './host';

/** Estado de carga por botón: `busy` es la clave de la acción en curso. */
export function useRunner() {
  const [busy, setBusy] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
    setBusy(key);
    try {
      return await fn();
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, []);
  return { busy, run };
}

/** Toast de error con el `code` del servidor. */
export function useFailToast() {
  const { toast, t } = useEnv();
  return useCallback((r: Extract<ToolOutcome, { ok: false }>) => {
    toast(r.timeout ? t.slow : `${t.errorPrefix} ${r.code}: ${r.message}`, r.timeout ? 'info' : 'error');
  }, [toast, t]);
}

/**
 * Repite `tick` cada `intervalMs` hasta que devuelva true, se agoten los
 * intentos o se desmonte la vista (la Vista 2 lo usa para get_video_status y
 * la Vista 1 para esperar una imagen o un cambio pedido al asistente).
 */
export function useRepeater() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback((tick: () => Promise<boolean>, opts: { intervalMs: number; maxTries: number }) => {
    stop();
    const gen = generation.current;
    let tries = 0;
    const loop = () => {
      timer.current = setTimeout(async () => {
        if (gen !== generation.current) return;
        tries += 1;
        let done = false;
        try {
          done = await tick();
        } catch {
          done = false;
        }
        if (gen !== generation.current) return;
        if (!done && tries < opts.maxTries) loop();
        else timer.current = null;
      }, opts.intervalMs);
    };
    loop();
  }, [stop]);

  useEffect(() => stop, [stop]);
  return { start, stop };
}
