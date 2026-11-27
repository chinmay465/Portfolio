import type { Deal } from '../shared/types.ts'

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} d ago`
}

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/** The big label on a deal card. */
export function badge(d: Pick<Deal, 'percent' | 'kind' | 'price'>): { main: string; sub: string } {
  if (d.kind === 'free') return d.price !== undefined && d.price > 0 ? { main: rupees(d.price), sub: 'deal' } : { main: 'FREE', sub: '100% off' }
  if (d.kind === 'bogo') return { main: `${d.percent}%`, sub: 'buy + get' }
  if (d.percent === null) return { main: '—', sub: 'offer' }
  return { main: `${d.percent}%`, sub: d.kind === 'flat' ? 'flat off' : 'off' }
}
