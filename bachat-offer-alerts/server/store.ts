import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { normalizeSettings } from '../shared/types.ts'
import type { SourceStatus } from '../shared/api-types.ts'
import type { Deal, Settings } from '../shared/types.ts'

export type { SourceStatus }
import type { Db } from './db.ts'

export interface Subscriber {
  id: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  settings: Settings
  /** Minutes behind UTC, as `Date#getTimezoneOffset` gives it (India: -330). */
  tzOffset: number
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : null)
const json = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

/** Everything Bachat keeps: deals seen, push subscribers, what each was sent, source health. */
export class Store {
  readonly db: Db
  constructor(db: Db) {
    this.db = db
  }

  async migrate(): Promise<void> {
    const stmts = [
      `create table if not exists deals (
        id text primary key,
        source text not null,
        platform text not null,
        percent integer,
        posted_at timestamptz not null,
        first_seen timestamptz not null default now(),
        data jsonb not null
      )`,
      `create index if not exists deals_posted_at on deals (posted_at desc)`,
      `create index if not exists deals_first_seen on deals (first_seen desc)`,
      `create table if not exists subscribers (
        id text primary key,
        token_hash text not null,
        endpoint text not null unique,
        keys jsonb not null,
        settings jsonb not null,
        tz_offset integer not null default -330,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_push timestamptz,
        failures integer not null default 0
      )`,
      `create table if not exists notified (
        subscriber_id text not null,
        deal_id text not null,
        at timestamptz not null default now(),
        primary key (subscriber_id, deal_id)
      )`,
      `create table if not exists meta (key text primary key, value text not null)`,
      `create table if not exists source_status (
        id text primary key,
        name text not null,
        kind text not null,
        last_checked timestamptz,
        last_ok timestamptz,
        last_error text,
        posts integer not null default 0,
        last_post_id text
      )`,
    ]
    for (const sql of stmts) await this.db.query(sql)
  }

  // ---- meta ----

  async getMeta(key: string): Promise<string | null> {
    const { rows } = await this.db.query<{ value: string }>('select value from meta where key = $1', [key])
    return rows[0]?.value ?? null
  }

  /** Sets `key` only if it isn't set yet, and returns whichever value won. */
  async initMeta(key: string, value: string): Promise<string> {
    await this.db.query('insert into meta (key, value) values ($1, $2) on conflict (key) do nothing', [key, value])
    return (await this.getMeta(key)) ?? value
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.db.query('insert into meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [key, value])
  }

  // ---- deals ----

  /** Saves deals not seen before and returns those (the new ones). */
  async insertDeals(deals: Deal[]): Promise<Deal[]> {
    const fresh: Deal[] = []
    for (const d of deals) {
      const { rows } = await this.db.query<{ id: string }>(
        `insert into deals (id, source, platform, percent, posted_at, data) values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do nothing returning id`,
        [d.id, d.source, d.platform, d.percent, d.postedAt, JSON.stringify(d)],
      )
      if (rows.length) fresh.push(d)
    }
    return fresh
  }

  async recentDeals(opts: { sinceHours?: number; limit?: number; by?: 'posted' | 'seen' } = {}): Promise<(Deal & { firstSeen: string })[]> {
    const col = opts.by === 'seen' ? 'first_seen' : 'posted_at'
    const { rows } = await this.db.query<{ data: unknown; first_seen: unknown }>(
      `select data, first_seen from deals where ${col} > now() - make_interval(hours => $1::int) order by posted_at desc limit $2`,
      [opts.sinceHours ?? 72, opts.limit ?? 300],
    )
    return rows.map((r) => ({ ...json<Deal>(r.data), firstSeen: iso(r.first_seen)! }))
  }

  async prune(days = 7): Promise<void> {
    await this.db.query(`delete from deals where posted_at < now() - make_interval(days => $1::int) and first_seen < now() - make_interval(days => $1::int)`, [days])
    await this.db.query(`delete from notified where at < now() - make_interval(days => $1::int)`, [days + 1])
  }

  // ---- subscribers ----

  /** Adds a push subscription (or takes over the one with the same endpoint) and returns its id and edit token. */
  async subscribe(endpoint: string, keys: Subscriber['keys'], settings: Settings, tzOffset: number): Promise<{ id: string; token: string }> {
    const token = randomBytes(24).toString('base64url')
    const id = randomUUID()
    const { rows } = await this.db.query<{ id: string }>(
      `insert into subscribers (id, token_hash, endpoint, keys, settings, tz_offset) values ($1, $2, $3, $4, $5, $6)
       on conflict (endpoint) do update set token_hash = excluded.token_hash, keys = excluded.keys,
         settings = excluded.settings, tz_offset = excluded.tz_offset, updated_at = now(), failures = 0
       returning id`,
      [id, hashToken(token), endpoint, JSON.stringify(keys), JSON.stringify(settings), tzOffset],
    )
    return { id: rows[0].id, token }
  }

  async authorize(id: string, token: string): Promise<boolean> {
    const { rows } = await this.db.query<{ token_hash: string }>('select token_hash from subscribers where id = $1', [id])
    return rows.length === 1 && rows[0].token_hash === hashToken(token)
  }

  async subscriber(id: string): Promise<Subscriber | null> {
    const { rows } = await this.db.query<Record<string, unknown>>('select * from subscribers where id = $1', [id])
    return rows[0] ? this.toSubscriber(rows[0]) : null
  }

  async subscribers(): Promise<Subscriber[]> {
    const { rows } = await this.db.query<Record<string, unknown>>('select * from subscribers order by created_at')
    return rows.map((r) => this.toSubscriber(r))
  }

  private toSubscriber(r: Record<string, unknown>): Subscriber {
    return {
      id: String(r.id),
      endpoint: String(r.endpoint),
      keys: json(r.keys),
      settings: normalizeSettings(json(r.settings)),
      tzOffset: Number(r.tz_offset),
    }
  }

  async updateSettings(id: string, settings: Settings, tzOffset?: number): Promise<void> {
    await this.db.query(
      `update subscribers set settings = $2, tz_offset = coalesce($3, tz_offset), updated_at = now() where id = $1`,
      [id, JSON.stringify(settings), tzOffset ?? null],
    )
  }

  async unsubscribe(id: string): Promise<void> {
    await this.db.query('delete from notified where subscriber_id = $1', [id])
    await this.db.query('delete from subscribers where id = $1', [id])
  }

  async markPushed(id: string, ok: boolean): Promise<void> {
    await this.db.query(
      ok
        ? 'update subscribers set last_push = now(), failures = 0 where id = $1'
        : 'update subscribers set failures = failures + 1 where id = $1',
      [id],
    )
  }

  async dropFailing(maxFailures = 20): Promise<void> {
    await this.db.query('delete from subscribers where failures >= $1', [maxFailures])
  }

  /** Deal ids already sent to this subscriber, among `ids`. */
  async notifiedAmong(subscriberId: string, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set()
    const { rows } = await this.db.query<{ deal_id: string }>(
      'select deal_id from notified where subscriber_id = $1 and deal_id = any($2::text[])',
      [subscriberId, ids],
    )
    return new Set(rows.map((r) => r.deal_id))
  }

  /** Claims a deal for a subscriber before sending, so two scans never send it twice. */
  async claim(subscriberId: string, dealId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ deal_id: string }>(
      'insert into notified (subscriber_id, deal_id) values ($1, $2) on conflict do nothing returning deal_id',
      [subscriberId, dealId],
    )
    return rows.length === 1
  }

  // ---- sources ----

  async sourceStatus(): Promise<SourceStatus[]> {
    const { rows } = await this.db.query<Record<string, unknown>>('select * from source_status order by name')
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: String(r.kind),
      lastChecked: iso(r.last_checked),
      lastOk: iso(r.last_ok),
      lastError: (r.last_error as string | null) ?? null,
      posts: Number(r.posts),
      lastPostId: (r.last_post_id as string | null) ?? null,
    }))
  }

  async lastPostId(id: string): Promise<string | null> {
    const { rows } = await this.db.query<{ last_post_id: string | null }>('select last_post_id from source_status where id = $1', [id])
    return rows[0]?.last_post_id ?? null
  }

  async recordSource(s: { id: string; name: string; kind: string; ok: boolean; error?: string; posts: number; lastPostId?: string | null }): Promise<void> {
    await this.db.query(
      `insert into source_status (id, name, kind, last_checked, last_ok, last_error, posts, last_post_id)
       values ($1, $2, $3, now(), case when $4 then now() end, $5, $6, $7)
       on conflict (id) do update set name = excluded.name, kind = excluded.kind, last_checked = now(),
         last_ok = case when $4 then now() else source_status.last_ok end,
         last_error = excluded.last_error, posts = excluded.posts,
         last_post_id = coalesce(excluded.last_post_id, source_status.last_post_id)`,
      [s.id, s.name, s.kind, s.ok, s.ok ? null : (s.error ?? 'failed').slice(0, 300), s.posts, s.lastPostId ?? null],
    )
  }
}
