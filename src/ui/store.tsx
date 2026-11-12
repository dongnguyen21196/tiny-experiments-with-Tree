import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { onChange } from '../db/notify';
import { initializeProfile, loadSnapshot, refreshStatuses, todayFor, type Snapshot } from '../db/repo';
import type { Experiment } from '../domain/types';

interface DataCtx {
  snap: Snapshot;
  reload: () => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('DataProvider missing');
  return c;
}

export function DataProvider({ children, fallback, onError }: { children: ReactNode; fallback: ReactNode; onError: (e: Error) => void }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const lastDay = useRef<string>('');

  const reload = useCallback(async () => {
    try {
      setSnap(await loadSnapshot());
    } catch (e) {
      onError(e as Error);
    }
  }, [onError]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await initializeProfile();
        if (alive) await reload();
      } catch (e) {
        onError(e as Error);
      }
    })();
    const off = onChange(() => void reload());
    // Qua ngày / quay lại tab: đánh giá lại trạng thái.
    const tick = async () => {
      const day = todayFor(Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (day !== lastDay.current || document.visibilityState === 'visible') {
        lastDay.current = day;
        try {
          await refreshStatuses();
        } catch {
          /* ignore */
        }
        void reload();
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVis);
    const iv = window.setInterval(tick, 60000);
    return () => {
      alive = false;
      off();
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(iv);
    };
  }, [reload, onError]);

  if (!snap) return <>{fallback}</>;
  return <Ctx.Provider value={{ snap, reload }}>{children}</Ctx.Provider>;
}

export function openExperiment(experiments: Experiment[]): Experiment | undefined {
  return experiments.find((e) => e.status === 'active' || e.status === 'awaiting_reflection');
}

export function useRoute(): string[] {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
}

export function useQuery(): URLSearchParams {
  useRoute();
  const q = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(q);
}

export function go(path: string) {
  window.location.hash = path.startsWith('/') ? path : `/${path}`;
}
