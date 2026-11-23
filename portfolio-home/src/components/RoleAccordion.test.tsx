// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jobs } from '../data/profile'
import { stubBrowser } from '../test/dom'
import RoleAccordion from './RoleAccordion'

stubBrowser()

const roles = jobs.flatMap((j) => j.roles)
const toggles = () => screen.getAllByRole('button')
const expanded = () => toggles().map((b) => b.getAttribute('aria-expanded'))

describe('RoleAccordion', () => {
  it('has one toggle per role, and opens the first role to start', () => {
    render(<RoleAccordion />)
    expect(toggles()).toHaveLength(roles.length)
    expect(roles.length).toBeGreaterThan(1)
    expect(expanded()).toEqual(roles.map((_, i) => String(i === 0)))
  })

  it('opens one role at a time', () => {
    render(<RoleAccordion />)
    for (let i = roles.length - 1; i >= 0; i--) {
      fireEvent.click(toggles()[i])
      expect(expanded()).toEqual(roles.map((_, j) => String(j === i)))
      expect(document.querySelectorAll('.exp-item.open')).toHaveLength(1)
    }
  })

  it('closes the open role when its toggle is pressed again', () => {
    render(<RoleAccordion />)
    fireEvent.click(toggles()[0])
    expect(expanded().every((v) => v === 'false')).toBe(true)
    expect(document.querySelectorAll('.exp-item.open')).toHaveLength(0)
    fireEvent.click(toggles()[0])
    expect(expanded()[0]).toBe('true')
  })

  it('points each toggle at its own labelled panel', () => {
    render(<RoleAccordion />)
    const ids = toggles().map((b) => b.getAttribute('aria-controls'))
    expect(new Set(ids).size).toBe(roles.length)
    for (const [i, id] of ids.entries()) {
      const panel = document.getElementById(id!)
      expect(panel?.getAttribute('role')).toBe('region')
      expect(panel?.getAttribute('aria-label')).toContain(roles[i].title)
    }
  })
})
