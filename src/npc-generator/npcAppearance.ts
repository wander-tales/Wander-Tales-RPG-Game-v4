import { loadCatalog } from '../threejs/chibiCatalog'
import { loadCharacter, saveCharacter, type CharacterAppearance } from '../character-creator/appearance'
import { generateNpcAppearance, type Role } from './npcGenerator'

let available: Promise<Set<string>> | null = null
const availableIds = () => (available ??= loadCatalog().then((c) => new Set(c.assets.filter((a) => a.readyForPlayer).map((a) => a.id))))

/** Saved look for this NPC, or a seeded one that is saved so it never changes unless regenerated. */
export async function npcAppearance(id: string, role: Role): Promise<CharacterAppearance> {
  const key = `npc:${id}:${role}`
  const saved = await loadCharacter(key).catch(() => undefined)
  if (saved) return saved.appearance
  const app = generateNpcAppearance(id, role, { available: await availableIds() })
  saveCharacter(key, app).catch(() => {}) // storage blocked: still deterministic from the seed
  return app
}
