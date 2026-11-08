import { useEffect, useMemo, useState } from 'react'
import { BUILDINGS, getBuilding } from '../game/map'
import { BIOME_INFO, BIOME_NPCS, DUNGEONS, MOUNTAIN_MONSTERS, attackMonster, biomeNpcLive, getBiomeNpc, getMonster, monsterLive, talkWithBiomeNpc } from '../game/biomes'
import { getVillagePopulation, setFollowerCount } from '../game/community'
import { getPlayerAccounts, getPlayerTotalStats } from '../game/playerAuthAndQuests'
import { height } from '../game/terrain'
import { RESIDENTS } from '../game/residents.mock'
import { npcLive, player } from '../game/live'
import { byId, friendLevel, friendsOf, moodEmoji, sim, type NeedKey } from '../game/sim'
import { PROFESSIONS, MAX_LEVEL, wagePerHour, xpToNext } from '../game/professions'
import { RESOURCE_ICON, town } from '../game/town'
import { BuildMenu, BuildingPanel, PlacementBar, StockChips, StoragePanel } from './TownPanels'
import { CommunityPanel } from './Community'
import { GuildPanel } from './Guild'
import { gmLine } from '../game/dialogue'
import { resetWorld } from '../game/persist'
import { clock, dayOf, hourOf, playerLevelInfo, useGame } from '../game/store'
import { CLASSES, type GuildClass } from '../game/recruitment'
import { interact } from '../game/interact'
import { PixelAvatar } from '../pixel/PixelAvatar'
import { PixelIcon } from '../pixel/icons'
import { PixelItemThumb, PixelSpriteStage } from '../pixel/PixelPreview'
import { CLASS_WEAPON, fromCreator } from '../pixel/look'
import { CATALOG, type CatalogAsset, type Channel } from '../threejs/chibiCatalog'
import { ROLES, generateNpcAppearance } from '../npc-generator/npcGenerator'
import {
  EYE_COLORS, HAIR_COLORS, PALETTE, SKIN_TONES, lookKeyFor, defaultAppearance, loadCharacter, saveCharacter,
  type CharacterAppearance, type Slot,
} from '../character-creator/appearance'
import { MobileControls } from './MobileControls'

import { ChroniclePanel } from './Chronicle'
import { CloudSaveBox } from './CloudSave'
import { SoundBox } from './Sound'
import { ROOMS, isSpot, leaveInterior, roomKindOf, type RoomId } from '../game/interior'
import { SEASON_DAYS, SEASON_INFO, WEATHER_INFO, dayInSeason, festivalAt, seasonOf, weatherAt } from '../game/calendar'

type Panel =
  | 'profile'
  | 'quests'
  | 'inventory'
  | 'residents'
  | 'buildings'
  | 'build'
  | 'storage'
  | 'guild'
  | 'chronicle'
  | 'community'
  | 'settings'
  | null

const SPEEDS = [2, 10, 60]
const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

function TopBar({
  isProfileOpen,
  toggleProfile,
  openStorageOrInventory,
}: {
  isProfileOpen: boolean
  toggleProfile: () => void
  openStorageOrInventory: () => void
}) {
  const name = useGame((s) => s.playerName)
  const cls = useGame((s) => s.playerClass)
  const userRole = useGame((s) => s.userRole)
  const xp = useGame((s) => s.playerXp)
  const hp = useGame((s) => s.playerHp)
  const deadUntil = useGame((s) => s.playerDeadUntil)
  const { level: lv, maxHp } = playerLevelInfo(xp)
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100))
  const minute = useGame((s) => Math.floor(s.time))
  const scale = useGame((s) => s.timeScale)
  const h = hourOf(minute)
  const weather = weatherAt(minute)
  const icon = weather !== 'clear' && h >= 6 && h < 18 ? WEATHER_INFO[weather].icon : h >= 6 && h < 18 ? '☀️' : h >= 18 && h < 20 ? '🌇' : '🌙'
  const season = SEASON_INFO[seasonOf(minute)]
  const fest = festivalAt(minute)
  const isGm = userRole === 'gm'

  return (
    <div className="topbar">
      <button
        type="button"
        className={`card profile profile-btn ${isProfileOpen ? 'on' : ''}`}
        onClick={toggleProfile}
        title="Klik untuk membuka Profil Karakter (Nama, Class, EXP, HP & Ganti Pakaian)"
      >
        <div className="avatar"><PixelAvatar /></div>
        <div className="profile-meta">
          <b>{name || (isGm ? 'Guild Master' : cls)}</b>
          <small>{isGm ? '👑 GM' : '⚔️ Player'} · Lv {lv} · {cls}</small>
          <div className="mini-hp-bar" title={`HP: ${Math.round(hp)} / ${maxHp}`}>
            <span>
              <i style={{ width: `${hpPct}%`, background: deadUntil ? '#7a2222' : hpPct < 30 ? '#d94338' : '#52b868' }} />
            </span>
            <small>{deadUntil ? '💀 Gugur' : `❤️ ${Math.round(hp)}/${maxHp}`}</small>
          </div>
        </div>
      </button>
      {fest && <div className="festival-banner" role="status">{fest.icon} {fest.name} on the square!</div>}
      <div className={`card clock ${isGm ? '' : 'clock-player'}`}>
        <small>{season.icon} {season.name} {dayInSeason(minute)}/{SEASON_DAYS} · {WEATHER_INFO[weather].name}</small>
        <b>{icon} Day {dayOf(minute)} · {clock(minute)}</b>
        {isGm && (
          <button
            className="chip"
            title="Percepat Waktu (Khusus Mode GM)"
            onClick={() => useGame.getState().setTimeScale(SPEEDS[(SPEEDS.indexOf(scale) + 1) % SPEEDS.length])}
          >
            ⏩ {scale / 2}×
          </button>
        )}
      </div>
      <div className="statwrap">
        <StockChips onClick={openStorageOrInventory} />
        {isGm && <div className="card stats mood"><TownMood /></div>}
      </div>
    </div>
  )
}

type WardrobeTab = 'clothing' | 'armor' | 'head' | 'hair' | 'feet' | 'accessories' | 'colors'

const WARDROBE_TABS: [WardrobeTab, string, Slot[]][] = [
  ['clothing', 'Pakaian', ['torso', 'apron']],
  ['armor', 'Armor', ['chest_armor', 'shoulders', 'hands', 'legs']],
  ['head', 'Kepala', ['headwear', 'hair_ornament', 'ears']],
  ['hair', 'Rambut', ['hair']],
  ['feet', 'Sepatu', ['feet']],
  ['accessories', 'Aksesori', ['back', 'neck', 'waist', 'waist_side']],
  ['colors', 'Warna & Tubuh', []],
]

const SLOT_LABEL: Record<Slot, string> = {
  hair: 'Gaya Rambut',
  headwear: 'Topi / Helm',
  hair_ornament: 'Hiasan Rambut',
  ears: 'Anting',
  torso: 'Pakaian Utama',
  apron: 'Celemek (Apron)',
  chest_armor: 'Armor Dada',
  shoulders: 'Pelindung Bahu',
  hands: 'Sarung Tangan',
  legs: 'Pelindung Kaki',
  feet: 'Sepatu / Boots',
  back: 'Jubah / Tas Punggung',
  neck: 'Kalung / Syal',
  waist: 'Sabuk (Belt)',
  waist_side: 'Kantong / Charm Pinggang',
}

const CHANNEL_LABEL: Record<Channel, string> = {
  primary: 'Utama',
  secondary: 'Kedua',
  trim: 'Aksen',
  leather: 'Kulit',
  metal: 'Logam',
  hair: 'Rambut',
  gem: 'Permata',
  cloth: 'Kain',
  dark: 'Gelap',
}

function WardrobeSwatches({ colors, value, onPick }: { colors: string[]; value?: string; onPick: (c: string) => void }) {
  return (
    <div className="cc-swatches wardrobe-swatches">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={value?.toLowerCase() === c.toLowerCase() ? 'on' : ''}
          style={{ background: c }}
          onClick={() => onPick(c)}
          aria-label={c}
        />
      ))}
      <input
        type="color"
        value={value ?? '#cccccc'}
        onChange={(e) => onPick(e.target.value)}
        aria-label="Pilih warna bebas"
        title="Pilih warna kustom"
      />
    </div>
  )
}

function ProfilePanel({ close }: { close: () => void }) {
  const playerName = useGame((s) => s.playerName)
  const playerClass = useGame((s) => s.playerClass)
  const classLocked = useGame((s) => s.classLocked)
  const userRole = useGame((s) => s.userRole)
  const loggedIg = useGame((s) => s.loggedInstagram)
  const playerXp = useGame((s) => s.playerXp)
  const setPlayerName = useGame((s) => s.setPlayerName)
  const lockPlayerClass = useGame((s) => s.lockPlayerClass)
  const gainXp = useGame((s) => s.gainXp)
  const notify = useGame((s) => s.notify)

  const [nameInput, setNameInput] = useState(playerName || playerClass)
  const [editingName, setEditingName] = useState(false)
  const [selectedInitialClass, setSelectedInitialClass] = useState<GuildClass>(playerClass)
  const [showWardrobe, setShowWardrobe] = useState(false)
  const [wTab, setWTab] = useState<WardrobeTab>('clothing')
  const [app, setApp] = useState<CharacterAppearance>(defaultAppearance)

  useEffect(() => {
    setNameInput(playerName || playerClass)
  }, [playerName, playerClass])

  useEffect(() => {
    loadCharacter(lookKeyFor(useGame.getState().loggedInstagram)).then((s) => { if (s) setApp(s.appearance) }).catch(() => {})
  }, [])

  const { level, currentXp, nextXp, totalXp } = playerLevelInfo(playerXp)
  const weapon = CLASS_WEAPON[playerClass] ?? 'sword'
  const spriteLook = useMemo(() => fromCreator(app, weapon), [app, weapon])
  const readyAssets = useMemo(() => CATALOG.assets.filter((a) => a.readyForPlayer), [])

  const applyAndSave = async (next: CharacterAppearance) => {
    setApp(next)
    await saveCharacter(lookKeyFor(useGame.getState().loggedInstagram), next)
    useGame.setState((s) => ({ rev: s.rev + 1 }))
  }

  const equipSlot = (slot: Slot, id: string | null) => {
    applyAndSave({ ...app, equipment: { ...app.equipment, [slot]: id } })
  }

  const setSlotColor = (slot: Slot, ch: Channel, color: string) => {
    applyAndSave({
      ...app,
      colors: {
        ...app.colors,
        [slot]: { ...(app.colors[slot] ?? {}), [ch]: color },
      },
    })
  }

  const randomizeLook = () => {
    const r = ROLES[Math.floor(Math.random() * ROLES.length)]
    const next = generateNpcAppearance(`random-${Date.now()}`, r, { available: new Set(readyAssets.map((a) => a.id)) })
    applyAndSave({ ...next, name: app.name })
    notify(`🎲 Penampilan diacak (${r})!`)
  }

  const saveName = () => {
    setPlayerName(nameInput)
    setEditingName(false)
    notify('Nama profil diperbarui!')
  }

  const activeSlots = WARDROBE_TABS.find((t) => t[0] === wTab)?.[2] ?? []
  const allEquipped = (Object.entries(app.equipment).filter(([, id]) => id) as [Slot, string][])
    .map(([slot, id]) => ({ slot, asset: readyAssets.find((x) => x.id === id) }))
    .filter((x): x is { slot: Slot; asset: CatalogAsset } => !!x.asset)

  return (
    <div className="panel profile-panel">
      <header>
        <h2>👤 Profil Karakter</h2>
        <button className="x" onClick={close} aria-label="Close">✕</button>
      </header>

      <div className="profile-stage-box">
        <PixelSpriteStage look={spriteLook} state="idle" compact />
      </div>

      {/* 1. Nama */}
      <div className="profile-info-card">
        {loggedIg && loggedIg !== 'demo.player' && (
          <div className="profile-row">
            <span className="profile-label">Akun</span>
            <div className="profile-val"><b>@{loggedIg}</b></div>
          </div>
        )}
        <div className="profile-row">
          <span className="profile-label">Nama</span>
          {editingName ? (
            <div className="profile-name-edit">
              <input
                value={nameInput}
                maxLength={24}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                autoFocus
              />
              <button type="button" onClick={saveName}>✓</button>
            </div>
          ) : (
            <div className="profile-val">
              <b>{playerName || playerClass}</b>
              <button type="button" className="profile-edit-btn" onClick={() => setEditingName(true)} title="Ubah nama">✎</button>
            </div>
          )}
        </div>

        {/* 2. Class (Permanent 1 Class per Player) */}
        <div className="profile-row">
          <span className="profile-label">Job Class</span>
          <div className="profile-val">
            <span className="cls-badge">⚔️ {playerClass}</span>
            <small className="wpn-note">({weapon})</small>
          </div>
        </div>
        {classLocked ? (
          <div className="locked-class-note">
            🔒 <b>Class Permanen ({playerClass})</b> — Setiap player hanya memiliki 1 Class dan tidak dapat diganti.
          </div>
        ) : (
          <div className="card-in" style={{ margin: '4px 0' }}>
            <small style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}>
              ⚠️ Pilih 1 Job Class Permanen (Hanya bisa dipilih 1 kali, tidak bisa diganti!):
            </small>
            <div className="seg wrap">
              {CLASSES.map((c: GuildClass) => (
                <button
                  key={c}
                  type="button"
                  className={selectedInitialClass === c ? 'on' : ''}
                  onClick={() => setSelectedInitialClass(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              type="button"
              style={{ marginTop: 8, width: '100%', padding: '7px', background: '#e8b84a', border: '2px solid #3a2414', fontWeight: 700 }}
              onClick={() => lockPlayerClass(selectedInitialClass)}
            >
              🔒 Kunci Class Permanen: {selectedInitialClass}
            </button>
          </div>
        )}

        {/* 3. EXP & Level */}
        <div className="profile-exp-box">
          <div className="profile-exp-head">
            <b>⭐ Level {level}</b>
            <span>EXP: <b>{currentXp}</b> / {nextXp}</span>
          </div>
          <div className="bar profile-exp-bar">
            <span>Progress</span>
            <div>
              <i style={{ width: `${Math.min(100, (currentXp / nextXp) * 100)}%`, background: '#e8b84a' }} />
            </div>
          </div>
          <div className="profile-exp-foot">
            <small>Total EXP: {totalXp}</small>
            {userRole === 'gm' && (
              <button type="button" className="exp-train-btn" onClick={() => gainXp(25)}>
                ⚡ +25 EXP (GM)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Tombol Mengganti Pakaian */}
      <div className="actions col">
        <button
          type="button"
          className={`outfit-toggle-btn ${showWardrobe ? 'on' : ''}`}
          onClick={() => setShowWardrobe(!showWardrobe)}
        >
          👕 {showWardrobe ? 'Tutup Lemari Pakaian' : 'Ganti Pakaian'}
        </button>
      </div>

      {showWardrobe && (
        <div className="wardrobe-box">
          <div className="wardrobe-header-row">
            <b>Lemari Pakaian &amp; Warna</b>
            <button type="button" className="wardrobe-rand-btn" onClick={randomizeLook}>
              🎲 Acak
            </button>
          </div>

          <div className="seg tabs">
            {WARDROBE_TABS.map(([key, label]) => (
              <button key={key} type="button" className={wTab === key ? 'on' : ''} onClick={() => setWTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {activeSlots.map((slot) => {
            const items = readyAssets.filter((a) => a.slot === slot)
            const equippedId = app.equipment[slot]
            const equippedAsset = items.find((a) => a.id === equippedId)
            return (
              <div key={slot} className="wardrobe-section">
                <h3>{SLOT_LABEL[slot]}</h3>
                <div className="cc-items wardrobe-grid">
                  <button
                    type="button"
                    className={!equippedId ? 'cc-item on' : 'cc-item'}
                    onClick={() => equipSlot(slot, null)}
                  >
                    <span className="cc-none">∅</span>
                    <small>Lepas</small>
                  </button>
                  {items.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={equippedId === a.id ? 'cc-item on' : 'cc-item'}
                      onClick={() => equipSlot(slot, a.id)}
                      title={a.name}
                    >
                      <PixelItemThumb asset={a} baseApp={app} />
                      <small>{a.name}</small>
                    </button>
                  ))}
                </div>

                {equippedAsset && (
                  <div className="wardrobe-color-box">
                    <small className="wardrobe-color-title">🎨 Warna {equippedAsset.name}:</small>
                    {(Object.keys(equippedAsset.channels) as Channel[]).map((ch) => (
                      <div key={ch} className="wardrobe-channel-row">
                        <span>{CHANNEL_LABEL[ch] ?? ch}</span>
                        <WardrobeSwatches
                          colors={ch === 'hair' ? HAIR_COLORS : PALETTE}
                          value={app.colors[slot]?.[ch] ?? equippedAsset.channels[ch]}
                          onPick={(c) => setSlotColor(slot, ch, c)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {wTab === 'colors' && (
            <div className="wardrobe-section">
              <h3>Warna Kulit</h3>
              <WardrobeSwatches colors={SKIN_TONES} value={app.skin} onPick={(skin) => applyAndSave({ ...app, skin })} />

              <h3>Warna Mata</h3>
              <WardrobeSwatches colors={EYE_COLORS} value={app.eyes} onPick={(eyes) => applyAndSave({ ...app, eyes })} />

              <h3>Warna Semua Pakaian &amp; Item Terpasang</h3>
              {!allEquipped.length && <p className="note">Pilih pakaian atau item terlebih dahulu.</p>}
              {allEquipped.map(({ slot, asset }) => (
                <div key={slot} className="wardrobe-color-box">
                  <small className="wardrobe-color-title">🎨 {asset.name} ({SLOT_LABEL[slot]}):</small>
                  {(Object.keys(asset.channels) as Channel[]).map((ch) => (
                    <div key={ch} className="wardrobe-channel-row">
                      <span>{CHANNEL_LABEL[ch] ?? ch}</span>
                      <WardrobeSwatches
                        colors={ch === 'hair' ? HAIR_COLORS : PALETTE}
                        value={app.colors[slot]?.[ch] ?? asset.channels[ch]}
                        onPick={(c) => setSlotColor(slot, ch, c)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Class-Specific Quests Panel for Players (scales with EXP/Level, locked claim until completed) */
function PlayerQuestsPanel({ close }: { close: () => void }) {
  const playerClass = useGame((s) => s.playerClass)
  const playerXp = useGame((s) => s.playerXp)
  const quests = useGame((s) => s.classQuests)
  const completedCount = useGame((s) => s.completedQuestsCount)
  const claimQuestReward = useGame((s) => s.claimQuestReward)
  const focusOn = useGame((s) => s.focusOn)
  const select = useGame((s) => s.select)
  const { level, currentXp, nextXp } = playerLevelInfo(playerXp)

  const locateObjective = (type: string) => {
    if (type === 'kill_slime') {
      const m = MOUNTAIN_MONSTERS.find((x) => x.species === 'slime')
      if (m) { select({ type: 'monster', id: m.id }); focusOn(m.homeX, m.homeZ); close() }
    } else if (type === 'kill_goblin') {
      const m = MOUNTAIN_MONSTERS.find((x) => x.species === 'goblin')
      if (m) { select({ type: 'monster', id: m.id }); focusOn(m.homeX, m.homeZ); close() }
    } else if (type === 'kill_any') {
      const m = MOUNTAIN_MONSTERS[0]
      if (m) { select({ type: 'monster', id: m.id }); focusOn(m.homeX, m.homeZ); close() }
    } else if (type === 'raid_dungeon') {
      const d = BUILDINGS.find((b) => b.kind === 'dungeon')
      if (d) { select({ type: 'building', id: d.id }); focusOn(d.x, d.z); close() }
    } else if (type === 'talk_npc') {
      const r = RESIDENTS[0]
      const l = r ? npcLive[r.id] : null
      if (r) { select({ type: 'resident', id: r.id }); focusOn(l?.x ?? 0, l?.z ?? 4); close() }
    }
  }

  return (
    <div className="panel wide-panel">
      <header>
        <h2>📜 Misi Class: {playerClass}</h2>
        <button className="x" onClick={close} aria-label="Close">✕</button>
      </header>
      <div className="badge ok">
        ⚔️ Job Class Permanen: {playerClass} · Level {level} ({currentXp}/{nextXp} EXP) · Selesai: {completedCount} Misi
      </div>
      <p className="note" style={{ marginTop: 4, marginBottom: 8 }}>
        Selesaikan target misi sesuai Class kamu di dunia untuk bisa klaim hadiah. Semakin tinggi EXP &amp; Level kamu, misi akan berganti menjadi lebih menantang dengan hadiah lebih besar!
      </p>

      <div className="list">
        {quests.map((q) => {
          const done = q.progress >= q.target
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100))
          return (
            <div key={q.id} className={`quest ${done ? 'active' : ''}`}>
              <div className="member-head" style={{ justifyContent: 'space-between' }}>
                <b>{q.title}</b>
                <span className="rank r4">Tier {q.tier} · {'★'.repeat(Math.min(5, q.tier))}</span>
              </div>
              <p className="desc" style={{ margin: '2px 0 4px', fontSize: 13 }}>{q.description}</p>
              <div className="bar">
                <span>{q.objectiveLabel}</span>
                <div>
                  <i style={{ width: `${pct}%`, background: done ? '#52b868' : '#e8b84a' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                <span>Progress: {q.progress} / {q.target} {done ? '✅ Selesai!' : '⏳ Belum Selesai'}</span>
                <span>Hadiah: ⭐ +{q.rewardXp} EXP · 🪙 +{q.rewardGold}</span>
              </div>
              <small style={{ display: 'block', marginTop: 2 }}>
                🎁 Item Hadiah: <b>{q.rewardItem.icon} {q.rewardItem.name}</b> ({q.rewardItem.bonus})
              </small>
              <div className="actions" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  disabled={!done}
                  style={done ? { background: '#e8b84a', borderColor: '#3a2414' } : undefined}
                  onClick={() => claimQuestReward(q.id)}
                >
                  {done ? '🎁 Klaim Hadiah & Misi Baru' : `🔒 Selesaikan Dulu (${q.progress}/${q.target})`}
                </button>
                {q.objectiveType !== 'explore_distance' && (
                  <button type="button" onClick={() => locateObjective(q.objectiveType)}>
                    🔍 Cari Target
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Personal Inventory & Equipped Gear Panel for Players */
function PlayerInventoryPanel({ close, openWardrobe }: { close: () => void; openWardrobe: () => void }) {
  const playerName = useGame((s) => s.playerName)
  const playerClass = useGame((s) => s.playerClass)
  const playerGold = useGame((s) => s.playerGold)
  const playerHp = useGame((s) => s.playerHp)
  const playerXp = useGame((s) => s.playerXp)
  const inventory = useGame((s) => s.playerInventory)
  const toggleEquipItem = useGame((s) => s.toggleEquipItem)
  const useConsumableItem = useGame((s) => s.useConsumableItem)
  const [app, setApp] = useState<CharacterAppearance>(defaultAppearance)

  useEffect(() => {
    loadCharacter(lookKeyFor(useGame.getState().loggedInstagram)).then((s) => { if (s) setApp(s.appearance) }).catch(() => {})
  }, [])

  const { level, maxHp } = playerLevelInfo(playerXp)
  const equippedItems = inventory.filter((i) => i.equipped)
  const bagItems = inventory

  return (
    <div className="panel wide-panel">
      <header>
        <h2>🎒 Inventory &amp; Equipment</h2>
        <button className="x" onClick={close} aria-label="Close">✕</button>
      </header>

      <div className="card-in" style={{ background: '#fffaf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <b>{playerName || playerClass}</b>
          <small style={{ display: 'block' }}>⚔️ Class: {playerClass} (Lv.{level}) · ❤️ HP: {Math.round(playerHp)}/{maxHp}</small>
        </div>
        <div className="cls-badge">🪙 {Math.floor(playerGold)} Gold</div>
      </div>

      <h3>⚔️ Perlengkapan yang Sedang Digunakan ({equippedItems.length})</h3>
      <div className="list">
        {equippedItems.map((item) => (
          <div key={item.id} className="person row" style={{ background: '#f7edd4', borderColor: '#e8b84a' }}>
            <span>
              {item.icon} <b>{item.name}</b> <span className="badge ok" style={{ marginBottom: 0 }}>Dipakai</span>
              <small>{item.bonus}</small>
            </span>
            <button type="button" onClick={() => toggleEquipItem(item.id)}>Lepas</button>
          </div>
        ))}
        {equippedItems.length === 0 && <p className="note">Belum ada perlengkapan yang dipasang.</p>}
      </div>

      <h3>🎒 Isi Tas Inventory Milikmu ({bagItems.length})</h3>
      <div className="list">
        {bagItems.map((item) => (
          <div key={item.id} className="person row">
            <span>
              {item.icon} <b>{item.name}</b> {item.qty > 1 ? `×${item.qty}` : ''}
              <small>{item.bonus}</small>
            </span>
            {item.category === 'consumable' ? (
              <button type="button" onClick={() => useConsumableItem(item.id)}>🧪 Gunakan</button>
            ) : (
              <button type="button" onClick={() => toggleEquipItem(item.id)}>
                {item.equipped ? 'Lepas' : '⚔️ Pakai'}
              </button>
            )}
          </div>
        ))}
      </div>

      <h3>👕 Pakaian Karakter yang Dikenakan</h3>
      <p className="note" style={{ marginTop: 2 }}>
        Rambut: <b>{app.equipment.hair ?? 'Default'}</b> · Pakaian: <b>{app.equipment.torso ?? 'Default'}</b> · Sepatu: <b>{app.equipment.feet ?? 'Default'}</b>
      </p>
      <div className="actions">
        <button type="button" onClick={openWardrobe}>👕 Buka Profil &amp; Ganti Pakaian</button>
      </div>
    </div>
  )
}

function TownMood() {
  useGame((s) => Math.floor(s.time / 10))
  const avg = Math.round(RESIDENTS.reduce((a, r) => a + sim[r.id].needs.happiness, 0) / RESIDENTS.length)
  return <span title="Average resident happiness">{moodEmoji(avg)} {avg}%</span>
}

const NEEDS: [NeedKey, string, string][] = [
  ['hunger', '🍞', 'Fullness'], ['energy', '⚡', 'Energy'], ['social', '💬', 'Social'], ['health', '❤️', 'Health'], ['happiness', '😊', 'Happiness'],
]
const Bar = ({ value, label, icon }: { value: number; label: string; icon: string }) => (
  <div className="bar" title={`${label} ${Math.round(value)}`}>
    <span>{icon} {label}</span>
    <div><i style={{ width: `${value}%`, background: value < 25 ? '#c94f4f' : value < 50 ? '#e0a64a' : '#6aa35a' }} /></div>
  </div>
)

function ResidentPanel({ id }: { id: string }) {
  const r = RESIDENTS.find((x) => x.id === id)
  if (!r) return null
  const minute = useGame((s) => Math.floor(s.time))
  const select = useGame((s) => s.select)
  const live = npcLive[id]
  const s = sim[id]
  const prof = PROFESSIONS[r.profession]
  const friends = friendsOf(id).slice(0, 4)
  return (
    <div className="panel">
      <header><h2>{moodEmoji(s.needs.happiness)} {r.name}</h2><button className="x" onClick={() => select(null)} aria-label="Close">✕</button></header>
      {r.mock ? <span className="badge">Warga Desa · NPC</span> : <span className="badge ok">Member Komunitas{r.instagram ? ` · @${r.instagram}` : ''}</span>}
      <blockquote>“{gmLine(r, s.needs, live?.activity ?? '', s.level, dayOf(minute))}”</blockquote>
      <dl>
        <dt>Activity</dt><dd>{live?.activity ?? '—'}</dd>
        <dt>Personality</dt><dd>{r.personality}</dd>
        <dt>Profession</dt><dd>{r.profession}{r.work ? ` · Lv ${s.level}${s.level < MAX_LEVEL ? '' : ' (max)'}` : ''}</dd>
        {r.work && prof && <><dt>Shift</dt><dd>{prof.shift[0]}:00–{prof.shift[1]}:00 · 🪙 {wagePerHour(r.profession, s.level).toFixed(1)}/h</dd></>}
        {r.work && s.workStatus && <><dt>At work</dt><dd>{s.workStatus}{s.unpaid ? ' · ⚠️ unpaid (treasury empty)' : ''}</dd></>}
        <dt>Wealth</dt><dd>🪙 {Math.floor(s.wealth)}</dd>
        <dt>Home</dt><dd>{getBuilding(r.home) ? <a onClick={() => select({ type: 'building', id: r.home })}>{getBuilding(r.home)!.name}</a> : 'Town Shelter'}</dd>
        <dt>Workplace</dt><dd>{r.work && getBuilding(r.work) ? <a onClick={() => select({ type: 'building', id: r.work! })}>{getBuilding(r.work)?.name}</a> : 'None'}</dd>
      </dl>
      {r.work && s.level < MAX_LEVEL && <Bar value={(s.xp / xpToNext(s.level)) * 100} label={`XP to Lv ${s.level + 1}`} icon="⭐" />}
      <h3>Needs</h3>
      {NEEDS.map(([k, icon, label]) => <Bar key={k} value={s.needs[k]} label={label} icon={icon} />)}
      <h3>Relationships</h3>
      {friends.length === 0 ? <p className="note">No friends yet.</p> : (
        <div className="people">
          {friends.map((f) => (
            <button key={f.id} className="person" onClick={() => select({ type: 'resident', id: f.id })}>
              {byId(f.id).name}<small>{friendLevel(f.value)} · {Math.round(f.value)}</small>
            </button>
          ))}
        </div>
      )}
      <div className="actions">
        {live?.visible && <button onClick={() => useGame.getState().focusOn(live.x, live.z)}>🔍 Find in town</button>}
      </div>
    </div>
  )
}

function BiomeNpcPanel({ id }: { id: string }) {
  useGame((s) => s.rev)
  const [lineIdx, setLineIdx] = useState(0)
  const bnpc = getBiomeNpc(id)
  if (!bnpc) return null
  const select = useGame((s) => s.select)
  const live = biomeNpcLive[id]
  const bInfo = BIOME_INFO[bnpc.biome]
  const homeBuilding = getBuilding(bnpc.homeBuildingId)
  const biomeDungeon = BUILDINGS.find((q) => q.kind === 'dungeon' && q.biomeRegion === bnpc.biome)

  return (
    <div className="panel">
      <header>
        <h2>{bInfo.icon} {bnpc.name}</h2>
        <button className="x" onClick={() => select(null)} aria-label="Close">✕</button>
      </header>
      <span className="badge">🌍 NPC Biome · Tidak Dihitung Penduduk Desa</span>
      <blockquote>“{bnpc.lines[lineIdx % bnpc.lines.length]}”</blockquote>
      <dl>
        <dt>Peran</dt><dd><b>{bnpc.title}</b> ({bnpc.cls})</dd>
        <dt>Wilayah Biome</dt><dd>{bInfo.icon} {bInfo.name}</dd>
        <dt>Tempat Tinggal</dt>
        <dd>
          {homeBuilding ? (
            <a onClick={() => select({ type: 'building', id: homeBuilding.id })}>{homeBuilding.name}</a>
          ) : 'Pos Biome'}
        </dd>
        {biomeDungeon && (
          <>
            <dt>Dungeon Biome</dt>
            <dd><a onClick={() => select({ type: 'building', id: biomeDungeon.id })}>⚔️ {biomeDungeon.name}</a></dd>
          </>
        )}
      </dl>
      <p className="note">NPC ini tinggal menetap di {bInfo.name} dan bukan warga desa.</p>
      <div className="actions col">
        <button
          onClick={() => {
            talkWithBiomeNpc(id)
            setLineIdx((i) => i + 1)
          }}
        >
          💬 Ajak Bicara (+15 EXP)
        </button>
        <button
          onClick={() => {
            leaveInterior()
            const tx = live?.x ?? bnpc.homeX
            const tz = live?.z ?? bnpc.homeZ + 1.5
            player.pos.set(tx, Math.max(0, height(tx, tz)), tz)
            useGame.setState({ mode: 'third', selection: null })
          }}
        >
          🚶 Jalan / Teleport ke NPC Ini
        </button>
        <button onClick={() => useGame.getState().focusOn(live?.x ?? bnpc.homeX, live?.z ?? bnpc.homeZ)}>
          🔍 Lihat di Peta Biome
        </button>
      </div>
    </div>
  )
}

function MonsterPanel({ id }: { id: string }) {
  useGame((s) => s.rev)
  useGame((s) => Math.floor(s.time))
  const mon = getMonster(id)
  if (!mon) return null
  const select = useGame((s) => s.select)
  const st = monsterLive[id]
  const bInfo = BIOME_INFO[mon.biome]
  const hp = st?.hp ?? mon.maxHp
  const hpPct = Math.max(0, Math.min(100, (hp / mon.maxHp) * 100))
  const distFromTown = Math.round(Math.hypot(st?.x ?? mon.homeX, st?.z ?? mon.homeZ))

  return (
    <div className="panel">
      <header>
        <h2>👹 {mon.name}</h2>
        <button className="x" onClick={() => select(null)} aria-label="Close">✕</button>
      </header>
      <span className="badge">⚔️ Lv {mon.level} · Ukuran {mon.scale.toFixed(1)}× · {distFromTown}m dari Desa</span>
      <Bar value={hpPct} label={`HP ${hp} / ${mon.maxHp}`} icon="❤️" />
      <dl>
        <dt>Spesies &amp; Serangan</dt><dd><b>{mon.species.replace('_', ' ').toUpperCase()}</b> · −{mon.damage} HP / serangan</dd>
        <dt>Wilayah Biome</dt><dd>{bInfo.icon} {bInfo.name}</dd>
        <dt>Hadiah Kalahkan</dt>
        <dd>
          ⭐ +{mon.xp} EXP · 🪙 +{mon.gold} Emas · {RESOURCE_ICON[mon.drop[0]]} +{mon.drop[1]} {mon.drop[0]}
        </dd>
      </dl>
      <p className="note">{mon.description} (Otomatis menyerang saat kamu mendekat!)</p>
      <div className="actions col">
        <button onClick={() => attackMonster(id)}>
          ⚔️ Serang Monster ({hp}/{mon.maxHp} HP)
        </button>
        <button
          onClick={() => {
            leaveInterior()
            const tx = (st?.x ?? mon.homeX)
            const tz = (st?.z ?? mon.homeZ) + 4
            player.pos.set(tx, Math.max(0, height(tx, tz)), tz)
            useGame.setState({ mode: 'third', selection: { type: 'monster', id } })
          }}
        >
          🚶 Jalan / Teleport ke Monster Ini
        </button>
        <button onClick={() => useGame.getState().focusOn(st?.x ?? mon.homeX, st?.z ?? mon.homeZ)}>
          🔍 Lihat Lokasi Monster
        </button>
      </div>
    </div>
  )
}

function RespawnBanner() {
  const deadUntil = useGame((s) => s.playerDeadUntil)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!deadUntil) return
    const timer = setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(timer)
  }, [deadUntil])

  if (!deadUntil) return null
  const remSec = Math.max(0, Math.ceil((deadUntil - Date.now()) / 1000))
  const mm = String(Math.floor(remSec / 60)).padStart(2, '0')
  const ss = String(remSec % 60).padStart(2, '0')

  return (
    <div className="respawn-banner" role="alert">
      <b>💀 Kamu Gugur dalam Pertarungan!</b>
      <span>⏳ Respawn otomatis di Desa dalam <b>{mm}:{ss}</b></span>
    </div>
  )
}

function ListPanel({ panel, close, openProfile }: { panel: 'residents' | 'buildings' | 'settings'; close: () => void; openProfile: () => void }) {
  const s = useGame.getState()
  const userRole = useGame((st) => st.userRole)
  const loggedIg = useGame((st) => st.loggedInstagram)
  const isDemo = useGame((st) => st.isDemoPlayer)
  useGame((st) => Math.floor(st.time))
  useGame((st) => st.rev)
  const [followerInput, setFollowerInput] = useState(() => String(getVillagePopulation()))
  const [confirmReset, setConfirmReset] = useState(false)
  const isGm = userRole === 'gm'

  if (panel === 'settings') {
    return (
      <div className="panel">
        <header><h2>⚙️ Settings</h2><button className="x" onClick={close} aria-label="Close">✕</button></header>
        <h3>Mode Akun Aktif</h3>
        <div className="card-in" style={{ background: '#fffaf0' }}>
          <b>{isGm ? '👑 Mode Guild Master (GM)' : `⚔️ Mode Player (${s.playerClass})`}</b>
          <small style={{ display: 'block', marginTop: 2 }}>
            {loggedIg ? `Instagram: @${loggedIg}` : 'Sesi Lokal / GM'}
          </small>
          <div className="actions" style={{ marginTop: 8 }}>
            <button type="button" onClick={() => { s.logoutToMenu(); close() }}>
              🚪 Logout ke Menu Login
            </button>
          </div>
        </div>

        <h3>Sound</h3>
        <SoundBox />
        <h3>Controls</h3>
        <ul className="help">
          <li><b>WASD</b> / panah untuk jalan, <b>Shift</b> lari, <b>E</b> interaksi / serang, <b>Space</b> ayunkan senjata</li>
          <li>Geser layar untuk melihat peta, cubit 2 jari (Pinch In / Out) atau scroll untuk Zoom</li>
          <li><b>V</b> kembali ikuti karakter</li>
        </ul>
        <h3>Appearance</h3>
        <div className="actions"><button onClick={openProfile}>👕 Profil &amp; Lemari Pakaian</button></div>
        {isGm && (
          <>
            <h3>Cloud save (Khusus GM)</h3>
            <CloudSaveBox />
            <h3>World (Khusus GM)</h3>
            <p className="note">The town saves automatically in this browser every 15 seconds.</p>
            {confirmReset ? (
              <div className="card-in">
                <p className="note warn" style={{ marginTop: 0, marginBottom: 6 }}>Reset seluruh dunia desa ke kondisi awal?</p>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button style={{ background: '#b8392f', color: '#fff8ec' }} onClick={() => { resetWorld(); useGame.setState((st) => ({ rev: st.rev + 1 })); close() }}>✓ Ya, Reset</button>
                  <button onClick={() => setConfirmReset(false)}>Batal</button>
                </div>
              </div>
            ) : (
              <div className="actions">
                <button onClick={() => setConfirmReset(true)}>↺ Reset world</button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  const goTo = (type: 'building' | 'resident' | 'biomeNpc' | 'monster', id: string, x: number, z: number) => {
    s.select({ type, id })
    s.focusOn(x, z)
    close()
  }

  if (panel === 'residents') {
    const pStats = getPlayerTotalStats(loggedIg, isDemo)
    const accounts = getPlayerAccounts()
    return (
      <div className="panel">
        <header><h2>👥 Warga &amp; Total Player</h2><button className="x" onClick={close} aria-label="Close">✕</button></header>
        <div className="card-in" style={{ background: '#fffaf0', marginBottom: 8 }}>
          <b>👥 Total Player: {pStats.online} Online / {pStats.offline} Offline</b>
          <small style={{ display: 'block', marginTop: 2 }}>
            🏘️ Jumlah Warga Desa Aktif: <b>{RESIDENTS.length} Warga</b>
          </small>
        </div>

        {isGm && (
          <div className="share" style={{ marginBottom: 8 }}>
            <small>Atur Kapasitas Warga:</small>
            <input
              type="number"
              min={0}
              style={{ width: 80 }}
              value={followerInput}
              onChange={(e) => setFollowerInput(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                const v = Math.max(0, Math.floor(Number(followerInput) || 0))
                setFollowerCount(v)
                setFollowerInput(String(v))
                s.notify(`Jumlah warga desa diatur menjadi ${v}!`)
              }}
            >
              Set
            </button>
          </div>
        )}

        <div className="list">
          <h3>🎮 Daftar Player Terdaftar ({accounts.length})</h3>
          {accounts.map((acc) => (
            <div key={acc.instagram} className="person row">
              <span>
                {acc.online ? '🟢' : '⚪'} <b>@{acc.instagram}</b> ({acc.displayName})
                <small>⚔️ Class: {acc.cls} · Status: {acc.online ? 'Online' : 'Offline'}</small>
              </span>
            </div>
          ))}

          <h3>🏘️ Warga Aktif di Desa ({RESIDENTS.length})</h3>
          {RESIDENTS.map((r) => {
            const l = npcLive[r.id]
            return (
              <button key={r.id} className="person" onClick={() => goTo('resident', r.id, l?.x ?? 0, l?.z ?? 0)}>
                {moodEmoji(sim[r.id].needs.happiness)} {r.name}{r.mock ? '' : ' ★'}
                <small>{r.profession} Lv {sim[r.id].level} · {l?.activity ?? ''}</small>
              </button>
            )
          })}

          <h3>🌍 NPC Penghuni Biome ({BIOME_NPCS.length})</h3>
          {BIOME_NPCS.map((bnpc) => {
            const l = biomeNpcLive[bnpc.id]
            const bInfo = BIOME_INFO[bnpc.biome]
            return (
              <button key={bnpc.id} className="person" onClick={() => goTo('biomeNpc', bnpc.id, l?.x ?? bnpc.homeX, l?.z ?? bnpc.homeZ)}>
                {bInfo.icon} {bnpc.name}
                <small>{bnpc.title} · {bInfo.name}</small>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const dungeons = BUILDINGS.filter((b) => b.kind === 'dungeon')
  const outposts = BUILDINGS.filter((b) => b.kind === 'outpost')
  const townBuildings = BUILDINGS.filter((b) => b.kind !== 'dungeon' && b.kind !== 'outpost')

  return (
    <div className="panel">
      <header><h2>Buildings, Dungeons &amp; Monsters</h2><button className="x" onClick={close} aria-label="Close">✕</button></header>
      <div className="list">
        <h3>⚔️ Dungeon di Setiap Biome ({dungeons.length})</h3>
        {dungeons.map((b) => {
          const d = DUNGEONS[b.id]
          const bInfo = d ? BIOME_INFO[d.biome] : null
          return (
            <button key={b.id} className="person" onClick={() => goTo('building', b.id, b.x, b.z)}>
              {bInfo?.icon ?? '⚔️'} {b.name}
              <small>Boss: {d?.boss ?? 'Unknown'} · Hadiah +{d?.xp ?? 75} EXP</small>
            </button>
          )
        })}

        <h3>👹 Monster di Seluruh Biome ({MOUNTAIN_MONSTERS.length})</h3>
        {MOUNTAIN_MONSTERS.map((mon) => {
          const l = monsterLive[mon.id]
          const bInfo = BIOME_INFO[mon.biome]
          return (
            <button key={mon.id} className="person" onClick={() => goTo('monster', mon.id, l?.x ?? mon.homeX, l?.z ?? mon.homeZ)}>
              👹 {mon.name} (Lv.{mon.level})
              <small>{bInfo.icon} {bInfo.name} · +{mon.xp} EXP</small>
            </button>
          )
        })}

        <h3>🏕️ Bangunan &amp; Pos Biome ({outposts.length})</h3>
        {outposts.map((b) => {
          const bInfo = b.biomeRegion ? BIOME_INFO[b.biomeRegion] : null
          return (
            <button key={b.id} className="person" onClick={() => goTo('building', b.id, b.x, b.z)}>
              {bInfo?.icon ?? '🏕️'} {b.name}
              <small>{bInfo?.name ?? 'Biome'}</small>
            </button>
          )
        })}

        <h3>🏘️ Bangunan Desa ({townBuildings.length})</h3>
        {townBuildings.map((b) => {
          const st = town.b[b.id]
          return (
            <button key={b.id} className="person" onClick={() => goTo('building', b.id, b.x, b.z)}>
              {b.name}
              <small>{st?.level ? `Level ${st.level}` : 'Under construction'}{st?.job?.type === 'upgrade' ? ' · upgrading' : ''}</small>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function HUD() {
  const [panel, setPanel] = useState<Panel>(null)
  const userRole = useGame((s) => s.userRole)
  const selection = useGame((s) => s.selection)
  const nearby = useGame((s) => s.nearby)
  const placing = useGame((s) => !!s.placing)
  const toast = useGame((s) => s.toast)
  const deadUntil = useGame((s) => s.playerDeadUntil)
  useGame((s) => s.rev)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'KeyV') useGame.getState().toggleMode()
      if (e.code === 'Escape' && !useGame.getState().placing) { useGame.getState().select(null); setPanel(null) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (selection) setPanel(null) }, [selection])
  const openPanel = useGame((s) => s.openPanel)
  useEffect(() => { if (openPanel) { setPanel(openPanel as Panel); useGame.setState({ openPanel: null, selection: null }) } }, [openPanel])

  const spot = nearby && isSpot(nearby.id) ? ROOMS[nearby.id.split(':')[0] as RoomId].spots[nearby.id.split(':')[1]] : null
  const nearbyName = spot
    ? spot.label
    : nearby && (
      nearby.type === 'building'
        ? getBuilding(nearby.id)?.name
        : nearby.type === 'biomeNpc'
          ? getBiomeNpc(nearby.id)?.name
          : nearby.type === 'monster'
            ? getMonster(nearby.id)?.name
            : RESIDENTS.find((r) => r.id === nearby.id)?.name
    )

  // Player Mode only shows 4 buttons (Misi, Warga, Inventory, Setting); GM Mode shows full 9 management buttons
  const playerNav: [Exclude<Panel, null | 'profile'>, string][] = [
    ['quests', 'Misi'],
    ['residents', 'Warga'],
    ['inventory', 'Inventory'],
    ['settings', 'Setting'],
  ]
  const gmNav: [Exclude<Panel, null | 'profile' | 'quests' | 'inventory'> | 'town', string][] = [
    ['town', 'Town'],
    ['residents', 'Residents'],
    ['buildings', 'Buildings'],
    ['build', 'Build'],
    ['storage', 'Storage'],
    ['guild', 'Guild'],
    ['chronicle', 'Chronicle'],
    ['community', 'Community'],
    ['settings', 'Settings'],
  ]
  const nav = userRole === 'player' ? playerNav : gmNav

  return (
    <div className="hud">
      <div className="hud-top">
        <TopBar
          isProfileOpen={!selection && panel === 'profile'}
          toggleProfile={() => {
            useGame.setState({ selection: null, placing: null })
            setPanel(panel === 'profile' ? null : 'profile')
          }}
          openStorageOrInventory={() => {
            useGame.getState().select(null)
            setPanel(userRole === 'gm' ? 'storage' : 'inventory')
          }}
        />
        <nav className={`nav ${userRole === 'player' ? 'nav-player' : 'nav-gm'}`}>
          {nav.map(([id, label]) => (
            <button key={id} className={panel === id ? 'on' : ''} onClick={() => {
              if (id === 'town') { useGame.setState({ selection: null }); useGame.getState().focusOn(0, 2); setPanel(null) }
              else { useGame.setState({ selection: null, placing: null }); setPanel(panel === id ? null : id) }
            }}>
              <PixelIcon name={id} /><small>{label}</small>
            </button>
          ))}
        </nav>
      </div>

      <RespawnBanner />
      {selection?.type === 'building' && <BuildingPanel id={selection.id} />}
      {selection?.type === 'resident' && <ResidentPanel id={selection.id} />}
      {selection?.type === 'biomeNpc' && <BiomeNpcPanel id={selection.id} />}
      {selection?.type === 'monster' && <MonsterPanel id={selection.id} />}
      {!selection && panel === 'profile' && <ProfilePanel close={() => setPanel(null)} />}
      {!selection && panel === 'quests' && <PlayerQuestsPanel close={() => setPanel(null)} />}
      {!selection && panel === 'inventory' && (
        <PlayerInventoryPanel close={() => setPanel(null)} openWardrobe={() => setPanel('profile')} />
      )}
      {!selection && userRole === 'gm' && panel === 'build' && <BuildMenu close={() => setPanel(null)} />}
      {!selection && userRole === 'gm' && panel === 'storage' && <StoragePanel close={() => setPanel(null)} />}
      {!selection && userRole === 'gm' && panel === 'community' && <CommunityPanel close={() => setPanel(null)} />}
      {!selection && userRole === 'gm' && panel === 'guild' && <GuildPanel close={() => setPanel(null)} />}
      {!selection && userRole === 'gm' && panel === 'chronicle' && <ChroniclePanel close={() => setPanel(null)} />}
      {!selection && (panel === 'residents' || panel === 'buildings' || panel === 'settings') && (
        <ListPanel panel={panel} close={() => setPanel(null)} openProfile={() => setPanel('profile')} />
      )}
      <PlacementBar />
      {toast && <div className="toast" role="status">{toast}</div>}

      {/* Hide floating prompt whenever any panel or selection is open so it never overlaps menus (Image 3 fix) */}
      {!placing && nearby && !selection && !panel && !deadUntil && (
        <button className="prompt" onClick={interact}>
          {!touch && <kbd>E</kbd>}{' '}
          {spot
            ? ''
            : nearby.type === 'monster'
              ? '⚔️ Lawan'
              : nearby.type === 'resident' || nearby.type === 'biomeNpc'
                ? 'Talk to'
                : getBuilding(nearby.id)?.kind === 'dungeon'
                  ? '⚔️ Raid'
                  : roomKindOf(nearby.id)
                    ? 'Enter'
                    : 'Inspect'}{' '}
          {nearbyName}
        </button>
      )}
      {touch && !placing && !selection && !panel && !deadUntil && <MobileControls />}
    </div>
  )
}
