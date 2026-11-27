import { decodeEntities, htmlToText } from './html.ts'

export interface RawPost {
  /** Post id within its source (Telegram message number, RSS guid). */
  id: string
  text: string
  links: string[]
  postUrl: string
  postedAt: string
  image?: string
}

export const telegramUrl = (channel: string, before?: string) =>
  `https://t.me/s/${encodeURIComponent(channel)}${before ? `?before=${encodeURIComponent(before)}` : ''}`

/**
 * Posts from a public channel's web preview (t.me/s/<channel>), oldest first as Telegram
 * lists them. Returns [] for pages that aren't a channel preview (private or unknown channel).
 */
export function parseTelegram(html: string, channel: string): RawPost[] {
  const posts: RawPost[] = []
  const starts = [...html.matchAll(/<div class="tgme_widget_message [^"]*"[^>]*\bdata-post="([^"]+)"/g)]
  for (let i = 0; i < starts.length; i++) {
    const m = starts[i]
    const chunk = html.slice(m.index ?? 0, i + 1 < starts.length ? starts[i + 1].index : html.length)
    const dataPost = decodeEntities(m[1])
    const num = dataPost.split('/').pop() ?? ''
    if (!/^\d+$/.test(num)) continue
    if (dataPost.split('/')[0].toLowerCase() !== channel.toLowerCase()) continue // forwarded preview

    const textStart = chunk.search(/<div class="tgme_widget_message_text js-message_text[^"]*"[^>]*>/)
    let text = ''
    let links: string[] = []
    if (textStart >= 0) {
      const open = chunk.indexOf('>', textStart) + 1
      const close = closingDiv(chunk, open)
      ;({ text, links } = htmlToText(chunk.slice(open, close)))
    }
    if (!text) continue // stickers, photos without captions, service messages

    const time = chunk.match(/<time[^>]*\bdatetime="([^"]+)"/)
    const image = chunk.match(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/)
    posts.push({
      id: num,
      text,
      links: links.filter((l) => /^https?:\/\//i.test(l)),
      postUrl: `https://t.me/${channel}/${num}`,
      postedAt: time ? new Date(time[1]).toISOString() : new Date().toISOString(),
      image: image ? decodeEntities(image[1]) : undefined,
    })
  }
  return posts
}

/** Index of the `</div>` that closes the div whose content starts at `from`. */
function closingDiv(s: string, from: number): number {
  let depth = 1
  const re = /<div\b|<\/div>/g
  re.lastIndex = from
  for (let m = re.exec(s); m; m = re.exec(s)) {
    depth += m[0] === '</div>' ? -1 : 1
    if (depth === 0) return m.index
  }
  return s.length
}
