/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const reducedMotion = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1])

describe('reduced motion', () => {
  it('stops the skeleton shimmer and leaves a flat placeholder', () => {
    const block = reducedMotion.find((b) => /\.skeleton\s*\{/.test(b))
    expect(block).toBeDefined()
    expect(block).toMatch(/animation:\s*none/)
    expect(block).toMatch(/background:\s*var\(--surface-2\)/)
  })
})
