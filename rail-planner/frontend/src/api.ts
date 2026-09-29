import type { ListQuery, RouteResponse, SeatsResponse, StationHit, Tolerance, TrainRef, ViaStop, WindowsResponse } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined>, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const res = await fetch(`${BASE}${path}?${qs}`, { signal });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
    } catch {
      /* keep generic message */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export type SeatLegReq = { train: string; from: string; to: string; date: string; cls: string; classes?: string[] };

export const api = {
  seats: (quota: string, legs: SeatLegReq[], fresh = false) => post<SeatsResponse>("/api/seats", { quota, legs, fresh }),
  stations: (q: string, signal?: AbortSignal) => get<StationHit[]>("/api/stations", { q, limit: 8 }, signal),
  trains: (q: string, signal?: AbortSignal) => get<TrainRef[]>("/api/trains", { q, limit: 8 }, signal),
  routes: (
    from: string,
    to: string,
    date: string,
    t: Tolerance,
    via: ViaStop[],
    trains: TrainRef[],
    q: ListQuery,
    limit: number, // 0 = all
    offset: number,
    signal?: AbortSignal,
  ) => {
    const { sleep_on, sleep_hours, no_wait_limit, max_wait_hours, ...rest } = t;
    return get<RouteResponse>(
      "/api/routes",
      {
        from,
        to,
        date,
        ...rest,
        via: via.map((v) => v.code).join(","),
        trains: trains.map((t) => t.number).join(",") || undefined,
        via_stay: via.some((v) => v.stay_h) ? via.map((v) => v.stay_h ?? 0).join(",") : undefined,
        max_wait_hours: no_wait_limit ? undefined : max_wait_hours,
        limit,
        offset,
        sort: q.sort,
        order: q.order,
        kind: q.kind,
        min_sleep_hours: sleep_on ? sleep_hours : undefined,
      },
      signal,
    );
  },
  windows: (date: string, train?: string, board?: string) =>
    get<WindowsResponse>("/api/booking-windows", { date, train, board }),
};
