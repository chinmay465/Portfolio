import { useState } from 'react'
import { ONLY_DISCOUNT } from '../shared/deal.ts'
import type { MatchResult } from '../shared/deal.ts'
import { isExtraordinary } from '../shared/discount.ts'
import { platformById } from '../shared/types.ts'
import type { FeedDeal } from './api.ts'
import { ago, badge, rupees } from './format.ts'

export default function DealCard({ deal, match, threshold, now }: { deal: FeedDeal; match: MatchResult; threshold: number; now: number }) {
  const [open, setOpen] = useState(false)
  const p = platformById(deal.platform)
  const wow = isExtraordinary(deal, threshold)
  const b = badge(deal)
  // The body without lines the card already shows: the title, the bare discount, and links.
  const rest = deal.text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      const bare = l.replace(/^[^\p{L}\p{N}₹[(]+/u, '')
      return bare && !l.includes(deal.title) && !ONLY_DISCOUNT.test(bare) && !/^(?:https?:\/\/)?[\w.-]+\.[a-z]{2,}\/\S*$/i.test(bare)
    })
    .join('\n')
  const style = { '--c': p.color } as React.CSSProperties

  return (
    <li className={`deal${wow ? ' wow-deal' : ''}`} style={style} data-testid="deal" data-platform={deal.platform}>
      <div className="tag" aria-label={deal.percent === null ? 'No discount stated' : `${deal.upTo ? 'up to ' : ''}${deal.percent}% off`}>
        {deal.upTo && <span className="upto">UP TO</span>}
        <strong>{b.main}</strong>
        <span>{b.sub}</span>
      </div>
      <div className="body">
        <div className="meta">
          <span className="store">
            <i />
            {deal.platform === 'other' ? 'Other' : p.name}
          </span>
          {deal.priceError && <span className="flag err">Price error</span>}
          {wow && !deal.priceError && <span className="flag err">{threshold}%+ deal</span>}
          {deal.loot && <span className="flag loot">Loot</span>}
          {match.matches && <span className="flag hit">Fits your alerts</span>}
          <span>
            {ago(deal.postedAt, now)} · {deal.sourceName}
          </span>
        </div>
        <p className="title">{deal.title}</p>
        {rest && (
          <p className={`snippet${open ? ' open' : ''}`} onClick={() => setOpen((o) => !o)}>
            {rest.replace(/~~(.*?)~~/g, '$1 (was)')}
          </p>
        )}
        {deal.price !== undefined && (
          <p className="price">
            {rupees(deal.price)}
            {deal.mrp !== undefined && <s>{rupees(deal.mrp)}</s>}
          </p>
        )}
        <div className="actions">
          <a className={`btn ${wow ? 'hot' : 'go'}`} href={deal.url} target="_blank" rel="noopener noreferrer">
            Open deal
          </a>
          {deal.url !== deal.postUrl && (
            <a className="btn" href={deal.postUrl} target="_blank" rel="noopener noreferrer">
              Post
            </a>
          )}
        </div>
        {!match.matches && <p className="why">No alert: {match.reason}</p>}
      </div>
    </li>
  )
}
