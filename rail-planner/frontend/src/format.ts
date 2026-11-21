// All times from the API are ISO strings with a +05:30 offset. Display in IST regardless of the viewer's zone.
const TZ = "Asia/Kolkata";

const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const longDayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const clock = (iso: string) => timeFmt.format(new Date(iso));
export const day = (iso: string) => dayFmt.format(new Date(iso));
export const longDay = (iso: string) => longDayFmt.format(new Date(iso));

export function duration(min: number): string {
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Calendar-day difference in IST between two instants (for "+1" arrival markers). */
export function dayDiff(fromIso: string, toIso: string): number {
  const key = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
  const a = new Date(key(fromIso)).getTime();
  const b = new Date(key(toIso)).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function countdown(targetIso: string, now: number): string {
  let s = Math.round((new Date(targetIso).getTime() - now) / 1000);
  if (s <= 0) return "now";
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  if (m > 0) return `in ${m}m`;
  return `in ${s}s`;
}

export function todayIST(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export const CLASS_LABELS: Record<string, string> = {
  "1A": "First AC",
  "2A": "AC 2 Tier",
  "3A": "AC 3 Tier",
  "3E": "AC 3 Economy",
  CC: "AC Chair Car",
  EC: "Executive Chair",
  SL: "Sleeper",
  "2S": "Second Sitting",
  FC: "First Class",
};

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function runDays(days: string[]): string {
  if (days.length === 7) return "Daily";
  if (days.length === 6) return `Daily except ${WEEK.find((d) => !days.includes(d))}`;
  return days.join(", ");
}
