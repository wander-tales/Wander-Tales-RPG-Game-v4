// Equipment: every catalog item, built from the smooth primitives in chibiGeo.tsx and hung on the right bone.
// Each layer is offset outward from the body (LAYER.*) so cloth sits over skin, armor over cloth, outer over
// armor — nothing is coplanar with the layer under it, which is what stopped the old GLB kit from clipping.
import type { ReactNode } from 'react'
import type { CharacterAppearance, ChannelColors, Slot } from '../character-creator/appearance'
import { CATALOG } from './chibiCatalog'
import {
  body, cloth, Cone, Disc, Ell, faceOut, frontZ, gem, hairCap, HEAD, HeadCap, J, LAYER, metal, mirrorV, Mirror, onHead, G,
  RBox, Ring, Seg, Sheet, Shell, torsoR, Tube, Dome, type Bone, type V3,
} from './chibiGeo'

const pick = (ch: ChannelColors, k: keyof ChannelColors, fallback: string) => ch[k] ?? fallback
const by = (a: Record<string, string>, over: ChannelColors) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, pick(over, k as keyof ChannelColors, v)]))

// ---------- hair: a skull cap + a back/side silhouette, parametrized per style ----------
type HairStyle = (c: string, trim: string) => ReactNode
export const HAIR_STYLE: Record<string, HairStyle> = {
  hair_short: (c) => hairCap(c),
  hair_messy: (c) => G(hairCap(c), [0.3, 0.75, -0.2, 0.3, 0.4, -0.35, -0.3, 0.75, -0.2, -0.3, 0.4, -0.35].reduce<ReactNode[]>((a, _v, i, arr) => {
    if (i % 3) return a
    const [x, y, z] = [arr[i], arr[i + 1], arr[i + 2]]
    a.push(<mesh key={i}>{Cone(onHead(x, y, z, 0.05), 0.05, 0.13, cloth(c), faceOut(x, y, z).map((v) => v + Math.PI / 2) as V3)}</mesh>)
    return a
  }, [])),
  hair_curly: (c) => G(hairCap(c), ...[[0.5, 0.5, 0.2], [-0.5, 0.5, 0.2], [0.3, 0.75, -0.3], [-0.3, 0.75, -0.3], [0, 0.85, -0.2], [0.55, 0.15, -0.1], [-0.55, 0.15, -0.1]]
    .map((d, i) => <mesh key={i}>{Ell(onHead(d[0], d[1], d[2], 0.04), 0.09, cloth(c))}</mesh>)),
  hair_long: (c) => G(hairCap(c), Sheet(onHead(0, 0.05, -0.75, 0.01), 0.22, 0.1, 0.55, 1.9, cloth(c), cloth(c), 0.6, [0.35, 0, 0])),
  hair_ponytail: (c, trim) => G(hairCap(c), Ring(onHead(0, 0.3, -0.85, 0.02), 0.045, 0.018, metal(trim)), Sheet(onHead(0, 0.15, -0.9, 0.02), 0.07, 0.025, 0.42, 1.3, cloth(c), cloth(c), 0.9, [0.55, 0, 0])),
  hair_twin_tails: (c, trim) => G(hairCap(c), ...[0.62, -0.62].map((x, i) => <mesh key={i}>{G(Ring(onHead(x, 0.35, 0.1, 0.02), 0.04, 0.016, metal(trim)), Sheet(onHead(x, 0.2, 0.05, 0.02), 0.06, 0.02, 0.32, 1.2, cloth(c), cloth(c), 1, [0.25, 0, x > 0 ? -0.2 : 0.2], x > 0 ? 0 : Math.PI))}</mesh>)),
  hair_braided: (c, trim) => G(hairCap(c), Tube(onHead(0, 0.1, -0.85, 0.02), onHead(0, -0.65, -0.55, 0.02), 0.045, 0.02, cloth(c)), ...[0.1, -0.1, 0.3, -0.3].map((t, i) => <mesh key={i}>{Ring(onHead(0, 0.1 - t * 1.1, -0.85 + t * 0.4, 0.025), 0.05, 0.012, metal(trim))}</mesh>)),
  hair_fantasy_spiky: (c, gemC) => G(hairCap(c), ...[[0, 1, -0.1], [0.4, 0.85, -0.1], [-0.4, 0.85, -0.1], [0.65, 0.4, -0.05], [-0.65, 0.4, -0.05]]
    .map((d, i) => <mesh key={i}>{Cone(onHead(d[0], d[1], d[2], 0.08), 0.045, 0.2, cloth(c), faceOut(d[0], d[1], d[2]).map((v, j) => j === 0 ? v + Math.PI / 2 : v) as V3)}</mesh>), Ell(onHead(0, 1, -0.1, 0.19), 0.025, gem(gemC))),
  hair_messy_brown: (c) => HAIR_STYLE.hair_messy(c, c),
  hair_short_black: (c) => hairCap(c),
  hair_long_braid: (c, trim) => HAIR_STYLE.hair_braided(c, trim),
  hair_twin_buns: (c) => G(hairCap(c), ...[0.6, -0.6].map((x, i) => <mesh key={i}>{Ell(onHead(x, 0.4, 0, 0.09), 0.12, cloth(c))}</mesh>)),
  hair_mage_swept: (c) => G(hairCap(c), Sheet(onHead(0.1, 0.1, -0.8, 0.01), 0.18, 0.08, 0.4, 1.1, cloth(c), cloth(c), 0.7, [0.25, 0, 0.18], -1.1)),
}
/** Wrap HAIR_STYLE (plain color strings) into the (overrides, defaults) signature every other slot table uses. */
const HAIR: Record<string, (ch: ChannelColors, d: Record<string, string>) => ReactNode> = Object.fromEntries(
  Object.entries(HAIR_STYLE).map(([id, fn]) => [id, (ch: ChannelColors, d: Record<string, string>) => {
    const p = by(d, ch)
    return fn(p.hair ?? p.primary ?? '#3a2416', p.trim ?? p.secondary ?? p.gem ?? p.hair ?? '#c9a36a')
  }]),
)

// ---------- headwear ----------
const HAT: Record<string, (ch: ChannelColors, def: Record<string, string>) => ReactNode> = {
  hat_farmer: (ch, d) => { const p = by(d, ch); return G(Dome([0, 1.42, 0], [0.4, 0.22, 0.4], cloth(p.primary)), Disc([0, 1.3, 0], 0.46, 0.03, cloth(p.trim))) },
  hat_farmer_straw: (ch, d) => HAT.hat_farmer(ch, d),
  hat_wizard: (ch, d) => { const p = by(d, ch); return G(Cone([0, 1.75, -0.02], 0.3, 0.75, cloth(p.primary), [0, 0, 0.08]), Disc([0, 1.35, -0.02], 0.44, 0.04, cloth(p.trim)), Ell([0.1, 1.7, -0.16], 0.025, gem(p.trim))) },
  hood: (ch, d) => { const p = by(d, ch); return G(HeadCap(LAYER.over + 0.01, Math.PI * 0.62, -0.05, cloth(p.primary)), Sheet([0, 1, -0.3], 0.3, 0.26, 0.42, 2.2, cloth(p.primary), cloth('#2a221c'), 0.9, [0.3, 0, 0])) },
  helmet_iron: (ch, d) => { const p = by(d, ch); return G(HeadCap(LAYER.armor, Math.PI * 0.6, -0.04, metal(p.metal)), Ring([0, 1.38, 0.02], 0.4, 0.03, metal(p.trim)), RBox([0, 1.2, 0.33], [0.1, 0.22, 0.03], metal('#1a1a1a'))) },
  crown_gold: (ch, d) => { const p = by(d, ch); return G(Ring([0, 1.44, 0.02], 0.4, 0.035, metal(p.metal)), ...[0, 1, 2, 3, 4].map((i) => <mesh key={i}>{Cone([Math.sin(i / 5 * Math.PI * 2 - 1.4) * 0.38, 1.52, Math.cos(i / 5 * Math.PI * 2 - 1.4) * 0.38 - 0.1], 0.03, 0.1, metal(p.metal))}</mesh>), Ell([0, 1.5, 0.37], 0.03, gem(p.gem))) },
  circlet_silver: (ch, d) => { const p = by(d, ch); return G(Ring([0, 1.46, 0.02], 0.39, 0.016, metal(p.metal)), Ell([0, 1.42, 0.38], 0.028, gem(p.gem))) },
  accessory_circlet: (ch, d) => HAT.circlet_silver(ch, d),
  hat_adventurer: (ch, d) => { const p = by(d, ch); return G(Dome([0, 1.4, 0], [0.42, 0.18, 0.42], cloth(p.leather)), Disc([0, 1.3, 0.04], 0.46, 0.028, cloth(p.leather)), Ring([0, 1.3, 0.38], 0.02, 0.012, cloth(p.trim), [Math.PI / 2, 0, 0], 1, Math.PI)) },
  hat_baker_cream: (ch, d) => { const p = by(d, ch); return G(Dome([0, 1.46, 0], [0.34, 0.3, 0.34], cloth(p.primary)), Disc([0, 1.3, 0], 0.37, 0.025, cloth(p.primary))) },
}
const EAR: Record<string, (ch: ChannelColors, d: Record<string, string>) => ReactNode> = {
  earrings_gold: (ch, d) => { const p = by(d, ch); const one = (x: number) => <mesh key={x}>{G(Ring(onHead(x, -0.5, 0.35, 0.01), 0.026, 0.006, metal(p.metal)), Ell(onHead(x, -0.58, 0.35, 0.01), 0.012, gem(p.gem)))}</mesh>; return G(one(0.97), one(-0.97)) },
  accessory_sapphire_earrings: (ch, d) => EAR.earrings_gold(ch, d),
}
const HAIR_ORN: Record<string, (ch: ChannelColors, d: Record<string, string>) => ReactNode> = {
  ornament_star_pin: (ch, d) => { const p = by(d, ch); return Ell(onHead(0.5, 0.65, 0.5, 0.03), 0.03, gem(p.gem)) },
}

// ---------- torso garments: built as Shell layers over the body, so they follow its silhouette ----------
type Garment = (ch: ChannelColors, d: Record<string, string>) => ReactNode
const sleeve = (m: ReturnType<typeof cloth>, len: 'short' | 'long') => {
  const to: V3 = len === 'long' ? J.wrist : [J.shoulder[0] + 0.03, J.shoulder[1] - 0.12, J.shoulder[2]]
  return G(Ell(J.shoulder, 0.078, m), Tube(J.shoulder, to, 0.07, len === 'long' ? 0.058 : 0.072, m))
}
const TORSO: Record<string, Garment> = {
  shirt_linen: (ch, d) => { const p = by(d, ch); return G(Shell(0.56, 0.89, LAYER.cloth, cloth(p.primary)), Ring([0, 0.885, 0], 0.085, 0.01, cloth(p.trim)), Mirror(sleeve(cloth(p.primary), 'short')), sleeve(cloth(p.primary), 'short')) },
  tunic_green: (ch, d) => { const p = by(d, ch); return G(Shell(0.5, 0.89, LAYER.cloth, cloth(p.primary), { flare: 0.5, flareFrom: 0.62 }), Shell(0.86, 0.9, LAYER.cloth + 0.002, cloth(p.trim)), Ring([0, 0.52, 0], 0.17, 0.012, cloth(p.leather)), Mirror(sleeve(cloth(p.primary), 'short')), sleeve(cloth(p.primary), 'short')) },
  tunic_forest: (ch, d) => TORSO.tunic_green(ch, d),
  robe_plain: (ch, d) => { const p = by(d, ch); return G(Shell(0.42, 0.89, LAYER.cloth, cloth(p.primary), { flare: 0.95, flareFrom: 0.68 }), Shell(0.87, 0.9, LAYER.cloth + 0.002, cloth(p.trim)), Ring([0, 0.55, 0], 0.175, 0.012, cloth(p.trim)), Mirror(sleeve(cloth(p.primary), 'long')), sleeve(cloth(p.primary), 'long')) },
  coat_traveler: (ch, d) => { const p = by(d, ch); return G(Shell(0.42, 0.885, LAYER.over, cloth(p.primary), { flare: 0.7, flareFrom: 0.64 }), Shell(0.6, 0.885, LAYER.over + 0.004, cloth(p.secondary), { phi: [Math.PI * 0.42, Math.PI * 0.16] }), Ring([0, 0.56, 0], 0.18, 0.014, cloth(p.trim)), Mirror(sleeve(cloth(p.primary), 'long')), sleeve(cloth(p.primary), 'long')) },
  outfit_traveler_coat: (ch, d) => TORSO.coat_traveler(ch, d),
  vest_leather: (ch, d) => { const p = by(d, ch); return G(Shell(0.56, 0.87, LAYER.cloth, cloth(p.leather), { phi: [Math.PI * 0.18, Math.PI * 1.64] }), Shell(0.85, 0.89, LAYER.cloth + 0.002, cloth(p.trim))) },
  dress_simple: (ch, d) => { const p = by(d, ch); return G(Shell(0.2, 0.89, LAYER.cloth, cloth(p.primary), { flare: 1.5, flareFrom: 0.62 }), Shell(0.86, 0.9, LAYER.cloth + 0.002, cloth(p.trim)), Ring([0, 0.52, 0], 0.17, 0.012, cloth(p.trim)), Mirror(sleeve(cloth(p.primary), 'short')), sleeve(cloth(p.primary), 'short')) },
  outfit_adventurer: (ch, d) => { const p = by(d, ch); return G(TORSO.tunic_green({ primary: p.primary, trim: p.trim, leather: p.leather }, { primary: p.primary, trim: p.trim, leather: p.leather }), Ring([0, 0.56, 0], 0.185, 0.02, cloth(p.leather))) },
  outfit_merchant: (ch, d) => { const p = by(d, ch); return G(TORSO.coat_traveler({ primary: p.primary, secondary: p.secondary, trim: p.trim }, { primary: p.primary, secondary: p.secondary, trim: p.trim })) },
  outfit_mage: (ch, d) => { const p = by(d, ch); return G(TORSO.robe_plain({ primary: p.primary, trim: p.trim }, { primary: p.primary, trim: p.trim }), Shell(0.6, 0.89, LAYER.over, cloth(p.secondary), { phi: [-0.55, 1.1] })) },
  outfit_mage_robe: (ch, d) => TORSO.outfit_mage(ch, d),
  outfit_ranger: (ch, d) => { const p = by(d, ch); return G(TORSO.vest_leather({ leather: p.primary, trim: p.leather }, { leather: p.primary, trim: p.leather }), Mirror(sleeve(cloth(p.secondary), 'long')), sleeve(cloth(p.secondary), 'long')) },
  outfit_ranger_vest: (ch, d) => TORSO.outfit_ranger(ch, d),
  outfit_knight_surcoat: (ch, d) => { const p = by(d, ch); return G(Shell(0.52, 0.88, LAYER.cloth, cloth(p.primary), { phi: [Math.PI * 0.3, Math.PI * 0.4] }), Shell(0.52, 0.88, LAYER.cloth, cloth(p.secondary), { phi: [-Math.PI * 0.1, Math.PI * 0.4] }), Ring([0, 0.56, 0], 0.18, 0.016, cloth(p.leather))) },
}

const apron = (ch: ChannelColors, d: Record<string, string>) => { const p = by(d, ch); const c1 = p.primary ?? p.cloth ?? '#eee5cd', c2 = p.secondary ?? p.trim ?? '#aa8d77'
  return G(Shell(0.4, 0.78, LAYER.over, cloth(c1), { phi: [Math.PI * 0.28, Math.PI * 0.44] }), Ring([0, 0.84, frontZ(0.8) - 0.07], 0.11, 0.012, cloth(c2), [Math.PI / 2, 0, 0]))
}
const APRON: Record<string, Garment> = { apron_leather_work: apron, apron_cloth: apron, apron_baker: apron, apron_blacksmith: apron }

const CHEST_ARMOR: Record<string, Garment> = {
  armor_leather: (ch, d) => { const p = by(d, ch); return G(Shell(0.56, 0.87, LAYER.armor, cloth(p.leather)), Ring([0, 0.56, 0], 0.185, 0.016, cloth(p.trim))) },
  armor_iron: (ch, d) => { const p = by(d, ch); return G(Shell(0.56, 0.87, LAYER.armor, metal(p.metal)), Shell(0.86, 0.89, LAYER.armor + 0.004, cloth(p.leather))) },
  armor_knight: (ch, d) => { const p = by(d, ch); return G(Shell(0.52, 0.88, LAYER.armor, metal(p.metal)), Shell(0.6, 0.86, LAYER.armor + 0.006, cloth(p.primary), { phi: [Math.PI * 0.3, Math.PI * 0.4] }), Ring([0, 0.885, 0], 0.09, 0.012, metal(p.trim))) },
  armor_mage: (ch, d) => { const p = by(d, ch); return G(Shell(0.52, 0.89, LAYER.armor, cloth(p.primary)), Ell(J.shoulder, 0.09, metal(p.metal)), Ell(mirrorV(J.shoulder), 0.09, metal(p.metal)), Ell([0, 0.6, frontZ(0.6, LAYER.armor)], 0.03, gem(p.gem))) },
  chest_plate: (ch, d) => { const p = by(d, ch); return Shell(0.56, 0.88, LAYER.armor, metal(p.metal)) },
}
const SHOULDERS: Record<string, Garment> = {
  shoulder_guards_iron: (ch, d) => { const p = by(d, ch); const one = (x: number) => <mesh key={x}>{G(Dome([x, 0.82, 0], [0.1, 0.08, 0.1], metal(p.metal)), Ring([x, 0.8, 0], 0.09, 0.012, cloth(p.leather)))}</mesh>; return G(one(J.shoulder[0]), one(mirrorV(J.shoulder)[0])) },
  shoulder_guard_pair: (ch, d) => SHOULDERS.shoulder_guards_iron(ch, d),
  accessory_bronze_pauldron_pair: (ch, d) => SHOULDERS.shoulder_guards_iron(ch, d),
  mantle_fur: (ch, d) => { const p = by(d, ch); return Shell(0.74, 0.9, LAYER.over, cloth(p.primary), { flare: 0.3, flareFrom: 0.74 }) },
}
const HANDS: Record<string, (ch: ChannelColors, d: Record<string, string>, side: 1 | -1) => ReactNode> = {
  gloves_leather: (ch, d) => { const p = by(d, ch); return G(Ell(J.hand, [0.072, 0.082, 0.068], cloth(p.leather)), Ring(J.wrist, 0.058, 0.012, cloth(p.leather))) },
}
// one side only — legs hangs on the thigh bone, feet on the shin bone; assemble() mirrors each onto its own R bone
const LEGS: Record<string, (ch: ChannelColors, d: Record<string, string>) => ReactNode> = {
  leg_armor_iron: (ch, d) => { const p = by(d, ch); return G(Tube(J.hip, [J.hip[0], J.knee[1] + 0.03, J.knee[2]], 0.082, 0.07, metal(p.metal)), Ring([J.knee[0], J.knee[1] + 0.02, J.knee[2] + 0.02], 0.065, 0.014, metal(p.metal))) },
}
const FEET: Record<string, (ch: ChannelColors, d: Record<string, string>) => ReactNode> = {
  boots_leather: (ch, d) => { const p = by(d, ch); return G(Ell(J.foot, [0.075, 0.06, 0.115], cloth(p.leather)), Tube(J.ankle, [J.ankle[0], J.ankle[1] + 0.12, J.ankle[2] - 0.01], 0.07, 0.062, cloth(p.leather))) },
  boots_leather_pair: (ch, d) => FEET.boots_leather(ch, d),
  boots_heavy: (ch, d) => { const p = by(d, ch); return G(Ell(J.foot, [0.082, 0.066, 0.12], cloth(p.dark)), Tube(J.ankle, [J.ankle[0], J.ankle[1] + 0.16, J.ankle[2] - 0.01], 0.078, 0.07, cloth(p.dark)), Ring([J.ankle[0], J.ankle[1] + 0.03, J.ankle[2]], 0.072, 0.012, cloth(p.trim))) },
  boots_knight: (ch, d) => { const p = by(d, ch); return G(Ell(J.foot, [0.08, 0.064, 0.118], metal(p.metal)), Tube(J.ankle, [J.ankle[0], J.ankle[1] + 0.17, J.ankle[2] - 0.01], 0.076, 0.068, metal(p.metal)), Ring([J.ankle[0], J.ankle[1] + 0.02, J.ankle[2]], 0.07, 0.012, cloth(p.dark))) },
  sandals: (ch, d) => { const p = by(d, ch); const f = J.foot; return G(Ell([f[0], f[1] - 0.01, f[2]], [0.078, 0.028, 0.12], cloth(p.leather)), Ring([f[0], f[1] + 0.03, f[2] - 0.08], 0.03, 0.009, cloth(p.leather), [0, 0, Math.PI / 2])) },
  shoes_mage: (ch, d) => { const p = by(d, ch); const f = J.foot; return G(Ell(f, [0.076, 0.058, 0.118], cloth(p.primary)), Ell([f[0], f[1] + 0.02, f[2] + 0.1], 0.02, gem(p.trim))) },
}
const BACK: Record<string, (ch: ChannelColors, d: Record<string, string>) => ReactNode> = {
  backpack: (ch, d) => { const p = by(d, ch); return G(RBox([0, 0.65, -frontZ(0.65) - 0.06], [0.22, 0.26, 0.12], cloth(p.leather), undefined, 0.04), Ring([0, 0.78, -frontZ(0.65) - 0.01], 0.07, 0.012, cloth(p.trim))) },
  accessory_adventurer_pack: (ch, d) => BACK.backpack(ch, d),
  // narrow at the collar (rTop), flares out toward the hem (rBot) — floor-length for the hero, knee-length for the traveler
  cape_hero: (ch, d) => { const p = by(d, ch); const h = 0.78; return G(Ring([0, 0.885, -frontZ(0.88) + 0.01], 0.09, 0.012, metal(p.metal)), Sheet([0, 0.86 - h / 2, -frontZ(0.75)], 0.1, 0.22, h, 1.5, cloth(p.primary), cloth('#3a2e26'), 1, [0.1, 0, 0])) },
  cape_traveler: (ch, d) => { const p = by(d, ch); const h = 0.5; return Sheet([0, 0.85 - h / 2, -frontZ(0.74)], 0.09, 0.19, h, 1.4, cloth(p.primary), cloth('#3a2e26'), 1, [0.08, 0, 0]) },
}
const WAIST: Record<string, Garment> = {
  belt_leather: (ch, d) => { const p = by(d, ch); return G(Ring([0, 0.56, 0], 0.19, 0.018, cloth(p.leather)), RBox([0, 0.56, frontZ(0.56, 0.02)], [0.07, 0.05, 0.02], metal(p.metal))) },
  belt_pouch: (ch, d) => { const p = by(d, ch); return G(WAIST.belt_leather({ leather: p.primary, metal: p.secondary }, { leather: p.primary, metal: p.secondary }), RBox([0.14, 0.48, frontZ(0.5, 0.03)], [0.07, 0.07, 0.05], cloth(p.secondary))) },
}
const WAIST_SIDE: Record<string, Garment> = {
  pouch: (ch, d) => { const p = by(d, ch); return RBox([0.16, 0.46, frontZ(0.5, 0.04)], [0.07, 0.08, 0.05], cloth(p.leather), undefined, 0.02) },
  ornament_crystal_charm: (ch, d) => { const p = by(d, ch); return Ell([0.15, 0.45, frontZ(0.5, 0.03)], 0.03, gem(p.gem)) },
}
const NECK: Record<string, (ch: ChannelColors, d: Record<string, string>) => ReactNode> = {
  necklace_beads: (ch, d) => { const p = by(d, ch); return G(Ring([0, 0.89, 0], 0.095, 0.009, cloth(p.trim)), Ell([0, 0.84, frontZ(0.89, 0.015)], 0.016, gem(p.gem))) },
  scarf_red: (ch, d) => { const p = by(d, ch); return G(Ring([0, 0.88, 0], 0.1, 0.03, cloth(p.primary)), RBox([0.06, 0.74, frontZ(0.82, 0.02)], [0.07, 0.16, 0.012], cloth(p.primary))) },
  accessory_scarf: (ch, d) => NECK.scarf_red(ch, d),
  medallion_guild: (ch, d) => { const p = by(d, ch); return G(Ring([0, 0.89, 0], 0.09, 0.008, metal(p.metal)), Ring([0, 0.78, frontZ(0.82, 0.016)], 0.028, 0.009, metal(p.metal)), Ell([0, 0.78, frontZ(0.82, 0.016)], 0.015, gem(p.gem))) },
  guild_medallion: (ch, d) => NECK.medallion_guild(ch, d),
  accessory_crystal_pendant: (ch, d) => { const p = by(d, ch); return G(Ring([0, 0.89, 0], 0.09, 0.007, metal(p.trim ?? p.secondary)), Ell([0, 0.78, frontZ(0.82, 0.018)], [0.02, 0.03, 0.016], gem(p.primary))) },
}

const SLOT_TABLE: Partial<Record<Slot, Record<string, (ch: ChannelColors, d: Record<string, string>) => ReactNode>>> = {
  hair: HAIR,
  headwear: HAT, ears: EAR, hair_ornament: HAIR_ORN, torso: TORSO, apron: APRON, chest_armor: CHEST_ARMOR,
  shoulders: SHOULDERS, legs: LEGS, feet: FEET, back: BACK, waist: WAIST, waist_side: WAIST_SIDE, neck: NECK,
}
/** headwear ids that cover the hair entirely. */
const HIDES_HAIR = new Set(['hood', 'helmet_iron'])
const BONE_FOR: Record<Slot, Bone> = {
  hair: 'head', headwear: 'head', hair_ornament: 'head', ears: 'head', neck: 'spine', torso: 'spine', apron: 'spine',
  chest_armor: 'spine', shoulders: 'spine', back: 'spine', waist: 'pelvis', waist_side: 'pelvis',
  hands: 'foreL' /* unused: hands split below */, legs: 'thighL', feet: 'shinL',
}

/** Build every piece of a character, grouped by the bone it hangs from. */
export function assemble(app: CharacterAppearance): Partial<Record<Bone, ReactNode[]>> {
  const out = body(app.skin)
  const equipped = Object.entries(app.equipment).filter(([, id]) => id) as [Slot, string][]
  const hideHair = equipped.some(([slot, id]) => slot === 'headwear' && HIDES_HAIR.has(id))
  const add = (b: Bone, n: ReactNode) => (out[b] ??= []).push(n)

  for (const [slot, id] of equipped) {
    if (slot === 'hair' && hideHair) continue
    const asset = CATALOG.assets.find((a) => a.id === id)
    if (!asset) continue
    const ch = app.colors[slot] ?? {}
    if (slot === 'hands') {
      const fn = HANDS[id]
      if (fn) { add('foreL', fn(ch, asset.channels, 1)); add('foreR', <group scale={[-1, 1, 1]}>{fn(ch, asset.channels, -1)}</group>) }
      continue
    }
    // legs/feet are a left+right pair: each side must hang on its own thigh/shin bone, or the right one
    // rigidly follows the left leg's walk rotation instead of its own (crosses through / detaches when walking)
    if (slot === 'legs' || slot === 'feet') {
      const fn = (slot === 'legs' ? LEGS : FEET)[id]
      if (fn) { const bone = slot === 'legs' ? 'thigh' : 'shin'; add(`${bone}L`, fn(ch, asset.channels)); add(`${bone}R`, <group scale={[-1, 1, 1]}>{fn(ch, asset.channels)}</group>) }
      continue
    }
    const table = SLOT_TABLE[slot], fn = table?.[id]
    if (!fn) continue
    add(BONE_FOR[slot], fn(ch, asset.channels))
  }
  return out
}
