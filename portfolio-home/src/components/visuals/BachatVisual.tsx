import { useEffect, useRef, useState } from 'react'

interface Offer {
  id: number
  store: string
  color: string
  title: string
  pct: number
  wow?: boolean
}

const OFFERS: Omit<Offer, 'id'>[] = [
  { store: 'Swiggy', color: '#fc8019', title: 'Flat ₹150 off above ₹199', pct: 75 },
  { store: 'Amazon', color: '#ff9900', title: '32" IPS monitor, ₹15,314', pct: 23 },
  { store: 'Zepto', color: '#8b5cf6', title: 'Triply cookware set, ₹200', pct: 96, wow: true },
  { store: 'Blinkit', color: '#f8cb46', title: 'Chocolate box, pricing glitch', pct: 90, wow: true },
  { store: 'Flipkart', color: '#2874f0', title: '9 kg front-load washer', pct: 58 },
  { store: 'PVR INOX', color: '#ffcc00', title: 'Buy 1 get 1 on Tuesdays', pct: 50 },
  { store: 'Zomato', color: '#e23744', title: '60% off on top restaurants', pct: 60 },
  { store: 'Instamart', color: '#e2387f', title: 'Milk 1L at ₹1 for new users', pct: 100, wow: true },
]
const MIN = 60
const PRIMED = 3
const toOffer = (i: number): Offer => ({ ...OFFERS[i % OFFERS.length], id: i })

/** Bachat's feed: offers stream in, ones over 60% light up, 90%+ ones set off an alert. */
export default function BachatVisual({ active }: { active: boolean }) {
  const [list, setList] = useState<Offer[]>(() => Array.from({ length: PRIMED }, (_, i) => toOffer(i)).reverse())
  const [toast, setToast] = useState<Offer | null>(null)
  const [alerts, setAlerts] = useState(1)
  const n = useRef(PRIMED)

  useEffect(() => {
    if (!active) return
    let hide: ReturnType<typeof setTimeout> | undefined
    const feed = setInterval(() => {
      const o = toOffer(n.current++)
      setList((l) => [o, ...l].slice(0, 5))
      if (o.pct >= MIN) setAlerts((a) => a + 1)
      if (o.wow) {
        setToast(o)
        clearTimeout(hide)
        hide = setTimeout(() => setToast(null), 2600)
      }
    }, 1400)
    return () => {
      clearInterval(feed)
      clearTimeout(hide)
    }
  }, [active])

  return (
    <div className="vis vis-bachat" data-active={active}>
      <div className="ba-head">
        <span className="ba-rule">
          Alert at <b>{MIN}%+</b> · <em>🚨 90%+ always</em>
        </span>
        <span className="ba-count">
          <strong>{alerts}</strong> alerts
        </span>
      </div>
      {toast && (
        <div className="ba-toast" key={toast.id} role="presentation">
          <span>🚨</span>
          <span>
            <b>{toast.pct === 100 ? '₹1 deal' : `${toast.pct}% off`} · {toast.store}</b>
            {toast.title}
          </span>
        </div>
      )}
      <ol className="ba-feed" aria-hidden="true">
        {list.map((o) => (
          <li key={o.id} className={o.wow ? 'wow' : o.pct >= MIN ? 'hit' : undefined} style={{ '--c': o.color } as React.CSSProperties}>
            <span className="ba-tag">{o.pct === 100 ? '₹1' : `${o.pct}%`}</span>
            <span className="ba-text">
              <i>{o.store}</i>
              {o.title}
            </span>
          </li>
        ))}
      </ol>
      <p className="vis-note">Simulated feed</p>
    </div>
  )
}
