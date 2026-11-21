import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigation } from 'react-router'
import { GITHUB_URL, REPO_URL, webProjects } from '../data/projects'
import { EMAIL, LINKEDIN_URL } from '../data/profile'
import { useReducedMotion } from '../hooks/motion'
import { usePings } from '../hooks/usePings'
import { SiteContext } from '../context/site'
import Ambient from '../components/Ambient'
import CommandPalette from '../components/CommandPalette'

const YEAR = new Date().getFullYear()

const NAV = [
  { to: '/about', label: 'About' },
  { to: '/experience', label: 'Experience' },
  { to: '/projects', label: 'Projects' },
  { to: '/contact', label: 'Contact' },
]

export default function Layout() {
  const reduced = useReducedMotion()
  const health = usePings(webProjects)
  const location = useLocation()
  const navigation = useNavigation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const site = useMemo(() => ({ reduced, health, openPalette: () => setPaletteOpen(true) }), [reduced, health])
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  useEffect(() => {
    document.body.classList.toggle('menu-open', menuOpen)
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.matches('input, textarea, [contenteditable]')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <SiteContext.Provider value={site}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Ambient reduced={reduced} />
      <div className={`route-loading${navigation.state === 'loading' ? ' on' : ''}`} aria-hidden="true" />

      <header className="nav">
        <Link className="brand" to="/" aria-label="Chinmay Upare, home" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            चि
          </span>
          <span className="brand-name">Chinmay Upare</span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} viewTransition>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button className="nav-jump" type="button" onClick={() => setPaletteOpen(true)}>
          Jump to
          <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <button
          className={`nav-burger${menuOpen ? ' open' : ''}`}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span />
          <span />
        </button>
      </header>

      {/* Any link in the menu closes it. */}
      <div
        id="mobile-menu"
        className={`mnav${menuOpen ? ' open' : ''}`}
        hidden={!menuOpen}
        onClick={(e) => (e.target as Element).closest('a') && setMenuOpen(false)}
      >
        <nav aria-label="Main">
          <NavLink to="/" end>
            Home
          </NavLink>
          {NAV.map((n, i) => (
            <NavLink key={n.to} to={n.to} style={{ '--i': i + 1 } as React.CSSProperties}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mnav-foot">
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
          <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </div>
      </div>

      <main id="main" className="page" key={location.pathname}>
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-grid">
          <div>
            <Link className="brand" to="/">
              <span className="brand-mark" aria-hidden="true">
                चि
              </span>
              <span className="brand-name">Chinmay Upare</span>
            </Link>
            <p className="footer-note">Senior frontend developer in Bangalore. React, Next.js, TypeScript.</p>
          </div>
          <nav aria-label="Footer">
            <h2>Pages</h2>
            <Link to="/">Home</Link>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div>
            <h2>Elsewhere</h2>
            <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              Source of this site
            </a>
          </div>
        </div>
        <div className="footer-row">
          <p>© {YEAR} Chinmay Upare. Built with React 19 and TypeScript, deployed on Render.</p>
          <button className="nav-jump" type="button" onClick={() => setPaletteOpen(true)}>
            Jump anywhere
            <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
        </div>
      </footer>

      <CommandPalette key={String(paletteOpen)} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ScrollRestoration />
    </SiteContext.Provider>
  )
}
