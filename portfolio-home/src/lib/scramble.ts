/** Glyphs the name flickers through before it settles: Devanagari letters mixed with Latin. */
export const SCRAMBLE_GLYPHS = 'कखगघचजटडतदनपबमयरलवशसहअइउएओ01ABCDEFGHKMNRSTUXZ#%&*+<>/'

/**
 * One frame of a left-to-right decode. Characters before the reveal front are final,
 * the rest show a random glyph. Spaces always stay spaces so line breaks never move.
 */
export function scrambleFrame(target: string, progress: number, rand: () => number = Math.random): string {
  const p = Math.min(1, Math.max(0, progress))
  const settled = Math.floor(p * target.length)
  let out = ''
  for (let i = 0; i < target.length; i++) {
    const ch = target[i]
    if (i < settled || ch === ' ') out += ch
    else out += SCRAMBLE_GLYPHS[Math.floor(rand() * SCRAMBLE_GLYPHS.length)]
  }
  return out
}
