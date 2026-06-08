import { initializeApp } from 'firebase/app'
import { getDatabase, ref, set, onValue, get } from 'firebase/database'

// ─── REPLACE THIS with your Firebase project config ───────────────────────────
// Steps:
// 1. Go to console.firebase.google.com → Create project (skip Analytics)
// 2. Build → Realtime Database → Create database → Start in test mode
// 3. Project Settings → Your apps → Add web app → copy the config object below
const firebaseConfig = {
  apiKey: "AIzaSyDRtv1uUGZCgDgW-cKTFW9yWCkgZj4A7w8",
  authDomain: "marblebagm.firebaseapp.com",
  databaseURL: "https://marblebagm-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "marblebagm",
  storageBucket: "marblebagm.firebasestorage.app",
  messagingSenderId: "709943726158",
  appId: "1:709943726158:web:3c71b577adf56383c8731f",
}
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig)
const db = getDatabase(app)
const STATE_REF = ref(db, 'the-bag-v2')

export async function storageSave(state) {
  try {
    await set(STATE_REF, state)
    return true
  } catch {
    return false
  }
}

export async function storageLoad() {
  try {
    const snap = await Promise.race([
      get(STATE_REF),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ])
    return snap && snap.exists ? (snap.exists() ? snap.val() : null) : null
  } catch {
    return null
  }
}

// Real-time listener — call once on mount, returns unsubscribe fn
export function subscribeToState(callback) {
  return onValue(STATE_REF, (snap) => {
    callback(snap.exists() ? snap.val() : null)
  })
}
