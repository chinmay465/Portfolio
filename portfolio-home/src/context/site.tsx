import { createContext, useContext } from 'react'
import type { ProjectId } from '../data/projects'
import type { Health } from '../hooks/usePings'

export interface Site {
  reduced: boolean
  /** Live ping results for the web apps, shared by every page. */
  health: Partial<Record<ProjectId, Health>>
  openPalette: () => void
}

export const SiteContext = createContext<Site>({ reduced: false, health: {}, openPalette: () => {} })

export const useSite = () => useContext(SiteContext)
