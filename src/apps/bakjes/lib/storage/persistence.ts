import { supabase } from "@/lib/supabase";
import type { AppData } from "../types";
import { appDataSchema, emptyAppData } from "../types";

// Persistence replacement for the original Drive-sync layer.
// One JSONB row per user in bakjes.app_data, mirroring the original AppData
// blob. Same write-debounce model so typing in the UI doesn't fire a request
// per keystroke.

export type SyncStatus = "opgeslagen" | "bezig" | "fout" | "offline";

function db() {
  if (!supabase) throw new Error("Supabase client not configured");
  return supabase.schema("bakjes");
}

async function currentUserId(): Promise<string> {
  if (!supabase) throw new Error("Supabase client not configured");
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Niet ingelogd.");
  return id;
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushed = 0;
let latestData: AppData | null = null;
let currentStatus: SyncStatus = "offline";
let listeners: Array<(data: AppData) => void> = [];
let statusListeners: Array<(s: SyncStatus) => void> = [];

export function subscribeSync(fn: (data: AppData) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  statusListeners.push(fn);
  fn(currentStatus);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== fn);
  };
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

function setSyncStatus(s: SyncStatus) {
  if (s === currentStatus) return;
  currentStatus = s;
  for (const l of statusListeners) l(s);
}

function emit(data: AppData) {
  for (const l of listeners) l(data);
}

export async function loadFromServer(): Promise<AppData> {
  const userId = await currentUserId();
  const { data, error } = await db()
    .from("app_data")
    .select("data")
    .eq("user_id", userId)
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { data: unknown }[];
  if (rows.length === 0) return emptyAppData();
  return appDataSchema.parse(rows[0].data);
}

async function saveToServer(data: AppData): Promise<void> {
  const userId = await currentUserId();
  const { error } = await db()
    .from("app_data")
    .upsert({ user_id: userId, data });
  if (error) throw new Error(error.message);
}

export async function boot(): Promise<{ data: AppData; source: "server" | "empty" }> {
  setSyncStatus("bezig");
  try {
    const remote = await loadFromServer();
    latestData = remote;
    emit(remote);
    setSyncStatus("opgeslagen");
    const hasContent =
      remote.bakjes.length +
        remote.regels.length +
        Object.keys(remote.assignments).length >
      0;
    return { data: remote, source: hasContent ? "server" : "empty" };
  } catch (err) {
    console.warn("Kon Bakjes-data niet laden.", err);
    setSyncStatus("fout");
    const empty = emptyAppData();
    latestData = empty;
    emit(empty);
    return { data: empty, source: "empty" };
  }
}

export async function mutate(updater: (prev: AppData) => AppData): Promise<AppData> {
  const prev = latestData ?? emptyAppData();
  const next: AppData = { ...updater(prev), laatstGeupdatet: new Date().toISOString() };
  latestData = next;
  emit(next);
  schedulePush(next);
  return next;
}

function schedulePush(data: AppData) {
  setSyncStatus("bezig");
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    pushNow(data).catch((err) => {
      console.warn("Push naar Supabase mislukt (retry bij volgende mutatie).", err);
      setSyncStatus("fout");
    });
  }, 1000);
}

async function pushNow(data: AppData): Promise<void> {
  const ts = Date.parse(data.laatstGeupdatet || "") || 0;
  if (ts <= lastPushed) {
    setSyncStatus("opgeslagen");
    return;
  }
  setSyncStatus("bezig");
  await saveToServer(data);
  lastPushed = ts;
  setSyncStatus("opgeslagen");
}

export async function forcePush(): Promise<void> {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (!latestData) return;
  await pushNow(latestData);
}

/** Direct overwrite (used by backup import). Skips the debounce. */
export async function replaceAll(next: AppData): Promise<void> {
  const stamped: AppData = { ...next, laatstGeupdatet: new Date().toISOString() };
  latestData = stamped;
  emit(stamped);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  setSyncStatus("bezig");
  await saveToServer(stamped);
  lastPushed = Date.parse(stamped.laatstGeupdatet) || 0;
  setSyncStatus("opgeslagen");
}
