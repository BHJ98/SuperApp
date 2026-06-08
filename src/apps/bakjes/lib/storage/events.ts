import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { AgendaEvent } from "../types";

// Calendar events live client-side: they're large (thousands of rows for a
// multi-year ICS export), regenerable from a fresh ICS upload, and don't need
// to survive a device reset. Sharing between devices would matter if we wanted
// cross-device calendar — for now each device re-imports its own ICS.

const DB_NAME = "superapp-bakjes";
const DB_VERSION = 1;

interface BakjesDB extends DBSchema {
  events: {
    key: string;
    value: AgendaEvent;
    indexes: { "by-start": string };
  };
}

let dbPromise: Promise<IDBPDatabase<BakjesDB>> | null = null;

function getDB(): Promise<IDBPDatabase<BakjesDB>> {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB alleen beschikbaar in de browser.");
  }
  if (!dbPromise) {
    dbPromise = openDB<BakjesDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("events")) {
          const store = db.createObjectStore("events", { keyPath: "uid" });
          store.createIndex("by-start", "start");
        }
      },
    });
  }
  return dbPromise;
}

export async function saveEvents(events: AgendaEvent[], replaceAll = false): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("events", "readwrite");
  if (replaceAll) await tx.objectStore("events").clear();
  for (const e of events) {
    await tx.objectStore("events").put(e);
  }
  await tx.done;
}

export async function allEvents(): Promise<AgendaEvent[]> {
  const db = await getDB();
  return db.getAll("events");
}

export async function eventsInRange(startIso: string, endIso: string): Promise<AgendaEvent[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(
    "events",
    "by-start",
    IDBKeyRange.upperBound(endIso),
  );
  return all.filter((e) => e.eind > startIso);
}

export async function clearEvents(): Promise<void> {
  const db = await getDB();
  await db.clear("events");
}
