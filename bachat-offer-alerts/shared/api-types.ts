// Shapes the server sends to the web app.

export interface SourceStatus {
  id: string
  name: string
  kind: string
  lastChecked: string | null
  lastOk: string | null
  lastError: string | null
  posts: number
  lastPostId: string | null
}

export interface SourceReport {
  id: string
  name: string
  ok: boolean
  posts: number
  fresh: number
  error?: string
}

export interface ScanSummary {
  at: string
  sources: SourceReport[]
  newDeals: number
  pushes: number
  subscribers: number
}
