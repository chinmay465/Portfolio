export type ProjectId = 'ekatra' | 'ank' | 'shodh' | 'setu'

export interface Project {
  id: ProjectId
  name: string
  /** Name in Devanagari, drawn by the hero particle field and the panel outline. */
  glyph: string
  /** What the Devanagari name means, in plain English. */
  meaning: string
  tagline: string
  points: string[]
  stack: string[]
  kind: 'Static site' | 'Node web service'
  live: string
  code: string
  accent: string
}

const repo = 'https://github.com/chinmay465/Portfolio'

export const REPO_URL = repo
export const GITHUB_URL = 'https://github.com/chinmay465'

export const projects: Project[] = [
  {
    id: 'ekatra',
    name: 'Ekatra',
    glyph: 'एकत्र',
    meaning: 'together',
    tagline: 'One recommendation feed across every streaming app you pay for.',
    points: [
      'Ranks Netflix, Prime Video, JioHotstar, SonyLIV and ZEE5 titles in a single feed, and each card says why it is there',
      'Content-based recommender that runs entirely in the browser, with a re-rank that stops one service from taking over',
      'Imports your Netflix viewing history from its CSV without uploading it anywhere',
      'Switches from a built-in demo catalog to live TMDB data with real posters and availability',
    ],
    stack: ['React 19', 'TypeScript', 'Vite', 'Vitest', 'oxlint'],
    kind: 'Static site',
    live: 'https://ekatra-streaming-hub.onrender.com',
    code: `${repo}/tree/main/ekatra-streaming-hub`,
    accent: '#ff5c8a',
  },
  {
    id: 'ank',
    name: 'Ank',
    glyph: 'अंक',
    meaning: 'an issue of a paper',
    tagline: "Today's Marathi epapers in one bilingual hub.",
    points: [
      'Sakal, Lokmat, Maharashtra Times, Loksatta, Pudhari, Punya Nagari and Tarun Bharat on one page',
      'City and date links open the exact edition where the publisher allows it',
      'Marathi dates with Devanagari numerals, and search that works in either script',
      'Tracks what you have read today, pins favourites and installs as a PWA',
    ],
    stack: ['React 19', 'TypeScript', 'Vite', 'Vitest', 'Fontsource'],
    kind: 'Static site',
    live: 'https://ank-marathi-epapers.onrender.com',
    code: `${repo}/tree/main/ank-marathi-epapers`,
    accent: '#ffb547',
  },
  {
    id: 'shodh',
    name: 'Shodh',
    glyph: 'शोध',
    meaning: 'search',
    tagline: 'A live monitor that watches public paste sites for your keywords.',
    points: [
      'Checks every keyword against every paste and shows exactly which ones hit',
      'Any or all match modes, plus whole-word and case-sensitive toggles',
      'Express backend polls the sources and streams matches over Server-Sent Events',
      'Can route its HTML sources through Setu for rotating IPs',
    ],
    stack: ['React 19', 'TypeScript', 'Express', 'SSE', 'Vitest'],
    kind: 'Node web service',
    live: 'https://shodh-paste-monitor.onrender.com',
    code: `${repo}/tree/main/shodh-paste-monitor`,
    accent: '#6ff3ff',
  },
  {
    id: 'setu',
    name: 'Setu',
    glyph: 'सेतु',
    meaning: 'bridge',
    tagline: 'A pool of free proxies that actually work, behind one API.',
    points: [
      'Pulls open proxy lists and keeps only proxies that pass an HTTPS check without leaking your IP',
      'Rotates across the fastest proxies, retries on blocks and evicts repeat failures',
      'Browse through a proxy, call its fetch API from scrapers, or point apps at a local tunnel',
      'HTTPS only by default, with TLS end to end and certificates verified',
    ],
    stack: ['React 19', 'TypeScript', 'Node', 'Express', 'Vitest'],
    kind: 'Node web service',
    live: 'https://setu-proxy-hub.onrender.com',
    code: `${repo}/tree/main/setu-proxy-hub`,
    accent: '#b9a4ff',
  },
]

export const stack = [
  'React 19',
  'TypeScript',
  'Next.js',
  'Vite',
  'Webpack Module Federation',
  'Micro-frontends',
  'Design systems',
  'styled-components',
  'Storybook',
  'React Testing Library',
  'Vitest',
  'Express',
  'Server-Sent Events',
  'Sentry',
  'GitHub Actions',
  'Jenkins',
  'Render',
  'PWA',
]
