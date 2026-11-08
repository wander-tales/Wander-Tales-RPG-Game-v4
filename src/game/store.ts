import { create } from 'zustand'
import type { BuildingKind } from './map.ts'
import { CLASSES, type GuildClass } from './recruitment.ts'
import {
  buildNextQuestForSlot,
  buildQuestsForClassAndLevel,
  findPlayerAccount,
  starterInventoryForClass,
  upsertPlayerAccount,
  type ClassQuest,
  type PlayerAccount,
  type PlayerInventoryItem,
  type QuestObjectiveType,
} from './playerAuthAndQuests.ts'
import { cloudPlayerLogout, cloudPlayerSave } from './playerCloud.ts'

export type CameraMode = 'iso' | 'third'
export type UserRole = 'gm' | 'player'
export type Selection = { type: 'building' | 'resident' | 'biomeNpc' | 'monster'; id: string } | null

const load = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const save = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } }

const loadClass = (): GuildClass => {
  const c = load('wt.class') as GuildClass | null
  return c && (CLASSES as readonly string[]).includes(c) ? c : 'Warrior'
}
const loadXp = (): number => {
  const n = Number(load('wt.xp'))
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 45
}
const loadClassLocked = (): boolean => load('wt.classLocked') === '1'

export function playerLevelInfo(totalXp: number) {
  let level = 1
  let rem = Math.max(0, Math.floor(totalXp))
  while (rem >= level * 100) {
    rem -= level * 100
    level++
  }
  const maxHp = 100 + (level - 1) * 20
  return { level, currentXp: rem, nextXp: level * 100, totalXp: Math.max(0, Math.floor(totalXp)), maxHp }
}

export const PLAYER_RESPAWN_MS = 120_000 // 2 minutes (120 seconds) respawn timer when player dies

interface GameState {
  screen: 'menu' | 'playing'
  userRole: UserRole
  isDemoPlayer: boolean
  loggedInstagram: string | null
  classLocked: boolean
  playerName: string
  playerClass: GuildClass
  playerXp: number
  playerHp: number
  playerGold: number
  playerInventory: PlayerInventoryItem[]
  classQuests: ClassQuest[]
  completedQuestsCount: number
  /** Timestamp (Date.now() + 120000) until the player respawns after dying; null when alive */
  playerDeadUntil: number | null
  /** Timestamp (performance.now()) until player red hit flash ends */
  playerHitUntil: number
  mode: CameraMode
  /** building id the player is standing inside (any building with a room, e.g. 'guild' or a cottage like 'h2'), or null outside */
  interior: string | null
  /** game minutes since day 1, 00:00 */
  time: number
  timeScale: number
  selection: Selection
  hovered: string | null
  nearby: Selection
  /** bumped whenever town data changes, so the UI and scene re-render */
  rev: number
  /** building being placed (construction preview) */
  placing: { kind: BuildingKind; rot: number; x: number | null; z: number | null } | null
  toast: string | null
  /** request the HUD to open a side panel (e.g. from a building) */
  openPanel: string | null
  /** camera focus request (iso) */
  focus: [number, number] | null
  start: (name: string) => void
  loginAsPlayer: (account: PlayerAccount) => void
  loginAsGm: (name?: string) => void
  startDemoAsPlayer: (cls?: GuildClass) => void
  toggleDemoRole: () => void
  logoutToMenu: () => void
  setPlayerName: (name: string) => void
  setPlayerClass: (cls: GuildClass) => void
  lockPlayerClass: (cls: GuildClass) => void
  gainXp: (amount: number) => void
  healPlayer: (amount: number) => void
  damagePlayer: (amount: number, attackerName: string) => boolean
  checkPlayerRespawn: (onRespawned?: () => void) => boolean
  recordQuestProgress: (type: QuestObjectiveType, amount?: number) => void
  claimQuestReward: (questId: string) => void
  toggleEquipItem: (itemId: string) => void
  useConsumableItem: (itemId: string) => void
  setMode: (m: CameraMode) => void
  toggleMode: () => void
  tick: (realSeconds: number) => void
  setTimeScale: (s: number) => void
  select: (s: Selection) => void
  setHovered: (id: string | null) => void
  setNearby: (s: Selection) => void
  focusOn: (x: number, z: number) => void
  notify: (msg: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
let cloudSaveTimer: ReturnType<typeof setTimeout> | undefined
const initialClass = loadClass()
const rawSavedName = load('wt.name')
const initialName = rawSavedName && rawSavedName !== 'Guild Master' ? rawSavedName : initialClass
const initialXp = loadXp()
const initialLv = playerLevelInfo(initialXp).level
const initialMaxHp = playerLevelInfo(initialXp).maxHp

function syncAccountProgress(state: {
  loggedInstagram: string | null
  playerName: string
  playerClass: GuildClass
  classLocked: boolean
  playerXp: number
  playerGold: number
  playerInventory: PlayerInventoryItem[]
  classQuests?: ClassQuest[]
  completedQuestsCount?: number
}) {
  if (!state.loggedInstagram) return
  const acc = findPlayerAccount(state.loggedInstagram)
  if (acc) {
    upsertPlayerAccount({
      ...acc,
      displayName: state.playerName || acc.cls,
      cls: state.playerClass,
      classLocked: state.classLocked,
      xp: state.playerXp,
      gold: state.playerGold,
      inventory: state.playerInventory,
      online: true,
    })
  }

  // Debounce cloud writes so combat and quest progress do not flood the database.
  clearTimeout(cloudSaveTimer)
  const snapshot = {
    playerName: state.playerName,
    playerClass: state.playerClass,
    classLocked: state.classLocked,
    xp: state.playerXp,
    gold: state.playerGold,
    inventory: state.playerInventory,
    quests: state.classQuests ?? [],
    completedQuestsCount: state.completedQuestsCount ?? 0,
  }
  cloudSaveTimer = setTimeout(() => {
    void cloudPlayerSave(snapshot).catch((error) => console.warn('[WanderTales] Cloud save failed:', error))
  }, 700)
}

export const useGame = create<GameState>((set, get) => ({
  screen: 'menu',
  userRole: 'player',
  isDemoPlayer: false,
  loggedInstagram: null,
  classLocked: loadClassLocked(),
  playerName: initialName,
  playerClass: initialClass,
  playerXp: initialXp,
  playerHp: initialMaxHp,
  playerGold: 100,
  playerInventory: starterInventoryForClass(initialClass),
  classQuests: buildQuestsForClassAndLevel(initialClass, initialLv, 0),
  completedQuestsCount: 0,
  playerDeadUntil: null,
  playerHitUntil: 0,
  mode: 'third',
  interior: null,
  time: 8 * 60,
  timeScale: 2, // 2 game minutes per real second → a day lasts 12 minutes
  selection: null,
  hovered: null,
  nearby: null,
  rev: 0,
  placing: null,
  toast: null,
  openPanel: null,
  focus: null,

  start: (name) => {
    const finalName = name.trim() || get().playerClass
    save('wt.name', finalName)
    set({ screen: 'playing', playerName: finalName, mode: 'third' })
  },

  loginAsPlayer: (account) => {
    const info = playerLevelInfo(account.xp)
    const cleanDisplay =
      account.displayName && account.displayName !== 'Guild Master'
        ? account.displayName
        : account.cls
    save('wt.name', cleanDisplay)
    save('wt.class', account.cls)
    save('wt.xp', String(account.xp))
    save('wt.classLocked', account.classLocked ? '1' : '0')
    set((s) => ({
      screen: 'playing',
      userRole: 'player',
      isDemoPlayer: false,
      loggedInstagram: account.instagram,
      playerName: cleanDisplay,
      playerClass: account.cls,
      classLocked: account.classLocked,
      playerXp: account.xp,
      playerHp: info.maxHp,
      playerGold: account.gold ?? 100,
      playerInventory: account.inventory?.length ? account.inventory : starterInventoryForClass(account.cls),
      classQuests: account.questState?.length ? account.questState : buildQuestsForClassAndLevel(account.cls, info.level, 0),
      completedQuestsCount: account.completedQuestsCount ?? 0,
      timeScale: 2, // Fast-forward disabled in Player mode
      mode: 'third',
      selection: null,
      placing: null,
      rev: s.rev + 1,
      toast: `⚔️ Selamat datang, @${account.instagram} (${account.cls} Lv.${info.level})!`,
    }))
  },

  loginAsGm: () => {
    const gmName = 'Guild Master'
    save('wt.name', gmName)
    set((s) => ({
      screen: 'playing',
      userRole: 'gm',
      isDemoPlayer: false,
      loggedInstagram: null,
      playerName: gmName,
      mode: 'third',
      selection: null,
      rev: s.rev + 1,
      toast: '👑 Login berhasil sebagai Guild Master!',
    }))
  },

  startDemoAsPlayer: (cls) => {
    const currentCls = cls ?? get().playerClass ?? 'Warrior'
    const xp = get().playerXp || 45
    const info = playerLevelInfo(xp)
    save('wt.name', currentCls)
    save('wt.class', currentCls)
    save('wt.classLocked', '1')
    set((s) => ({
      screen: 'playing',
      userRole: 'player',
      isDemoPlayer: true,
      loggedInstagram: 'demo.player',
      playerName: currentCls,
      playerClass: currentCls,
      classLocked: true,
      playerHp: info.maxHp,
      playerInventory: starterInventoryForClass(currentCls),
      classQuests: buildQuestsForClassAndLevel(currentCls, info.level, 0),
      timeScale: 2, // Player mode always runs at normal 1x speed
      mode: 'third',
      selection: null,
      placing: null,
      rev: s.rev + 1,
      toast: `🎮 Mode Demo Player Aktif (${currentCls} Lv.${info.level})!`,
    }))
  },

  toggleDemoRole: () => {
    const s = get()
    if (s.userRole === 'gm') {
      const info = playerLevelInfo(s.playerXp)
      const nextName =
        !s.playerName || s.playerName === 'Guild Master' ? s.playerClass : s.playerName
      set({
        userRole: 'player',
        isDemoPlayer: true,
        playerName: nextName,
        classLocked: true,
        timeScale: 2,
        placing: null,
        selection: null,
        classQuests: s.classQuests.length ? s.classQuests : buildQuestsForClassAndLevel(s.playerClass, info.level, s.completedQuestsCount),
        rev: s.rev + 1,
        toast: `🎮 Beralih ke Demo as Player (${s.playerClass})`,
      })
    } else {
      set({
        userRole: 'gm',
        isDemoPlayer: true,
        playerName: 'Guild Master',
        selection: null,
        rev: s.rev + 1,
        toast: '👑 Beralih ke Mode Guild Master (GM)',
      })
    }
  },

  logoutToMenu: () => {
    const s = get()
    void cloudPlayerLogout().catch((error) => console.warn('[WanderTales] Cloud logout failed:', error))
    if (s.loggedInstagram) {
      const acc = findPlayerAccount(s.loggedInstagram)
      if (acc) upsertPlayerAccount({ ...acc, online: false })
    }
    set({
      screen: 'menu',
      selection: null,
      placing: null,
      openPanel: null,
      timeScale: 2,
    })
  },

  setPlayerName: (raw) => {
    const s = get()
    const fallback = s.userRole === 'gm' ? 'Guild Master' : s.playerClass
    const playerName = raw.trim().slice(0, 24) || fallback
    save('wt.name', playerName)
    set({ playerName })
    syncAccountProgress({ ...get(), playerName })
  },

  setPlayerClass: (playerClass) => {
    const s = get()
    // Enforce 1 permanent class per player! Only allow changing if not locked yet.
    if (s.classLocked) {
      clearTimeout(toastTimer)
      set({ toast: `🔒 Class kamu sudah terkunci permanen sebagai ${s.playerClass} dan tidak bisa diganti!` })
      toastTimer = setTimeout(() => set({ toast: null }), 3500)
      return
    }
    const lv = playerLevelInfo(s.playerXp).level
    const shouldRenameToClass =
      !s.playerName ||
      s.playerName === 'Guild Master' ||
      (CLASSES as readonly string[]).includes(s.playerName)
    const nextName = shouldRenameToClass ? playerClass : s.playerName
    save('wt.name', nextName)
    save('wt.class', playerClass)
    save('wt.classLocked', '1')
    const nextInv = starterInventoryForClass(playerClass)
    const nextQuests = buildQuestsForClassAndLevel(playerClass, lv, s.completedQuestsCount)
    set((prev) => ({
      playerName: nextName,
      playerClass,
      classLocked: true,
      playerInventory: nextInv,
      classQuests: nextQuests,
      rev: prev.rev + 1,
      toast: `🔒 Class ${playerClass} telah dipilih secara permanen! Misi ${playerClass} kini aktif.`,
    }))
    syncAccountProgress({
      ...get(),
      playerName: nextName,
      playerClass,
      classLocked: true,
      playerInventory: nextInv,
    })
  },

  lockPlayerClass: (cls) => {
    const s = get()
    if (s.classLocked) {
      s.notify(`🔒 Class sudah terkunci sebagai ${s.playerClass}!`)
      return
    }
    const lv = playerLevelInfo(s.playerXp).level
    const shouldRenameToClass =
      !s.playerName ||
      s.playerName === 'Guild Master' ||
      (CLASSES as readonly string[]).includes(s.playerName)
    const nextName = shouldRenameToClass ? cls : s.playerName
    save('wt.name', nextName)
    save('wt.class', cls)
    save('wt.classLocked', '1')
    const nextInv = starterInventoryForClass(cls)
    const nextQuests = buildQuestsForClassAndLevel(cls, lv, s.completedQuestsCount)
    set((prev) => ({
      playerName: nextName,
      playerClass: cls,
      classLocked: true,
      playerInventory: nextInv,
      classQuests: nextQuests,
      rev: prev.rev + 1,
      toast: `🔒 Class ${cls} dikunci permanen! Selesaikan Misi Class untuk naik level.`,
    }))
    syncAccountProgress({
      ...get(),
      playerName: nextName,
      playerClass: cls,
      classLocked: true,
      playerInventory: nextInv,
    })
  },

  gainXp: (amount) =>
    set((s) => {
      const prevLv = playerLevelInfo(s.playerXp).level
      const playerXp = Math.max(0, s.playerXp + Math.floor(amount))
      save('wt.xp', String(playerXp))
      const info = playerLevelInfo(playerXp)
      syncAccountProgress({ ...s, playerXp })
      if (info.level > prevLv) {
        clearTimeout(toastTimer)
        toastTimer = setTimeout(() => set({ toast: null }), 4000)
        // Upgrade unstarted quests to match higher level difficulty
        const updatedQuests = s.classQuests.map((q, idx) =>
          q.progress === 0 ? buildNextQuestForSlot(s.playerClass, idx, info.level, s.completedQuestsCount) : q,
        )
        return {
          playerXp,
          playerHp: info.maxHp,
          classQuests: updatedQuests,
          toast: `🎉 Level Up! Kamu mencapai Level ${info.level} (HP Penuh: ${info.maxHp})! Misi Class meningkat ke kesulitan baru!`,
        }
      }
      return { playerXp }
    }),

  healPlayer: (amount) =>
    set((s) => {
      if (s.playerDeadUntil) return s
      const maxHp = playerLevelInfo(s.playerXp).maxHp
      return { playerHp: Math.min(maxHp, s.playerHp + Math.floor(amount)) }
    }),

  damagePlayer: (amount, attackerName) => {
    const s = get()
    if (s.playerDeadUntil && Date.now() < s.playerDeadUntil) return false
    const nextHp = Math.max(0, Math.round(s.playerHp - Math.max(1, Math.floor(amount))))
    const hitUntil = performance.now() + 420
    if (nextHp <= 0) {
      const deadUntil = Date.now() + PLAYER_RESPAWN_MS
      clearTimeout(toastTimer)
      const msg = `💀 Kamu gugur diserang ${attackerName}! Respawn dalam 2 menit (02:00)...`
      toastTimer = setTimeout(() => set({ toast: null }), 5000)
      set({ playerHp: 0, playerDeadUntil: deadUntil, playerHitUntil: hitUntil, toast: msg, selection: null })
      return true
    }
    set({ playerHp: nextHp, playerHitUntil: hitUntil })
    return false
  },

  checkPlayerRespawn: (onRespawned) => {
    const s = get()
    if (!s.playerDeadUntil) return false
    if (Date.now() >= s.playerDeadUntil) {
      const maxHp = playerLevelInfo(s.playerXp).maxHp
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => set({ toast: null }), 4000)
      set({
        playerHp: maxHp,
        playerDeadUntil: null,
        mode: 'third',
        focus: null,
        interior: null,
        toast: '✨ Kamu telah Respawn kembali di Desa dengan HP penuh!',
      })
      onRespawned?.()
      return true
    }
    return false
  },

  recordQuestProgress: (type, amount = 1) => {
    const s = get()
    let anyCompletedNow = false
    let completedTitle = ''
    const nextQuests = s.classQuests.map((q) => {
      const matches =
        q.objectiveType === type ||
        (q.objectiveType === 'kill_any' && (type === 'kill_slime' || type === 'kill_goblin' || type === 'kill_any'))
      if (!matches) return q
      if (q.progress >= q.target) return q
      const nextProg = Math.min(q.target, Math.round((q.progress + amount) * 10) / 10)
      if (nextProg >= q.target && q.progress < q.target) {
        anyCompletedNow = true
        completedTitle = q.title
      }
      return { ...q, progress: nextProg }
    })
    set({ classQuests: nextQuests })
    syncAccountProgress({ ...get(), classQuests: nextQuests })
    if (anyCompletedNow) {
      get().notify(`✅ Misi Selesai: "${completedTitle}"! Buka menu Misi untuk klaim hadiah.`)
    }
  },

  claimQuestReward: (questId) => {
    const s = get()
    const idx = s.classQuests.findIndex((q) => q.id === questId)
    if (idx < 0) return
    const q = s.classQuests[idx]
    if (q.progress < q.target) {
      s.notify('⚠️ Selesaikan target misi terlebih dahulu sebelum klaim hadiah!')
      return
    }
    const nextCompletedCount = s.completedQuestsCount + 1
    const nextXp = s.playerXp + q.rewardXp
    save('wt.xp', String(nextXp))
    const nextLv = playerLevelInfo(nextXp).level
    const nextGold = s.playerGold + q.rewardGold

    // Add reward item to inventory
    const inv = [...s.playerInventory]
    const existingItem = inv.find((i) => i.name === q.rewardItem.name)
    if (existingItem) {
      existingItem.qty += 1
    } else {
      inv.push({ ...q.rewardItem })
    }

    // Generate next harder quest for this slot scaled to new level & completed count
    const nextQuest = buildNextQuestForSlot(s.playerClass, idx, nextLv, nextCompletedCount)
    const nextQuests = [...s.classQuests]
    nextQuests[idx] = nextQuest

    set((prev) => ({
      playerXp: nextXp,
      playerHp: Math.max(prev.playerHp, playerLevelInfo(nextXp).maxHp),
      playerGold: nextGold,
      playerInventory: inv,
      classQuests: nextQuests,
      completedQuestsCount: nextCompletedCount,
      rev: prev.rev + 1,
    }))
    syncAccountProgress({
      ...get(),
      playerXp: nextXp,
      playerGold: nextGold,
      playerInventory: inv,
    })
    s.notify(`🎁 Klaim Berhasil! +${q.rewardXp} EXP, +${q.rewardGold} Gold & ${q.rewardItem.icon} ${q.rewardItem.name}! Misi baru (Tier ${nextQuest.tier}) terbuka!`)
  },

  toggleEquipItem: (itemId) => {
    const s = get()
    const target = s.playerInventory.find((i) => i.id === itemId)
    if (!target) return
    const nextInv = s.playerInventory.map((item) => {
      if (item.id === itemId) return { ...item, equipped: !item.equipped }
      if (!target.equipped && item.category === target.category && item.category !== 'consumable') {
        return { ...item, equipped: false }
      }
      return item
    })
    set((prev) => ({ playerInventory: nextInv, rev: prev.rev + 1 }))
    syncAccountProgress({ ...get(), playerInventory: nextInv })
    s.notify(target.equipped ? `${target.name} dilepas.` : `⚔️ ${target.name} digunakan!`)
  },

  useConsumableItem: (itemId) => {
    const s = get()
    const target = s.playerInventory.find((i) => i.id === itemId)
    if (!target || target.category !== 'consumable' || target.qty <= 0) return
    s.healPlayer(55)
    const nextInv = s.playerInventory
      .map((i) => (i.id === itemId ? { ...i, qty: i.qty - 1 } : i))
      .filter((i) => i.qty > 0)
    set((prev) => ({ playerInventory: nextInv, rev: prev.rev + 1 }))
    syncAccountProgress({ ...get(), playerInventory: nextInv })
    s.notify(`🧪 Menggunakan ${target.name}! HP dipulihkan.`)
  },

  setMode: (mode) => set((s) => (s.interior ? s : { mode })),
  toggleMode: () => set((s) => (s.interior ? s : { mode: s.mode === 'iso' ? 'third' : 'iso' })),
  tick: (dt) =>
    set((s) => {
      const maxHp = playerLevelInfo(s.playerXp).maxHp
      const canRegen = !s.playerDeadUntil && s.playerHp < maxHp && performance.now() > s.playerHitUntil + 6000
      const nextHp = canRegen ? Math.min(maxHp, s.playerHp + dt * 1.5) : s.playerHp
      const effectiveScale = s.userRole === 'gm' ? s.timeScale : 2
      return { time: s.time + dt * effectiveScale, playerHp: nextHp }
    }),
  setTimeScale: (timeScale) =>
    set((s) => {
      if (s.userRole !== 'gm') return { timeScale: 2 }
      return { timeScale }
    }),
  select: (selection) => set({ selection }),
  setHovered: (hovered) => set({ hovered }),
  setNearby: (nearby) => set((s) => (s.nearby?.id === nearby?.id ? s : { nearby })),
  focusOn: (x, z) => set((s) => (s.interior ? s : { focus: [x, z], mode: 'iso' })),
  notify: (toast) => {
    clearTimeout(toastTimer)
    set({ toast })
    toastTimer = setTimeout(() => set({ toast: null }), 3500)
  },
}))

export const hourOf = (t: number) => (t % 1440) / 60
export const dayOf = (t: number) => Math.floor(t / 1440) + 1
export const clock = (t: number) => {
  const m = Math.floor(t % 1440)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
