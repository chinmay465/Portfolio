import { useEffect, useState } from 'react'
import { PLATFORMS } from '../shared/types.ts'
import type { PlatformId, Settings } from '../shared/types.ts'
import { disablePush, enablePush, pushState, testPush } from './api.ts'
import type { PushState } from './api.ts'

const GROUPS: { id: string; label: string }[] = [
  { id: 'food', label: 'Food delivery' },
  { id: 'grocery', label: 'Quick commerce & grocery' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'movies', label: 'Movies' },
  { id: 'other', label: 'Everything else' },
]
const HOURS = [1, 3, 6, 12, 24]
const words = (s: string) => s.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)

interface Props {
  settings: Settings
  onSave: (s: Settings) => Promise<void>
}

export default function AlertsView({ settings, onSave }: Props) {
  const [draft, setDraft] = useState(settings)
  const [push, setPush] = useState<PushState | 'busy'>('off')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [kw, setKw] = useState(settings.keywords.join(', '))
  const [mute, setMute] = useState(settings.muted.join(', '))

  useEffect(() => setDraft(settings), [settings])
  useEffect(() => {
    void pushState().then(setPush)
  }, [])

  const dirty = JSON.stringify({ ...draft, keywords: words(kw), muted: words(mute) }) !== JSON.stringify(settings)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const setPlatform = (id: PlatformId, on: boolean) => set('platforms', { ...draft.platforms, [id]: on })
  const setGroup = (group: string, on: boolean) =>
    set('platforms', { ...draft.platforms, ...Object.fromEntries(PLATFORMS.filter((p) => p.group === group).map((p) => [p.id, on])) })

  async function save() {
    setSaving(true)
    try {
      await onSave({ ...draft, keywords: words(kw), muted: words(mute) })
      setMsg({ ok: true, text: push === 'on' ? 'Saved. Alerts use these rules from the next check.' : 'Saved in this browser.' })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function togglePush() {
    const was = push
    setPush('busy')
    setMsg(null)
    try {
      if (was === 'on') await disablePush()
      else {
        await onSave({ ...draft, keywords: words(kw), muted: words(mute) })
        await enablePush({ ...draft, keywords: words(kw), muted: words(mute) })
      }
      setPush(await pushState())
      setMsg({ ok: true, text: was === 'on' ? 'Alerts are off on this device.' : 'Alerts are on. Bachat checks about every 10 minutes.' })
    } catch (err) {
      setPush(await pushState())
      setMsg({ ok: false, text: (err as Error).message })
    }
  }

  async function sendTest() {
    try {
      await testPush()
      setMsg({ ok: true, text: 'Test alert sent. It should pop up in a few seconds.' })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    }
  }

  return (
    <section className="panel" aria-label="Alert settings">
      <div className="card hero">
        <h2>Notifications on this device</h2>
        <p>Alerts arrive even with Bachat closed. Settings live on this device.</p>
        <div className="pushrow">
          <span className={`status${push === 'on' ? ' on' : ''}`}>
            <i />
            {push === 'on' ? 'On' : push === 'denied' ? 'Blocked in browser settings' : push === 'needs-install' ? 'Add to Home Screen first' : push === 'unsupported' ? 'Not supported in this browser' : push === 'busy' ? 'Working…' : 'Off'}
          </span>
          {(push === 'on' || push === 'off' || push === 'busy') && (
            <button className={`btn ${push === 'on' ? '' : 'go'}`} onClick={togglePush} disabled={push === 'busy'}>
              {push === 'on' ? 'Turn off' : 'Turn on alerts'}
            </button>
          )}
          {push === 'on' && (
            <button className="btn" onClick={sendTest}>
              Send a test
            </button>
          )}
        </div>
        {push === 'needs-install' && <p className="muted">On iPhone, web alerts need Bachat on the Home Screen: Share → Add to Home Screen, then open it from there.</p>}
        {msg && (
          <p role="status" style={{ color: msg.ok ? 'var(--lime)' : 'var(--hot)', fontSize: 13 }}>
            {msg.text}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Minimum discount</h2>
        <p>Alert me when an offer is at least this much off.</p>
        <div className="slider">
          <div className="row">
            <strong data-testid="min-value">{draft.minDiscount}%</strong>
            <span className="muted">off or more</span>
          </div>
          <input type="range" min={0} max={95} step={5} value={draft.minDiscount} aria-label="Minimum discount" onChange={(e) => set('minDiscount', Number(e.target.value))} />
          <div className="ticks"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>95%</span></div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={draft.includeUpTo} onChange={(e) => set('includeUpTo', e.target.checked)} />
          Count “up to X% off” sale claims
        </label>
        <label className="toggle">
          <input type="checkbox" checked={draft.includeNoDiscount} onChange={(e) => set('includeNoDiscount', e.target.checked)} />
          Also alert for coupons that don’t state a discount
        </label>
      </div>

      <div className="card alarm">
        <h2>🚨 Extraordinary deals</h2>
        <p>Real 90%+ discounts and price errors. These alert with sound, stay on screen, and skip quiet hours. “Up to 90%” sale banners don’t count.</p>
        <label className="toggle">
          <input type="checkbox" checked={draft.extraordinary.enabled} onChange={(e) => set('extraordinary', { ...draft.extraordinary, enabled: e.target.checked })} />
          Alert me for extraordinary deals
        </label>
        <div className="slider">
          <div className="row">
            <strong>{draft.extraordinary.threshold}%</strong>
            <span className="muted">counts as extraordinary</span>
          </div>
          <input type="range" min={70} max={99} step={1} value={draft.extraordinary.threshold} aria-label="Extraordinary threshold" onChange={(e) => set('extraordinary', { ...draft.extraordinary, threshold: Number(e.target.value) })} />
        </div>
        <label className="toggle">
          <input type="checkbox" checked={draft.extraordinary.anyPlatform} onChange={(e) => set('extraordinary', { ...draft.extraordinary, anyPlatform: e.target.checked })} />
          From any store, even ones switched off below
        </label>
      </div>

      <div className="card">
        <h2>Offers available now or earlier</h2>
        <p>Pick which offers can alert you, by when they were posted.</p>
        <div className="grid2">
          <label className="check-tile">
            <input type="checkbox" checked={draft.ages.now} onChange={(e) => set('ages', { ...draft.ages, now: e.target.checked })} />
            Live now
          </label>
          <label className="check-tile">
            <input type="checkbox" checked={draft.ages.earlier} onChange={(e) => set('ages', { ...draft.ages, earlier: e.target.checked })} />
            Posted earlier
          </label>
        </div>
        <label className="field">
          “Now” means posted within
          <select value={draft.nowHours} onChange={(e) => set('nowHours', Number(e.target.value))}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h} {h === 1 ? 'hour' : 'hours'}
              </option>
            ))}
          </select>
        </label>
        {!draft.ages.now && !draft.ages.earlier && <p style={{ color: 'var(--hot)', fontSize: 13 }}>With both off, nothing will alert you.</p>}
      </div>

      <div className="card">
        <div className="row">
          <h2>Stores</h2>
          <span>
            <button className="linkish" onClick={() => set('platforms', Object.fromEntries(PLATFORMS.map((p) => [p.id, true])) as Settings['platforms'])}>All</button>
            {' · '}
            <button className="linkish" onClick={() => set('platforms', Object.fromEntries(PLATFORMS.map((p) => [p.id, false])) as Settings['platforms'])}>None</button>
          </span>
        </div>
        {GROUPS.map((g) => {
          const list = PLATFORMS.filter((p) => p.group === g.id)
          const allOn = list.every((p) => draft.platforms[p.id])
          return (
            <div key={g.id} className="stack">
              <div className="row">
                <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</span>
                {list.length > 1 && (
                  <button className="linkish" onClick={() => setGroup(g.id, !allOn)}>
                    {allOn ? 'Uncheck all' : 'Check all'}
                  </button>
                )}
              </div>
              <div className="grid2">
                {list.map((p) => (
                  <label key={p.id} className="check-tile" style={{ '--c': p.color } as React.CSSProperties}>
                    <input type="checkbox" checked={draft.platforms[p.id]} onChange={(e) => setPlatform(p.id, e.target.checked)} />
                    {p.name}
                    <i />
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <h2>Words</h2>
        <label className="field">
          Only alert when the offer mentions (comma separated, empty for everything)
          <input type="text" value={kw} placeholder="biryani, airpods, movie tickets" onChange={(e) => setKw(e.target.value)} />
        </label>
        <label className="field">
          Never alert when it mentions
          <input type="text" value={mute} placeholder="credit card, emi" onChange={(e) => setMute(e.target.value)} />
        </label>
      </div>

      <div className="card">
        <h2>Quiet hours</h2>
        <label className="toggle">
          <input type="checkbox" checked={draft.quiet.enabled} onChange={(e) => set('quiet', { ...draft.quiet, enabled: e.target.checked })} />
          Hold normal alerts overnight (extraordinary deals still come through)
        </label>
        {draft.quiet.enabled && (
          <div className="grid2">
            {(['from', 'to'] as const).map((k) => (
              <label key={k} className="field">
                {k === 'from' ? 'From' : 'Until'}
                <select value={draft.quiet[k]} onChange={(e) => set('quiet', { ...draft.quiet, [k]: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </div>

      {dirty && (
        <div className="save-bar">
          <span>Unsaved changes</span>
          <button className="btn go" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save alerts'}
          </button>
        </div>
      )}
    </section>
  )
}
