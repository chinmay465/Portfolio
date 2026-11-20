import { useEffect, useRef } from 'react'
import type { MatchRecord } from '../lib/types.ts'
import FeedRow from './FeedRow.tsx'

interface Props {
  matches: MatchRecord[]
  keywords: string[]
  running: boolean
}

export default function Feed({ matches, keywords, running }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)

  function onScroll() {
    const el = ref.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // New matches append at the bottom; keep the view pinned there unless the
  // user has scrolled up to read something.
  useEffect(() => {
    const el = ref.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [matches])

  if (!matches.length) {
    return (
      <div className="feed" ref={ref} onScroll={onScroll}>
        <p className="empty">
          {running
            ? 'Watching… matches will appear here, newest at the bottom.'
            : 'Add keywords and press Start. Matches append here, newest at the bottom.'}
        </p>
      </div>
    )
  }

  return (
    <div className="feed" ref={ref} onScroll={onScroll}>
      {matches.map((m) => (
        <FeedRow key={m.id} match={m} keywords={keywords} />
      ))}
    </div>
  )
}
