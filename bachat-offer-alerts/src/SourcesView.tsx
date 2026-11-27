import { useState } from 'react'
import type { SourceStatus } from '../shared/api-types.ts'
import { DEFAULT_SOURCES, cleanChannel } from '../shared/types.ts'
import type { Settings } from '../shared/types.ts'
import { ago } from './format.ts'

interface Props {
  status: SourceStatus[]
  settings: Settings
  now: number
  onSave: (s: Settings) => Promise<void>
}

export default function SourcesView({ status, settings, now, onSave }: Props) {
  const [input, setInput] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const byId = new Map(status.map((s) => [s.id, s]))
  const rows = [
    ...DEFAULT_SOURCES.filter((s) => s.enabled).map((s) => ({ id: s.id, name: s.name, note: s.note ?? '', own: false })),
    ...settings.channels.map((c) => ({ id: `tg:${c.toLowerCase()}`, name: `@${c}`, note: `t.me/${c}`, own: true })),
  ]

  async function add() {
    const ch = cleanChannel(input)
    if (!ch) {
      setErr('That doesn’t look like a public channel name (like lootdeals or t.me/lootdeals).')
      return
    }
    setErr(null)
    setInput('')
    await onSave({ ...settings, channels: [...settings.channels, ch] })
  }

  return (
    <section className="panel" aria-label="Sources">
      <div className="card">
        <h2>Where offers come from</h2>
        <p>Bachat reads these every 10 minutes and works out the store and the real discount from each post.</p>
        <div className="stack">
          {rows.map((r) => {
            const s = byId.get(r.id)
            const state = !s ? 'Not checked yet' : s.lastError ? `Failing: ${s.lastError}` : `${s.posts} posts · checked ${ago(s.lastChecked!, now)}`
            return (
              <div key={r.id} className="src">
                <span className={`led${s ? (s.lastError ? ' bad' : ' ok') : ''}`} />
                <div>
                  <b>{r.name}</b>
                  <small>{state}</small>
                  {r.note && !r.own && <small style={{ display: 'block' }}>{r.note}</small>}
                </div>
                {r.own && (
                  <button className="linkish" onClick={() => onSave({ ...settings, channels: settings.channels.filter((c) => `tg:${c.toLowerCase()}` !== r.id) })}>
                    Remove
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <label className="field">
          Add a public Telegram deals channel
          <span className="row" style={{ gap: 8 }}>
            <input style={{ flex: 1 }} value={input} placeholder="t.me/channelname" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
            <button className="btn go" onClick={() => void add()}>
              Add
            </button>
          </span>
        </label>
        {err && <p style={{ color: 'var(--hot)', fontSize: 13 }}>{err}</p>}
      </div>

      <div className="card">
        <h2>What Bachat can and can’t see</h2>
        <ul className="facts">
          <li><span>✅</span><span><b>Public deal channels.</b> Offers people share for Zomato, Swiggy, Instamart, Blinkit, Zepto, BigBasket, Amazon, Flipkart, Myntra, PVR INOX, BookMyShow and more, with the price, MRP and discount read from the post.</span></li>
          <li><span>✅</span><span><b>90%+ and price-error deals.</b> Spotted from the real price against the MRP, or from words like “price error” and “pricing glitch”. These are usually gone within minutes, so they get their own loud alert.</span></li>
          <li><span>➖</span><span><b>Offers only inside your account.</b> Personal coupons in the Swiggy, Zomato or Blinkit apps depend on your login and address, and no open feed exists for them. Swiggy’s Builders Club API is invite-only and made for ordering, not offer feeds.</span></li>
          <li><span>➖</span><span><b>Amazon and PVR offer pages.</b> They block automated reading, and Amazon’s product API is only for its affiliates, so Bachat relies on deal posts for them.</span></li>
        </ul>
      </div>
    </section>
  )
}
