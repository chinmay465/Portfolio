import { DEFAULT_SEATS, DEFAULT_TOLERANCE, type SeatPrefs, type StationHit, type Tolerance } from "./types";

export type SavedTrip = { from: StationHit; to: StationHit; date: string };

const KEY = "rail-planner:v3";
// Older versions stored earlier defaults (45-min changes, 1 change, +3 h/150 km, single class); keep trips only.
const OLD_KEYS = ["rail-planner:v2", "rail-planner:v1"];

type Saved = {
  last?: SavedTrip;
  recent: SavedTrip[];
  tolerance: Tolerance;
  seats: SeatPrefs;
  classMode: "best" | "cheapest";
};

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
        classMode: parsed.classMode === "best" ? "best" : "cheapest",
      };
    }
  } catch {
    /* storage unavailable */
  }
  return { recent: [], tolerance: DEFAULT_TOLERANCE, seats: DEFAULT_SEATS, classMode: "cheapest" };
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
  saveFilters(tolerance: Tolerance, seats: SeatPrefs) {
    write({ ...read(), tolerance, seats });
  },
  saveClassMode(classMode: "best" | "cheapest") {
    write({ ...read(), classMode });
  },
};
