interface Chapter {
  id: string
  scene: string
  mr: string
  en: string
}

/** A fixed index of the page's chapters, Marathi over English; the current one is lit. */
export default function ChapterRail({ chapters, active }: { chapters: Chapter[]; active: string }) {
  const current = chapters.findIndex((c) => active === c.scene || active.startsWith(`${c.scene}:`))
  return (
    <nav className="rail" aria-label="Chapters">
      <ol>
        {chapters.map((c, i) => (
          <li key={c.id} className={i === current ? 'on' : i < current ? 'past' : undefined}>
            <a href={`#${c.id}`} aria-current={i === current ? 'true' : undefined}>
              <span lang="mr">{c.mr}</span>
              {c.en}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
