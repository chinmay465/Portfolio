import { useMemo, useState } from 'react'
import { isNow, matchDeal } from '../shared/deal.ts'
import { isExtraordinary } from '../shared/discount.ts'
import { PLATFORMS } from '../shared/types.ts'
import type { PlatformId, Settings } from '../shared/types.ts'
import type { FeedDeal } from './api.ts'
import DealCard from './DealCard.tsx'

const MINS = [0, 40, 60, 80, 90]

export default function FeedView({ deals, settings, now, loading }: { deals: FeedDeal[]; settings: Settings; now: number; loading: boolean }) {
  const [age, setAge] = useState<'now' | 'earlier'>('now')
  const [onlyMatches, setOnlyMatches] = useState(false)
  const [min, setMin] = useState(0)
  const [store, setStore] = useState<PlatformId | null>(null)
  const hour = new Date(now).getHours()

  const rows = useMemo(
    () => deals.map((d) => ({ d, m: matchDeal(d, settings, now, hour), fresh: isNow(d, settings.nowHours, now) })),
    [deals, settings, now, hour],
  )
  const inAge = rows.filter((r) => (age === 'now' ? r.fresh : !r.fresh))
  const counts = new Map<PlatformId, number>()
  for (const r of inAge) counts.set(r.d.platform, (counts.get(r.d.platform) ?? 0) + 1)
  const shown = inAge
    .filter((r) => !onlyMatches || r.m.matches)
    .filter((r) => (r.d.percent ?? 0) >= min || (min > 0 && r.d.priceError))
    .filter((r) => !store || r.d.platform === store)
    .sort((a, b) => Number(isExtraordinary(b.d, settings.extraordinary.threshold)) - Number(isExtraordinary(a.d, settings.extraordinary.threshold)) || Date.parse(b.d.postedAt) - Date.parse(a.d.postedAt))
  const wowNow = rows.filter((r) => r.fresh && isExtraordinary(r.d, settings.extraordinary.threshold)).length
  const nowCount = rows.filter((r) => r.fresh).length

  return (
    <section aria-label="Offers">
      {wowNow > 0 && (
        <div className="wow" role="status">
          <span className="siren" aria-hidden="true">🚨</span>
          <span>
            <b>{wowNow} extraordinary {wowNow === 1 ? 'deal' : 'deals'}</b> right now ({settings.extraordinary.threshold}%+ off or a price error). They go fast.
          </span>
        </div>
      )}
      <div className="seg" role="group" aria-label="When posted">
        <button aria-pressed={age === 'now'} onClick={() => setAge('now')}>
          Now<em>{nowCount}</em>
        </button>
        <button aria-pressed={age === 'earlier'} onClick={() => setAge('earlier')}>
          Earlier<em>{rows.length - nowCount}</em>
        </button>
      </div>
      <div className="filters">
        <div className="row">
          <div className="chips" role="group" aria-label="Minimum discount">
            {MINS.map((m) => (
              <button key={m} className="chip" aria-pressed={min === m} onClick={() => setMin(m)}>
                {m === 0 ? 'Any %' : `${m}%+`}
              </button>
            ))}
          </div>
          <label className="toggle">
            <input type="checkbox" checked={onlyMatches} onChange={(e) => setOnlyMatches(e.target.checked)} />
            My alerts
          </label>
        </div>
        <div className="chips" role="group" aria-label="Store">
          <button className="chip" aria-pressed={store === null} onClick={() => setStore(null)}>
            All stores
          </button>
          {PLATFORMS.filter((p) => counts.get(p.id)).map((p) => (
            <button
              key={p.id}
              className="chip"
              style={{ '--c': p.color } as React.CSSProperties}
              aria-pressed={store === p.id}
              onClick={() => setStore(store === p.id ? null : p.id)}
            >
              <i />
              {p.id === 'other' ? 'Other' : p.name}
              <small>{counts.get(p.id)}</small>
            </button>
          ))}
        </div>
      </div>
      {shown.length ? (
        <ul className="deals">
          {shown.map(({ d, m }) => (
            <DealCard key={d.id} deal={d} match={m} threshold={settings.extraordinary.threshold} now={now} />
          ))}
        </ul>
      ) : (
        <div className="empty">
          <strong>{loading ? 'Checking the deal channels…' : age === 'now' ? `Nothing in the last ${settings.nowHours} h` : 'No earlier offers'}</strong>
          {loading ? 'This takes a few seconds.' : inAge.length ? 'Loosen the filters above to see more.' : 'Tap Check now, or look at Earlier.'}
        </div>
      )}
    </section>
  )
}
