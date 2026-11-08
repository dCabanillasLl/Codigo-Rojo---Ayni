import type { RequestInput } from '../types';
import initSqlJs, { type Database } from 'sql.js';
import sqliteWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

type CacheRecord<T> = { key: string; data: T; savedAt: string };
export type PendingRequest = { id: string; ownerId: string; body: RequestInput; createdAt: string; error?: string; blocked?: boolean };
export type AppNotification = { id: string; ownerId: string; text: string; createdAt: string; read: boolean };
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

let sqliteFileDatabase: Promise<IDBDatabase> | undefined;
let sqlite: Promise<Database> | undefined;
let sqliteTail = Promise.resolve();
function openSqliteFileStore() {
  if (!sqliteFileDatabase) sqliteFileDatabase = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ayni-sqlite-file', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sqlite', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el archivo SQLite local.'));
  });
  return sqliteFileDatabase;
}
async function readSqliteFile() {
  const db = await openSqliteFileStore();
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    const request = db.transaction('sqlite', 'readonly').objectStore('sqlite').get('main');
    request.onsuccess = () => resolve(request.result?.bytes as Uint8Array | undefined);
    request.onerror = () => reject(new Error('No se pudo leer el archivo SQLite local.'));
  });
}
async function writeSqliteFile(bytes: Uint8Array) {
  const db = await openSqliteFileStore();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('sqlite', 'readwrite');
    transaction.objectStore('sqlite').put({ id: 'main', bytes });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('No se pudo persistir el archivo SQLite local.'));
    transaction.onabort = () => reject(new Error('Se canceló la persistencia SQLite.'));
  });
}
function persist(db: Database) { return writeSqliteFile(db.export()); }

function openSqlite() {
  if (!sqlite) sqlite = (async () => {
    const SQL = await initSqlJs({ locateFile: () => sqliteWasmUrl });
    const restored = await readSqliteFile();
    const db = new SQL.Database(restored ? new Uint8Array(restored) : undefined);
    db.run(`CREATE TABLE IF NOT EXISTS pending_requests (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload TEXT NOT NULL,
      created_at TEXT NOT NULL, blocked INTEGER NOT NULL DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', text TEXT NOT NULL,
      created_at TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0
    )`);
    // Keep histories from the shared device private. Legacy rows have no safe owner,
    // so leave them unassigned and never display them to an account.
    const notificationColumns = rows<{ name: string }>(db, 'PRAGMA table_info(notifications)');
    if (!notificationColumns.some(column => column.name === 'owner_id')) {
      db.run("ALTER TABLE notifications ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''");
      await persist(db);
    }
    // Move any requests saved by the previous IndexedDB queue into SQLite once.
    const legacy = await operation<PendingRequest[]>('pending', 'readonly', store => store.getAll());
    if (legacy.length) {
      for (const record of legacy) db.run(
        'INSERT OR IGNORE INTO pending_requests (id, owner_id, payload, created_at, blocked) VALUES (?, ?, ?, ?, ?)',
        [record.id, record.ownerId, JSON.stringify(record), record.createdAt, record.blocked ? 1 : 0],
      );
      await persist(db);
      await operation('pending', 'readwrite', store => store.clear());
    } else if (!restored) await persist(db);
    return db;
  })().catch(error => { sqlite = undefined; throw error; });
  return sqlite;
}
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const result = sqliteTail.then(action, action);
  sqliteTail = result.then(() => undefined, () => undefined);
  return result;
}
function write<T>(action: (db: Database) => T): Promise<T> {
  return serialized(async () => {
    const db = await openSqlite();
    db.run('BEGIN IMMEDIATE');
    try { const result = action(db); db.run('COMMIT'); await persist(db); return result; }
    catch (error) { try { db.run('ROLLBACK'); } catch { /* Transaction may already have committed. */ } throw error; }
  });
}
function read<T>(action: (db: Database) => T): Promise<T> { return serialized(async () => action(await openSqlite())); }
function rows<T>(db: Database, sql: string, params: (string | number | null)[] = []): T[] {
  const statement = db.prepare(sql); const result: T[] = [];
  try { statement.bind(params); while (statement.step()) result.push(statement.getAsObject() as T); }
  finally { statement.free(); }
  return result;
}

export async function pendingList(ownerId: string) {
  return read(db => rows<{ payload: string }>(db, 'SELECT payload FROM pending_requests WHERE owner_id = ? ORDER BY created_at ASC', [ownerId]).map(row => JSON.parse(row.payload) as PendingRequest));
}
export async function pendingSave(record: PendingRequest) {
  await write(db => db.run(`INSERT INTO pending_requests (id, owner_id, payload, created_at, blocked)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, blocked=excluded.blocked`,
  [record.id, record.ownerId, JSON.stringify(record), record.createdAt, record.blocked ? 1 : 0]));
}
export async function pendingDelete(id: string) { await write(db => db.run('DELETE FROM pending_requests WHERE id = ?', [id])); }
export async function saveNotification(notification: AppNotification) {
  await write(db => db.run(`INSERT INTO notifications (id, owner_id, text, created_at, is_read) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, text=excluded.text, created_at=excluded.created_at, is_read=excluded.is_read`,
  [notification.id, notification.ownerId, notification.text, notification.createdAt, notification.read ? 1 : 0]));
}
export async function notificationList(ownerId: string) {
  return read(db => rows<{ id: string; owner_id: string; text: string; created_at: string; is_read: number }>(db,
    'SELECT id, owner_id, text, created_at, is_read FROM notifications WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100', [ownerId])
    .map(item => ({ id: item.id, ownerId: item.owner_id, text: item.text, createdAt: item.created_at, read: item.is_read === 1 })));
}
export async function markNotificationsRead(ownerId: string) { await write(db => db.run('UPDATE notifications SET is_read = 1 WHERE owner_id = ? AND is_read = 0', [ownerId])); }
