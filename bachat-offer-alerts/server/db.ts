import pg from 'pg'

/** The slice of a Postgres client the store needs. Both `pg.Pool` and PGlite fit it. */
export interface Db {
  kind: 'postgres' | 'pglite'
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  close(): Promise<void>
}

/**
 * `DATABASE_URL` set: a real Postgres (Neon, Supabase, any). Not set: PGlite, an
 * embedded Postgres kept in `dataDir`, or in memory when `dataDir` is `memory://`.
 * On Render's free plan the disk is wiped on every deploy, so PGlite is for local runs.
 */
export async function openDb(databaseUrl: string | undefined, dataDir: string): Promise<Db> {
  if (databaseUrl) {
    const pool = new pg.Pool({
      connectionString: databaseUrl.trim(),
      max: 3,
      connectionTimeoutMillis: 20_000,
      idleTimeoutMillis: 30_000,
    })
    // Neon suspends idle computes and closes their connections. Without a listener,
    // that error on an idle client would crash the process.
    pool.on('error', (err) => console.error('postgres idle client error:', err.message))
    return {
      kind: 'postgres',
      query: async <T>(sql: string, params?: unknown[]) => {
        const res = await pool.query(sql, params)
        return { rows: res.rows as T[] }
      },
      close: () => pool.end(),
    }
  }
  // Loaded only when needed: the WASM build is heavy for a 512 MB free instance.
  const { PGlite } = await import('@electric-sql/pglite')
  const lite = await PGlite.create(dataDir)
  return {
    kind: 'pglite',
    query: <T>(sql: string, params?: unknown[]) => lite.query<T>(sql, params),
    close: () => lite.close(),
  }
}

/** Error text safe to show publicly: connection strings and passwords removed. */
export function describeError(err: unknown): string {
  const text = err instanceof Error ? `${(err as { code?: string }).code ?? err.name}: ${err.message}` : String(err)
  return text.replace(/postgres(ql)?:\/\/\S+/gi, 'postgres://…').replace(/password\S*/gi, 'password …').slice(0, 300)
}
