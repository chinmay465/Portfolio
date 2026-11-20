import { useCallback, useEffect, useRef, useState } from 'react'
import Controls from './components/Controls.tsx'
import Feed from './components/Feed.tsx'
import { openStream, startMonitor, stopMonitor } from './lib/api.ts'
import { formatElapsed } from './lib/format.ts'
import type { MatchRecord, StartBody, Stats } from './lib/types.ts'

const emptyStats: Stats = { scanned: 0, matched: 0, startedAt: null, lastPollAt: null, errors: 0 }

export default function App() {
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<Stats>(emptyStats)
  const [matches, setMatches] = useState<MatchRecord[]>([])
  const [notice, setNotice] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [keywords, setKeywords] = useState<string[]>([])
  const startedAt = useRef<number | null>(null)
  const streamRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      if (startedAt.current !== null) setElapsed(Date.now() - startedAt.current)
    }, 250)
    return () => clearInterval(id)
  }, [running])

  const closeStream = useCallback(() => {
    streamRef.current?.close()
    streamRef.current = null
  }, [])

  const handleStart = useCallback(
    async (body: StartBody) => {
      setNotice('')
      try {
        await startMonitor(body)
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Failed to start.')
        return
      }
      setKeywords(body.keywords)
      setMatches([])
      setStats(emptyStats)
      startedAt.current = Date.now()
      setElapsed(0)
      setRunning(true)
      closeStream()
      streamRef.current = openStream((ev) => {
        if (ev.type === 'match') setMatches((m) => [...m, ev.match])
        else if (ev.type === 'scan') setStats(ev.stats)
        else if (ev.type === 'status' && ev.stats) setStats(ev.stats)
        else if (ev.type === 'provider_error') setNotice(`${ev.provider}: ${ev.message}`)
      })
    },
    [closeStream],
  )

  const handleStop = useCallback(async () => {
    await stopMonitor()
    setRunning(false)
    closeStream()
  }, [closeStream])

  useEffect(() => () => closeStream(), [closeStream])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className={running ? 'dot live' : 'dot'} />
          <h1>Shodh <span className="sub">· paste keyword monitor</span></h1>
        </div>
        <div className="clock">
          <span className="clock-label">elapsed</span>
          <span className="timer">{formatElapsed(elapsed)}</span>
        </div>
      </header>

      <main className="layout">
        <Controls running={running} notice={notice} onStart={handleStart} onStop={handleStop} />

        <section className="panel feed-panel">
          <div className="feed-head">
            <h2>Live feed</h2>
            <div className="stats-inline">
              <span><strong>{stats.scanned}</strong> scanned</span>
              <span><strong>{stats.matched}</strong> matches</span>
              <span><strong>{stats.errors}</strong> errors</span>
            </div>
          </div>
          <Feed matches={matches} keywords={keywords} running={running} />
        </section>
      </main>
    </div>
  )
}
