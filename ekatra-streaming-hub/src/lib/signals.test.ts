import { describe, expect, it } from 'vitest'
import { EMPTY_SIGNALS } from '../types.ts'
import { applyReaction } from './signals.ts'

describe('applyReaction', () => {
  it('toggles a like and clears an earlier dislike', () => {
    const s = applyReaction({ ...EMPTY_SIGNALS, disliked: ['a'] }, 'a', 'like')
    expect(s).toMatchObject({ liked: ['a'], disliked: [] })
    expect(applyReaction(s, 'a', 'like').liked).toEqual([])
  })

  it('a dislike removes the like and the watchlist entry', () => {
    const s = applyReaction({ ...EMPTY_SIGNALS, liked: ['a'], watchlist: ['a'] }, 'a', 'dislike')
    expect(s).toMatchObject({ liked: [], watchlist: [], disliked: ['a'] })
  })

  it('toggles watched', () => {
    const s = applyReaction(EMPTY_SIGNALS, 'a', 'watched')
    expect(s.watched).toEqual({ a: 1 })
    expect(applyReaction(s, 'a', 'watched').watched).toEqual({})
  })
})
