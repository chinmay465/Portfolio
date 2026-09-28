import { DEFAULT_TOLERANCE, type StationHit, type Tolerance } from "./types";

export type SavedTrip = { from: StationHit; to: StationHit; date: string };

const KEY = "rail-planner:v1";

type Saved = { last?: SavedTrip; recent: SavedTrip[]; tolerance: Tolerance };

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      return { recent: parsed.recent ?? [], last: parsed.last, tolerance: { ...DEFAULT_TOLERANCE, ...parsed.tolerance } };
    }
  } catch {
    /* storage unavailable */
  }
  return { recent: [], tolerance: DEFAULT_TOLERANCE };
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
    write({ last: trip, recent, tolerance });
  },
};
