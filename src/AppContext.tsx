import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, errorMessage, refreshData } from './lib/api';
import { cacheRead, cacheWrite, markNotificationsRead as persistNotificationsRead, notificationList, pendingDelete, pendingList, pendingSave, saveNotification, type AppNotification, type PendingRequest } from './lib/storage';
import { useOnline, useRemote } from './lib/hooks';
import { postingSector } from './lib/location';
import type { Area, Catalogs, HelpRequest, RequestInput, Sector, User } from './types';

function storedUser(): User | null { try { return JSON.parse(sessionStorage.getItem('ayni-user') || 'null'); } catch { return null; } }
function storeUser(user: User | null) { try { if (user) sessionStorage.setItem('ayni-user', JSON.stringify(user)); else sessionStorage.removeItem('ayni-user'); } catch { /* Session persistence is optional. */ } }
type AppState = {
  user: User | null; online: boolean; sessionLoading: boolean; sessionError: string;
  setUser: (user: User | null) => void; requireUser: () => boolean; authOpen: boolean; setAuthOpen: (value: boolean) => void;
  postingSectorId: string; catalogs: ReturnType<typeof useRemote<Catalogs>>;
  area: Area; setArea: (area: Area) => void; notify: (text: string) => void;
  pending: PendingRequest[]; syncing: boolean; sync: () => Promise<void>; refreshPending: () => Promise<void>;
  notifications: AppNotification[]; notificationsError: string; unreadNotifications: number; markNotificationsRead: () => void;
  submitRequest: (body: RequestInput) => Promise<'published' | 'pending'>;
};
const Context = createContext<AppState | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, updateUser] = useState<User | null>(storedUser);
  const userRef = useRef(user); userRef.current = user;
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [serverNotifications, setServerNotifications] = useState<{ ownerId: string; items: AppNotification[] } | null>(null);
  const [notificationsError, setNotificationsError] = useState('');
  const online = useOnline();
  const sectors = useRemote<Sector[]>('/sectores');
  // Retain the legacy database association without asking users to select a sector.
  const postingSectorId = postingSector(user?.sectorId, sectors.data);
  const catalogs = useRemote<Catalogs>('/catalogos');
  const [area, setArea] = useState<Area>({ coordinates: user?.latitud != null && user.longitud != null ? { latitude: Number(user.latitud), longitude: Number(user.longitud) } : null, radius: 1000 });
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const setUser = useCallback((value: User | null) => {
    const previous = userRef.current;
    updateUser(value); userRef.current = value; storeUser(value); setSessionError('');
    if (value && (previous?.id !== value.id || previous.latitud !== value.latitud || previous.longitud !== value.longitud)) {
      setArea(current => ({ ...current, coordinates: value.latitud != null && value.longitud != null ? { latitude: Number(value.latitud), longitude: Number(value.longitud) } : null }));
    } else if (!value && previous) setArea({ coordinates: null, radius: 1000 });
  }, []);
  useEffect(() => {
    let active = true;
    setSessionLoading(true);
    api<User>('/auth/me').then(value => { if (active) setUser(value); }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) setUser(null);
      else setSessionError(errorMessage(error));
    }).finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, [online, setUser]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 5000); return () => window.clearTimeout(timeout); }, [toast]);
  useEffect(() => {
    let active = true;
    const ownerId = user?.id;
    setNotifications([]);
    if (ownerId) void notificationList(ownerId).then(value => {
      if (active && userRef.current?.id === ownerId) setNotifications(value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.id]);
  useEffect(() => {
    const ownerId = user?.id;
    if (!ownerId || sessionLoading) return;
    let active = true, fetching = false;
    const controller = new AbortController();
    const key = `${ownerId}:/notificaciones`;
    const receive = async () => {
      if (fetching || !active) return;
      fetching = true;
      try {
        const items = await api<AppNotification[]>('/notificaciones', { signal: controller.signal, expectedUserId: ownerId });
        if (!active || userRef.current?.id !== ownerId) return;
        setServerNotifications({ ownerId, items }); setNotificationsError('');
        await cacheWrite(key, items).catch(() => undefined);
      } catch (error) {
        if (!active || userRef.current?.id !== ownerId) return;
        setNotificationsError(errorMessage(error));
        if (error instanceof ApiError && ([401, 403].includes(error.status) || error.code === 'SESSION_CHANGED')) { setServerNotifications(null); return; }
        const cached = await cacheRead<AppNotification[]>(key).catch(() => undefined);
        if (active && cached) setServerNotifications(current => current?.ownerId === ownerId ? current : { ownerId, items: cached.data });
      } finally { fetching = false; }
    };
    void receive();
    const refresh = () => { if (document.visibilityState === 'visible') void receive(); };
    const timer = online ? window.setInterval(refresh, 20_000) : undefined;
    window.addEventListener('focus', refresh); window.addEventListener('ayni:refresh', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('ayni:refresh', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [user?.id, online, sessionLoading]);
  const notify = useCallback((text: string) => {
    setToast(text);
    const ownerId = userRef.current?.id;
    if (!ownerId) return;
    const notification: AppNotification = { id: crypto.randomUUID(), ownerId, text, createdAt: new Date().toISOString(), read: false };
    setNotifications(current => userRef.current?.id === ownerId ? [notification, ...current].slice(0, 100) : current);
    void saveNotification(notification).then(() => notificationList(ownerId)).then(value => {
      if (userRef.current?.id === ownerId) setNotifications(value);
    }).catch(() => undefined);
  }, []);
  const markRead = useCallback(() => {
    const ownerId = userRef.current?.id;
    if (!ownerId) return;
    setNotifications(current => current.map(item => item.ownerId === ownerId ? { ...item, read: true } : item));
    void persistNotificationsRead(ownerId).catch(() => undefined);
    const items = serverNotifications && serverNotifications.ownerId === ownerId ? serverNotifications.items : [];
    const ids = items.filter(item => !item.read).map(item => item.id);
    if (ownerId && ids.length) void api('/notificaciones/leidas', { method: 'POST', body: { ids }, expectedUserId: ownerId }).then(() => {
      if (userRef.current?.id !== ownerId) return;
      setServerNotifications(current => current?.ownerId === ownerId ? { ...current, items: current.items.map(item => ids.includes(item.id) ? { ...item, read: true } : item) } : current);
      refreshData();
    }).catch(error => { if (userRef.current?.id === ownerId) setNotificationsError(errorMessage(error)); });
  }, [serverNotifications]);
  const refreshPending = useCallback(async () => { const owner = userRef.current?.id; if (!owner) { setPending([]); return; } const list = await pendingList(owner).catch(() => []); if (owner === userRef.current?.id) setPending(list); }, []);
  useEffect(() => { void refreshPending(); }, [user?.id, refreshPending]);
  const sync = useCallback(async () => {
    const owner = userRef.current?.id;
    if (!navigator.onLine || !owner || syncingRef.current) return;
    syncingRef.current = true; setSyncing(true);
    try {
      const identity = await api<User>('/auth/me');
      if (identity.id !== owner || userRef.current?.id !== owner) return;
      const entries = await pendingList(owner);
      let published = 0;
      for (const entry of entries) {
        if (userRef.current?.id !== owner || entry.blocked) continue;
        try {
          await api<HelpRequest>('/solicitudes', { method: 'POST', body: entry.body, expectedUserId: owner });
          await pendingDelete(entry.id); published++;
        } catch (error) {
          await pendingSave({ ...entry, error: errorMessage(error), blocked: error instanceof ApiError && !error.temporary && error.status !== 401 && error.code !== 'SESSION_CHANGED' });
          if (!(error instanceof ApiError) || error.temporary || error.status === 401) break;
        }
      }
      if (published) { setToast(`${published === 1 ? 'Tu pedido se publicó' : `${published} pedidos se publicaron`} al recuperar conexión`); refreshData(); }
    } catch (error) { setSessionError(errorMessage(error)); }
    finally { syncingRef.current = false; setSyncing(false); await refreshPending(); }
  }, [refreshPending]);
  useEffect(() => { if (online && user && !sessionLoading) void sync(); }, [online, user?.id, sessionLoading, sync]);
  useEffect(() => { if (!online || !user) return; const timer = window.setInterval(() => { void sync(); }, 45000); return () => window.clearInterval(timer); }, [online, user?.id, sync]);
  const submitRequest = async (body: RequestInput): Promise<'published' | 'pending'> => {
    const owner = userRef.current?.id;
    if (!owner) throw new Error('Inicia sesión para publicar tu pedido.');
    const entry: PendingRequest = { id: `${owner}:${body.clientRequestId}`, ownerId: owner, body, createdAt: new Date().toISOString() };
    // Persist before the first attempt so a reload cannot lose the idempotency key.
    await pendingSave(entry);
    if (!navigator.onLine) { await refreshPending(); return 'pending'; }
    try {
      await api<HelpRequest>('/solicitudes', { method: 'POST', body, expectedUserId: owner });
      await pendingDelete(entry.id); await refreshPending(); refreshData(); return 'published';
    } catch (error) {
      if (error instanceof ApiError && (error.temporary || error.code === 'SESSION_CHANGED' || error.status === 401)) { await pendingSave({ ...entry, error: error.message }); await refreshPending(); return 'pending'; }
      await pendingDelete(entry.id); await refreshPending(); throw error;
    }
  };
  const allNotifications = [...notifications, ...(user && serverNotifications?.ownerId === user.id ? serverNotifications.items : [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100);
  const unreadNotifications = allNotifications.filter(item => !item.read).length;
  return <Context.Provider value={{ user, setUser, online, sessionLoading, sessionError, requireUser: () => { if (user) return true; setAuthOpen(true); return false; }, authOpen, setAuthOpen, postingSectorId, catalogs, area, setArea, notify, pending, syncing, sync, refreshPending, notifications: allNotifications, notificationsError: user ? notificationsError : '', unreadNotifications, markNotificationsRead: markRead, submitRequest }}>
    {children}{toast && <div className="toast" role="status">{toast}</div>}
  </Context.Provider>;
}
export function useApp() { const state = useContext(Context); if (!state) throw new Error('AYNI context missing'); return state; }
