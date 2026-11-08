import { useState } from 'react'
import { useGame } from '../game/store'
import { findPlayerAccount, starterInventoryForClass, verifyPlayerLogin, verifyGmLogin } from '../game/playerAuthAndQuests'
import { backendMode, errorText, getBackend } from '../backend'

export function MainMenu() {
  const screen = useGame((s) => s.screen)
  const loginAsPlayer = useGame((s) => s.loginAsPlayer)
  const loginAsGm = useGame((s) => s.loginAsGm)

  const [loginMode, setLoginMode] = useState<'player' | 'gm'>('player')

  // Player Login state
  const [igUsername, setIgUsername] = useState('')
  const [pin, setPin] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // GM Login state (no name field, no default email)
  const [gmEmail, setGmEmail] = useState('')
  const [gmPassword, setGmPassword] = useState('')

  if (screen !== 'menu') return null

  const handlePlayerLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setBusy(true)
    try {
      if (backendMode === 'supabase') {
        const identity = await (await getBackend()).authenticatePlayer(igUsername, pin)
        const existing = findPlayerAccount(identity.instagram)
        const account = existing ?? {
          instagram: identity.instagram, displayName: identity.displayName, pin: '', cls: 'Warrior' as const,
          classLocked: false, follows: true, online: true, xp: 45, gold: 100,
          inventory: starterInventoryForClass('Warrior'), createdAt: new Date().toISOString(),
        }
        const defaultPlayerName = identity.displayName || account.displayName || account.cls
        loginAsPlayer({ ...account, instagram: identity.instagram, displayName: defaultPlayerName, pin: '', online: true })
      } else {
        const res = verifyPlayerLogin(igUsername, pin)
        if (!res.ok || !res.account) {
          setErrorMsg(res.error ?? 'Gagal login.')
          return
        }
        const acc = res.account
        const defaultPlayerName = acc.displayName && acc.displayName !== 'Guild Master' ? acc.displayName : acc.cls
        loginAsPlayer({ ...acc, displayName: defaultPlayerName })
      }
    } catch (err) {
      setErrorMsg(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const handleGmLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    const email = gmEmail.trim()
    if (!email || !gmPassword) {
      setErrorMsg('Masukkan Email dan Password Guild Master yang terdaftar.')
      return
    }
    setBusy(true)
    try {
      const b = await getBackend()
      if (backendMode === 'supabase') {
        await b.signInWithPassword(email, gmPassword)
        const sess = await b.session()
        if (!sess.isGuildMaster) {
          await b.signOut()
          setErrorMsg('Email ini tidak terdaftar sebagai Guild Master di database.')
          return
        }
        loginAsGm()
      } else {
        const res = verifyGmLogin(email, gmPassword)
        if (!res.ok) {
          setErrorMsg(res.error ?? 'Gagal login GM.')
          return
        }
        loginAsGm()
      }
    } catch (err) {
      setErrorMsg(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="menu">
      <div className="menu-card login-card">
        <div className="login-crest">⚔️ 🛡️ ✨</div>
        <p className="kicker">Cozy Low-Poly Guild RPG</p>
        <h1>
          Wanderer&apos;s <span>TALES</span>
        </h1>

        {loginMode === 'player' ? (
          <form onSubmit={handlePlayerLogin} className="login-form">
            <div className="login-field">
              <label htmlFor="ig-user">Username Instagram</label>
              <input
                id="ig-user"
                type="text"
                value={igUsername}
                placeholder="@username_kamu"
                autoComplete="username"
                onChange={(e) => {
                  setIgUsername(e.target.value)
                  setErrorMsg(null)
                }}
              />
            </div>

            <div className="login-field">
              <label htmlFor="ig-pin">PIN 6 Digit (dari DM)</label>
              <input
                id="ig-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                placeholder="••••••"
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                  setErrorMsg(null)
                }}
              />
            </div>

            {errorMsg && <div className="login-error">⚠️ {errorMsg}</div>}

            <button type="submit" className="login-submit-btn" disabled={busy}>
              {busy ? 'Memverifikasi...' : '⚔️ Masuk Dunia'}
            </button>

            <div className="dm-daftar-compact">
              <span>📩 Belum punya PIN?</span> Kirim DM <b className="dm-code">DAFTAR</b> ke{' '}
              <a href="https://instagram.com/wandertales.guild" target="_blank" rel="noreferrer">
                @wandertales.guild
              </a>
              <p>Kamu lupa PIN? Kirim <b className="dm-code">LUPA PIN</b> melalui DM Instagram yang sama.</p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleGmLogin} className="login-form">
            <div className="gm-mode-badge">👑 Login Guild Master</div>

            <div className="login-field">
              <label htmlFor="gm-email">Email Guild Master</label>
              <input
                id="gm-email"
                type="email"
                value={gmEmail}
                placeholder="Masukkan email terdaftar"
                autoComplete="email"
                onChange={(e) => {
                  setGmEmail(e.target.value)
                  setErrorMsg(null)
                }}
              />
            </div>

            <div className="login-field">
              <label htmlFor="gm-pass">Password</label>
              <input
                id="gm-pass"
                type="password"
                value={gmPassword}
                placeholder="••••••••"
                autoComplete="current-password"
                onChange={(e) => {
                  setGmPassword(e.target.value)
                  setErrorMsg(null)
                }}
              />
            </div>

            {errorMsg && <div className="login-error">⚠️ {errorMsg}</div>}

            <button type="submit" className="login-submit-btn" disabled={busy}>
              {busy ? 'Memverifikasi...' : '👑 Masuk sebagai GM'}
            </button>
          </form>
        )}

        {/* Small button at bottom to switch between Player login and GM login */}
        <div className="login-bottom-bar">
          {loginMode === 'player' ? (
            <button
              type="button"
              className="login-sub-btn gm-btn"
              onClick={() => {
                setLoginMode('gm')
                setErrorMsg(null)
              }}
            >
              🔑 Login as GM
            </button>
          ) : (
            <button
              type="button"
              className="login-sub-btn"
              onClick={() => {
                setLoginMode('player')
                setErrorMsg(null)
              }}
            >
              ← Kembali ke Login Player
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
