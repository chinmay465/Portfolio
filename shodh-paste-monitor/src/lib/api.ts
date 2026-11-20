import type { MatchRecord, StartBody, Stats } from './types.ts'

export async function startMonitor(body: StartBody): Promise<void> {
  const res = await fetch('/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || 'Failed to start.')
  }
}

export async function stopMonitor(): Promise<void> {
  await fetch('/api/stop', { method: 'POST' })
}

export type StreamEvent =
  | { type: 'match'; match: MatchRecord }
  | { type: 'scan'; stats: Stats }
  | { type: 'status'; stats?: Stats; running?: boolean }
  | { type: 'provider_error'; provider: string; message: string }

export function openStream(onEvent: (e: StreamEvent) => void): EventSource {
  const es = new EventSource('/api/stream')
  es.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data) as StreamEvent)
    } catch {
      /* ignore malformed frames */
    }
  }
  return es
}
