import type { Client, Order, Profile, Sector } from "@/lib/pcp-types";

const DB_NAME = "publicolor-pcp-offline";
const STORE_NAME = "snapshots";
const DB_VERSION = 1;
const SNAPSHOT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export type OfflinePcpSnapshot = {
  userId: string;
  savedAt: string;
  orders: Order[];
  sectors: Sector[];
  clients: Client[];
  profiles: Profile[];
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Falha ao abrir o armazenamento offline."));
  });
}

export async function saveOfflineSnapshot(snapshot: OfflinePcpSnapshot) {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(snapshot);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Falha ao salvar os dados offline."));
  });
  database.close();
}

export async function loadOfflineSnapshot(userId: string) {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  const snapshot = await new Promise<OfflinePcpSnapshot | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve((request.result as OfflinePcpSnapshot | undefined) || null);
    request.onerror = () => reject(request.error || new Error("Falha ao ler os dados offline."));
  });
  database.close();
  if (!snapshot) return null;
  const age = Date.now() - new Date(snapshot.savedAt).getTime();
  if (age > SNAPSHOT_MAX_AGE) return null;
  return { ...snapshot, profiles: snapshot.profiles || [] };
}
