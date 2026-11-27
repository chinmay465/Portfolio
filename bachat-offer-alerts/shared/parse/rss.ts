import { decodeEntities, htmlToText } from './html.ts'
import type { RawPost } from './telegram.ts'

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1] : ''
}
const unCdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')

/** Items from an RSS 2.0 or Atom feed (Reddit serves Atom). Newest first, as feeds list them. */
export function parseFeed(xml: string): RawPost[] {
  const out: RawPost[] = []
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2])
  for (const b of blocks) {
    const title = decodeEntities(unCdata(tag(b, 'title'))).trim()
    const atomLink = b.match(/<link\b[^>]*\bhref="([^"]+)"/i)
    const postUrl = decodeEntities(atomLink ? atomLink[1] : unCdata(tag(b, 'link')).trim())
    const id = decodeEntities(unCdata(tag(b, 'guid') || tag(b, 'id')).trim()) || postUrl
    const when = unCdata(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated')).trim()
    // Content is escaped HTML inside the XML: unescape, then flatten.
    const body = decodeEntities(unCdata(tag(b, 'content') || tag(b, 'description') || tag(b, 'summary')))
    const { text: bodyText, links } = htmlToText(body)
    const thumb = b.match(/<media:thumbnail\b[^>]*\burl="([^"]+)"/i)
    const cleanBody = bodyText
      .replace(/submitted by\s*\/u\/\S+/i, '')
      .replace(/\[link\]|\[comments\]/gi, '')
      .trim()
    const text = [title, cleanBody].filter(Boolean).join('\n').trim()
    if (!title || !postUrl) continue
    const date = when ? new Date(when) : new Date()
    out.push({
      id: id.replace(/^.*\//, '') || id,
      text,
      links: [...links.filter((l) => /^https?:\/\//i.test(l) && !/reddit\.com\/(?:user|u)\//i.test(l)), postUrl],
      postUrl,
      postedAt: (Number.isNaN(date.getTime()) ? new Date() : date).toISOString(),
      image: thumb ? decodeEntities(thumb[1]) : undefined,
    })
  }
  return out
}
