import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';
import { cacheRead, cacheWrite } from './storage';
import type { Area } from '../types';

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
  useEffect(() => { window.addEventListener('ayni:refresh', reload); window.addEventListener('online', reload); return () => { window.removeEventListener('ayni:refresh', reload); window.removeEventListener('online', reload); }; }, [reload]);
  useEffect(() => {
    if (!path) { setData(null); setLoading(false); setError(''); return; }
    const controller = new AbortController();
    let active = true;
    const key = `${scope}:${path}`;
    if (currentKey.current !== key) setData(null);
    currentKey.current = key;
    setLoading(true); setError(''); setCachedAt(null);
    api<T>(path, { signal: controller.signal }).then(async value => {
      if (!active) return;
      setData(value);
      await cacheWrite(key, value).catch(() => undefined);
    }).catch(async error => {
      if (!active) return;
      setError(errorMessage(error));
      // Do not show private cached data after authorization was revoked.
      if (error?.status === 401 || error?.status === 403) { setData(null); return; }
      const cached = await cacheRead<T>(key).catch(() => undefined);
      if (active && cached) { setData(cached.data); setCachedAt(cached.savedAt); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [path, scope, version]);
  return { data, loading, error, cachedAt, reload };
}
export function areaQuery(area: Area) {
  const params = new URLSearchParams();
  if (area.coordinates) { params.set('latitud', String(area.coordinates.latitude)); params.set('longitud', String(area.coordinates.longitude)); params.set('radio', String(area.radius)); }
  else if (area.sectorId) params.set('sectorId', area.sectorId);
  return params;
}
export function useDebounced<T>(value: T, delay = 300) {
  const [result, setResult] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setResult(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return result;
}
