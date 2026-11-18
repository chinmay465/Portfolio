import { useEffect, useRef, type ReactNode } from 'react'

/** Native <dialog>: focus trap, Esc to close and a top-layer backdrop for free. */
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

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={label}
      onClose={onClose}
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
