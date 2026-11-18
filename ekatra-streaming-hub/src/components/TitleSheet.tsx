import { useEffect, useState } from 'react'
import { PROVIDER_BY_ID } from '../data/providers.ts'
import { openLinks, whereToWatch } from '../lib/links.ts'
import { similarTo } from '../lib/recommend.ts'
import { fetchProviders } from '../lib/tmdb.ts'
import type { ProviderId, Reaction, Signals, Title } from '../types.ts'
import { Thumb } from './Thumb.tsx'
import { TitleCard } from './TitleCard.tsx'

interface Props {
  title: Title
  pool: Title[]
  services: ProviderId[]
  signals: Signals
  tmdbKey?: string
  onReact: (t: Title, r: Reaction) => void
  onOpen: (t: Title) => void
}

const LANG = new Intl.DisplayNames(['en'], { type: 'language' })

export function TitleSheet({ title, pool, services, signals, tmdbKey, onReact, onOpen }: Props) {
  const [live, setLive] = useState<{ id: string; providers: ProviderId[] } | null>(null)

  // TMDB discover only tells us the service we searched; ask for the full list when the sheet opens.
  useEffect(() => {
    if (!tmdbKey || !title.id.startsWith('tmdb:')) return
    let cancelled = false
    fetchProviders(tmdbKey, title)
      .then((providers) => !cancelled && setLive({ id: title.id, providers }))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tmdbKey, title])

  const providers = live?.id === title.id && live.providers.length ? live.providers : title.providers
  const full = { ...title, providers }
  const links = openLinks(full, services)
  const similar = similarTo(title, pool, services, signals.disliked, 8)
  const liked = signals.liked.includes(title.id)
  const disliked = signals.disliked.includes(title.id)
  const saved = signals.watchlist.includes(title.id)
  const plays = signals.watched[title.id] ?? 0

  return (
    <div className="sheet">
      <Thumb title={full} large />
      <div className="sheet__head">
        <h2>{title.name}</h2>
        <p className="sheet__meta">
          {title.kind === 'series' ? 'Series' : 'Film'}
          {title.year ? ` · ${title.year}` : ''}
          {title.genres.length ? ` · ${title.genres.join(', ')}` : ''}
          {` · ${LANG.of(title.language) ?? title.language}`}
          {title.rating ? ` · ★ ${title.rating.toFixed(1)} on TMDB` : ''}
        </p>
        {title.overview && <p className="sheet__overview">{title.overview}</p>}
      </div>

      <div className="sheet__play">
        {links.length === 0 && <p className="muted">Not on a subscription service in India right now.</p>}
        {links.map((l) => (
          <a
            key={l.provider}
            className="play-btn"
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ '--tint': PROVIDER_BY_ID[l.provider].color } as React.CSSProperties}
          >
            <span aria-hidden="true">▶</span> {l.label}
          </a>
        ))}
        <a className="text-link" href={whereToWatch(full)} target="_blank" rel="noopener noreferrer">
          All streaming options ↗
        </a>
      </div>

      <div className="sheet__actions" role="group" aria-label="Your reaction">
        <button type="button" className="pill" aria-pressed={liked} onClick={() => onReact(title, 'like')}>
          👍 {liked ? 'Liked' : 'Like'}
        </button>
        <button type="button" className="pill" aria-pressed={disliked} onClick={() => onReact(title, 'dislike')}>
          👎 {disliked ? 'Not for me' : 'Dislike'}
        </button>
        <button type="button" className="pill" aria-pressed={saved} onClick={() => onReact(title, 'save')}>
          {saved ? '✓ In watchlist' : '+ Watchlist'}
        </button>
        <button type="button" className="pill" aria-pressed={plays > 0} onClick={() => onReact(title, 'watched')}>
          {plays > 0 ? `✓ Watched${plays > 1 ? ` (${plays})` : ''}` : 'Mark watched'}
        </button>
      </div>

      {similar.length > 0 && (
        <section className="sheet__similar">
          <h3>More like this</h3>
          <div className="grid grid--compact">
            {similar.map((t) => (
              <TitleCard key={t.id} title={t} services={services} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
