import type { Db } from './db.ts'

/** Days are counted in IST, so "today" matches the owner's calendar. */
export const TZ = 'Asia/Kolkata'

export type Device = 'mobile' | 'tablet' | 'desktop'

export interface Visit {
  id: string
  path: string
  referrer: string | null
  device: Device
}

export interface Ranked {
  label: string
  visitors: number
}

export interface Stats {
  storage: Db['kind']
  total: number
  today: number
  last7: number
  last30: number
  activeToday: number
  returning: number
  days: number
  daily: { date: string; visitors: number }[]
  pages: Ranked[]
  referrers: Ranked[]
  devices: Ranked[]
}

/**
 * One row per visitor. The browser sends its random id once per session; a repeat id
 * only bumps `sessions` and `last_seen`, so moving between pages, reloading or coming
 * back next week never adds a second row.
 */
export class VisitorStore {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async migrate(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS visitors (
        id           uuid PRIMARY KEY,
        first_seen   timestamptz NOT NULL,
        last_seen    timestamptz NOT NULL,
        sessions     integer NOT NULL DEFAULT 1,
        landing_path text NOT NULL,
        referrer     text,
        device       text NOT NULL
      )`)
    await this.db.query('CREATE INDEX IF NOT EXISTS visitors_first_seen ON visitors (first_seen)')
  }

  /** Returns true when this is the visitor's first ever entry. */
  async record(visit: Visit, now = new Date()): Promise<boolean> {
    const { rows } = await this.db.query<{ sessions: number }>(
      `INSERT INTO visitors (id, first_seen, last_seen, landing_path, referrer, device)
       VALUES ($1, $2, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET last_seen = EXCLUDED.last_seen, sessions = visitors.sessions + 1
       RETURNING sessions`,
      [visit.id, now.toISOString(), visit.path, visit.referrer, visit.device],
    )
    return rows[0]?.sessions === 1
  }

  async stats(days: number, now = new Date()): Promise<Stats> {
    const at = now.toISOString()
    const today = `($1::timestamptz AT TIME ZONE '${TZ}')::date`

    const [totals, daily, pages, referrers, devices] = await Promise.all([
      this.db.query<Omit<Stats, 'storage' | 'days' | 'daily' | 'pages' | 'referrers' | 'devices'>>(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE (first_seen AT TIME ZONE '${TZ}')::date = ${today})::int AS today,
           count(*) FILTER (WHERE first_seen > $1::timestamptz - interval '7 days')::int AS last7,
           count(*) FILTER (WHERE first_seen > $1::timestamptz - interval '30 days')::int AS last30,
           count(*) FILTER (WHERE (last_seen AT TIME ZONE '${TZ}')::date = ${today})::int AS "activeToday",
           count(*) FILTER (WHERE sessions > 1)::int AS returning
         FROM visitors`,
        [at],
      ),
      this.db.query<{ date: string; visitors: number }>(
        `SELECT to_char(d, 'YYYY-MM-DD') AS date, count(v.id)::int AS visitors
         FROM generate_series(${today} - ($2::int - 1), ${today}, interval '1 day') AS d
         LEFT JOIN visitors v ON (v.first_seen AT TIME ZONE '${TZ}')::date = d::date
         GROUP BY d ORDER BY d`,
        [at, days],
      ),
      this.ranked('landing_path', at, days),
      this.ranked(`coalesce(referrer, 'Direct')`, at, days),
      this.ranked('device', at, days),
    ])

    return {
      storage: this.db.kind,
      ...totals.rows[0],
      days,
      daily: daily.rows,
      pages,
      referrers,
      devices,
    }
  }

  /** Top values of one column among visitors first seen in the window. */
  private async ranked(column: string, at: string, days: number): Promise<Ranked[]> {
    const { rows } = await this.db.query<Ranked>(
      `SELECT ${column} AS label, count(*)::int AS visitors
       FROM visitors
       WHERE first_seen > $1::timestamptz - make_interval(days => $2::int)
       GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 8`,
      [at, days],
    )
    return rows
  }
}
