import type { CSSProperties } from 'react'
import { CITIES, type CityId, type IssueDate, type Lang, type Paper } from '../data/papers'
import { t } from '../i18n'
import { formatShortDate, num } from '../lib/format'
import { resolveLink } from '../lib/links'

interface Props {
  paper: Paper
  lang: Lang
  city: CityId | null
  date: IssueDate
  isFav: boolean
  isRead: boolean
  onToggleFav: () => void
  onOpen: () => void
  onUnread: () => void
}

export function PaperCard({ paper, lang, city, date, isFav, isRead, onToggleFav, onOpen, onUnread }: Props) {
  const style = { '--hue': paper.hue } as CSSProperties
  const other: Lang = lang === 'mr' ? 'en' : 'mr'
  const link = resolveLink(paper, city, date)
  const cityName = city ? CITIES[city][lang] : ''

  let linkNote: string
  if (link.kind === 'dated') linkNote = t('opensDated', lang)(cityName, formatShortDate(date, lang))
  else if (link.kind === 'latest') linkNote = t('opensLatest', lang)(cityName)
  else if (city) linkNote = t('pickOnSite', lang)(cityName)
  else linkNote = t('editions', lang)(num(paper.cities.length, lang))

  return (
    <article className={`paper${isRead ? ' is-read' : ''}`} style={style}>
      <div className="paper__masthead" aria-hidden="true">
        {paper.name.mr}
      </div>

      <div className="paper__body">
        <h3 className="paper__name">
          <a
            className="paper__link"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onOpen}
          >
            {paper.name[lang]}
          </a>
        </h3>
        <p className="paper__alt" lang={other}>{paper.name[other]}</p>

        <dl className="paper__facts">
          <div>
            <dt>{t('since', lang)}</dt>
            <dd>{num(paper.founded, lang)}</dd>
          </div>
          <div>
            <dt>{t('from', lang)}</dt>
            <dd>{CITIES[paper.hq][lang]}</dd>
          </div>
        </dl>
        <p className={`paper__editions${city && link.kind === 'home' ? ' paper__editions--fallback' : ''}`}>{linkNote}</p>

        <span className="paper__cta" aria-hidden="true">{t('open', lang)}</span>
      </div>

      <div className="paper__actions">
        {isRead && (
          <button type="button" className="chip chip--read" onClick={onUnread} title={t('markUnread', lang)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('readToday', lang)}
            <span className="visually-hidden">. {t('markUnread', lang)}</span>
          </button>
        )}
        <button
          type="button"
          className={`star${isFav ? ' is-on' : ''}`}
          aria-pressed={isFav}
          aria-label={isFav ? t('removeFav', lang) : t('addFav', lang)}
          title={isFav ? t('removeFav', lang) : t('addFav', lang)}
          onClick={onToggleFav}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </article>
  )
}
