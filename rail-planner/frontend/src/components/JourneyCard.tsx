import { useState } from "react";
import { clock, day, dayDiff, duration, runDays } from "../format";
import { classOptions, journeyPicks, journeySeat, legClass, type LegPick, type SeatState } from "../seats";
import type { ClassChoice, Journey, Leg, RouteResponse, SeatResult } from "../types";
import { BookingWindows } from "./BookingWindows";

const KIND_LABEL = { direct: "Direct", nearby: "Nearby station", connection: "Change", through: "Direct" } as const;

function changeLabel(j: Journey): string {
  const t = j.transfers;
  if (t.length === 1)
    return t[0].planned_stay_minutes
      ? `Stop at ${t[0].station.name} · ${duration(t[0].wait_minutes)}`
      : `Change at ${t[0].station.name} · ${duration(t[0].wait_minutes)} wait`;
  return `${t.length} changes: ${t.map((x) => x.station.name).join(", ")}`;
}

function transferLine(t: Journey["transfers"][number]): string {
  if (t.planned_stay_minutes)
    return `Stop at ${t.station.name} · ${duration(t.wait_minutes)} (planned ${duration(t.planned_stay_minutes)})`;
  return `Change at ${t.station.name} · ${duration(t.wait_minutes)} wait`;
}

type Props = {
  j: Journey;
  route: RouteResponse;
  seats?: Record<string, SeatState>;
  choice: ClassChoice;
  quota: string;
  onPickClass: (leg: Leg, cls: string) => void;
  pinned?: string[];
  onPinTrain?: (t: { number: string; name: string }) => void; // undefined while filters are being edited
  onCheckSeats: () => void;
  onRefreshSeats: () => void;
};

export function JourneyCard({ j, route, seats, choice, quota, onPickClass, onCheckSeats, onRefreshSeats, pinned = [], onPinTrain }: Props) {
  const [open, setOpen] = useState(false);
  const picks = journeyPicks(j, choice, quota);
  const pickFor = (l: Leg) => picks.find((p) => p.leg === l);
  const pending = seats ? picks.filter((p) => !seats[p.key]) : [];
  const first = j.legs[0];
  const last = j.legs[j.legs.length - 1];
  const plus = dayDiff(j.depart_at, j.arrive_at);

  return (
    <article className={`card journey ${j.kind}`}>
      <header className="j-head">
        <div className="j-time">
          <strong>{clock(j.depart_at)}</strong>
          <span className="code">{first.from.code}</span>
        </div>
        <div className="j-line">
          <span className="j-dur">{duration(j.minutes)}</span>
          <span className="track" aria-hidden>
            {j.transfers.map((t, i) => (
              <i key={t.station.code} className="dot" title={t.station.name} style={{ left: `${((i + 1) / (j.transfers.length + 1)) * 100}%` }} />
            ))}
          </span>
          <span className="j-km">{j.km} km</span>
        </div>
        <div className="j-time end">
          <strong>
            {clock(j.arrive_at)}
            {plus > 0 && <sup>+{plus}</sup>}
          </strong>
          <span className="code">{last.to.code}</span>
        </div>
      </header>

      <div className="badges">
        <span className={`badge kind ${j.kind}`}>
          {j.transfers.length > 0 ? changeLabel(j) : KIND_LABEL[j.kind]}
        </span>
        {j.via.length > 0 && <span className="badge soft">Via {j.via.map((v) => v.code).join(" → ")}</span>}
        {j.transfers.some((t) => t.tight) && (
          <span className="badge tight" title="Short connection: a late first train can make you miss the second">
            Tight change
          </span>
        )}
        <Delta minutes={j.extra_minutes} km={j.extra_km} />
        <span className="badge soft">{day(j.depart_at)}</span>
        {j.sleep && (
          <span className="badge sleepb" title={`Uninterrupted on ${j.sleep.train}`}>
            Sleep {clock(j.sleep.start)}–{clock(j.sleep.end)} on {j.sleep.train}
          </span>
        )}
        {seats && <JourneySeatBadge s={journeySeat(j, seats, choice, quota)} />}
      </div>

      {(j.access.board_offset_km > 0 || j.access.alight_offset_km > 0) && (
        <p className="access">
          {j.access.board_offset_km > 0 && (
            <>
              Board at <b>{first.from.name}</b>, {j.access.board_offset_km} km from {route.from.name}.{" "}
            </>
          )}
          {j.access.alight_offset_km > 0 && (
            <>
              Get off at <b>{last.to.name}</b>, {j.access.alight_offset_km} km from {route.to.name}.
            </>
          )}
        </p>
      )}

      <ol className="legs">
        {j.legs.map((l, i) => (
          <li key={l.train.number + l.depart_at}>
            {i > 0 && j.transfers[i - 1] && (
              <div className={`wait ${j.transfers[i - 1].tight ? "tight" : ""} ${j.transfers[i - 1].planned_stay_minutes ? "stay" : ""}`}>
                {transferLine(j.transfers[i - 1])}
              </div>
            )}
            <div className="leg-train">
              <span className="num">{l.train.number}</span>
              <span className="tname">{l.train.name}</span>
              <button
                type="button"
                className={`pin ${pinned.includes(l.train.number) ? "on" : ""}`}
                disabled={!onPinTrain}
                onClick={() => onPinTrain?.({ number: l.train.number, name: l.train.name })}
                title={
                  pinned.includes(l.train.number)
                    ? `Stop filtering by ${l.train.number}`
                    : `Only show routes that use ${l.train.number}`
                }
                aria-pressed={pinned.includes(l.train.number)}
              >
                {pinned.includes(l.train.number) ? "Pinned ✓" : "Only this train"}
              </button>
              {l.train.reserved && (
                <ClassPicker leg={l} value={legClass(l, j.sleep?.leg === i, choice)} onChange={(c) => onPickClass(l, c)} />
              )}
              {seats && l.train.reserved && <SeatPill s={seats[pickFor(l)?.key ?? ""]} />}
              <span className={`runs ${l.train.runs_on.length < 7 ? "limited" : ""}`}>{runDays(l.train.runs_on)}</span>
            </div>
            <div className="leg-times">
              {l.from.code} {clock(l.depart_at)} → {l.to.code} {clock(l.arrive_at)}
              {dayDiff(l.depart_at, l.arrive_at) > 0 && <sup>+{dayDiff(l.depart_at, l.arrive_at)}</sup>} · {duration(l.minutes)} · {l.km} km
              {l.passes.length > 0 && <> · via {l.passes.map((p) => p.name).join(", ")} (stay on)</>}
            </div>
          </li>
        ))}
      </ol>

      {seats && (
        <div className="seat-actions">
          {pending.length > 0 ? (
            <button type="button" className="link" onClick={onCheckSeats}>
              Check seats ({pending.map((p) => p.cls).join(" + ")} · {pending.length} request{pending.length === 1 ? "" : "s"})
            </button>
          ) : (
            <CheckedAt picks={picks} seats={seats} quota={quota} onRefresh={onRefreshSeats} />
          )}
        </div>
      )}

      <button type="button" className="toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide booking windows" : "Booking windows"} <NextOpen j={j} />
      </button>

      {open &&
        j.legs.map((l) => (
          <section key={"w" + l.train.number} className="leg-windows">
            {j.legs.length > 1 && (
              <h4>
                {l.train.number} · {l.from.code} → {l.to.code}
              </h4>
            )}
            {l.origin_date !== l.depart_at.slice(0, 10) && (
              <p className="muted small">
                This train leaves its origin on {day(l.origin_date + "T12:00:00+05:30")}, so its windows open a day earlier than your boarding date suggests.
              </p>
            )}
            <BookingWindows
              windows={l.booking_windows}
              compact
              title={`${l.train.number} ${l.from.code}→${l.to.code}`}
              detail={`${l.train.name}, departs ${l.from.name} ${day(l.depart_at)} ${clock(l.depart_at)}`}
            />
          </section>
        ))}
    </article>
  );
}

function Delta({ minutes, km }: { minutes: number | null; km: number | null }) {
  if (minutes === null || km === null) return null;
  const t = minutes === 0 ? "same time" : minutes < 0 ? `${duration(minutes)} faster` : `+${duration(minutes)}`;
  const d = km === 0 ? "" : km < 0 ? ` · ${-km} km shorter` : ` · +${km} km`;
  return <span className={`badge delta ${minutes <= 0 ? "good" : ""}`}>{t + d}</span>;
}

function NextOpen({ j }: { j: Journey }) {
  const upcoming = j.legs
    .flatMap((l) => l.booking_windows)
    .filter((w) => w.status === "upcoming")
    .sort((a, b) => a.opens_at.localeCompare(b.opens_at))[0];
  if (!upcoming) return null;
  return (
    <span className="next">
      · next: {upcoming.label} {day(upcoming.opens_at)} {clock(upcoming.opens_at)}
    </span>
  );
}

function short(s: SeatResult): string {
  switch (s.category) {
    case "available":
      return s.count != null ? `AVL ${s.count}` : "AVL";
    case "rac":
      return s.count != null ? `RAC ${s.count}` : "RAC";
    case "waitlist":
      return s.count != null ? `WL ${s.count}` : "WL";
    case "regret":
      return "REGRET";
    case "closed":
      return "Closed";
    case "no_class":
      return `No ${s.cls}`;
    default:
      return s.error ? "Check failed" : "Unknown";
  }
}

function SeatPill({ s }: { s?: SeatState }) {
  if (!s) return <span className="seat none" title="Seats not checked yet">—</span>;
  if (s === "loading") return <span className="seat loading">…</span>;
  const pct = s.category === "waitlist" && s.prediction_pct != null ? ` · ${Math.round(s.prediction_pct)}%` : "";
  const title = [s.raw || s.label, s.prediction && `prediction: ${s.prediction}`, s.error].filter(Boolean).join(" · ");
  const alt = s.checked_cls && s.checked_cls !== s.cls ? ` · ${s.checked_cls}` : "";
  return (
    <span className={`seat ${s.category}`} title={alt ? `${title} (train has no ${s.cls}; checked ${s.checked_cls})` : title}>
      {short(s)}
      {alt}
      {pct}
    </span>
  );
}

function JourneySeatBadge({ s }: { s: SeatResult | null }) {
  if (!s) return null;
  const text =
    s.category === "available" ? "Seats available" : s.category === "rac" ? "RAC only" : s.category === "waitlist" ? "Waitlisted" : s.category === "unknown" ? "Seats unknown" : "No seats";
  return <span className={`badge seatb ${s.category}`}>{text}</span>;
}

function ClassPicker({ leg, value, onChange }: { leg: Leg; value: string; onChange: (cls: string) => void }) {
  const { options, known } = classOptions(leg);
  const opts = options.includes(value) ? options : [value, ...options];
  return (
    <select
      className="cls-pick"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Class on ${leg.train.number}`}
      title={known ? "Classes this train carries" : "This train's classes aren't known; common classes shown"}
    >
      {opts.map((c) => (
        <option key={c} value={c}>
          {c}
          {known ? "" : "?"}
        </option>
      ))}
    </select>
  );
}

function CheckedAt({ picks, seats, quota, onRefresh }: { picks: LegPick[]; seats: Record<string, SeatState>; quota: string; onRefresh: () => void }) {
  const times = picks
    .map((p) => seats[p.key])
    .filter((s): s is SeatResult => !!s && s !== "loading" && !!s.checked_at)
    .map((s) => s.checked_at as string)
    .sort();
  if (!times.length) return null;
  return (
    <span className="muted small">
      {quota} quota · checked {clock(times[0])} ·{" "}
      <button type="button" className="link" onClick={onRefresh}>
        Refresh
      </button>
    </span>
  );
}
