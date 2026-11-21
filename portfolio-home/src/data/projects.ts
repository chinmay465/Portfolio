export type ProjectId = 'rail' | 'kavach' | 'swar' | 'ekatra' | 'ank' | 'shodh' | 'setu'

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
  kind: 'Static site' | 'Node web service' | 'Python web service' | 'Android app'
  /** Deployed web app. Pinged by the status console. Absent for the Android apps. */
  live?: string
  /** Where to get the Android APK (built by CI). */
  download?: string
  /** Source on GitHub. Absent while the repo is private. */
  code?: string
  accent: string
}

const repo = 'https://github.com/chinmay465/Portfolio'

export const REPO_URL = repo
export const GITHUB_URL = 'https://github.com/chinmay465'

export const projects: Project[] = [
  {
    id: 'rail',
    name: 'Rail Planner',
    glyph: 'मार्ग',
    meaning: 'route',
    tagline: 'When Indian Railways bookings open, and the routes that still get you there when direct trains are full.',
    points: [
      'General and Tatkal booking windows for every leg, counted from the train\'s origin, with a calendar reminder',
      'Alternate routes within your limits on extra time, extra distance and changes, through via stations with planned stops',
      'A round-by-round search over the useful change points, sorted and filtered on the server, 50 results at a time',
      'Live seat availability per leg (AVL, RAC, WL), with rate-limit handling and a toggle to hide waitlisted routes',
    ],
    stack: ['Python', 'FastAPI', 'React', 'TypeScript', 'Docker'],
    kind: 'Python web service',
    live: 'https://rail-planner-08hw.onrender.com',
    accent: '#ff6b3d',
  },
  {
    id: 'kavach',
    name: 'Kavach',
    glyph: 'कवच',
    meaning: 'armour',
    tagline: 'A system-wide Android ad blocker that runs as a local VPN.',
    points: [
      'Filters DNS for every app through a local VpnService, so ads and trackers are blocked without root or a remote server',
      'About 76,000 ad and tracker domains, plus your own blocks, allows and wildcard patterns',
      'Encrypted DNS-over-HTTPS upstream, no analytics SDKs, and a privacy check on every APK in CI',
      'Live lookups you can export, and Kavach On/Off shortcuts for automation like Samsung Routines',
    ],
    stack: ['Kotlin', 'Android VpnService', 'DNS-over-HTTPS', 'Coroutines', 'GitHub Actions'],
    kind: 'Android app',
    download: `${repo}/actions/workflows/ci.yml?query=branch%3Amain`,
    code: `${repo}/tree/main/kavach-adblock`,
    accent: '#4ade80',
  },
  {
    id: 'swar',
    name: 'Swar',
    glyph: 'स्वर',
    meaning: 'a musical note',
    tagline: 'YouTube Music that keeps playing with the screen off, and plays no ads.',
    points: [
      'Wraps music.youtube.com in a WebView, so your own account, library and recommendations come along',
      'A script injected before the page loads keeps the player "visible" and strips ad slots from the API data, so no ad is ever scheduled',
      'A media foreground service mirrors the player into a MediaSession: notification, lock screen, headset and Bluetooth buttons',
      'Pauses when headphones come out, and blocks Google telemetry; the page script and the APK are privacy-checked in CI',
    ],
    stack: ['Kotlin', 'Android WebView', 'MediaSession', 'JavaScript', 'jsdom', 'GitHub Actions'],
    kind: 'Android app',
    download: `${repo}/actions/workflows/ci.yml?query=branch%3Amain`,
    code: `${repo}/tree/main/swar-music`,
    accent: '#5b8cff',
  },
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

/** Projects with a live web URL to ping and open. */
export const webProjects = projects.filter((p): p is Project & { live: string } => Boolean(p.live))

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
  'Kotlin',
  'Android',
  'Sentry',
  'GitHub Actions',
  'Jenkins',
  'Render',
  'PWA',
]
