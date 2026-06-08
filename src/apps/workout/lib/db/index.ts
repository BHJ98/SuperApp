import { LocalRepository } from "./local";
import { SupabaseRepository } from "./supabase";
import type { Repository } from "./repository";

export * from "./types";
export * from "./repository";

const hasSupabase =
  !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

// Cloud sync for workout is opt-in: it requires the `workout` schema to exist in
// the host project (run migration/workout_schema.sql) AND the schema to be
// exposed in Settings -> API. Until both are done, leave VITE_WORKOUT_CLOUD
// unset so the proven IndexedDB backend keeps working. Flip to "1" to switch.
const useCloud = hasSupabase && import.meta.env.VITE_WORKOUT_CLOUD === "1";

export const STORAGE_MODE: "local" | "cloud" = useCloud ? "cloud" : "local";

let instance: Repository | null = null;

/**
 * Returns the active data adapter. Defaults to local IndexedDB storage; when
 * cloud sync is enabled (see VITE_WORKOUT_CLOUD) the Supabase adapter is used,
 * giving both phones one shared dataset.
 */
export function getRepository(): Repository {
  if (!instance) {
    instance = useCloud ? new SupabaseRepository() : new LocalRepository();
  }
  return instance;
}
