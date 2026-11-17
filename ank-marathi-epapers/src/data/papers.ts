export type Lang = 'mr' | 'en'
export type Bilingual = Record<Lang, string>

export type CityId =
  | 'mumbai' | 'thane' | 'pune' | 'nashik' | 'nagpur' | 'kolhapur'
  | 'sambhajinagar' | 'ahilyanagar' | 'solapur' | 'satara' | 'sangli'
  | 'ratnagiri' | 'sindhudurg' | 'jalgaon' | 'akola' | 'nanded' | 'dhule'
  | 'belagavi' | 'goa'

export const CITIES: Record<CityId, Bilingual> = {
  mumbai: { mr: 'मुंबई', en: 'Mumbai' },
  thane: { mr: 'ठाणे', en: 'Thane' },
  pune: { mr: 'पुणे', en: 'Pune' },
  nashik: { mr: 'नाशिक', en: 'Nashik' },
  nagpur: { mr: 'नागपूर', en: 'Nagpur' },
  kolhapur: { mr: 'कोल्हापूर', en: 'Kolhapur' },
  sambhajinagar: { mr: 'छत्रपती संभाजीनगर', en: 'Chh. Sambhajinagar' },
  ahilyanagar: { mr: 'अहिल्यानगर', en: 'Ahilyanagar' },
  solapur: { mr: 'सोलापूर', en: 'Solapur' },
  satara: { mr: 'सातारा', en: 'Satara' },
  sangli: { mr: 'सांगली', en: 'Sangli' },
  ratnagiri: { mr: 'रत्नागिरी', en: 'Ratnagiri' },
  sindhudurg: { mr: 'सिंधुदुर्ग', en: 'Sindhudurg' },
  jalgaon: { mr: 'जळगाव', en: 'Jalgaon' },
  akola: { mr: 'अकोला', en: 'Akola' },
  nanded: { mr: 'नांदेड', en: 'Nanded' },
  dhule: { mr: 'धुळे', en: 'Dhule' },
  belagavi: { mr: 'बेळगाव', en: 'Belagavi' },
  goa: { mr: 'गोवा', en: 'Goa' },
}

/** Calendar date in the reader's timezone, e.g. { y: 2026, m: 11, d: 17 }. */
export interface IssueDate {
  y: number
  m: number
  d: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = ({ y, m, d }: IssueDate) => `${y}-${pad(m)}-${pad(d)}`
const compactDate = ({ y, m, d }: IssueDate) => `${y}${pad(m)}${pad(d)}`

export interface Paper {
  id: string
  name: Bilingual
  /** Official ePaper home. Used when no city is picked or a city has no known edition link. */
  url: string
  founded: number
  hq: CityId
  /** Cities the paper publishes editions from (used for the city filter). */
  cities: CityId[]
  /** Publisher's own identifier for each city's edition, as it appears in their URLs. */
  editions?: Partial<Record<CityId, string>>
  /** Builds the publisher's URL for one edition. */
  editionUrl?: (edition: string, date: IssueDate) => string
  /** False when the publisher's edition URL has no date in it (it always opens the latest issue). */
  dated?: boolean
  /** Hue (0–360) used for the masthead tint. Not a brand colour. */
  hue: number
}

/*
 * Edition URL formats were read off each publisher's own epaper site (November 2026).
 * Punya Nagari's epaper site had no editions up, so it opens the paper's epaper home.
 */
export const PAPERS: Paper[] = [
  {
    id: 'sakal',
    name: { mr: 'सकाळ', en: 'Sakal' },
    url: 'https://epaper.esakal.com/',
    founded: 1932,
    hq: 'pune',
    cities: ['pune', 'mumbai', 'kolhapur', 'nashik', 'nagpur', 'solapur', 'satara', 'sangli', 'ahilyanagar', 'sambhajinagar', 'jalgaon', 'akola', 'nanded', 'dhule', 'ratnagiri', 'sindhudurg', 'belagavi'],
    editions: {
      pune: 'Pune', mumbai: 'Mumbai', kolhapur: 'Kolhapur', nashik: 'Nashik', nagpur: 'Nagpur',
      solapur: 'Solapur', satara: 'Satara', sangli: 'Sangli', ahilyanagar: 'Nagar',
      sambhajinagar: 'Chh_Sambhajinagar', jalgaon: 'Jalgaon', akola: 'Akola', nanded: 'Nanded',
      dhule: 'Dhule', ratnagiri: 'Ratnagiri', sindhudurg: 'Sindhudurg', belagavi: 'Belgaum',
    },
    editionUrl: (location, date) =>
      `https://epaper.esakal.com/smartepaper/ui/home.aspx?q=${location}/Main/${isoDate(date)}`,
    hue: 18,
  },
  {
    id: 'lokmat',
    name: { mr: 'लोकमत', en: 'Lokmat' },
    url: 'https://epaper.lokmat.com/',
    founded: 1971,
    hq: 'nagpur',
    cities: ['nagpur', 'mumbai', 'pune', 'nashik', 'kolhapur', 'sambhajinagar', 'jalgaon', 'ahilyanagar', 'solapur', 'akola', 'goa'],
    editions: {
      mumbai: 'Mumbai Main', pune: 'Pune Main', nagpur: 'Nagpur Main',
      sambhajinagar: 'Chhatrapati Sambhajinagar Main', kolhapur: 'Kolhapur Main', nashik: 'Nashik Main',
      jalgaon: 'Jalgaon Main', akola: 'Akola Main', solapur: 'Solapur Main',
      ahilyanagar: 'Ahilyanagar Main', goa: 'Goa Main',
    },
    editionUrl: (edition, date) =>
      `https://epaper.lokmat.com/main-editions/${encodeURIComponent(edition)}/${isoDate(date)}/1`,
    hue: 352,
  },
  {
    id: 'maharashtra-times',
    name: { mr: 'महाराष्ट्र टाइम्स', en: 'Maharashtra Times' },
    url: 'https://epaper.maharashtratimes.com/',
    founded: 1962,
    hq: 'mumbai',
    cities: ['mumbai', 'thane', 'pune', 'nashik', 'nagpur', 'sambhajinagar'],
    // Times epaper city pages always show the latest issue. Only confirmed city slugs are listed.
    editions: { pune: 'pune', nashik: 'nashik' },
    editionUrl: (slug) =>
      `https://epaper.indiatimes.com/timesepaper/publication-maharashtra-times,city-${slug}.cms`,
    dated: false,
    hue: 222,
  },
  {
    id: 'loksatta',
    name: { mr: 'लोकसत्ता', en: 'Loksatta' },
    url: 'https://epaper.loksatta.com/',
    founded: 1948,
    hq: 'mumbai',
    cities: ['mumbai', 'pune', 'nagpur', 'nashik', 'sambhajinagar', 'ahilyanagar'],
    // Issue URLs carry a per-issue ID that can't be predicted, so link each city's
    // fixed "latest issue" page instead ("titleId:Name", from the epaper home page).
    editions: {
      mumbai: '92:Mumbai', pune: '643:Pune', nagpur: '8490:Nagpur', nashik: '5356:Nasik',
      sambhajinagar: '28138:Chhatrapati-Sambhajinagar', ahilyanagar: '28139:Ahilyanagar',
    },
    editionUrl: (edition) => {
      const [titleId, name] = edition.split(':')
      return `https://epaper.loksatta.com/t/${titleId}/latest/${name}`
    },
    dated: false,
    hue: 200,
  },
  {
    id: 'pudhari',
    name: { mr: 'पुढारी', en: 'Pudhari' },
    url: 'https://epaper.pudhari.news/',
    founded: 1937,
    hq: 'kolhapur',
    cities: ['kolhapur', 'mumbai', 'thane', 'pune', 'ahilyanagar', 'belagavi', 'sangli', 'satara', 'solapur', 'ratnagiri', 'sindhudurg', 'goa', 'nashik', 'sambhajinagar', 'nanded'],
    // "Name:CODE". Only the codes read off the site are listed; other cities open the home page.
    editions: {
      pune: 'Pune:PUN', kolhapur: 'Kolhapur:KOL', mumbai: 'Mumbai:MUM',
      thane: 'Thane:THE', ahilyanagar: 'Ahilyanagar:AHM',
    },
    editionUrl: (edition, date) => {
      const [name, code] = edition.split(':')
      return `https://epaper.pudhari.news/edition/${name}/PUDHARI_${code}/PUDHARI_${code}_${compactDate(date)}/page/1`
    },
    hue: 30,
  },
  {
    id: 'punya-nagari',
    name: { mr: 'पुण्यनगरी', en: 'Punya Nagari' },
    url: 'https://epaper.punyanagari.in/',
    founded: 1999,
    hq: 'mumbai',
    cities: ['mumbai', 'thane', 'pune', 'nashik', 'nanded', 'ahilyanagar', 'nagpur'],
    hue: 280,
  },
  {
    id: 'tarun-bharat',
    name: { mr: 'तरुण भारत', en: 'Tarun Bharat' },
    url: 'https://epaper.tarunbharat.com/',
    founded: 1919,
    hq: 'belagavi',
    cities: ['belagavi', 'kolhapur', 'goa', 'ratnagiri', 'sangli', 'satara', 'sindhudurg', 'mumbai', 'solapur'],
    editions: {
      belagavi: '503', goa: '505', sindhudurg: '28240', kolhapur: '31522', sangli: '31523',
      satara: '31526', ratnagiri: '31525', mumbai: '31496', solapur: '31527',
    },
    editionUrl: (titleId) => `https://epaper.tarunbharat.com/t/${titleId}`,
    dated: false,
    hue: 160,
  },
]
