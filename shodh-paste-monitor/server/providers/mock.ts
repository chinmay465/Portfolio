import type { Paste, Provider } from '../monitor.ts'

// Synthetic source so the app works offline, with no third-party account.
// It fabricates pastes and sprinkles in your configured keywords so you can
// watch the live feed and matching behave. Not real data.

const POOL = [
  'config', 'server', 'deploy', 'update', 'changelog', 'user', 'token', 'api',
  'release', 'note', 'backup', 'test', 'report', 'status', 'build', 'data',
  'export', 'meeting', 'draft', 'invoice', 'ticket', 'review', 'incident',
  'migration', 'schema', 'endpoint', 'webhook', 'rollback', 'sandbox',
]

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function createMockProvider({ keywords = [] }: { keywords?: string[] } = {}): Provider {
  let counter = 0
  return {
    name: 'mock',
    async fetchRecent(): Promise<Paste[]> {
      const n = 2 + Math.floor(Math.random() * 4)
      const out: Paste[] = []
      for (let i = 0; i < n; i++) {
        counter++
        const len = 20 + Math.floor(Math.random() * 60)
        const words: string[] = []
        for (let j = 0; j < len; j++) words.push(rand(POOL))
        // ~40% of pastes contain a configured keyword, so matches actually show up.
        if (keywords.length && Math.random() < 0.4) {
          const kw = rand(keywords)
          words.splice(Math.floor(Math.random() * words.length), 0, kw)
        }
        out.push({
          id: `mock-${Date.now()}-${counter}`,
          title: `synthetic paste #${counter}`,
          url: null,
          content: words.join(' '),
          timestamp: Date.now(),
        })
      }
      return out
    },
  }
}
