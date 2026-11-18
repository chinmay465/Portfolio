import { describe, expect, it } from 'vitest'
import { normalize } from './text.ts'

describe('normalize', () => {
  it('strips accents, punctuation and a leading "the"', () => {
    expect(normalize('Shōgun')).toBe('shogun')
    expect(normalize('The Marvelous Mrs. Maisel')).toBe('marvelous mrs maisel')
    expect(normalize('Scam 1992: The Harshad Mehta Story')).toBe('scam 1992 the harshad mehta story')
  })
})
