import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';
import { cacheDelete, cacheRead, cacheWrite } from './storage';
export { areaQuery } from './location';

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  return online;
}
export function useRemote<T>(path: string | null, scope = 'public') {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState('');
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const currentKey = useRef('');
  const reload = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => { window.addEventListener('ayni:refresh', reload); window.addEventListener('online', reload); window.addEventListener('offline', reload); return () => { window.removeEventListener('ayni:refresh', reload); window.removeEventListener('online', reload); window.removeEventListener('offline', reload); }; }, [reload]);
  useEffect(() => {
    if (!path) { setData(null); setLoading(false); setError(''); return; }
    const controller = new AbortController();
    let active = true;
    const key = `${scope}:${path}`;
    if (currentKey.current !== key) setData(null);
    currentKey.current = key;
    setLoading(true); setError(''); setCachedAt(null);
    if (!navigator.onLine) {
      void cacheRead<T>(key).catch(() => undefined).then(cached => {
        if (!active) return;
        setData(cached?.data ?? null); setCachedAt(cached?.savedAt ?? null); setLoading(false);
        setError(cached ? '' : 'Todavía no hay información guardada para esta vista. Ábrela con conexión primero.');
      });
      return () => { active = false; controller.abort(); };
    }
    api<T>(path, { signal: controller.signal, expectedUserId: /^[1-9]\d{0,19}$/.test(scope) ? scope : undefined }).then(async value => {
      if (!active) return;
      setData(value);
      await cacheWrite(key, value).catch(() => undefined);
    }).catch(async error => {
      if (!active) return;
      setError(errorMessage(error));
      // Do not show private cached data after authorization was revoked.
      if ([401, 403, 404].includes(error?.status) || error?.code === 'SESSION_CHANGED') { setData(null); await cacheDelete(key).catch(() => undefined); return; }
      if (error?.status >= 400 && error?.status < 500 && error?.status !== 429) { setData(null); return; }
      const cached = await cacheRead<T>(key).catch(() => undefined);
      if (active && cached) { setData(cached.data); setCachedAt(cached.savedAt); if (error?.status === 0) setError(''); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [path, scope, version]);
  const current = path != null && currentKey.current === `${scope}:${path}`;
  return { data: current ? data : null, loading: path != null && (!current || loading), error: current ? error : '', cachedAt: current ? cachedAt : null, reload };
}
export function useDebounced<T>(value: T, delay = 300) {
  const [result, setResult] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setResult(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return result;
}
