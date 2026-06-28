import { supabase } from '@/lib/supabase'

// Supabase-backed storage for "The Bag", replacing the old Firebase Realtime
// Database. Same three-function surface (storageSave / storageLoad /
// subscribeToState) so TheBag.jsx is unchanged apart from this import.
//
// The whole app state is one JSON blob kept in a single shared row
// (marblebag.state, id = 1), gated by RLS via public.is_allowed(). Because
// read and write are governed by the SAME policy, a permission problem blocks
// both — so a failed load can never be followed by a successful overwrite.
// That structurally rules out the silent-wipe failure mode the Firebase
// (asymmetric, time-expiring test-mode rules) setup had.

const TABLE = 'state'
const ROW_ID = 1

function db() {
  if (!supabase) throw new Error('Supabase client not configured')
  return supabase.schema('marblebag')
}

export async function storageSave(state) {
  try {
    const { error } = await db()
      .from(TABLE)
      .upsert(
        { id: ROW_ID, data: state, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      )
    return !error
  } catch {
    return false
  }
}

export async function storageLoad() {
  try {
    const { data, error } = await db()
      .from(TABLE)
      .select('data')
      .eq('id', ROW_ID)
      .maybeSingle()
    if (error) return null
    return data ? data.data : null
  } catch {
    return null
  }
}

// Realtime listener — call once on mount, returns an unsubscribe fn.
// Fires once with the current state (or null if the row doesn't exist yet),
// then again on every cross-device change. Throws synchronously if Supabase
// isn't configured so the caller's try/catch can fall back to localStorage.
export function subscribeToState(callback) {
  if (!supabase) throw new Error('Supabase client not configured')
  let cancelled = false

  // Initial load. Only call back on a definite result; on a transient error we
  // stay silent so the caller never initialises (and thus never auto-saves)
  // from a failed read.
  db()
    .from(TABLE)
    .select('data')
    .eq('id', ROW_ID)
    .maybeSingle()
    .then(({ data, error }) => {
      if (cancelled || error) return
      callback(data ? data.data : null)
    })

  const channel = supabase
    .channel('marblebag-state')
    .on(
      'postgres_changes',
      { event: '*', schema: 'marblebag', table: TABLE },
      (payload) => {
        if (cancelled) return
        const row = payload.new
        if (row && 'data' in row) callback(row.data)
      },
    )
    .subscribe()

  return () => {
    cancelled = true
    supabase.removeChannel(channel)
  }
}
