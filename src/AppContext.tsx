import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, errorMessage, refreshData } from './lib/api';
import { pendingDelete, pendingList, pendingSave, type PendingRequest } from './lib/storage';
import { useOnline, useRemote } from './lib/hooks';
import type { Area, Catalogs, HelpRequest, RequestInput, Sector, User } from './types';

function storedUser(): User | null { try { return JSON.parse(sessionStorage.getItem('ayni-user') || 'null'); } catch { return null; } }
function storeUser(user: User | null) { try { if (user) sessionStorage.setItem('ayni-user', JSON.stringify(user)); else sessionStorage.removeItem('ayni-user'); } catch { /* Session persistence is optional. */ } }
type AppState = {
  user: User | null; online: boolean; sessionLoading: boolean; sessionError: string;
  setUser: (user: User | null) => void; requireUser: () => boolean; authOpen: boolean; setAuthOpen: (value: boolean) => void;
  sectors: ReturnType<typeof useRemote<Sector[]>>; catalogs: ReturnType<typeof useRemote<Catalogs>>;
  area: Area; setArea: (area: Area) => void; notify: (text: string) => void;
  pending: PendingRequest[]; syncing: boolean; sync: () => Promise<void>; refreshPending: () => Promise<void>;
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
  const online = useOnline();
  const sectors = useRemote<Sector[]>('/sectores');
  const catalogs = useRemote<Catalogs>('/catalogos');
  const [area, setArea] = useState<Area>({ sectorId: user?.sectorId || '', coordinates: null, radius: 1000 });
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const setUser = useCallback((value: User | null) => { updateUser(value); userRef.current = value; storeUser(value); setSessionError(''); if (value?.sectorId) setArea(current => ({ ...current, sectorId: value.sectorId! })); }, []);
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
  return <Context.Provider value={{ user, setUser, online, sessionLoading, sessionError, requireUser: () => { if (user) return true; setAuthOpen(true); return false; }, authOpen, setAuthOpen, sectors, catalogs, area, setArea, notify: setToast, pending, syncing, sync, refreshPending, submitRequest }}>
    {children}{toast && <div className="toast" role="status">{toast}</div>}
  </Context.Provider>;
}
export function useApp() { const state = useContext(Context); if (!state) throw new Error('AYNI context missing'); return state; }
