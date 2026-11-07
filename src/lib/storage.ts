import type { RequestInput } from '../types';

type CacheRecord<T> = { key: string; data: T; savedAt: string };
export type PendingRequest = { id: string; ownerId: string; body: RequestInput; createdAt: string; error?: string; blocked?: boolean };
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('El almacenamiento local no está disponible en este navegador.')); return; }
    const request = indexedDB.open('ayni-local', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('cache', { keyPath: 'key' });
      request.result.createObjectStore('pending', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new Error('No se pudo abrir el almacenamiento local.')); };
  });
  return database;
}
async function operation<T>(store: 'cache' | 'pending', mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(new Error('No se pudo guardar en este dispositivo. Revisa el espacio disponible.'));
    transaction.onabort = transaction.onerror;
  });
}
export async function cacheRead<T>(key: string) { return operation<CacheRecord<T> | undefined>('cache', 'readonly', store => store.get(key)); }
export async function cacheWrite<T>(key: string, data: T) { await operation('cache', 'readwrite', store => store.put({ key, data, savedAt: new Date().toISOString() })); }
export async function pendingList(ownerId: string) { const records = await operation<PendingRequest[]>('pending', 'readonly', store => store.getAll()); return records.filter(item => item.ownerId === ownerId).sort((a,b) => a.createdAt.localeCompare(b.createdAt)); }
export async function pendingSave(record: PendingRequest) { await operation('pending', 'readwrite', store => store.put(record)); }
export async function pendingDelete(id: string) { await operation('pending', 'readwrite', store => store.delete(id)); }
