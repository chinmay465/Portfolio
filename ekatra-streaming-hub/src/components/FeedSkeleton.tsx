interface Props {
  /** Read out to screen readers; the placeholder cards themselves are hidden from them. Leave out inside a live region that already says it's loading. */
  label?: string
  count?: number
}

/** Placeholder cards shaped like TitleCard, shown while TMDB requests are in flight. */
export function FeedSkeleton({ label, count = 12 }: Props) {
  return (
    <div className="grid" aria-busy="true">
      {label && (
        <span className="sr-only" role="status">
          {label}
        </span>
      )}
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card card--skeleton" aria-hidden="true" data-testid="skeleton-card">
          <div className="skeleton skeleton--thumb" />
          <div className="card__body">
            <div className="skeleton skeleton--avatar" />
            <div className="card__text skeleton__lines">
              <div className="skeleton skeleton--line" />
              <div className="skeleton skeleton--line skeleton--short" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
