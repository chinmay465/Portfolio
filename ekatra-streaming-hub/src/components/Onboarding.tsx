import { useState } from 'react'
import { recommend } from '../lib/recommend.ts'
import { EMPTY_SIGNALS, type ProviderId, type Title } from '../types.ts'
import { ServicePicker } from './ServicePicker.tsx'
import { Thumb } from './Thumb.tsx'

/** Two quick steps: which services you pay for, then a few titles you liked (the cold-start seed). */
export function Onboarding({
  pool,
  services,
  onServices,
  onDone,
}: {
  pool: Title[]
  services: ProviderId[]
  onServices: (s: ProviderId[]) => void
  onDone: (liked: Title[]) => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [picked, setPicked] = useState<string[]>([])
  const options = recommend(pool, EMPTY_SIGNALS, services, {}, 18).map((p) => p.title)

  if (step === 1) {
    return (
      <div className="onboard">
        <p className="eyebrow">Step 1 of 2</p>
        <h2>Which services do you have?</h2>
        <p className="muted">Your feed only shows what you can actually watch. You can change this later.</p>
        <ServicePicker value={services} onChange={onServices} />
        <div className="onboard__foot">
          <button type="button" className="primary" onClick={() => setStep(2)}>
            Next
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="onboard">
      <p className="eyebrow">Step 2 of 2</p>
      <h2>Tap a few you’ve enjoyed</h2>
      <p className="muted">Three or more gives the feed something to go on.</p>
      <div className="picker">
        {options.map((t) => {
          const on = picked.includes(t.id)
          return (
            <button
              key={t.id}
              type="button"
              className="picker__item"
              aria-pressed={on}
              aria-label={t.name}
              onClick={() => setPicked(on ? picked.filter((x) => x !== t.id) : [...picked, t.id])}
            >
              <Thumb title={t} />
              <span className="picker__check" aria-hidden="true">
                ✓
              </span>
            </button>
          )
        })}
      </div>
      <div className="onboard__foot">
        <button type="button" className="ghost" onClick={() => setStep(1)}>
          Back
        </button>
        <button type="button" className="primary" onClick={() => onDone(options.filter((t) => picked.includes(t.id)))}>
          {picked.length ? `Build my feed (${picked.length})` : 'Skip for now'}
        </button>
      </div>
    </div>
  )
}
