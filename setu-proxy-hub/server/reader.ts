import * as cheerio from 'cheerio'

export interface ReaderBlock {
  kind: 'h' | 'p' | 'pre' | 'li'
  text: string
}

export interface ReaderPage {
  title: string
  description: string
  blocks: ReaderBlock[]
  links: Array<{ text: string; href: string }>
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Turn fetched HTML into a script-free "reader view": headings, paragraphs,
 * list items, code blocks and links. The browser never renders the original
 * page, so nothing on it can run or load resources from your real IP.
 */
export function toReader(html: string, baseUrl: string): ReaderPage {
  const $ = cheerio.load(html)
  const title = clean($('title').first().text()) || clean($('h1').first().text())
  const description = clean($('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content') ?? '')

  $('script, style, noscript, svg, iframe, template, form, button, select').remove()
  const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body')

  const blocks: ReaderBlock[] = []
  root.find('h1, h2, h3, h4, p, li, pre, blockquote').each((_, el) => {
    const tag = el.tagName.toLowerCase()
    // Skip containers whose text is already captured by a nested block.
    if ((tag === 'li' || tag === 'blockquote') && $(el).find('p, pre').length) return
    const text = tag === 'pre' ? $(el).text().trim() : clean($(el).text())
    if (!text) return
    const kind: ReaderBlock['kind'] = tag.startsWith('h') ? 'h' : tag === 'pre' ? 'pre' : tag === 'li' ? 'li' : 'p'
    blocks.push({ kind, text: text.slice(0, 5000) })
  })
  if (!blocks.length) {
    const text = clean(root.text())
    if (text) blocks.push({ kind: 'p', text: text.slice(0, 20000) })
  }

  const seen = new Set<string>()
  const links: ReaderPage['links'] = []
  $('a[href]').each((_, el) => {
    if (links.length >= 300) return
    const raw = $(el).attr('href') ?? ''
    let href: string
    try {
      href = new URL(raw, baseUrl).toString()
    } catch {
      return
    }
    if (!/^https?:/.test(href) || seen.has(href)) return
    seen.add(href)
    links.push({ text: clean($(el).text()).slice(0, 140) || href, href })
  })

  return { title, description, blocks: blocks.slice(0, 800), links }
}
