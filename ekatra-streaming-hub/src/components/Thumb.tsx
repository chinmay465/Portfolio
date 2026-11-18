import { PROVIDER_BY_ID } from '../data/providers.ts'
import type { Title } from '../types.ts'

function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** 16:9 thumbnail. TMDB titles use their backdrop; demo titles get generated typographic artwork. */
export function Thumb({ title, large = false }: { title: Title; large?: boolean }) {
  const provider = PROVIDER_BY_ID[title.providers[0]]
  const h = hash(title.id)
  const style = {
    '--tint': provider?.color ?? '#666',
    '--hue': `${h % 360}deg`,
    '--angle': `${(h >> 8) % 180}deg`,
  } as React.CSSProperties

  return (
    <div className={`thumb${large ? ' thumb--large' : ''}`} style={style}>
      {title.poster ? (
        <img src={title.poster} alt="" loading="lazy" decoding="async" />
      ) : (
        <div className="thumb__art" aria-hidden="true">
          <span className="thumb__name">{title.name.split(':')[0]}</span>
          <span className="thumb__year">{title.year || ''}</span>
        </div>
      )}
      <div className="thumb__badges">
        {title.providers.slice(0, 2).map((id) => (
          <span key={id} className="badge" style={{ '--tint': PROVIDER_BY_ID[id].color } as React.CSSProperties}>
            {PROVIDER_BY_ID[id].short}
          </span>
        ))}
      </div>
    </div>
  )
}
