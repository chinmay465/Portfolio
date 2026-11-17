import type { Lang } from './data/papers'

const strings = {
  appName: { mr: 'अंक', en: 'Ank' },
  tagline: { mr: 'आजचे मराठी ई-पेपर, एकाच ठिकाणी', en: "Today's Marathi epapers, in one place" },
  readCount: {
    mr: (read: string, total: string) => `${total} पैकी ${read} वाचले`,
    en: (read: string, total: string) => `${read} of ${total} read`,
  },
  allRead: { mr: 'आजचे सगळे अंक वाचून झाले', en: "You've opened every paper today" },
  search: { mr: 'वृत्तपत्र शोधा', en: 'Search papers' },
  city: { mr: 'तुमचे शहर', en: 'Your city' },
  anyCity: { mr: 'सर्व शहरे', en: 'All cities' },
  favourites: { mr: 'आवडती', en: 'Favourites' },
  others: { mr: 'इतर वृत्तपत्रे', en: 'More papers' },
  all: { mr: 'सर्व वृत्तपत्रे', en: 'All papers' },
  open: { mr: 'ई-पेपर उघडा', en: 'Open epaper' },
  since: { mr: 'स्थापना', en: 'Since' },
  from: { mr: 'मुख्यालय', en: 'Based in' },
  editions: {
    mr: (n: string) => `${n} आवृत्त्या`,
    en: (n: string) => `${n} editions`,
  },
  cityEdition: {
    mr: (c: string) => `${c} आवृत्ती उपलब्ध`,
    en: (c: string) => `${c} edition available`,
  },
  addFav: { mr: 'आवडत्यांमध्ये जोडा', en: 'Add to favourites' },
  removeFav: { mr: 'आवडत्यांमधून काढा', en: 'Remove from favourites' },
  readToday: { mr: 'आज वाचले', en: 'Read today' },
  markUnread: { mr: 'न वाचलेले करा', en: 'Mark as unread' },
  emptyTitle: { mr: 'काही सापडले नाही', en: 'No papers match' },
  emptyBody: {
    mr: 'शोध बदला किंवा शहर "सर्व शहरे" करा.',
    en: 'Try another search, or set the city to "All cities".',
  },
  clear: { mr: 'फिल्टर काढा', en: 'Clear filters' },
  theme: { mr: 'रंगसंगती बदला', en: 'Switch theme' },
  language: { mr: 'Switch to English', en: 'मराठीत पाहा' },
  footer: {
    mr: 'प्रत्येक दुवा प्रकाशकाच्या अधिकृत ई-पेपरवर जातो. काही वृत्तपत्रांना पूर्ण अंक वाचण्यासाठी मोफत नोंदणी किंवा सदस्यत्व लागते — त्यामुळे पत्रकारितेला आधार मिळतो.',
    en: "Every link opens the publisher's official epaper. Some papers ask for a free sign-up or a subscription to read the full issue — that's what keeps the journalism going.",
  },
  shortcut: { mr: 'शोधण्यासाठी / दाबा', en: 'Press / to search' },
}

type Strings = typeof strings
export type Key = keyof Strings

export function t<K extends Key>(key: K, lang: Lang): Strings[K][Lang] {
  return strings[key][lang] as Strings[K][Lang]
}
