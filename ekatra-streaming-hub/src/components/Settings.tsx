import { useState } from 'react'
import type { ProviderId } from '../types.ts'
import { ServicePicker } from './ServicePicker.tsx'

export type Source = { mode: 'demo' } | { mode: 'tmdb'; key: string }

interface Props {
  services: ProviderId[]
  onServices: (s: ProviderId[]) => void
  source: Source
  onSource: (s: Source) => void
  onImport: (file: File) => void
  onReset: () => void
}

export function Settings({ services, onServices, source, onSource, onImport, onReset }: Props) {
  const [key, setKey] = useState(source.mode === 'tmdb' ? source.key : '')

  return (
    <div className="settings">
      <h2>Settings</h2>

      <section>
        <h3>Your services</h3>
        <ServicePicker value={services} onChange={onServices} />
      </section>

      <section>
        <h3>Catalog</h3>
        <div className="seg" role="radiogroup" aria-label="Catalog source">
          <button
            type="button"
            role="radio"
            aria-checked={source.mode === 'demo'}
            onClick={() => onSource({ mode: 'demo' })}
          >
            Demo catalog
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={source.mode === 'tmdb'}
            onClick={() => key.trim() && onSource({ mode: 'tmdb', key: key.trim() })}
          >
            Live from TMDB
          </button>
        </div>
        <p className="muted small">
          The demo has ~55 originals. For the live catalog, paste a free{' '}
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">
            TMDB API key or read token
          </a>
          . It’s kept in this browser and only sent to TMDB.
        </p>
        <form
          className="key-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (key.trim()) onSource({ mode: 'tmdb', key: key.trim() })
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="TMDB API key"
            aria-label="TMDB API key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button type="submit" className="primary" disabled={!key.trim()}>
            Use live data
          </button>
        </form>
      </section>

      <section>
        <h3>Import Netflix history</h3>
        <p className="muted small">
          On Netflix, open Account → Profile → Viewing activity → Download all. Pick the CSV here; it’s read in your
          browser and never uploaded.
        </p>
        <label className="file-btn">
          Choose NetflixViewingHistory.csv
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImport(f)
              e.target.value = ''
            }}
          />
        </label>
      </section>

      <section>
        <h3>Reset</h3>
        <button
          type="button"
          className="ghost danger"
          onClick={() => {
            if (confirm('Clear your likes, watchlist and history on this device?')) onReset()
          }}
        >
          Clear my data
        </button>
      </section>
    </div>
  )
}
