import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { GITHUB_URL, REPO_URL, projects } from '../data/projects'
import { LINKEDIN_URL } from '../data/profile'

interface Item {
  id: string
  title: string
  hint: string
  href: string
  external: boolean
  accent?: string
}

const items: Item[] = [
  { id: 'home', title: 'Home', hint: 'Page', href: '/', external: false },
  { id: 'about', title: 'About me', hint: 'Page', href: '/about', external: false },
  { id: 'experience', title: 'Experience and education', hint: 'Page', href: '/experience', external: false },
  { id: 'projects', title: 'All projects', hint: 'Page', href: '/projects', external: false },
  { id: 'contact', title: 'Email and contact', hint: 'Page', href: '/contact', external: false },
  ...projects.flatMap((p) => [
    { id: `${p.id}-page`, title: p.name, hint: 'Project page', href: `/projects/${p.id}`, external: false, accent: p.accent },
    p.live
      ? { id: `${p.id}-live`, title: `Open ${p.name}`, hint: p.live.replace('https://', ''), href: p.live, external: true, accent: p.accent }
      : p.download
        ? { id: `${p.id}-apk`, title: `Get the ${p.name} APK`, hint: 'GitHub Actions', href: p.download, external: true, accent: p.accent }
        : { id: `${p.id}-demo`, title: `Try the ${p.name} demo`, hint: 'Interactive', href: `/projects/${p.id}#demo`, external: false, accent: p.accent },
    ...(p.live && p.download
      ? [{ id: `${p.id}-apk`, title: `Get the ${p.name} APK`, hint: 'GitHub Actions', href: p.download, external: true, accent: p.accent }]
      : []),
    ...(p.code
      ? [{ id: `${p.id}-code`, title: `${p.name} source code`, hint: 'GitHub', href: p.code, external: true, accent: p.accent }]
      : []),
  ]),
  { id: 'linkedin', title: 'LinkedIn profile', hint: 'linkedin.com/in/chinmay-upare', href: LINKEDIN_URL, external: true },
  { id: 'github', title: 'GitHub profile', hint: 'github.com/chinmay465', href: GITHUB_URL, external: true },
  { id: 'repo', title: 'Source of this site', hint: 'GitHub', href: REPO_URL, external: true },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => `${i.title} ${i.hint}`.toLowerCase().includes(q))
  }, [query])

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      listRef.current?.querySelector<HTMLAnchorElement>(`[data-index="${active}"]`)?.click()
    }
  }

  return (
    <div className="palette-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Jump to" onKeyDown={onKey}>
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          placeholder="Search pages, projects and links"
          aria-label="Search pages, projects and links"
          aria-controls="palette-list"
          aria-activedescendant={results[active] ? `pal-${results[active].id}` : undefined}
        />
        <ul id="palette-list" ref={listRef} className="palette-list" role="listbox">
          {results.length === 0 && <li className="palette-empty">Nothing matches “{query}”. Try a project name.</li>}
          {results.map((item, i) => (
            <li key={item.id} role="option" id={`pal-${item.id}`} aria-selected={i === active}>
              {item.external ? (
                <a
                  data-index={i}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={i === active ? 'is-active' : undefined}
                  style={item.accent ? ({ '--accent': item.accent } as React.CSSProperties) : undefined}
                  onPointerMove={() => setActive(i)}
                  onClick={onClose}
                >
                  <span className="palette-dot" aria-hidden="true" />
                  <span className="palette-title">{item.title}</span>
                  <span className="palette-hint">{item.hint}</span>
                </a>
              ) : (
                <Link
                  data-index={i}
                  to={item.href}
                  viewTransition
                  className={i === active ? 'is-active' : undefined}
                  style={item.accent ? ({ '--accent': item.accent } as React.CSSProperties) : undefined}
                  onPointerMove={() => setActive(i)}
                  onClick={onClose}
                >
                  <span className="palette-dot" aria-hidden="true" />
                  <span className="palette-title">{item.title}</span>
                  <span className="palette-hint">{item.hint}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
        <p className="palette-foot">
          <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> to open, <kbd>Esc</kbd> to close
        </p>
      </div>
    </div>
  )
}
