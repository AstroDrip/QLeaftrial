// A very small promise wrapper over IndexedDB: one database, one object store, values kept by string key.
// IndexedDB can be missing (old browsers), blocked (some private modes) or simply never answer, so every call
// either resolves in good time or rejects; callers decide what to do without it.
const OPEN_TIMEOUT_MS = 3_000;
const open = new Map<string, Promise<IDBDatabase>>();

export function idbSupported(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function database(name: string, store: string): Promise<IDBDatabase> {
  const key = `${name}/${store}`;
  const existing = open.get(key);
  if (existing) return existing;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!idbSupported()) { reject(new Error("IndexedDB is not available")); return; }
    const timer = setTimeout(() => reject(new Error("IndexedDB did not open")), OPEN_TIMEOUT_MS);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, 1);
    } catch (error) {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error("IndexedDB could not be opened"));
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      // Another tab upgrading or the browser clearing storage closes it; the next call opens a fresh one.
      db.onversionchange = () => { db.close(); open.delete(key); };
      db.onclose = () => open.delete(key);
      resolve(db);
    };
    request.onerror = () => { clearTimeout(timer); reject(request.error ?? new Error("IndexedDB could not be opened")); };
    request.onblocked = () => { clearTimeout(timer); reject(new Error("IndexedDB is blocked")); };
  });
  open.set(key, opening);
  opening.catch(() => open.delete(key));
  return opening;
}

async function run<T>(name: string, store: string, mode: IDBTransactionMode, work: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database(name, store);
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(store, mode);
    } catch (error) {
      open.delete(`${name}/${store}`);
      reject(error instanceof Error ? error : new Error("IndexedDB transaction failed"));
      return;
    }
    const request = work(transaction.objectStore(store));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    // A write counts only once its transaction has completed: that is when the data is really on the device.
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB request failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export const idbGet = <T>(name: string, store: string, key: string) => run<T | undefined>(name, store, "readonly", (objects) => objects.get(key) as IDBRequest<T | undefined>);
export const idbSet = (name: string, store: string, key: string, value: unknown) => run(name, store, "readwrite", (objects) => objects.put(value, key)).then(() => undefined);
export const idbDelete = (name: string, store: string, key: string) => run(name, store, "readwrite", (objects) => objects.delete(key)).then(() => undefined);
export const idbAll = <T>(name: string, store: string) => run<T[]>(name, store, "readonly", (objects) => objects.getAll() as IDBRequest<T[]>);

/** For tests: forget open connections so a replaced or reset IndexedDB is picked up. */
export function resetIdbForTests(): void {
  for (const pending of open.values()) pending.then((db) => db.close()).catch(() => undefined);
  open.clear();
}
