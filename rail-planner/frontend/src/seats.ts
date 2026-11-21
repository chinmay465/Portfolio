import { useCallback, useRef, useState } from "react";
import { api, type SeatLegReq } from "./api";
import { seatKey, type ClassChoice, type Journey, type Leg, type SeatCategory, type SeatResult } from "./types";

export type SeatState = SeatResult | "loading";

const RANK: Record<SeatCategory, number> = { available: 0, rac: 1, unknown: 2, waitlist: 3, regret: 4, closed: 4, no_class: 4 };

/** Cheapest first (typical fare order); "Best" walks it backwards. */
export const FARE_ORDER = ["2S", "SL", "FC", "3E", "CC", "3A", "2A", "EC", "1A"];
const BERTHS = new Set(["SL", "FC", "3E", "3A", "2A", "1A"]);
// When we don't know a train's classes, offer the classes most long-distance trains carry.
const UNKNOWN_CLASSES = ["SL", "3A", "2A"];

export const legDate = (l: Leg) => l.depart_at.slice(0, 10); // ISO string is already in IST
export const legId = (l: Leg) => [l.train.number, l.from.code, l.to.code, legDate(l)].join("|");

export function classOptions(l: Leg): { options: string[]; known: boolean } {
  const known = l.train.classes.length > 0;
  const options = (known ? l.train.classes : UNKNOWN_CLASSES).slice().sort((a, b) => FARE_ORDER.indexOf(a) - FARE_ORDER.indexOf(b));
  return { options, known };
}

/** Class to check on this leg: Custom override, else best/cheapest among the classes this train actually has.
 *  The leg you sleep on only considers berth classes. */
export function legClass(l: Leg, sleeping: boolean, choice: ClassChoice): string {
  if (choice.mode === "custom" && choice.overrides[legId(l)]) return choice.overrides[legId(l)];
  const mode = choice.mode === "custom" ? choice.base : choice.mode;
  let { options } = classOptions(l);
  if (sleeping) {
    const berths = options.filter((c) => BERTHS.has(c));
    if (berths.length) options = berths;
  }
  return mode === "cheapest" ? options[0] : options[options.length - 1];
}

export type LegPick = { leg: Leg; cls: string; key: string };

export function journeyPicks(j: Journey, choice: ClassChoice, quota: string): LegPick[] {
  return j.legs
    .map((leg, i) => ({ leg, i }))
    .filter(({ leg }) => leg.train.reserved)
    .map(({ leg, i }) => {
      const cls = legClass(leg, j.sleep?.leg === i, choice);
      return { leg, cls, key: seatKey(leg.train.number, leg.from.code, leg.to.code, legDate(leg), cls, quota) };
    });
}

/** Worst status across a journey's legs, or null if any reserved leg isn't checked yet. */
export function journeySeat(j: Journey, seats: Record<string, SeatState>, choice: ClassChoice, quota: string): SeatResult | null {
  let worst: SeatResult | null = null;
  for (const p of journeyPicks(j, choice, quota)) {
    const s = seats[p.key];
    if (!s || s === "loading") return null;
    if (!worst || RANK[s.category] > RANK[worst.category]) worst = s;
  }
  return worst;
}

export function isBookable(s: SeatResult, racOk: boolean): boolean {
  return s.category === "available" || (racOk && s.category === "rac") || s.category === "unknown";
}

export function useSeats() {
  const [seats, setSeats] = useState<Record<string, SeatState>>({});
  const [usage, setUsage] = useState<{ month?: number; message?: string } | null>(null);
  const inflight = useRef(new Set<string>());
  const known = useRef<Record<string, SeatState>>({});
  known.current = seats;

  const check = useCallback(async (picks: LegPick[], quota: string, fresh = false) => {
    const send: LegPick[] = [];
    for (const p of picks) {
      if (inflight.current.has(p.key) || send.some((t) => t.key === p.key)) continue;
      if (!fresh && known.current[p.key]) continue;
      send.push(p);
    }
    if (!send.length) return;
    setSeats((prev) => {
      const next = { ...prev };
      for (const p of send) next[p.key] = "loading";
      return next;
    });
    send.forEach((p) => inflight.current.add(p.key));
    const legs: SeatLegReq[] = send.map(({ leg, cls }) => ({
      train: leg.train.number,
      from: leg.from.code,
      to: leg.to.code,
      date: legDate(leg),
      cls,
      classes: leg.train.classes.length ? leg.train.classes : undefined,
    }));
    const clear = () =>
      setSeats((prev) => {
        const next = { ...prev };
        send.forEach((p) => next[p.key] === "loading" && delete next[p.key]);
        return next;
      });
    try {
      const res = await api.seats(quota, legs, fresh);
      if (res.source === null) {
        setUsage({ message: res.message });
        clear();
        return;
      }
      setUsage({ month: res.month_requests });
      setSeats((prev) => {
        const next = { ...prev };
        for (const r of res.results) next[seatKey(r.train, r.from, r.to, r.date, r.cls, r.quota)] = r;
        return next;
      });
    } catch {
      clear();
    } finally {
      send.forEach((p) => inflight.current.delete(p.key));
    }
  }, []);

  return { seats, check, usage };
}
