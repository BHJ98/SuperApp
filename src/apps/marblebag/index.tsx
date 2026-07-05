import { useState } from 'react'
import TheBag from './TheBag.jsx'

const PASSWORD = import.meta.env.VITE_MARBLEBAG_PASSWORD as string | undefined

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (input === PASSWORD) {
      sessionStorage.setItem('marblebag-unlocked', '1')
      onUnlock()
    } else {
      setError(true)
      setInput('')
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#08080d',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20,
    }}>
      <div style={{ fontSize: 36 }}>🔒</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <input
          type="password"
          value={input}
          onChange={e => { setInput(e.target.value); setError(false) }}
          placeholder="Password"
          autoFocus
          style={{
            background: '#12121f', border: `1.5px solid ${error ? '#ef4444' : '#2a2a4a'}`,
            borderRadius: 8, color: '#e0e0ff', padding: '11px 18px',
            fontSize: 16, outline: 'none', width: 220,
          }}
        />
        {error && <div style={{ color: '#ef4444', fontSize: 13 }}>Incorrect password</div>}
        <button
          type="submit"
          style={{
            background: '#3b82f6', border: 'none', borderRadius: 8,
            color: '#fff', padding: '11px 0', fontSize: 15,
            cursor: 'pointer', width: '100%',
          }}
        >
          Unlock
        </button>
      </form>
    </div>
  )
}

export default function Marblebag() {
  const needsPassword = Boolean(PASSWORD)
  const [unlocked, setUnlocked] = useState(
    () => !needsPassword || sessionStorage.getItem('marblebag-unlocked') === '1'
  )

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />

  return (
    <div className="-mx-4 -mt-4">
      <TheBag />
    </div>
  )
}
