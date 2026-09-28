import { DEFAULT_SEATS, DEFAULT_TOLERANCE, type SeatPrefs, type StationHit, type Tolerance } from "./types";

export type SavedTrip = { from: StationHit; to: StationHit; date: string };

const KEY = "rail-planner:v2";
// v1 stored the old 45-minute default change time; keep trips, reset tolerances.
const OLD_KEYS = ["rail-planner:v1"];

type Saved = { last?: SavedTrip; recent: SavedTrip[]; tolerance: Tolerance; seats: SeatPrefs };

function read(): Saved {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      const old = OLD_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
      if (old) {
        const parsed = JSON.parse(old) as Partial<Saved>;
        raw = JSON.stringify({ last: parsed.last, recent: parsed.recent ?? [] });
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      return {
        recent: parsed.recent ?? [],
        last: parsed.last,
        tolerance: { ...DEFAULT_TOLERANCE, ...parsed.tolerance },
        seats: { ...DEFAULT_SEATS, ...parsed.seats },
      };
    }
  } catch {
    /* storage unavailable */
  }
  return { recent: [], tolerance: DEFAULT_TOLERANCE, seats: DEFAULT_SEATS };
}

function write(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export const storage = {
  load: read,
  remember(trip: SavedTrip, tolerance: Tolerance) {
    const s = read();
    const same = (t: SavedTrip) => t.from.code === trip.from.code && t.to.code === trip.to.code;
    const recent = [trip, ...s.recent.filter((t) => !same(t))].slice(0, 6);
    write({ ...s, last: trip, recent, tolerance });
  },
  saveSeats(seats: SeatPrefs) {
    write({ ...read(), seats });
  },
};
