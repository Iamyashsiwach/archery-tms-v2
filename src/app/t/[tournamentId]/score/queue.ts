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

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const queue = {
  all: (tournamentId: string) =>
    tx<QueuedEnd[]>("readonly", (s) => s.getAll()).then((items) => items.filter((i) => i.tournament_id === tournamentId)),
  put: (item: QueuedEnd) => tx("readwrite", (s) => s.put(item)),
  remove: (id: string) => tx("readwrite", (s) => s.delete(id)),
};
