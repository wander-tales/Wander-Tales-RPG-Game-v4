import { useEffect, useRef, useState } from 'react'
import { backendMode, errorText, getBackend, type CommunityResident, type FollowerListInfo, type Registration } from '../backend'
import { PERSONALITIES, randomAppearance } from '../game/avatar'
import { applyMembers, community, getVillagePopulation, setFollowerCount, setPlaceholders } from '../game/community'
import { hashHandle, parseFollowerExport } from '../game/followers'
import { RESIDENTS, type Appearance, type Personality } from '../game/residents.mock'
import { CLASSES, type GuildClass } from '../game/recruitment'
import {
  getPlayerAccounts,
  getPlayerTotalStats,
  getUploadedFollowersMeta,
  mergePlayerAccounts,
  regeneratePlayerPin,
  registerPlayerPin,
  removePlayerAccount,
  savePlayerAccounts,
  syncFollowersListWithAccounts,
  type PlayerAccount,
  type UploadedFollowersMeta,
} from '../game/playerAuthAndQuests'
import { useGame } from '../game/store'
import { AvatarEditor, AvatarPreview } from './AvatarEditor'

type Tab = 'pins' | 'pending' | 'residents' | 'add'

const DM_GUILD_HANDLE = 'wandertales.guild'

/** Write player accounts (username + PIN) to the database so players can log in from any device. */
async function pushAccounts(accounts: PlayerAccount[]): Promise<boolean> {
  if (!accounts.length) return true
  try {
    const b = await getBackend()
    await b.savePlayerAccounts(accounts)
    return true
  } catch (err) {
    useGame.getState().notify(`⚠️ Akun belum tersimpan ke database: ${errorText(err)}`)
    return false
  }
}

export function CommunityPanel({ close }: { close: () => void }) {
  useGame((s) => s.rev)
  const loggedIg = useGame((s) => s.loggedInstagram)
  const isDemo = useGame((s) => s.isDemoPlayer)
  const [tab, setTab] = useState<Tab>('pins')
  const [pendingRegs, setPendingRegs] = useState<Registration[]>([])
  const [members, setMembers] = useState<CommunityResident[]>([])
  const [followerInput, setFollowerInput] = useState(() => String(getVillagePopulation()))
  const [accounts, setAccounts] = useState<PlayerAccount[]>(() => getPlayerAccounts())
  const [uploadedMeta, setUploadedMeta] = useState<UploadedFollowersMeta | null>(() => getUploadedFollowersMeta())
  const [backendFollowerInfo, setBackendFollowerInfo] = useState<FollowerListInfo | null>(null)
  const [autoPinForFollowers, setAutoPinForFollowers] = useState(true)
  const [uploadingFollowers, setUploadingFollowers] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [newIg, setNewIg] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newClass, setNewClass] = useState<GuildClass>('Warrior')
  const [customPin, setCustomPin] = useState('')
  const g = useGame.getState()

  const refreshBackend = async () => {
    try {
      const b = await getBackend()
      const [p, m, fInfo] = await Promise.all([
        b.listRegistrations('pending').catch(() => []),
        b.listResidents().catch(() => []),
        b.followerListInfo().catch(() => null),
      ])
      setPendingRegs(p)
      setMembers(m)
      setBackendFollowerInfo(fInfo)
      if (backendMode === 'supabase') {
        const remote = await b.listPlayerAccounts().catch(() => null)
        if (remote) {
          // accounts made in this browser before they were saved to the database: save them now
          const inDb = new Set(remote.map((a) => a.instagram))
          const missing = getPlayerAccounts().filter((a) => !inDb.has(a.instagram))
          if (missing.length && (await pushAccounts(missing))) {
            useGame.getState().notify(`☁️ ${missing.length} akun player disimpan ke database.`)
          }
          setAccounts(mergePlayerAccounts(remote))
        }
      }
      applyMembers(m)
      useGame.setState((s) => ({ rev: s.rev + 1 }))
    } catch {
      /* ignore */
    }
  }

  const refreshAccounts = () => {
    setAccounts(getPlayerAccounts())
    setUploadedMeta(getUploadedFollowersMeta())
  }

  useEffect(() => {
    refreshBackend()
  }, [tab])

  const real = RESIDENTS.filter((r) => !r.mock)
  const mockCount = RESIDENTS.length - real.length
  const pop = getVillagePopulation()
  const pStats = getPlayerTotalStats(loggedIg, isDemo)

  const handleFollowersFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploadingFollowers(true)
    try {
      const combinedHandles = new Set<string>()
      for (const file of Array.from(files)) {
        const text = await file.text()
        const parsed = parseFollowerExport(text)
        for (const h of parsed) combinedHandles.add(h)
      }

      if (combinedHandles.size === 0) {
        g.notify('⚠️ Tidak ditemukan username Instagram di dalam file yang diupload.')
        return
      }

      // Sync with Player PIN accounts & village capacity (this browser)
      const syncRes = syncFollowersListWithAccounts(combinedHandles, autoPinForFollowers)
      setFollowerCount(syncRes.totalFollowers)
      setFollowerInput(String(syncRes.totalFollowers))
      refreshAccounts()

      // Save to the database: follower list (SHA-256 hashes) + player accounts with PINs
      const b = await getBackend()
      let dbError: unknown = null
      try {
        const hashes = await Promise.all([...combinedHandles].map((h) => hashHandle(h)))
        await b.setFollowers(hashes)
        await b.savePlayerAccounts(getPlayerAccounts())
      } catch (err) {
        dbError = err
      }
      await refreshBackend()

      if (dbError) {
        g.notify(`⚠️ ${syncRes.totalFollowers} followers terbaca, tapi GAGAL disimpan ke database: ${errorText(dbError)}`)
      } else {
        g.notify(
          `✅ ${syncRes.totalFollowers} Followers IG tersimpan ke database${b.mode === 'local' ? ' (lokal)' : ''}! (${syncRes.newlyCreated} PIN baru dibuat)`,
        )
      }
    } catch (err) {
      g.notify(`⚠️ Gagal membaca file followers: ${(err as Error)?.message ?? String(err)}`)
    } finally {
      setUploadingFollowers(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleExportPinsCsv = () => {
    const rows = ['instagram,display_name,class,pin,follows,online']
    for (const a of accounts) {
      rows.push(`@${a.instagram},"${a.displayName.replace(/"/g, '""')}",${a.cls},${a.pin},${a.follows},${a.online}`)
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `wandertales-player-pins-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    g.notify(`📥 Daftar ${accounts.length} PIN Player berhasil diunduh (.csv)!`)
  }

  const handleRegisterPin = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = registerPlayerPin(newIg, newDisplayName || undefined, newClass, customPin || undefined)
    if (!res.ok || !res.account) {
      g.notify(res.error ?? 'Gagal mendaftarkan akun.')
      return
    }
    try {
      const b = await getBackend()
      await b.addResident({
        instagram: res.account.instagram,
        displayName: res.account.displayName,
        personality: 'Adventurous',
        appearance: randomAppearance((Math.random() * 2 ** 32) >>> 0),
        consentData: true,
        showInstagram: true,
      })
      await refreshBackend()
    } catch {
      /* already exists in resident list */
    }
    await pushAccounts([res.account])
    refreshAccounts()
    setNewIg('')
    setNewDisplayName('')
    setCustomPin('')
    g.notify(`✅ @${res.account.instagram} terdaftar! PIN Login 6 Digit: ${res.account.pin}`)
  }

  const filteredAccounts = searchQuery.trim()
    ? accounts.filter((a) => {
        const q = searchQuery.trim().replace(/^@/, '').toLowerCase()
        return (
          a.instagram.toLowerCase().includes(q) ||
          a.displayName.toLowerCase().includes(q) ||
          a.pin.includes(q)
        )
      })
    : accounts

  const activeFollowerCount = uploadedMeta?.count ?? backendFollowerInfo?.count ?? null
  const activeFollowerDate = uploadedMeta?.uploadedAt ?? backendFollowerInfo?.uploadedAt ?? null

  return (
    <div className="panel wide-panel">
      <header>
        <h2>Community &amp; Database PIN Player</h2>
        <button className="x" onClick={close} aria-label="Close">✕</button>
      </header>

      <p className="note">
        👥 <b>Total Player: {pStats.online} Online / {pStats.offline} Offline</b> (Total {pStats.total} Player) ·{' '}
        🏘️ Warga Desa: <b>{pop}</b> ({real.length} member · {mockCount} NPC).
      </p>

      {/* Upload Daftar Followers Instagram Box */}
      <div className="card-in" style={{ background: '#f7edd4', marginTop: 6, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <b>📤 Upload Daftar Followers Instagram</b>
          {activeFollowerCount !== null && (
            <span className="badge ok" style={{ marginBottom: 0 }}>
              ✓ {activeFollowerCount} Followers Terdaftar
            </span>
          )}
        </div>
        <p className="note" style={{ marginTop: 4, marginBottom: 6 }}>
          Upload file hasil download dari Instagram (<b>followers_1.json</b>, <b>followers_1.html</b>, atau <b>.csv / .txt</b>) untuk menyinkronkan daftar followers <b>@{DM_GUILD_HANDLE}</b> ke database.
        </p>

        <label className="check" style={{ marginBottom: 8, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={autoPinForFollowers}
            onChange={(e) => setAutoPinForFollowers(e.target.checked)}
          />
          <span>Otomatis buatkan akun &amp; PIN 6 Digit untuk semua followers yang diupload</span>
        </label>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".json,.html,.htm,.csv,.txt"
          style={{ display: 'none' }}
          onChange={handleFollowersFileUpload}
        />

        <div className="actions" style={{ marginTop: 4 }}>
          <button
            type="button"
            disabled={uploadingFollowers}
            style={{ background: '#e0b04a', borderColor: '#3a2414' }}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadingFollowers ? '⏳ Memproses File...' : '📂 Pilih File Followers IG (.json / .html)'}
          </button>
          <button type="button" onClick={handleExportPinsCsv} title="Unduh semua username & PIN dalam format CSV">
            📥 Export CSV PIN
          </button>
        </div>

        {activeFollowerDate && (
          <small style={{ display: 'block', marginTop: 6, color: '#6e5640', fontSize: 11 }}>
            Terakhir diupload: {new Date(activeFollowerDate).toLocaleString()}
          </small>
        )}
      </div>

      <div className="share">
        <small>👥 Atur Kapasitas Warga Desa:</small>
        <input
          type="number"
          min={0}
          style={{ width: 84 }}
          value={followerInput}
          onChange={(e) => setFollowerInput(e.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            const v = Math.max(0, Math.floor(Number(followerInput) || 0))
            setFollowerCount(v)
            setFollowerInput(String(v))
            useGame.setState((s) => ({ rev: s.rev + 1 }))
            g.notify(`Jumlah warga desa diatur menjadi ${v}!`)
          }}
        >
          Update Warga
        </button>
      </div>

      <div className="seg tabs">
        <button className={tab === 'pins' ? 'on' : ''} onClick={() => setTab('pins')}>
          🔑 PIN (DAFTAR) ({accounts.length})
        </button>
        <button className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>
          Pending ({pendingRegs.length})
        </button>
        <button className={tab === 'add' ? 'on' : ''} onClick={() => setTab('add')}>
          + Tambah Warga
        </button>
        <button className={tab === 'residents' ? 'on' : ''} onClick={() => setTab('residents')}>
          Warga ({RESIDENTS.length})
        </button>
      </div>

      {tab === 'pins' && (
        <div>
          <div className="card-in" style={{ background: '#fffaf0' }}>
            <b>📩 Pendaftaran Manual DM (@{DM_GUILD_HANDLE} · Format: DAFTAR)</b>
            <p className="note" style={{ marginTop: 4 }}>
              Saat ada follower yang mengirim DM <b>DAFTAR</b> ke Instagram <b>@{DM_GUILD_HANDLE}</b>, masukkan username mereka di bawah untuk membuat <b>PIN 6 Digit acak</b>.
            </p>
            <form onSubmit={handleRegisterPin} className="form" style={{ marginTop: 8 }}>
              <input
                placeholder="Username Instagram (contoh: @budi.rpg)"
                value={newIg}
                onChange={(e) => setNewIg(e.target.value)}
              />
              <div className="grid2">
                <label>
                  Nama Karakter (Opsional)
                  <input
                    placeholder="Sesuai Class jika kosong"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                  />
                </label>
                <label>
                  PIN 6 Digit (Kosong = Acak)
                  <input
                    placeholder="Acak 6 digit"
                    maxLength={6}
                    value={customPin}
                    onChange={(e) => setCustomPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>
              </div>
              <div className="seg wrap">
                {CLASSES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={newClass === c ? 'on' : ''}
                    onClick={() => setNewClass(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <button type="submit">🎲 Buat PIN 6 Digit &amp; Simpan ke Database</button>
            </form>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '10px 0 6px' }}>
            <h3 style={{ margin: 0 }}>Daftar Akun Player ({filteredAccounts.length}/{accounts.length})</h3>
            <input
              type="text"
              placeholder="🔍 Cari @username / PIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 175, padding: '4px 8px', fontSize: 12, border: '2px solid #4a3220', background: '#fffaf0' }}
            />
          </div>

          <div className="list">
            {filteredAccounts.map((acc) => {
              const dmReply = `Halo @${acc.instagram}! Pendaftaran DAFTAR kamu di @${DM_GUILD_HANDLE} berhasil. Username Login: @${acc.instagram} | PIN 6 Digit: ${acc.pin}`
              return (
                <div key={acc.instagram} className="member">
                  <div className="member-head">
                    <b>@{acc.instagram}</b>
                    <small>({acc.displayName})</small>
                    <span className="cls">⚔️ {acc.cls}{acc.classLocked ? ' 🔒' : ''}</span>
                    <span className={`follows ${acc.follows ? '' : 'unknown'}`}>
                      {acc.follows ? '✓ Follower' : 'Belum Follow'}
                    </span>
                    <span className={`follows ${acc.online ? '' : 'unknown'}`}>
                      {acc.online ? '🟢 Online' : '⚪ Offline'}
                    </span>
                  </div>
                  <div className="share" style={{ margin: '4px 0' }}>
                    <span>🔑 PIN 6 Digit:</span>
                    <code className="code small" style={{ fontSize: 14, padding: '2px 8px' }}>{acc.pin}</code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(dmReply)
                        g.notify(`Balasan DM untuk @${acc.instagram} (PIN: ${acc.pin}) disalin!`)
                      }}
                    >
                      📋 Copy DM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextPin = regeneratePlayerPin(acc.instagram)
                        const updated = getPlayerAccounts().find((a) => a.instagram === acc.instagram)
                        if (updated) void pushAccounts([updated])
                        refreshAccounts()
                        if (nextPin) g.notify(`PIN baru @${acc.instagram}: ${nextPin}`)
                      }}
                    >
                      🎲 Acak PIN
                    </button>
                  </div>
                  <div className="actions" style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const list = getPlayerAccounts().map((a) =>
                          a.instagram === acc.instagram ? { ...a, online: !a.online } : a,
                        )
                        savePlayerAccounts(list)
                        refreshAccounts()
                        useGame.setState((s) => ({ rev: s.rev + 1 }))
                      }}
                    >
                      {acc.online ? 'Set Offline' : 'Set Online'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removePlayerAccount(acc.instagram)
                        getBackend()
                          .then((b) => b.removePlayerAccount(acc.instagram))
                          .catch((err) => g.notify(`⚠️ Gagal menghapus dari database: ${errorText(err)}`))
                        refreshAccounts()
                        useGame.setState((s) => ({ rev: s.rev + 1 }))
                        g.notify(`Akun @${acc.instagram} dihapus dari database login.`)
                      }}
                    >
                      🗑️ Hapus
                    </button>
                  </div>
                </div>
              )
            })}
            {filteredAccounts.length === 0 && (
              <p className="note">Tidak ada akun yang cocok dengan pencarian &ldquo;{searchQuery}&rdquo;.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'pending' && (
        <div className="list">
          {!pendingRegs.length && <p className="note">Tidak ada pendaftaran warga yang menunggu persetujuan.</p>}
          {pendingRegs.map((reg) => (
            <div key={reg.id} className="pending">
              <AvatarPreview look={reg.appearance} size={100} />
              <div>
                <b>{reg.displayName}</b> <small>@{reg.instagram} · {reg.personality}</small>
                <div className="code small">{reg.verificationCode}</div>
                <div className="actions">
                  <button
                    onClick={async () => {
                      const b = await getBackend()
                      await b.review(reg.id, true)
                      const pinRes = registerPlayerPin(reg.instagram, reg.displayName, 'Warrior')
                      if (pinRes.account) await pushAccounts([pinRes.account])
                      await refreshBackend()
                      refreshAccounts()
                      g.notify(
                        pinRes.account
                          ? `✓ ${reg.displayName} diterima! PIN Login: ${pinRes.account.pin}`
                          : `✓ ${reg.displayName} diterima!`,
                      )
                    }}
                  >
                    ✓ Approve &amp; Buat PIN
                  </button>
                  <button
                    onClick={async () => {
                      const b = await getBackend()
                      await b.review(reg.id, false)
                      await refreshBackend()
                    }}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'add' && (
        <AddResidentForm
          onDone={async () => {
            await refreshBackend()
            refreshAccounts()
            setTab('pins')
          }}
        />
      )}

      {tab === 'residents' && (
        <div className="list">
          <label className="check" style={{ marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={community.placeholders}
              onChange={(e) => {
                setPlaceholders(e.target.checked)
                useGame.setState((s) => ({ rev: s.rev + 1 }))
              }}
            />
            Tampilkan 12 warga NPC awal desa
          </label>
          {RESIDENTS.map((r) => (
            <div key={r.id} className="person row">
              <button onClick={() => { g.select({ type: 'resident', id: r.id }); close() }}>
                {r.name}{r.mock ? '' : ' ★'}
                <small>{r.profession} · {r.personality}{r.instagram ? ` · @${r.instagram}` : ' · NPC'}</small>
              </button>
              {!r.mock && (
                <button
                  className="x"
                  title="Hapus dari desa"
                  onClick={async () => {
                    const b = await getBackend()
                    await b.removeResident(r.id)
                    await refreshBackend()
                    g.notify(`${r.name} meninggalkan desa.`)
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && <p className="note">Belum ada warga komunitas tambahan.</p>}
        </div>
      )}
    </div>
  )
}

function AddResidentForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [ig, setIg] = useState('')
  const [pers, setPers] = useState<Personality>('Cheerful')
  const [cls, setCls] = useState<GuildClass>('Warrior')
  const [look, setLook] = useState<Appearance>(() => randomAppearance((Math.random() * 2 ** 32) >>> 0))
  const g = useGame.getState()

  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        try {
          const b = await getBackend()
          await b.addResident({
            instagram: ig.trim().replace(/^@/, '') || name.trim().toLowerCase().replace(/\s+/g, '.'),
            displayName: name.trim(),
            personality: pers,
            appearance: look,
            consentData: true,
            showInstagram: true,
          })
          if (ig.trim()) {
            const reg = registerPlayerPin(ig, name.trim(), cls)
            if (reg.ok && reg.account) {
              await pushAccounts([reg.account])
              g.notify(`✅ ${name.trim()} ditambahkan! PIN Login (@${reg.account.instagram}): ${reg.account.pin}`)
              onDone()
              return
            }
          }
          g.notify(`✅ ${name.trim()} bergabung ke desa!`)
          onDone()
        } catch (err) {
          g.notify(String((err as Error)?.message ?? 'Gagal menambah warga'))
        }
      }}
    >
      <AvatarPreview look={look} size={140} />
      <input placeholder="Nama karakter *" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Instagram @username" value={ig} maxLength={30} onChange={(e) => setIg(e.target.value)} />
      <div className="seg wrap">
        {CLASSES.map((c) => (
          <button type="button" key={c} className={cls === c ? 'on' : ''} onClick={() => setCls(c)}>
            {c}
          </button>
        ))}
      </div>
      <select value={pers} onChange={(e) => setPers(e.target.value as Personality)}>
        {PERSONALITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <AvatarEditor value={look} onChange={setLook} />
      <button type="submit" disabled={!name.trim()}>+ Tambah Warga &amp; Buat PIN 6 Digit</button>
    </form>
  )
}
