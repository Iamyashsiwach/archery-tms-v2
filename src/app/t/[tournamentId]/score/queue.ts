"use client";

import type { QueuedEnd } from "./types";

// Ends wait here until the server has them. IndexedDB survives a closed tab,
// a dead battery and a reload with no signal; localStorage would too, but can
// be cleared under storage pressure on some phones and has no transactions.

const DB = "archery-tms";
const STORE = "ends";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Resolves when the transaction has committed, not when the request succeeds:
// a reload or a killed tab straight after "Save end" must not lose the end.
// Strict durability asks the browser to flush writes to disk before that.
async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode, { durability: mode === "readwrite" ? "strict" : "default" });
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = t.onabort = () => reject(t.error ?? req.error);
  });
}

export const queue = {
  all: (tournamentId: string) =>
    tx<QueuedEnd[]>("readonly", (s) => s.getAll()).then((items) => items.filter((i) => i.tournament_id === tournamentId)),
  put: (item: QueuedEnd) => tx("readwrite", (s) => s.put(item)),
  remove: (id: string) => tx("readwrite", (s) => s.delete(id)),
};
