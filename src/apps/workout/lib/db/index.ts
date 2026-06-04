import { LocalRepository } from "./local";
import type { Repository } from "./repository";

export * from "./types";
export * from "./repository";

const hasSupabase =
  !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export const STORAGE_MODE: "local" | "cloud" = hasSupabase ? "cloud" : "local";

let instance: Repository | null = null;

/**
 * Returns the active data adapter. Defaults to local IndexedDB storage; when
 * Supabase credentials are present the cloud adapter is used instead.
 * The cloud adapter lands in the cloud-sync milestone — see supabase/migrations.
 */
export function getRepository(): Repository {
  if (!instance) {
    // if (hasSupabase) instance = new SupabaseRepository();
    instance = new LocalRepository();
  }
  return instance;
}
