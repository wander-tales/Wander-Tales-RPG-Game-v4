import { useState } from 'react'
import { enterInterior, leaveInterior, roomKindOf } from '../game/interior'
import { BUILDINGS, NODES, getBuilding, type BuildingKind } from '../game/map'
import { BIOME_INFO, BIOME_NPCS, DUNGEONS, dungeonState, raidDungeon } from '../game/biomes'
import { height } from '../game/terrain'
import { RESIDENTS } from '../game/residents.mock'
import { player } from '../game/live'
import { PROFESSIONS, RESOURCES, professionsAt, type Bundle, type Recipe, type Resource } from '../game/professions'
import { assignWorker, openBuilding, sim, unassignWorker } from '../game/sim'
import { demolishBuilding, getVillagePopulation } from '../game/community'
import {
  RESOURCE_ICON, TYPES, activeSite, beds, buyFromMerchant, buyQuote, canAfford, cancelJob, checkPlacement, levelOf, missing,
  OUT_CAP, price, sellQuote, sellToMerchant, slotsOf, startUpgrade, storageCap, town, upgradeCost, waitingAt, workersOf,
} from '../game/town'
import { clock, dayOf, useGame } from '../game/store'
import { getPlayerTotalStats } from '../game/playerAuthAndQuests'
import { confirmPlacement, rotatePlacement } from '../game/placement'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
export const Cost = ({ cost, gold }: { cost: Bundle; gold: number }) => (
  <span className="cost">
    {gold > 0 && <span className={town.gold < gold ? 'short' : ''}>🪙 {gold}</span>}
    {Object.entries(cost).map(([k, v]) => (
      <span key={k} className={town.stock[k as Resource] < (v ?? 0) ? 'short' : ''} title={k}>{RESOURCE_ICON[k as Resource]} {v}</span>
    ))}
  </span>
)
const recipeText = (r: Recipe) => {
  const side = (b: Bundle) => Object.entries(b).map(([k, v]) => `${v} ${RESOURCE_ICON[k as Resource]}`).join(' + ')
  return `${Object.keys(r.input).length ? `${side(r.input)} → ` : ''}${side(r.output)} / ${r.minutes} min`
}
const Progress = ({ value, label }: { value: number; label: string }) => (
  <div className="bar"><span>{label}</span><div><i style={{ width: `${Math.min(100, value)}%`, background: '#e0b04a' }} /></div></div>
)

function walkTo(buildingId: string) {
  leaveInterior()
  const [x, z] = NODES[getBuilding(buildingId)!.door]
  player.pos.set(x, Math.max(0, height(x, z)), z)
  useGame.setState({ mode: 'third', selection: null })
}

export function BuildingPanel({ id }: { id: string }) {
  useGame((s) => s.rev)
  const minute = useGame((s) => Math.floor(s.time))
  const [hiring, setHiring] = useState(false)
  const [confirmDemolish, setConfirmDemolish] = useState(false)
  const g = useGame.getState()
  const b = getBuilding(id)
  if (!b) return null

  // --- Biome Dungeon Panel ---
  if (b.kind === 'dungeon') {
    const d = DUNGEONS[b.id]
    const bInfo = d ? BIOME_INFO[d.biome] : null
    const clears = dungeonState[b.id]?.clears ?? 0
    const biomeGuards = BIOME_NPCS.filter((n) => n.biome === d?.biome)
    const goodsList = d
      ? Object.entries(d.goods)
          .map(([k, v]) => `${RESOURCE_ICON[k as Resource]} +${v} ${k}`)
          .join(' · ')
      : ''
    return (
      <div className="panel">
        <header><h2>⚔️ {b.name}</h2><button className="x" onClick={() => g.select(null)} aria-label="Close">✕</button></header>
        {bInfo && <span className="badge ok">{bInfo.icon} Dungeon Biome: {bInfo.name}</span>}
        <p className="desc">{d?.lore ?? b.description}</p>
        {d && (
          <dl>
            <dt>Boss Utama</dt><dd>👹 <b>{d.boss}</b></dd>
            <dt>Tingkat Bahaya</dt><dd>{'⭐'.repeat(d.difficulty)} (Rekomendasi Lv {d.recLevel}+)</dd>
            <dt>Hadiah Raid</dt>
            <dd>
              🪙 +{d.gold} Gold · ⚡ +{d.xp} EXP{goodsList ? ` · ${goodsList}` : ''}
            </dd>
            <dt>Total Diselesaikan</dt><dd>🏆 {clears} kali</dd>
          </dl>
        )}
        {biomeGuards.length > 0 && (
          <div className="people">
            <h3>NPC Penjaga &amp; Penghuni Biome Ini</h3>
            {biomeGuards.map((npc) => (
              <div key={npc.id} className="person row">
                <button onClick={() => { g.select({ type: 'biomeNpc', id: npc.id }); g.focusOn(npc.homeX, npc.homeZ) }}>
                  {npc.name}<small>{npc.title} · Bukan Penduduk Desa</small>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="actions col">
          <button onClick={() => { raidDungeon(b.id) }}>
            ⚔️ Raid / Taklukkan Dungeon (+{d?.xp ?? 75} EXP)
          </button>
          <button onClick={() => walkTo(id)}>🚶 Teleport / Jalan ke Gerbang Dungeon</button>
          <button onClick={() => g.focusOn(b.x, b.z)}>🔍 Lihat Lokasi di Peta</button>
        </div>
      </div>
    )
  }

  // --- Biome Outpost Building Panel ---
  if (b.kind === 'outpost') {
    const bInfo = b.biomeRegion ? BIOME_INFO[b.biomeRegion] : null
    const localNpcs = BIOME_NPCS.filter((n) => n.homeBuildingId === b.id)
    const biomeNpcsAll = BIOME_NPCS.filter((n) => n.biome === b.biomeRegion)
    const biomeDungeon = BUILDINGS.find((q) => q.kind === 'dungeon' && q.biomeRegion === b.biomeRegion)
    return (
      <div className="panel">
        <header><h2>🏕️ {b.name}</h2><button className="x" onClick={() => g.select(null)} aria-label="Close">✕</button></header>
        {bInfo && <span className="badge">{bInfo.icon} Bangunan Biome · {bInfo.name}</span>}
        <p className="desc">{b.description}</p>
        <p className="note">NPC yang tinggal di bangunan biome ini adalah penghuni wilayah liar dan <b>tidak dihitung sebagai penduduk desa</b>.</p>
        <div className="people">
          <h3>Penghuni Bangunan ({localNpcs.length})</h3>
          {(localNpcs.length ? localNpcs : biomeNpcsAll).map((npc) => (
            <div key={npc.id} className="person row">
              <button onClick={() => { g.select({ type: 'biomeNpc', id: npc.id }); g.focusOn(npc.homeX, npc.homeZ) }}>
                {npc.name}<small>{npc.title} · NPC Biome</small>
              </button>
            </div>
          ))}
        </div>
        <div className="actions col">
          {biomeDungeon && (
            <button onClick={() => { g.select({ type: 'building', id: biomeDungeon.id }); g.focusOn(biomeDungeon.x, biomeDungeon.z) }}>
              ⚔️ Ke Dungeon Biome ({biomeDungeon.name})
            </button>
          )}
          <button onClick={() => walkTo(id)}>🚶 Jalan ke Sini</button>
          <button onClick={() => g.focusOn(b.x, b.z)}>🔍 Lihat di Peta</button>
        </div>
      </div>
    )
  }

  const isGm = g.userRole === 'gm'
  const st = town.b[id], type = TYPES[b.kind], job = st?.job
  const built = (st?.level ?? 1) > 0
  const canDemolish = isGm && (town.placed.some((p) => p.id === id) || type.buildable)
  const workers = workersOf(id), slots = slotsOf(id), profs = professionsAt(b.kind)
  const up = isGm && st && st.level < type.maxLevel ? upgradeCost(b.kind, st.level) : null
  const builders = RESIDENTS.filter((r) => r.profession === 'Builder' && r.work)
  const act = (err: string | null | undefined, ok?: string) => (err ? g.notify(err) : ok && g.notify(ok))

  return (
    <div className="panel">
      <header><h2>{b.name}</h2><button className="x" onClick={() => g.select(null)} aria-label="Close">✕</button></header>
      <p className="desc">{b.description}</p>
      <dl>
        <dt>Level</dt><dd>{built ? `${st?.level ?? 1} / ${type.maxLevel}` : 'Under construction'}</dd>
        {profs.map((p) => PROFESSIONS[p].recipe && <span key={p} style={{ display: 'contents' }}><dt>{p}</dt><dd>{recipeText(PROFESSIONS[p].recipe!)}</dd></span>)}
        {(b.kind === 'tavern' || b.kind === 'market') && built && <><dt>Now</dt><dd>{openBuilding(b.kind) === id ? '🟢 Open' : '🔴 Closed (no staff on duty)'}</dd></>}
        {b.kind === 'house' && built && <><dt>Beds</dt><dd>{(type.beds ?? 0) + levelOf(id) - 1} · {RESIDENTS.filter((r) => r.home === id).length} living here</dd></>}
        {b.kind === 'guild' && <><dt>Warehouse</dt><dd>{storageCap()} per resource · couriers deliver here</dd></>}
        {built && profs.some((p) => PROFESSIONS[p].recipe) && (
          <><dt>For pickup</dt><dd>{waitingAt(id) ? Object.entries(st.out ?? {}).map(([k, v]) => `${RESOURCE_ICON[k as Resource]} ${v}`).join(' ') : 'nothing'} <small>({waitingAt(id)} / {OUT_CAP})</small></dd></>
        )}
        {b.kind === 'construction' && <><dt>Working on</dt><dd>{activeSite() ? getBuilding(activeSite()!)!.name : 'Nothing queued'}</dd></>}
      </dl>
      {job && (
        <>
          <Progress value={(job.progress / job.needed) * 100} label={job.type === 'build' ? '🏗️ Construction' : `⬆️ Upgrade to Lv ${st.level + 1}`} />
          {activeSite() !== id ? <p className="note">Queued: builders finish {getBuilding(activeSite()!)?.name} first.</p>
            : !builders.length ? <p className="note warn">No builders! Hire one at the Builders' Yard.</p>
              : <p className="note">Builders work {PROFESSIONS.Builder.shift[0]}:00–{PROFESSIONS.Builder.shift[1]}:00 · {Math.ceil(job.needed - job.progress)} builder-minutes left</p>}
        </>
      )}

      {profs.length > 0 && built && (
        <div className="people">
          <h3>Workers {workers.length} / {slots}</h3>
          {workers.map((r) => (
            <div key={r.id} className="person row">
              <button onClick={() => g.select({ type: 'resident', id: r.id })}>
                {r.name}<small>{r.profession} Lv {sim[r.id].level} · {sim[r.id].workStatus || 'Off duty'}</small>
              </button>
              {isGm && (
                <button className="x" title="Remove from job" onClick={() => { unassignWorker(r.id); g.notify(`${r.name} is now unemployed`); useGame.setState((s) => ({ rev: s.rev + 1 })) }}>✕</button>
              )}
            </div>
          ))}
          {isGm && workers.length < slots && (hiring ? (
            <div className="hire">
              <h3>Hire a resident</h3>
              {[...RESIDENTS].filter((r) => r.work !== id).sort((a) => (a.work ? 1 : -1)).map((r) => (
                <div key={r.id} className="person row">
                  <span>{r.name}<small>{r.work ? `${r.profession} at ${getBuilding(r.work)?.name}` : 'Unemployed'}</small></span>
                  {profs.map((p) => (
                    <button key={p} onClick={() => { act(assignWorker(r.id, id, p), `${r.name} now works here as ${p}`); setHiring(false); useGame.setState((s) => ({ rev: s.rev + 1 })) }}>{p}</button>
                  ))}
                </div>
              ))}
            </div>
          ) : <button className="wide" onClick={() => setHiring(true)}>+ Hire worker</button>)}
          {isGm && workers.length >= slots && <p className="note">All slots filled — upgrade for +1 slot.</p>}
        </div>
      )}

      <div className="actions col">
        {isGm && up && !job && built && (
          <button disabled={!canAfford(up.cost, up.gold)} onClick={() => { act(startUpgrade(id, minute)); useGame.setState((s) => ({ rev: s.rev + 1 })) }}>
            ⬆️ Upgrade to Lv {st.level + 1} <Cost cost={up.cost} gold={up.gold} />
          </button>
        )}
        {isGm && job && (
          <button onClick={() => {
            const isBuild = job.type === 'build'
            cancelJob(id, minute)
            useGame.setState((s) => ({ rev: s.rev + 1, selection: isBuild ? null : s.selection }))
            g.notify(isBuild ? `Pembangunan ${b.name} dibatalkan.` : `Upgrade ${b.name} dibatalkan.`)
          }}>
            ✕ Cancel {job.type === 'build' ? 'construction' : 'upgrade'}
          </button>
        )}
        {b.kind === 'guild' && (
          <button onClick={() => useGame.setState({ openPanel: isGm ? 'guild' : 'quests' })}>
            ⚔️ {isGm ? 'Open Guild Hall' : 'Buka Misi Class'}
          </button>
        )}
        {roomKindOf(id) && <button onClick={() => enterInterior(id)}>🚪 Go inside</button>}
        <button onClick={() => walkTo(id)}>🚶 Explore here</button>
        {isGm && !job && canDemolish && (
          confirmDemolish ? (
            <div className="card-in">
              <p className="note warn" style={{ marginTop: 0, marginBottom: 6 }}>
                ⚠️ Yakin ingin menghancurkan <b>{b.name}</b>? Bangunan akan dihapus permanen.
              </p>
              <div className="actions" style={{ marginTop: 0 }}>
                <button
                  style={{ background: '#b8392f', color: '#fff8ec' }}
                  onClick={() => {
                    const bName = b.name
                    const err = demolishBuilding(id, minute)
                    if (err) {
                      g.notify(err)
                      setConfirmDemolish(false)
                    } else {
                      if (useGame.getState().interior === id) leaveInterior()
                      useGame.setState((s) => ({ rev: s.rev + 1, selection: null }))
                      g.notify(`🧨 ${bName} berhasil dihancurkan!`)
                    }
                  }}
                >
                  🧨 Ya, Hancurkan
                </button>
                <button onClick={() => setConfirmDemolish(false)}>Batal</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDemolish(true)}>🧨 Demolish</button>
          )
        )}
      </div>
    </div>
  )
}

export function BuildMenu({ close }: { close: () => void }) {
  useGame((s) => s.rev)
  const kinds = (Object.keys(TYPES) as BuildingKind[]).filter((k) => TYPES[k].buildable)
  const start = (kind: BuildingKind) => {
    useGame.setState({ placing: { kind, rot: 0, x: null, z: null }, mode: 'iso', selection: null })
    useGame.getState().notify('Pick a spot — green means you can build there')
    close()
  }
  return (
    <div className="panel">
      <header><h2>Build</h2><button className="x" onClick={close} aria-label="Close">✕</button></header>
      <p className="note">Builders construct new buildings during their shift. Trees on the plot are cut for wood.</p>
      <div className="list">
        {kinds.map((k) => {
          const t = TYPES[k], ok = canAfford(t.cost, t.gold)
          return (
            <button key={k} className="person build" disabled={!ok} onClick={() => start(k)} title={ok ? '' : `Need ${missing(t.cost, t.gold).join(', ')}`}>
              {t.name}<small>{t.description}</small><Cost cost={t.cost} gold={t.gold} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function PlacementBar() {
  const p = useGame((s) => s.placing)
  if (!p) return null
  const t = TYPES[p.kind]
  const check = p.x !== null && p.z !== null ? checkPlacement(p.kind, p.x, p.z, p.rot) : null
  return (
    <div className="placebar">
      <div><b>{t.name}</b> <Cost cost={t.cost} gold={t.gold} /></div>
      <small className={check && !check.ok ? 'warn' : ''}>{check ? (check.ok ? check.reason || 'Good spot!' : check.reason) : 'Tap or move over the ground'}</small>
      <div className="actions">
        <button onClick={rotatePlacement}>⟳ Rotate <kbd>R</kbd></button>
        <button disabled={!check?.ok} onClick={confirmPlacement}>✓ Build here</button>
        <button onClick={() => useGame.setState({ placing: null })}>✕ Cancel</button>
      </div>
    </div>
  )
}

const KEEP = 40
export function StoragePanel({ close }: { close: () => void }) {
  useGame((s) => s.rev)
  const minute = useGame((s) => Math.floor(s.time))
  const g = useGame.getState()
  const sell = (r: Resource, q: number) => { if (!sellToMerchant(r, q, minute)) g.notify(`Not enough ${r}`) }
  const buy = (r: Resource, q: number) => { if (!buyFromMerchant(r, q, minute)) g.notify(town.gold < buyQuote(r, q) ? 'Not enough gold' : 'Storage is full') }
  const surplus = RESOURCES.filter((r) => town.stock[r] > KEEP)
  const surplusGold = surplus.reduce((a, r) => a + sellQuote(r, town.stock[r] - KEEP), 0)
  const days = [town.today, ...town.days].slice(0, 7)
  const maxFlow = Math.max(1, ...days.map((d) => Math.max(d.income, d.expense)))
  return (
    <div className="panel wide-panel">
      <header><h2>Storage & Trade (Khusus GM)</h2><button className="x" onClick={close} aria-label="Close">✕</button></header>
      <p className="note">Treasury 🪙 {Math.floor(town.gold)} · warehouse {storageCap()} per resource · goods count once a Courier (or a Builder with nothing to build) carries them here from their workplace · the travelling merchant buys at 80% and sells at 130% of the town price.</p>
      <table className="stock">
        <thead><tr><th>Good</th><th>Stock</th><th>Price</th><th>Trade 10</th></tr></thead>
        <tbody>
          {RESOURCES.map((r) => (
            <tr key={r}>
              <td>{RESOURCE_ICON[r]} {cap(r)}</td>
              <td>{Math.floor(town.stock[r])}</td>
              <td>{price(r)}</td>
              <td className="trade">
                <button disabled={town.stock[r] < 10} onClick={() => sell(r, 10)} title={`+${sellQuote(r, 10)} gold`}>Sell</button>
                <button disabled={town.gold < buyQuote(r, 10)} onClick={() => buy(r, 10)} title={`−${buyQuote(r, 10)} gold`}>Buy</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <button disabled={!surplus.length} onClick={() => { surplus.forEach((r) => sellToMerchant(r, town.stock[r] - KEEP, minute)); g.notify(`Sold surplus for ${surplusGold} gold`) }}>
          Sell surplus above {KEEP} (+{surplusGold} 🪙)
        </button>
      </div>
      <h3>Last days</h3>
      <div className="days">
        {days.map((d) => (
          <div key={d.day} className="day" title={Object.entries(d.byKind).map(([k, v]) => `${k} ${Math.round(v ?? 0)}`).join(', ')}>
            <span>Day {d.day}{d === town.today ? ' (today)' : ''}</span>
            <div><i className="in" style={{ width: `${(d.income / maxFlow) * 100}%` }} /><i className="out" style={{ width: `${(d.expense / maxFlow) * 100}%` }} /></div>
            <b className={d.income - d.expense < 0 ? 'neg' : 'pos'}>{d.income - d.expense >= 0 ? '+' : ''}{Math.round(d.income - d.expense)}</b>
          </div>
        ))}
      </div>
      <p className="note">Green = income (rent, meals, shopping, sales) · red = spending (wages, construction, purchases). Hover a day for details.</p>
      <h3>Recent transactions</h3>
      <ul className="ledger">
        {town.ledger.slice(0, 12).map((x, i) => (
          <li key={i}><small>Day {dayOf(x.t)} {clock(x.t)}</small> {x.note} {x.gold !== 0 && <b className={x.gold < 0 ? 'neg' : 'pos'}>{x.gold > 0 ? '+' : ''}{Math.round(x.gold)}</b>}</li>
        ))}
        {!town.ledger.length && <li>No transactions yet.</li>}
      </ul>
    </div>
  )
}

/** Compact stock readout for the top bar. */
export function StockChips({ onClick }: { onClick: () => void }) {
  useGame((s) => s.rev)
  useGame((s) => Math.floor(s.time / 5))
  const userRole = useGame((s) => s.userRole)
  const playerGold = useGame((s) => s.playerGold)
  const loggedIg = useGame((s) => s.loggedInstagram)
  const isDemo = useGame((s) => s.isDemoPlayer)
  const pStats = getPlayerTotalStats(loggedIg, isDemo)
  const food = town.stock.bread + town.stock.fish + town.stock.vegetables

  if (userRole === 'player') {
    return (
      <button className="card stats chips" onClick={onClick} title="Buka Inventory Player">
        <span title="Gold Milikmu">🪙 {Math.floor(playerGold)}</span>
        <span title="Total Player Terdaftar (Online / Offline)">
          👥 Total Player: {pStats.online} Online / {pStats.offline} Offline
        </span>
        <span className="opt" title="Warga Desa">🏠 {RESIDENTS.length} Warga</span>
      </button>
    )
  }

  return (
    <button className="card stats chips" onClick={onClick} title="Open Storage & Trade (GM)">
      <span title="Gold Kas Desa">🪙 {Math.floor(town.gold)}</span>
      <span className="opt" title="Wood">🪵 {town.stock.wood}</span>
      <span className="opt" title="Stone">🪨 {town.stock.stone}</span>
      <span className="opt" title="Food (bread + fish + vegetables)">🍞 {food}</span>
      <span title="Total Player (Online / Offline)">
        👥 Total Player: {pStats.online} Online / {pStats.offline} Offline
      </span>
      <span className="opt" title="Tempat tinggal terisi di desa">🏠 {RESIDENTS.length}/{beds()}</span>
    </button>
  )
}


