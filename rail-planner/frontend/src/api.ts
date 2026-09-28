import type { RouteResponse, SeatsResponse, StationHit, Tolerance, WindowsResponse } from "./types";

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

export type SeatLegReq = { train: string; from: string; to: string; date: string; classes?: string[] };

export const api = {
  seats: (cls: string, quota: string, legs: SeatLegReq[], fresh = false) =>
    post<SeatsResponse>("/api/seats", { cls, quota, legs, fresh }),
  stations: (q: string, signal?: AbortSignal) => get<StationHit[]>("/api/stations", { q, limit: 8 }, signal),
  routes: (from: string, to: string, date: string, t: Tolerance, via: string[], limit: number, signal?: AbortSignal) =>
    get<RouteResponse>("/api/routes", { from, to, date, ...t, via: via.join(","), limit }, signal),
  windows: (date: string, train?: string, board?: string) =>
    get<WindowsResponse>("/api/booking-windows", { date, train, board }),
};
