// Placing a new building: confirm the spot or turn it a quarter.
import { placeBuilding } from './town'
import { useGame } from './store'

/** Confirm the current placement. Used by click and the Build button. */
export function confirmPlacement() {
  const s = useGame.getState(), p = s.placing
  if (!p || p.x === null || p.z === null) return
  const res = placeBuilding(p.kind, p.x, p.z, p.rot, s.time)
  if (res.error) return s.notify(res.error)
  s.notify('Construction started — builders are on their way')
  useGame.setState({ placing: null })
}

export const rotatePlacement = () => useGame.setState((s) => (s.placing ? { placing: { ...s.placing, rot: (s.placing.rot + Math.PI / 2) % (Math.PI * 2) } } : s))
