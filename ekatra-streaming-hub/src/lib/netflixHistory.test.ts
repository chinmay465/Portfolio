import { describe, expect, it } from 'vitest'
import { DEMO_CATALOG } from '../data/catalog.ts'
import { matchHistory, parseCsv, readNetflixHistory, showName } from './netflixHistory.ts'

const CSV = `﻿Title,Date
"Stranger Things: Season 4: Chapter One: The Hellfire Club","28/05/2022"
"Stranger Things: Season 4: Chapter Two: Vecna's Curse","28/05/2022"
"Glass Onion: A Knives Out Mystery","24/12/2022"
"Dark: Season 1: Secrets","02/01/2021"
"Kota Factory: Season 2: Lecture 1","25/09/2021"
"Some Show, With A Comma: Season 1: Pilot","01/01/2020"
"Some Show, With A Comma: Season 1: Two","01/01/2020"
`

describe('parseCsv', () => {
  it('handles quotes, commas inside quotes, escaped quotes and CRLF', () => {
    expect(parseCsv('a,"b,c","say ""hi"""\r\nd,e,f\r\n')).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['d', 'e', 'f'],
    ])
  })
})

describe('Netflix viewing history', () => {
  it('counts rows per entry, skipping the header and BOM', () => {
    const rows = readNetflixHistory(CSV)
    expect(rows).toHaveLength(7)
    expect(rows[0].plays).toBe(1)
  })

  it('cuts episode detail from show names', () => {
    expect(showName('Dark: Season 1: Secrets')).toBe('Dark')
    expect(showName('Money Heist: Part 1: Episode 1')).toBe('Money Heist')
    expect(showName('Some Film: A Subtitle')).toBe('Some Film')
  })

  it('matches episodes to shows and films with colons in their names', () => {
    const { matched, unmatched } = matchHistory(readNetflixHistory(CSV), DEMO_CATALOG)
    expect(matched).toEqual({
      'demo:stranger-things': 2,
      'demo:glass-onion': 1,
      'demo:dark': 1,
      'demo:kota-factory': 1,
    })
    expect(unmatched).toEqual([{ name: 'Some Show, With A Comma', plays: 2 }])
  })
})
