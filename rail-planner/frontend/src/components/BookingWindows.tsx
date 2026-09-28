import { useEffect, useState } from "react";
import { clock, countdown, longDay } from "../format";
import { downloadReminder } from "../ics";
import type { BookingWindow } from "../types";

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

type Props = { windows: BookingWindow[]; title: string; detail: string; compact?: boolean };

export function BookingWindows({ windows, title, detail, compact }: Props) {
  const now = useNow();
  if (!windows.length) return <p className="muted small">Unreserved train: no advance booking. Buy at the counter or on UTS.</p>;

  return (
    <ul className={`windows ${compact ? "compact" : ""}`}>
      {windows.map((w) => {
        const status = w.status === "upcoming" && new Date(w.opens_at).getTime() <= now ? "open" : w.status;
        return (
          <li key={w.kind} className={`window ${w.kind} ${status}`}>
            <div className="w-main">
              <span className="w-label">{w.label}</span>
              <span className="w-when">
                {longDay(w.opens_at)} · <strong>{clock(w.opens_at)}</strong>
              </span>
              <span className="w-classes">{w.classes.join(" · ")}</span>
            </div>
            <div className="w-side">
              <span className={`pill ${status}`}>
                {status === "open" ? "Open now" : status === "departed" ? "Departed" : countdown(w.opens_at, now)}
              </span>
              {status === "upcoming" && (
                <button type="button" className="link" onClick={() => downloadReminder(w, title, detail)} title="Download a calendar reminder">
                  Remind me
                </button>
              )}
            </div>
            {!compact && <p className="w-note">{w.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}
