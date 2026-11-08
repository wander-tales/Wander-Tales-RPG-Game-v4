// Turns the existing look data into sprite layers. Nothing is converted or re-saved: player/NPC appearance data stays
// exactly as the Character Creator and Register page store it.
import { CATALOG, type Channel } from '../threejs/chibiCatalog'
import type { CharacterAppearance, Slot } from '../character-creator/appearance'
import type { Appearance } from '../game/residents.mock'
import type { Extra, HairStyle, Hat, SpriteLook, Weapon } from './sheet'

const HAIR: Record<string, HairStyle> = {
  hair_short: 'short', hair_short_black: 'short', hair_long: 'long', hair_ponytail: 'ponytail', hair_twin_tails: 'twin',
  hair_twin_buns: 'twin', hair_braided: 'braid', hair_long_braid: 'braid', hair_messy: 'messy', hair_messy_brown: 'messy',
  hair_curly: 'curly', hair_fantasy_spiky: 'spiky', hair_mage_swept: 'spiky',
}
const HATS: Record<string, Hat> = {
  hat_farmer: 'straw', hat_farmer_straw: 'straw', hat_wizard: 'wizard', hood: 'hood', helmet_iron: 'helmet',
  crown_gold: 'crown', circlet_silver: 'circlet', accessory_circlet: 'circlet', hat_adventurer: 'feather', hat_baker_cream: 'baker',
}
const LONG = new Set(['robe_plain', 'dress_simple', 'outfit_mage', 'outfit_mage_robe'])
/** Guild classes carry a weapon (there is no weapon slot in the save data, so it comes from the class). */
export const CLASS_WEAPON: Record<string, Weapon> = { Warrior: 'sword', Paladin: 'hammer', Mage: 'staff', Healer: 'staff', Archer: 'bow', Rogue: 'dagger' }

/** Colour of a channel for the item in `slot`: the player's override, else the item's default. */
function col(app: CharacterAppearance, slot: Slot, ...chs: Channel[]): string | undefined {
  const id = app.equipment[slot]
  if (!id) return undefined
  const asset = CATALOG.assets.find((a) => a.id === id)
  for (const ch of chs) { const c = app.colors[slot]?.[ch] ?? asset?.channels[ch]; if (c) return c }
  return Object.values(asset?.channels ?? {})[0]
}

export function fromCreator(app: CharacterAppearance, weapon?: Weapon): SpriteLook {
  const eq = app.equipment
  const hatId = eq.headwear ?? ''
  const extras: { kind: Extra; c: string }[] = []
  const neck = eq.neck ?? ''
  if (neck.includes('scarf')) extras.push({ kind: 'scarf', c: col(app, 'neck', 'primary')! })
  else if (neck) extras.push({ kind: 'medallion', c: col(app, 'neck', 'metal', 'gem', 'primary')! })
  if (eq.ears) extras.push({ kind: 'earrings', c: col(app, 'ears', 'gem', 'metal', 'primary')! })
  if (eq.hair_ornament) extras.push({ kind: 'flower', c: col(app, 'hair_ornament', 'gem', 'metal')! })
  const ws = eq.waist_side ?? ''
  if (ws.includes('charm')) extras.push({ kind: 'charm', c: col(app, 'waist_side', 'gem', 'primary') ?? '#b07ce0' })
  else if (ws) extras.push({ kind: 'pouch', c: col(app, 'waist_side', 'leather', 'primary') ?? '#8a5a33' })
  const back = eq.back ?? ''
  return {
    skin: app.skin,
    eyes: app.eyes,
    hair: col(app, 'hair', 'hair', 'primary') ?? '#3a2416',
    hairStyle: eq.hair ? HAIR[eq.hair] ?? 'short' : 'bald',
    shirt: col(app, 'torso', 'primary', 'leather') ?? '#d8c7a6',
    trim: col(app, 'torso', 'secondary', 'trim'),
    long: LONG.has(eq.torso ?? ''),
    pants: col(app, 'legs', 'metal', 'primary') ?? '#5a4a3c',
    shoes: col(app, 'feet', 'leather', 'dark', 'metal', 'primary') ?? '#4a3426',
    hat: HATS[hatId] ? { kind: HATS[hatId], c: col(app, 'headwear', 'primary', 'metal', 'leather')!, c2: col(app, 'headwear', 'trim', 'gem', 'secondary') } : undefined,
    armor: col(app, 'chest_armor', 'metal', 'leather', 'primary'),
    shoulders: col(app, 'shoulders', 'metal', 'primary'),
    apron: col(app, 'apron', 'leather', 'cloth', 'primary'),
    belt: col(app, 'waist', 'leather', 'primary'),
    gloves: col(app, 'hands', 'leather'),
    cape: back.includes('cape') ? col(app, 'back', 'primary') : undefined,
    pack: back && !back.includes('cape') ? col(app, 'back', 'leather', 'primary') : undefined,
    extras: extras.length ? extras : undefined,
    weapon,
  }
}

const SIMPLE_HAIR: Record<Appearance['hairStyle'], HairStyle> = { short: 'short', long: 'long', bun: 'twin', spiky: 'spiky' }
/** The Register page's simple look (also the brief fallback while a full look loads). */
export function fromSimple(a: Appearance, cape?: string, weapon?: Weapon): SpriteLook {
  const extras: { kind: Extra; c: string }[] = []
  if (a.accessory === 'glasses') extras.push({ kind: 'glasses', c: '#3a2e26' })
  if (a.accessory === 'scarf') extras.push({ kind: 'scarf', c: a.hat ?? '#c94f4f' })
  if (a.accessory === 'flower') extras.push({ kind: 'flower', c: '#f6a5c0' })
  if (a.accessory === 'horns') extras.push({ kind: 'horns', c: '#e8dcc0' })
  if (a.accessory === 'headband') extras.push({ kind: 'headband', c: a.hat ?? '#c94f4f' })
  return {
    skin: a.skin, hair: a.hair, hairStyle: SIMPLE_HAIR[a.hairStyle], shirt: a.shirt, pants: a.pants, shoes: '#4a3426',
    hat: a.hat ? { kind: 'cap', c: a.hat } : undefined, cape, extras: extras.length ? extras : undefined, weapon,
  }
}
