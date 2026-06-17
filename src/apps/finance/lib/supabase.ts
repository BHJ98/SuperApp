import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as shellSupabase } from "@/lib/supabase";

// Finance runs only behind the shell's AuthGate + isSupabaseConfigured check,
// so the shared client is guaranteed to exist here. These helpers expose it as
// a non-null client so the ported pages don't need null-guards everywhere.
export const supabase = shellSupabase as SupabaseClient;

export function createClient(): SupabaseClient {
  return shellSupabase as SupabaseClient;
}
