import { useEffect, useState } from 'react'
import { backendMode, CLOUD_SLOTS, type CloudSlotInfo, type CloudSummary, type CloudVersion } from '../backend'
import { cloud, checkNow, keepThisDevice, listHistory, listSlots, onCloudChange, pushNow, setEnabled, setSlot, useCloudSave, useVersion } from '../backend/cloud'
import { summarize } from '../game/persist'
import { useGame } from '../game/store'

const line = (s: CloudSummary) => `Day ${s.day} · ${s.season} · ${s.gold} gold · ${s.population} residents · ${s.buildings} buildings`
const Card = ({ title, s, extra }: { title: string; s: CloudSummary; extra?: string }) => (
  <div className="save-card">
    <b>{title}</b>
    {line(s)}
    {extra && <><br />{extra}</>}
  </div>
)

/** Settings section: turn cloud saves on, pick a slot, load an older version, and resolve a conflict when two devices saved different towns. */
export function CloudSaveBox() {
  const [, force] = useState(0)
  const [slots, setSlots] = useState<CloudSlotInfo[] | null>(null)
  const [history, setHistory] = useState<CloudVersion[] | null>(null)
  useEffect(() => onCloudChange(() => force((n) => n + 1)), [])
  // refresh what each slot holds whenever a sync finishes or the slot changes
  useEffect(() => {
    if (!cloud.enabled || cloud.status === 'working') return
    listSlots().then(setSlots).catch(() => setSlots(null))
    setHistory(null)
  }, [cloud.enabled, cloud.status, cloud.slot, cloud.rev])
  const busy = cloud.status === 'working'
  const other = cloud.status === 'conflict' ? cloud.other : null
  return (
    <div className="cloud-box">
      <label><input type="checkbox" checked={cloud.enabled} disabled={busy} onChange={(e) => setEnabled(e.target.checked)} /> Sync this town to the cloud</label>
      {backendMode === 'local' && <p className="note">Local dev backend: the “cloud” is stored in this browser. Good for trying this out, not a real backup.</p>}
      {cloud.enabled && (
        <div className="actions">
          {Array.from({ length: CLOUD_SLOTS }, (_, i) => i + 1).map((n) => {
            const info = slots?.find((x) => x.slot === n)
            return (
              <button key={n} disabled={busy} className={n === cloud.slot ? 'on' : ''} title={info ? line(info.summary) : 'Empty slot'}
                onClick={() => { if (n !== cloud.slot && confirm(`Sync this town with slot ${n} from now on?${info ? ' You will be asked which town to keep.' : ' The slot is empty, so this town is saved there.'}`)) void setSlot(n) }}>
                Slot {n}<small>{info ? `Day ${info.summary.day}` : 'empty'}</small>
              </button>
            )
          })}
        </div>
      )}
      {cloud.enabled && !other && (
        <p>
          {cloud.status === 'working' ? 'Syncing…' : cloud.status === 'error' ? <span className="warn">⚠ {cloud.error}</span>
            : cloud.lastSync ? `✔ Slot ${cloud.slot} synced ${new Date(cloud.lastSync).toLocaleTimeString()} · revision ${cloud.rev}` : 'Waiting for the first sync…'}
        </p>
      )}
      {other && (
        <>
          <p className="warn">Two different saves exist. Nothing was overwritten. Which one do you want to keep?</p>
          <Card title="This device" s={summarize(useGame.getState().time)} />
          <Card title={`Slot ${cloud.slot} · revision ${other.rev}`} s={other.summary} extra={`Saved ${new Date(other.savedAt).toLocaleString()} on ${other.device}`} />
          <div className="actions col">
            <button disabled={busy} onClick={() => { if (confirm('Save this device’s town as the newest version of the slot? The cloud keeps the older version in its history.')) void keepThisDevice() }}>Keep this device</button>
            <button disabled={busy} onClick={() => { if (confirm('Replace this device’s town with the cloud save? The town on this device will be lost.')) void useCloudSave() }}>Use cloud save</button>
          </div>
        </>
      )}
      {cloud.enabled && !other && (
        <div className="actions">
          <button disabled={busy} onClick={() => void pushNow()}>⬆ Save now</button>
          <button disabled={busy} onClick={() => void checkNow()}>🔄 Check cloud</button>
          <button disabled={busy} onClick={() => listHistory().then(setHistory).catch((e) => alert(e instanceof Error ? e.message : String(e)))}>🕘 Versions</button>
        </div>
      )}
      {history && !other && (
        <div className="history">
          {!history.length && <p className="note">No versions in slot {cloud.slot} yet.</p>}
          {history.map((v) => (
            <div key={v.rev} className="save-card row">
              <span><b>Revision {v.rev}{v.rev === cloud.rev ? ' · this device' : ''}</b>{line(v.summary)}<br />{new Date(v.savedAt).toLocaleString()} on {v.device}</span>
              {v.rev !== cloud.rev && (
                <button disabled={busy} onClick={() => { if (confirm(`Load revision ${v.rev} onto this device? The town on this device is replaced; the cloud keeps every version.`)) void useVersion(v.rev) }}>Load</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
