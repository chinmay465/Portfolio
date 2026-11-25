// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DEMO_CATALOG } from '../data/catalog.ts'
import { EMPTY_SIGNALS, type ProviderId, type Title } from '../types.ts'
import { Modal } from './Modal.tsx'
import { TitleSheet } from './TitleSheet.tsx'

// jsdom has <dialog> but not showModal() or close(); these do what the browser does to `open` and events.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
})

afterEach(cleanup)

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open settings
      </button>
      <Modal open={open} onClose={() => setOpen(false)} label="Settings">
        <label>
          Name <input />
        </label>
        <button type="button">Save</button>
      </Modal>
    </>
  )
}

/** Focus the trigger and click it, as a real click or Enter would. */
function openWith(name: string) {
  const trigger = screen.getByRole('button', { name })
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}

const dialog = () => document.querySelector('dialog')!

describe('Modal', () => {
  it('moves focus into the dialog when it opens', () => {
    render(<Harness />)
    openWith('Open settings')
    expect(dialog().open).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  })

  it('wraps Tab from the last control to the first, and Shift+Tab back', () => {
    render(<Harness />)
    openWith('Open settings')
    const close = screen.getByRole('button', { name: 'Close' })
    const save = screen.getByRole('button', { name: 'Save' })

    save.focus()
    expect(fireEvent.keyDown(save, { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(close)

    expect(fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(document.activeElement).toBe(save)
  })

  it('leaves Tab alone between controls in the middle', () => {
    render(<Harness />)
    openWith('Open settings')
    const input = screen.getByRole('textbox')
    input.focus()
    expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })).toBe(true)
  })

  it('pulls focus back in if it lands on the dialog itself', () => {
    render(<Harness />)
    openWith('Open settings')
    dialog().tabIndex = -1
    dialog().focus()
    fireEvent.keyDown(dialog(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }))
  })

  it('closes on Escape and returns focus to the trigger', () => {
    render(<Harness />)
    const trigger = openWith('Open settings')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(dialog().open).toBe(false)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('returns focus to the trigger when closed with the close button', () => {
    render(<Harness />)
    const trigger = openWith('Open settings')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(dialog().open).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })
})

describe('TitleSheet in a Modal', () => {
  const services: ProviderId[] = ['netflix', 'prime', 'jiohotstar', 'sonyliv', 'zee5']

  function Sheet() {
    const [open, setOpen] = useState<Title | null>(null)
    return (
      <>
        <button type="button" onClick={() => setOpen(DEMO_CATALOG[0])}>
          {DEMO_CATALOG[0].name}
        </button>
        <Modal open={open !== null} onClose={() => setOpen(null)} label={open?.name ?? 'Title'} className="modal--sheet">
          {open && (
            <TitleSheet
              key={open.id}
              title={open}
              pool={DEMO_CATALOG}
              services={services}
              signals={EMPTY_SIGNALS}
              onReact={() => {}}
              onOpen={setOpen}
            />
          )}
        </Modal>
      </>
    )
  }

  it('keeps focus in the sheet when a similar title opens, and returns it to the card on Escape', () => {
    render(<Sheet />)
    const card = openWith(DEMO_CATALOG[0].name)
    expect(dialog().contains(document.activeElement)).toBe(true)

    const similar = screen.getAllByRole('button', { name: /, details$/ })[0]
    const next = similar.getAttribute('aria-label')!.replace(/, details$/, '')
    similar.focus()
    fireEvent.click(similar)

    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe(next)
    expect(document.activeElement).toBe(heading)

    fireEvent.keyDown(heading, { key: 'Escape' })
    expect(dialog().open).toBe(false)
    expect(document.activeElement).toBe(card)
  })

  it('wraps Tab inside the sheet', () => {
    render(<Sheet />)
    openWith(DEMO_CATALOG[0].name)
    const close = screen.getByRole('button', { name: 'Close' })
    const controls = dialog().querySelectorAll<HTMLElement>('a[href], button')
    const last = controls[controls.length - 1]
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
  })
})
