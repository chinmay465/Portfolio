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
  opensDated: {
    mr: (c: string, d: string) => `${c} आवृत्ती, ${d}`,
    en: (c: string, d: string) => `${c} edition, ${d}`,
  },
  opensLatest: {
    mr: (c: string) => `${c} आवृत्ती, ताजा अंक`,
    en: (c: string) => `${c} edition, latest issue`,
  },
  pickOnSite: {
    mr: (c: string) => `${c} आवृत्ती साइटवर निवडा`,
    en: (c: string) => `Pick the ${c} edition on the site`,
  },
  notInCity: {
    mr: (c: string) => `${c} साठी उपलब्ध नाही`,
    en: (c: string) => `Not available for ${c}`,
  },
  opensHome: { mr: 'मुख्य ई-पेपर उघडेल', en: 'Opens the main epaper' },
  issueDate: { mr: 'अंकाची तारीख', en: 'Issue date' },
  today: { mr: 'आज', en: 'Today' },
  addFav: { mr: 'आवडत्यांमध्ये जोडा', en: 'Add to favourites' },
  removeFav: { mr: 'आवडत्यांमधून काढा', en: 'Remove from favourites' },
  readToday: { mr: 'आज वाचले', en: 'Read today' },
  markUnread: { mr: 'न वाचलेले करा', en: 'Mark as unread' },
  emptyTitle: { mr: 'काही सापडले नाही', en: 'No papers match' },
  emptyBody: {
    mr: 'दुसरे नाव शोधून पाहा.',
    en: 'Try a different name.',
  },
  clear: { mr: 'शोध काढा', en: 'Clear search' },
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
