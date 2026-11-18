import { PROVIDER_BY_ID } from '../data/providers.ts'
import { reasonText } from '../lib/reason.ts'
import type { Reason } from '../lib/recommend.ts'
import type { ProviderId, Title } from '../types.ts'
import { Thumb } from './Thumb.tsx'

interface Props {
  title: Title
  services: ProviderId[]
  reason?: Reason
  note?: string
  onOpen: (t: Title) => void
}

export function TitleCard({ title, services, reason, note, onOpen }: Props) {
  const main = title.providers.find((p) => services.includes(p)) ?? title.providers[0]
  const provider = main ? PROVIDER_BY_ID[main] : undefined
  const offServices = services.length > 0 && !title.providers.some((p) => services.includes(p))

  return (
    <article className={`card${offServices ? ' card--off' : ''}`}>
      <button type="button" className="card__hit" onClick={() => onOpen(title)} aria-label={`${title.name}, details`}>
        <Thumb title={title} />
      </button>
      <div className="card__body">
        <span className="avatar" style={{ '--tint': provider?.color ?? '#777' } as React.CSSProperties} aria-hidden="true">
          {provider?.name[0] ?? '?'}
        </span>
        <div className="card__text">
          <h3 className="card__title">
            <button type="button" onClick={() => onOpen(title)}>
              {title.name}
            </button>
          </h3>
          <p className="card__meta">
            {provider?.name ?? 'Not streaming in India'}
            {title.providers.length > 1 && ` +${title.providers.length - 1}`} · {title.kind === 'series' ? 'Series' : 'Film'}
            {title.year ? ` · ${title.year}` : ''}
            {title.rating ? ` · ★ ${title.rating.toFixed(1)}` : ''}
          </p>
          {(note || reason) && <p className="card__reason">{note ?? reasonText(reason!)}</p>}
          {offServices && <p className="card__reason card__reason--muted">Not on your services</p>}
        </div>
      </div>
    </article>
  )
}
