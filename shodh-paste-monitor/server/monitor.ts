import { EventEmitter } from 'node:events'
import { makeSnippet, matchKeywords, qualifies } from './matcher.ts'
import type { MatchOptions } from './matcher.ts'

export interface Stats {
  scanned: number
  matched: number
  startedAt: number | null
  lastPollAt: number | null
  errors: number
}

export interface MatchRecord {
  id: string
  source: string
  title: string
  url: string | null
  matchedKeywords: string[]
  snippet: string
  size: number
  foundAt: number
  pasteTime: number | null
}

/** What a provider returns for each item it finds. */
export interface Paste {
  id: string
  title?: string
  url?: string | null
  content?: string
  timestamp?: number | null
}

export interface Provider {
  name: string
  fetchRecent(): Promise<Paste[]>
}

export interface MonitorConfig {
  keywords: string[]
  mode: 'any' | 'all'
  intervalMs: number
  matchOptions: MatchOptions
}

/**
 * Polling engine. Emits:
 *   'status'         -> snapshot             when start/stop is called
 *   'scan'           -> { stats }            after every poll cycle
 *   'match'          -> MatchRecord          for each new matching paste
 *   'provider_error' -> { provider, message }
 */
export class Monitor extends EventEmitter {
  running = false
  timer: ReturnType<typeof setTimeout> | null = null
  seen = new Set<string>()
  seenOrder: string[] = []
  providers: Provider[] = []
  config: MonitorConfig | null = null
  stats: Stats = Monitor.freshStats()

  static freshStats(): Stats {
    return { scanned: 0, matched: 0, startedAt: null, lastPollAt: null, errors: 0 }
  }

  configure(opts: { providers: Provider[] } & MonitorConfig): void {
    this.providers = opts.providers
    this.config = {
      keywords: opts.keywords,
      mode: opts.mode,
      intervalMs: opts.intervalMs,
      matchOptions: opts.matchOptions,
    }
  }

  snapshot() {
    return {
      running: this.running,
      stats: this.stats,
      config: this.config
        ? { keywords: this.config.keywords, mode: this.config.mode, intervalMs: this.config.intervalMs }
        : null,
      providers: this.providers.map((p) => p.name),
    }
  }

  start(): void {
    if (this.running) this.stop()
    this.running = true
    this.seen.clear()
    this.seenOrder = []
    this.stats = Monitor.freshStats()
    this.stats.startedAt = Date.now()
    this.emit('status', this.snapshot())
    void this.poll()
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.emit('status', this.snapshot())
  }

  private remember(key: string): void {
    this.seen.add(key)
    this.seenOrder.push(key)
    if (this.seenOrder.length > 5000) {
      const old = this.seenOrder.shift()
      if (old) this.seen.delete(old)
    }
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.config) return
    const { keywords, mode, matchOptions } = this.config

    for (const provider of this.providers) {
      if (!this.running) break
      let pastes: Paste[] = []
      try {
        pastes = await provider.fetchRecent()
      } catch (err) {
        this.stats.errors++
        this.emit('provider_error', {
          provider: provider.name,
          message: err instanceof Error ? err.message : String(err),
        })
        continue
      }

      for (const paste of pastes) {
        const key = `${provider.name}:${paste.id}`
        if (this.seen.has(key)) continue
        this.remember(key)
        this.stats.scanned++

        const content = paste.content ?? ''
        const found = matchKeywords(content, keywords, matchOptions)
        if (qualifies(found, keywords.length, mode)) {
          this.stats.matched++
          const record: MatchRecord = {
            id: key,
            source: provider.name,
            title: paste.title || '(untitled)',
            url: paste.url ?? null,
            matchedKeywords: found,
            snippet: makeSnippet(content, found, matchOptions),
            size: content.length,
            foundAt: Date.now(),
            pasteTime: paste.timestamp ?? null,
          }
          this.emit('match', record)
        }
      }
    }

    this.stats.lastPollAt = Date.now()
    this.emit('scan', { stats: this.stats })

    if (this.running) {
      this.timer = setTimeout(() => void this.poll(), this.config.intervalMs)
    }
  }
}
