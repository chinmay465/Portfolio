interface Props {
  items: string[]
  reverse?: boolean
}

/** An endless strip; the list is doubled so the loop has no seam. */
export default function Marquee({ items, reverse }: Props) {
  const row = [...items, ...items]
  return (
    <div className={`marquee${reverse ? ' marquee-rev' : ''}`}>
      <ul className="marquee-track">
        {row.map((item, i) => (
          <li key={i} aria-hidden={i >= items.length ? 'true' : undefined}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
