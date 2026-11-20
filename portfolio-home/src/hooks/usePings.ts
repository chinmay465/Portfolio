import { useEffect, useState } from 'react'
import { ping, type PingState } from '../lib/ping'
import type { Project, ProjectId } from '../data/projects'

export interface Health {
  state: PingState
  ms?: number
  history: number[]
}

const REPEAT_MS = 30_000
const KEEP = 10

/** Pings every live app on load and every 30 s while the tab is open. */
export function usePings(list: Project[]): Record<ProjectId, Health> {
  const [health, setHealth] = useState(() =>
    Object.fromEntries(list.map((p) => [p.id, { state: 'checking', history: [] } as Health])) as Record<ProjectId, Health>,
  )

  useEffect(() => {
    let alive = true
    const update = (id: ProjectId, fn: (h: Health) => Health) =>
      alive && setHealth((prev) => ({ ...prev, [id]: fn(prev[id]) }))

    const check = (p: Project) =>
      ping(p.live, () => update(p.id, (h) => (h.state === 'online' ? h : { ...h, state: 'waking' }))).then((r) =>
        update(p.id, (h) => ({
          state: r.state,
          ms: r.ms,
          history: r.state === 'online' ? [...h.history, r.ms].slice(-KEEP) : h.history,
        })),
      )

    list.forEach(check)
    const timer = setInterval(() => {
      if (!document.hidden) list.forEach(check)
    }, REPEAT_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [list])

  return health
}

export function healthLabel(h: Health): string {
  switch (h.state) {
    case 'checking':
      return 'Checking'
    case 'waking':
      return 'Waking the server'
    case 'online':
      return `Live, ${h.ms} ms`
    case 'unreachable':
      return 'No answer yet'
    case 'blocked':
      return "Can't check from here"
  }
}
