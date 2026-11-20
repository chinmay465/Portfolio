import { useEffect, useState } from 'react'

const SERVICES = {
  Netflix: '#e50914',
  'Prime Video': '#1aa7ec',
  JioHotstar: '#3d6bff',
  SonyLIV: '#f0b429',
  ZEE5: '#9b4dff',
} as const
type Service = keyof typeof SERVICES

const FEED: { title: string; service: Service; why: string; hue: number }[] = [
  { title: 'Paatal Lok', service: 'Prime Video', why: 'Because you liked Mirzapur', hue: 12 },
  { title: 'Scam 1992', service: 'SonyLIV', why: 'Popular on SonyLIV', hue: 42 },
  { title: 'Kota Factory', service: 'Netflix', why: 'Because you liked Panchayat', hue: 200 },
  { title: 'Aarya', service: 'JioHotstar', why: 'Because you liked Delhi Crime', hue: 330 },
  { title: 'Sunflower', service: 'ZEE5', why: 'Popular on ZEE5', hue: 52 },
  { title: 'Sacred Games', service: 'Netflix', why: 'Because you liked Paatal Lok', hue: 0 },
  { title: 'Rocket Boys', service: 'SonyLIV', why: 'Because you liked Scam 1992', hue: 220 },
  { title: 'The Family Man', service: 'Prime Video', why: 'Because you liked Special Ops', hue: 160 },
]
const CHIPS = ['All', 'Series', 'Thriller', 'Drama', 'Films']

/** A working sketch of the Ekatra home feed: chips that switch, a feed that keeps scrolling. */
export default function EkatraVisual({ active }: { active: boolean }) {
  const [chip, setChip] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setChip((c) => (c + 1) % CHIPS.length), 2200)
    return () => clearInterval(t)
  }, [active])

  const cards = [...FEED, ...FEED]
  return (
    <div className="vis vis-ekatra" data-active={active}>
      <div className="vis-bar">
        <span className="vis-logo">Ekatra</span>
        <span className="vis-search">Search all your apps</span>
      </div>
      <div className="ek-chips" aria-hidden="true">
        {CHIPS.map((c, i) => (
          <span key={c} className={i === chip ? 'on' : undefined}>
            {c}
          </span>
        ))}
      </div>
      <div className="ek-window" aria-hidden="true">
        <ul className="ek-feed">
          {cards.map((c, i) => (
            <li key={i} style={{ '--h': c.hue, '--svc': SERVICES[c.service] } as React.CSSProperties}>
              <span className="ek-thumb">
                <span>{c.title}</span>
              </span>
              <span className="ek-title">{c.title}</span>
              <span className="ek-svc">{c.service}</span>
              <span className="ek-why">{c.why}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
