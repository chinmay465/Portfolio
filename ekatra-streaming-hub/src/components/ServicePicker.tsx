import { PROVIDERS } from '../data/providers.ts'
import type { ProviderId } from '../types.ts'

export function ServicePicker({
  value,
  onChange,
}: {
  value: ProviderId[]
  onChange: (next: ProviderId[]) => void
}) {
  return (
    <div className="services" role="group" aria-label="Your streaming services">
      {PROVIDERS.map((p) => {
        const on = value.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            className="service"
            aria-pressed={on}
            style={{ '--tint': p.color } as React.CSSProperties}
            onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
          >
            <span className="avatar" aria-hidden="true">
              {p.name[0]}
            </span>
            {p.name}
            <span className="service__tick" aria-hidden="true">
              {on ? '✓' : '+'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
