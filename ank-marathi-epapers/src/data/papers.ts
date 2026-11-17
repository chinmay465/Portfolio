export type Lang = 'mr' | 'en'
export type Bilingual = Record<Lang, string>

export type CityId =
  | 'mumbai' | 'thane' | 'pune' | 'nashik' | 'nagpur' | 'kolhapur'
  | 'sambhajinagar' | 'ahilyanagar' | 'solapur' | 'satara' | 'sangli'
  | 'ratnagiri' | 'sindhudurg' | 'jalgaon' | 'akola' | 'nanded'
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
  belagavi: { mr: 'बेळगाव', en: 'Belagavi' },
  goa: { mr: 'गोवा', en: 'Goa' },
}

export interface Paper {
  id: string
  name: Bilingual
  /** Official ePaper home. The publisher's own viewer handles editions, dates and sign-in. */
  url: string
  founded: number
  hq: CityId
  /** Cities the paper publishes editions from (used for the city filter). */
  cities: CityId[]
  /** Hue (0–360) used for the masthead tint. Not a brand colour. */
  hue: number
}

export const PAPERS: Paper[] = [
  {
    id: 'sakal',
    name: { mr: 'सकाळ', en: 'Sakal' },
    url: 'https://epaper.esakal.com/',
    founded: 1932,
    hq: 'pune',
    cities: ['pune', 'mumbai', 'kolhapur', 'nashik', 'nagpur', 'solapur', 'satara', 'sangli', 'ahilyanagar', 'sambhajinagar', 'jalgaon', 'goa'],
    hue: 18,
  },
  {
    id: 'lokmat',
    name: { mr: 'लोकमत', en: 'Lokmat' },
    url: 'https://epaper.lokmat.com/',
    founded: 1971,
    hq: 'nagpur',
    cities: ['nagpur', 'mumbai', 'pune', 'nashik', 'kolhapur', 'sambhajinagar', 'jalgaon', 'ahilyanagar', 'solapur', 'akola', 'nanded', 'goa'],
    hue: 352,
  },
  {
    id: 'maharashtra-times',
    name: { mr: 'महाराष्ट्र टाइम्स', en: 'Maharashtra Times' },
    url: 'https://epaper.maharashtratimes.com/',
    founded: 1962,
    hq: 'mumbai',
    cities: ['mumbai', 'thane', 'pune', 'nashik', 'nagpur', 'kolhapur', 'sambhajinagar'],
    hue: 222,
  },
  {
    id: 'loksatta',
    name: { mr: 'लोकसत्ता', en: 'Loksatta' },
    url: 'https://epaper.loksatta.com/',
    founded: 1948,
    hq: 'mumbai',
    cities: ['mumbai', 'pune', 'nagpur', 'sambhajinagar', 'ahilyanagar'],
    hue: 200,
  },
  {
    id: 'pudhari',
    name: { mr: 'पुढारी', en: 'Pudhari' },
    url: 'https://epaper.pudhari.news/',
    founded: 1937,
    hq: 'kolhapur',
    cities: ['kolhapur', 'mumbai', 'pune', 'ahilyanagar', 'belagavi', 'sangli', 'satara', 'solapur', 'ratnagiri', 'sindhudurg', 'goa'],
    hue: 30,
  },
  {
    id: 'punya-nagari',
    name: { mr: 'पुण्यनगरी', en: 'Punya Nagari' },
    url: 'https://www.epunyanagari.com/',
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
    cities: ['belagavi', 'kolhapur', 'goa', 'ratnagiri', 'sangli', 'satara'],
    hue: 160,
  },
]
