import { splitHighlights } from '../lib/format.ts'
import type { MatchRecord } from '../lib/types.ts'

interface Props {
  match: MatchRecord
  keywords: string[]
}

export default function FeedRow({ match, keywords }: Props) {
  const time = new Date(match.foundAt).toLocaleTimeString()
  const segments = splitHighlights(match.snippet, match.matchedKeywords.length ? match.matchedKeywords : keywords)

  return (
    <div className="row">
      <div className="row-head">
        <span className={`src ${match.source}`}>{match.source}</span>
        <span className="row-title">{match.title}</span>
        <span className="row-time">{time}</span>
      </div>
      <div className="row-head">
        {match.matchedKeywords.map((kw) => (
          <span className="kw" key={kw}>{kw}</span>
        ))}
      </div>
      <div className="snippet">
        {segments.map((seg, i) =>
          seg.hit ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>,
        )}
      </div>
      {match.url && (
        <a href={match.url} target="_blank" rel="noopener noreferrer">
          open ↗
        </a>
      )}
    </div>
  )
}
