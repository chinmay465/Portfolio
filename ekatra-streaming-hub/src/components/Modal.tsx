import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Controls Tab can reach inside `root`, in document order. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && !el.closest('[inert]'))
}

/**
 * Native <dialog> for the top layer, backdrop and inert page, plus the parts browsers leave out:
 * focus starts on the first control, Tab and Shift+Tab wrap inside the dialog instead of leaving
 * for the browser UI, Escape closes it, and focus goes back to whatever opened it.
 */
export function Modal({
  open,
  onClose,
  label,
  className = '',
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      const active = document.activeElement
      trigger.current = active instanceof HTMLElement && active !== document.body ? active : null
      d.showModal()
      focusables(d)[0]?.focus()
    }
    if (!open) {
      if (d.open) d.close()
      const back = trigger.current
      trigger.current = null
      if (back?.isConnected) back.focus()
    }
  }, [open])

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    const d = e.currentTarget
    if (e.key === 'Escape') {
      // Close through React state rather than the native cancel, so it behaves the same everywhere.
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const items = focusables(d)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    const inside = active !== d && d.contains(active)
    if (e.shiftKey && (!inside || active === first)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (!inside || active === last)) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={label}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="modal__inner">
          <button type="button" className="icon-btn modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
          {children}
        </div>
      )}
    </dialog>
  )
}
