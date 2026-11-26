import pg from 'pg'
import { PGlite } from '@electric-sql/pglite'

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
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 })
    return {
      kind: 'postgres',
      query: async <T>(sql: string, params?: unknown[]) => {
        const res = await pool.query(sql, params)
        return { rows: res.rows as T[] }
      },
      close: () => pool.end(),
    }
  }
  const lite = await PGlite.create(dataDir)
  return {
    kind: 'pglite',
    query: <T>(sql: string, params?: unknown[]) => lite.query<T>(sql, params),
    close: () => lite.close(),
  }
}
