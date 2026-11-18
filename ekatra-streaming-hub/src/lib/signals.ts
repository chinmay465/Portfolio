import type { Reaction, Signals } from '../types.ts'

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
const without = (list: string[], id: string) => list.filter((x) => x !== id)

/** Likes and dislikes are mutually exclusive; disliking also drops a title from the watchlist. */
export function applyReaction(s: Signals, id: string, r: Reaction): Signals {
  switch (r) {
    case 'like':
      return { ...s, liked: toggle(s.liked, id), disliked: without(s.disliked, id) }
    case 'dislike':
      return {
        ...s,
        disliked: toggle(s.disliked, id),
        liked: without(s.liked, id),
        watchlist: without(s.watchlist, id),
      }
    case 'save':
      return { ...s, watchlist: toggle(s.watchlist, id) }
    case 'watched': {
      const watched = { ...s.watched }
      if (watched[id]) delete watched[id]
      else watched[id] = 1
      return { ...s, watched }
    }
  }
}
