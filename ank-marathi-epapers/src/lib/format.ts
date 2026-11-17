import type { Lang } from '../data/papers'

const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९']

export function toDevanagari(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => DEVANAGARI_DIGITS[Number(d)])
}

export function num(value: number, lang: Lang): string {
  return lang === 'mr' ? toDevanagari(value) : String(value)
}

const MONTHS_MR = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर']
const DAYS_MR = ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface DateParts {
  weekday: string
  date: string
}

export function formatDate(d: Date, lang: Lang): DateParts {
  const day = d.getDate()
  const year = d.getFullYear()
  if (lang === 'mr') {
    return {
      weekday: DAYS_MR[d.getDay()],
      date: `${toDevanagari(day)} ${MONTHS_MR[d.getMonth()]} ${toDevanagari(year)}`,
    }
  }
  return { weekday: DAYS_EN[d.getDay()], date: `${day} ${MONTHS_EN[d.getMonth()]} ${year}` }
}

/** Local calendar day key, e.g. 2026-11-17. Used to reset "read today" at midnight. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Case- and script-insensitive match against both names. */
export function matchesQuery(names: string[], query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, '')
  if (!q) return true
  return names.some((n) => n.toLowerCase().replace(/\s+/g, '').includes(q))
}
