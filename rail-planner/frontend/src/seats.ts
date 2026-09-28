import { useCallback, useRef, useState } from "react";
import { api, type SeatLegReq } from "./api";
import { seatKey, type Journey, type Leg, type SeatCategory, type SeatPrefs, type SeatResult } from "./types";

export type SeatState = SeatResult | "loading";

const RANK: Record<SeatCategory, number> = { available: 0, rac: 1, unknown: 2, waitlist: 3, regret: 4, closed: 4, no_class: 4 };

export const legDate = (l: Leg) => l.depart_at.slice(0, 10); // ISO string is already in IST
export const legKey = (l: Leg, p: SeatPrefs) => seatKey(l.train.number, l.from.code, l.to.code, legDate(l), p.cls, p.quota);

/** Worst status across a journey's legs, or null if any reserved leg isn't checked yet. */
export function journeySeat(j: Journey, seats: Record<string, SeatState>, p: SeatPrefs): SeatResult | null {
  let worst: SeatResult | null = null;
  for (const l of j.legs) {
    if (!l.train.reserved) continue;
    const s = seats[legKey(l, p)];
    if (!s || s === "loading") return null;
    if (!worst || RANK[s.category] > RANK[worst.category]) worst = s;
  }
  return worst;
}

export function isBookable(s: SeatResult, p: SeatPrefs): boolean {
  return s.category === "available" || (p.rac_ok && s.category === "rac") || s.category === "unknown";
}

export function useSeats() {
  const [seats, setSeats] = useState<Record<string, SeatState>>({});
  const [usage, setUsage] = useState<{ month?: number; message?: string } | null>(null);
  const inflight = useRef(new Set<string>());

  const check = useCallback(async (journeys: Journey[], p: SeatPrefs, fresh = false) => {
    const legs: SeatLegReq[] = [];
    const keys: string[] = [];
    for (const j of journeys)
      for (const l of j.legs) {
        const k = legKey(l, p);
        if (!l.train.reserved || keys.includes(k) || inflight.current.has(k)) continue;
        keys.push(k);
        legs.push({ train: l.train.number, from: l.from.code, to: l.to.code, date: legDate(l), classes: l.train.classes.length ? l.train.classes : undefined });
      }
    setSeats((prev) => {
      const todo = keys.filter((k) => !prev[k]);
      if (!todo.length) return prev;
      const next = { ...prev };
      for (const k of todo) next[k] = "loading";
      return next;
    });
    const todo = legs.filter((_, i) => !inflight.current.has(keys[i]));
    if (!todo.length) return;
    keys.forEach((k) => inflight.current.add(k));
    try {
      const res = await api.seats(p.cls, p.quota, todo, fresh);
      if (res.source === null) {
        setUsage({ message: res.message });
        setSeats((prev) => {
          const next = { ...prev };
          keys.forEach((k) => delete next[k]);
          return next;
        });
        return;
      }
      setUsage({ month: res.month_requests });
      setSeats((prev) => {
        const next = { ...prev };
        for (const r of res.results) next[seatKey(r.train, r.from, r.to, r.date, r.cls, r.quota)] = r;
        return next;
      });
    } catch {
      setSeats((prev) => {
        const next = { ...prev };
        keys.forEach((k) => delete next[k]);
        return next;
      });
    } finally {
      keys.forEach((k) => inflight.current.delete(k));
    }
  }, []);

  const refresh = useCallback(
    (journeys: Journey[], p: SeatPrefs) => {
      setSeats((prev) => {
        const next = { ...prev };
        for (const j of journeys) for (const l of j.legs) delete next[legKey(l, p)];
        return next;
      });
      setTimeout(() => check(journeys, p, true), 0);
    },
    [check],
  );

  return { seats, check, refresh, usage };
}
