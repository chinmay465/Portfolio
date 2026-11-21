/** Everything about Chinmay that the page shows, taken from his resume. No phone number on purpose. */

export const EMAIL = 'chinmayupare@gmail.com'
export const LINKEDIN_URL = 'https://www.linkedin.com/in/chinmay-upare/'

export const facts = [
  { label: 'Role', value: 'Senior Frontend Developer at KredX' },
  { label: 'Based in', value: 'Bangalore, India' },
  { label: 'Experience', value: '4+ years, all in fintech' },
  { label: 'Studied', value: 'B.Tech CS, MIT AoE Pune' },
]

export const about = {
  lead: 'I build the parts of a product that other people build on, and the flows where a bug costs someone real money.',
  body: [
    "I'm a senior frontend developer at KredX in Bangalore. Before that I spent three years at Paytm Money in Pune, where I joined as a Software Engineer and was promoted to Senior. Everything I've shipped has been fintech, in React, Next.js and TypeScript.",
    'Most of my work sits underneath features: a design system so the team stops rebuilding the same button, micro-frontends so teams deploy without waiting on each other, and performance work so a page stays fast on a cheap phone. The rest is KYC, onboarding and payments, which I own end to end, failure states included.',
    'I review code and mentor junior developers at KredX, and I interviewed frontend candidates at Paytm Money. Outside work I build small, complete apps with AI coding tools like Claude Code and GitHub Copilot, and give them Devanagari names.',
  ],
  principles: [
    {
      title: 'Build the system, not the screen',
      text: 'A versioned component library with tokens and Storybook docs, and six micro-frontends that deploy independently.',
    },
    {
      title: 'Fast is a feature',
      text: 'Took a Lighthouse score from 70 to 95 for over a million users with code splitting, lazy images and fewer re-renders.',
    },
    {
      title: 'Own the whole flow',
      text: 'Payments from initiation to status reconciliation and failure handling, KYC from capture to ops approval.',
    },
  ],
}

export interface Impact {
  what: string
  before: string
  after: string
  /** Count from one number to the other when it scrolls in. */
  count?: { from: number; to: number; suffix?: string }
  where: string
  how: string
}

export const impact: Impact[] = [
  {
    what: 'Company onboarding',
    before: '2 days',
    after: '2 hours',
    where: 'KredX',
    how: 'Automatic GSTIN and CIN lookups plus cKYC replaced manual document checks.',
  },
  {
    what: 'Lighthouse score',
    before: '70',
    after: '95',
    count: { from: 70, to: 95 },
    where: 'Paytm Money',
    how: 'Route-level code splitting, lazy-loaded images and memoised rendering, for 1M+ users.',
  },
  {
    what: 'Codebases per feature',
    before: '2',
    after: '1',
    count: { from: 2, to: 1 },
    where: 'Paytm Money',
    how: 'Web and the mobile app merged into one H5 codebase rendered inside the native app.',
  },
  {
    what: 'Account-closure support requests',
    before: '100%',
    after: '30%',
    count: { from: 100, to: 30, suffix: '%' },
    where: 'Paytm Money',
    how: 'Automated the closure flow, removing one of the biggest friction points in the journey.',
  },
  {
    what: 'Shared UI components',
    before: 'Ad hoc',
    after: '25+',
    where: 'KredX',
    how: 'One themed, versioned package over Ant Design with brand tokens and Storybook docs.',
  },
]

export interface Role {
  title: string
  dates: string
  points: string[]
}

export interface Job {
  company: string
  place: string
  dates: string
  note?: string
  roles: Role[]
}

export const jobs: Job[] = [
  {
    company: 'KredX',
    place: 'Bangalore',
    dates: 'Sep 2025 – now',
    roles: [
      {
        title: 'Senior Frontend Developer',
        dates: 'Sep 2025 – now',
        points: [
          'Architected the user-management module for vendors and financiers in TypeScript: video KYC, ops and risk approvals, and full lifecycle actions, with React Query for server state',
          'Rebuilt company onboarding with automatic GSTIN and CIN data fetch and cKYC, cutting it from 2 days to 2 hours',
          'Led the design system end to end: 25+ themed components over Ant Design, brand tokens and Storybook docs, now the standard for new features',
          'Integrated the BillDesk payment gateway for invoice payments, covering initiation, status reconciliation and failure handling',
          'Mentor junior developers and review code across the frontend team',
        ],
      },
    ],
  },
  {
    company: 'Paytm Money',
    place: 'Pune',
    dates: 'Jun 2022 – May 2025',
    note: 'Three years, promoted from Software Engineer to Senior Software Engineer',
    roles: [
      {
        title: 'Senior Software Engineer',
        dates: 'Jul 2024 – May 2025',
        points: [
          'Automated the account-closure flow, cutting related support requests by 70%',
          'Delivered core trading tools (margin calculators, portfolio analytics, interactive charts) for 740K+ active users, lifting engagement 20%, tested with Jest and React Testing Library',
          'Shipped a P&L calculator for Equity and F&O, plus Market Movers and Scanners',
          'Overhauled onboarding and the funds flow, and built a real-time Market Status feature that kept trading state accurate through market hours',
          'Interviewed frontend candidates as part of the hiring loop',
        ],
      },
      {
        title: 'Software Engineer',
        dates: 'Jun 2022 – Jun 2024',
        points: [
          'Unified the web and mobile app into one H5 codebase rendered inside the native app, halving the surface area of every new feature',
          'Built modules across 6 micro-frontend apps with Webpack Module Federation, solving shared-dependency conflicts and cross-app auth token propagation',
          'Raised the Lighthouse score from 70 to 95 for 1M+ users while cutting memory use',
          'Built UserCampaign, a Next.js and Express ops tool that turns uploaded CSV user data into structured tables',
        ],
      },
    ],
  },
]

export const education = {
  school: 'MIT Academy of Engineering, Pune',
  degree: 'B.Tech in Computer Science',
  dates: '2018 – 2022',
  grade: 'CGPA 8.75',
}

export const skills: { group: string; items: string[] }[] = [
  { group: 'Languages', items: ['JavaScript', 'TypeScript', 'HTML', 'CSS'] },
  {
    group: 'Frontend',
    items: ['React', 'Next.js (SSR, SSG)', 'React Query', 'Context API', 'styled-components', 'Ant Design', 'Mobile web (H5)'],
  },
  {
    group: 'Architecture',
    items: ['Micro-frontends', 'Module Federation', 'Design systems', 'Storybook', 'Web Vitals', 'Payment gateways'],
  },
  {
    group: 'Testing and tooling',
    items: ['Jest', 'React Testing Library', 'Vitest', 'Webpack', 'Vite', 'GitHub Actions', 'Jenkins', 'Sentry'],
  },
  { group: 'AI tooling', items: ['Claude Code', 'GitHub Copilot', 'AI-assisted development'] },
  { group: 'Backend', items: ['Node.js', 'Express', 'REST APIs', 'Server-Sent Events'] },
]

export interface Stage {
  year: string
  city: 'Pune' | 'Bangalore'
  title: string
  org: string
  points: string[]
  /** 0 = Pune, 1 = Bangalore: where the dot on the route sits at this stage. */
  route: number
}

export const journey: Stage[] = [
  {
    year: '2018',
    city: 'Pune',
    title: 'B.Tech in Computer Science',
    org: 'MIT Academy of Engineering',
    points: ['Four years of computer science in Pune', 'Graduated in 2022 with a CGPA of 8.75'],
    route: 0,
  },
  {
    year: '2022',
    city: 'Pune',
    title: 'Software Engineer',
    org: 'Paytm Money',
    points: [
      'Merged the web and mobile app into one H5 codebase',
      'Built modules across 6 micro-frontends with Module Federation',
      'Took Lighthouse from 70 to 95 for 1M+ users',
    ],
    route: 0,
  },
  {
    year: '2024',
    city: 'Pune',
    title: 'Promoted to Senior Software Engineer',
    org: 'Paytm Money',
    points: [
      'Trading tools for 740K+ active users, engagement up 20%',
      'Automated account closure, 70% fewer support requests',
      'Interviewed frontend candidates for the team',
    ],
    route: 0,
  },
  {
    year: '2025',
    city: 'Bangalore',
    title: 'Senior Frontend Developer',
    org: 'KredX',
    points: [
      'Moved to Bangalore',
      'Led the design system: 25+ components, tokens, Storybook',
      'Onboarding cut from 2 days to 2 hours; BillDesk payments end to end',
    ],
    route: 1,
  },
  {
    year: 'Today',
    city: 'Bangalore',
    title: 'Shipping at work, building on weekends',
    org: 'KredX and five side projects',
    points: [
      'Mentoring and reviewing code across the frontend team',
      'Five side projects, each with a Devanagari name',
    ],
    route: 1,
  },
]

export interface HeroSkill {
  /** What the particles spell. */
  word: string
  /** Label on the chip. */
  label: string
  /** What I've done with it, shown as the caption. */
  detail: string
  accent: string
}

export const heroSkills: HeroSkill[] = [
  { word: 'React', label: 'React', detail: '4+ years in production at Paytm Money and KredX', accent: '#6ff3ff' },
  {
    word: 'AI',
    label: 'AI-assisted dev',
    detail: 'Ships with Claude Code and GitHub Copilot: every app in this portfolio was built that way',
    accent: '#c084fc',
  },
  {
    word: 'TypeScript',
    label: 'TypeScript',
    detail: "KredX's vendor and financier user-management module, typed end to end",
    accent: '#5b9dff',
  },
  {
    word: 'Next.js',
    label: 'Next.js',
    detail: 'SSR and SSG pages, plus UserCampaign, an ops tool on Next.js and Express',
    accent: '#fff1e8',
  },
  {
    word: 'Design',
    label: 'Design systems',
    detail: 'Led a 25+ component system with brand tokens and Storybook docs at KredX',
    accent: '#ff5c8a',
  },
  {
    word: 'MFE',
    label: 'Micro-frontends',
    detail: '6 apps on Webpack Module Federation at Paytm Money, deployed independently',
    accent: '#b9a4ff',
  },
  {
    word: '70→95',
    label: 'Performance',
    detail: 'Lighthouse from 70 to 95 for 1M+ users with code splitting and fewer re-renders',
    accent: '#4ade80',
  },
  {
    word: 'KYC',
    label: 'KYC and payments',
    detail: 'Video KYC, cKYC onboarding in 2 hours instead of 2 days, BillDesk payments',
    accent: '#ff9933',
  },
  {
    word: 'Tests',
    label: 'Testing',
    detail: 'Jest and React Testing Library on trading tools used by 740K+ people',
    accent: '#ffb547',
  },
]
