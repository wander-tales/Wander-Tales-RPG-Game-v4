import { useEffect, useMemo, useRef, useState } from 'react'
import { ACCESSORIES, BUILDS, CLOTH_COLORS, HAIR_COLORS, HAIR_STYLES, HAT_COLORS, SKIN_TONES, randomAppearance } from '../game/avatar'
import type { Appearance } from '../game/residents.mock'
import { fromSimple } from '../pixel/look'
import { SHEET, buildSheet, frameRect, type Dir, type State } from '../pixel/sheet'

const DIRS: Dir[] = ['down', 'left', 'up', 'right']

function MiniPixelCanvas({ look, state = 'idle', dir }: { look: Appearance; state?: State; dir: Dir | 'spin' }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const spriteLook = useMemo(() => fromSimple(look), [look])
  useEffect(() => {
    const sheet = buildSheet(spriteLook)
    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const c = ref.current
      if (!c) return
      const x = c.getContext('2d')!
      x.imageSmoothingEnabled = false
      const sec = (now - t0) / 1000
      const meta = SHEET.states[state]
      const f = Math.floor(sec * meta.fps) % meta.frames
      const d: Dir = dir === 'spin' ? DIRS[Math.floor(sec * 0.9) % DIRS.length] : dir

      // Pixel meadow background
      x.fillStyle = '#a7d8ee'; x.fillRect(0, 0, 48, 48)
      x.fillStyle = '#cdebf7'; x.fillRect(0, 14, 48, 12)
      x.fillStyle = '#7bb862'; x.fillRect(0, 26, 48, 22)
      x.fillStyle = '#68a150'; x.fillRect(0, 38, 48, 10)
      x.fillStyle = '#8b857c'; x.fillRect(11, 34, 26, 6)
      x.fillStyle = '#aba499'; x.fillRect(12, 34, 24, 4)
      x.fillStyle = 'rgba(20,16,24,0.35)'; x.fillRect(17, 36, 14, 2)

      const r = frameRect(state, d, f)
      x.drawImage(sheet, r.x, r.y, r.w, r.h, 8, 0, r.w, r.h)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [spriteLook, state, dir])
  return <canvas ref={ref} width={48} height={48} className="avatar-pixel-canvas" />
}

/** Pure Pixel Art preview of an avatar. */
export function AvatarPreview({ look, size = 220 }: { look: Appearance; size?: number }) {
  const [dir, setDir] = useState<Dir | 'spin'>('down')
  const [state, setState] = useState<State>('idle')
  return (
    <div className="avatar-preview mode-pixel" style={{ height: size }}>
      {size >= 140 && (
        <div className="avatar-preview-top">
          <span className="avatar-preview-label">👾 Pixel Preview</span>
          <div className="avatar-mode-tabs">
            {(['down', 'left', 'right', 'up', 'spin'] as const).map((d) => (
              <button key={d} type="button" className={dir === d ? 'on' : ''} onClick={() => setDir(d)}>
                {d === 'down' ? '⬇' : d === 'left' ? '⬅' : d === 'right' ? '➡' : d === 'up' ? '⬆' : '⟳'}
              </button>
            ))}
            <button type="button" className={state === 'walk' ? 'on' : ''} onClick={() => setState(state === 'idle' ? 'walk' : 'idle')}>
              {state === 'walk' ? 'Walk' : 'Idle'}
            </button>
          </div>
        </div>
      )}

      <div className="avatar-preview-panes">
        <div className="avatar-pane-pixel">
          <MiniPixelCanvas look={look} state={state} dir={dir} />
        </div>
      </div>
    </div>
  )
}

const Swatches = ({ colors, value, onPick, none }: { colors: string[]; value: string | undefined; onPick: (c: string | undefined) => void; none?: boolean }) => (
  <div className="swatches">
    {none && <button className={`swatch none ${value === undefined ? 'on' : ''}`} onClick={() => onPick(undefined)} aria-label="None">✕</button>}
    {colors.map((c) => <button key={c} className={`swatch ${value === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} />)}
  </div>
)
const Choice = <T extends string,>({ options, value, onPick }: { options: readonly T[]; value: T; onPick: (v: T) => void }) => (
  <div className="seg wrap">{options.map((o) => <button key={o} type="button" className={value === o ? 'on' : ''} onClick={() => onPick(o)}>{o[0].toUpperCase() + o.slice(1)}</button>)}</div>
)

/** Avatar customization controls (registration page + Guild Master tools). */
export function AvatarEditor({ value, onChange }: { value: Appearance; onChange: (a: Appearance) => void }) {
  const set = (patch: Partial<Appearance>) => onChange({ ...value, ...patch })
  return (
    <div className="avatar-editor">
      <button type="button" className="wide" onClick={() => onChange(randomAppearance((Math.random() * 2 ** 32) >>> 0))}>🎲 Randomize</button>
      <label>Skin tone</label><Swatches colors={SKIN_TONES} value={value.skin} onPick={(skin) => set({ skin: skin! })} />
      <label>Hair style</label><Choice options={HAIR_STYLES} value={value.hairStyle} onPick={(hairStyle) => set({ hairStyle })} />
      <label>Hair color</label><Swatches colors={HAIR_COLORS} value={value.hair} onPick={(hair) => set({ hair: hair! })} />
      <label>Shirt</label><Swatches colors={CLOTH_COLORS} value={value.shirt} onPick={(shirt) => set({ shirt: shirt! })} />
      <label>Trousers</label><Swatches colors={CLOTH_COLORS} value={value.pants} onPick={(pants) => set({ pants: pants! })} />
      <label>Hat</label><Swatches colors={HAT_COLORS} value={value.hat} none onPick={(hat) => { const { hat: _, ...rest } = value; onChange(hat ? { ...rest, hat } : rest) }} />
      <label>Accessory</label><Choice options={ACCESSORIES} value={value.accessory ?? 'none'} onPick={(accessory) => set({ accessory })} />
      <label>Build</label><Choice options={BUILDS} value={value.build ?? 'regular'} onPick={(build) => set({ build })} />
      <label>Height <small>{Math.round(value.height * 100)}%</small></label>
      <input type="range" min={0.9} max={1.1} step={0.01} value={value.height} onChange={(e) => set({ height: Number(e.target.value) })} />
    </div>
  )
}
