import type { BookingWindow } from "./types";

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Download an .ics reminder that fires 10 minutes before a booking window opens. */
export function downloadReminder(w: BookingWindow, title: string, detail: string): void {
  const start = new Date(w.opens_at);
  const end = new Date(start.getTime() + 15 * 60_000);
  const uid = `${start.getTime()}-${w.kind}-${Math.random().toString(36).slice(2)}@rail-planner`;
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rail Planner//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${w.label} opens · ${title}`)}`,
    `DESCRIPTION:${esc(`${detail}\n${w.note}\nLog in to IRCTC / RailOne 5 minutes early.`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`${w.label} opens in 10 minutes`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${w.kind}-${start.toISOString().slice(0, 10)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
