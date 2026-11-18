import type { Title } from '../types.ts'
import { normalize } from './text.ts'

/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

/**
 * Netflix's "Download viewing activity" CSV has one row per episode or film:
 * `"Stranger Things: Season 4: Chapter One: The Hellfire Club","5/28/22"`.
 * Returns each distinct show or film with how many rows it had, most-watched first.
 */
export function readNetflixHistory(csv: string): { name: string; plays: number }[] {
  const rows = parseCsv(csv.replace(/^﻿/, ''))
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = header.indexOf('title')
  const body = col === -1 ? rows : rows.slice(1)
  const titleCol = col === -1 ? 0 : col

  const counts = new Map<string, number>()
  for (const r of body) {
    const raw = r[titleCol]?.trim()
    if (raw) counts.set(raw, (counts.get(raw) ?? 0) + 1)
  }
  return [...counts].map(([name, plays]) => ({ name, plays })).sort((a, b) => b.plays - a.plays)
}

/** Cuts episode detail: "Dark: Season 1: Secrets" → "Dark". Film titles with colons are kept whole elsewhere. */
export function showName(raw: string): string {
  const cut = raw.search(/: (Season|Series|Part|Volume|Chapter|Limited Series|Book|Collection) /i)
  return (cut === -1 ? raw.split(': ')[0] : raw.slice(0, cut)).trim()
}

export interface HistoryMatch {
  /** Title id → number of rows (episodes or viewings). */
  matched: Record<string, number>
  /** Shows we couldn't find in the catalog, most-watched first. */
  unmatched: { name: string; plays: number }[]
}

/**
 * Matches history rows to catalog titles. Tries the longest colon-prefix first, so
 * "Glass Onion: A Knives Out Mystery" matches the film, and "Dark: Season 1: Secrets" falls back to "Dark".
 */
export function matchHistory(rows: { name: string; plays: number }[], pool: Title[]): HistoryMatch {
  const byName = new Map<string, Title>()
  for (const t of pool) byName.set(normalize(t.name), t)

  const matched: Record<string, number> = {}
  const unmatched = new Map<string, number>()
  for (const { name, plays } of rows) {
    const parts = name.split(': ')
    let hit: Title | undefined
    for (let n = parts.length; n >= 1 && !hit; n--) hit = byName.get(normalize(parts.slice(0, n).join(': ')))
    if (hit) matched[hit.id] = (matched[hit.id] ?? 0) + plays
    else {
      const show = showName(name)
      unmatched.set(show, (unmatched.get(show) ?? 0) + plays)
    }
  }
  return {
    matched,
    unmatched: [...unmatched].map(([name, plays]) => ({ name, plays })).sort((a, b) => b.plays - a.plays),
  }
}
