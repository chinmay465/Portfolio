import { useState } from "react";
import { clock, day, dayDiff, duration, runDays } from "../format";
import type { Journey, RouteResponse } from "../types";
import { BookingWindows } from "./BookingWindows";

const KIND_LABEL = { direct: "Direct", nearby: "Nearby station", connection: "1 change" } as const;

export function JourneyCard({ j, route }: { j: Journey; route: RouteResponse }) {
  const [open, setOpen] = useState(false);
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
            {j.transfer && <i className="dot" title={j.transfer.station.name} />}
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
          {j.kind === "connection" && j.transfer
            ? `Change at ${j.transfer.station.name} · ${duration(j.transfer.wait_minutes)} wait`
            : KIND_LABEL[j.kind]}
        </span>
        {j.transfer?.tight && (
          <span className="badge tight" title="Short connection: a late first train can make you miss the second">
            Tight change
          </span>
        )}
        <Delta minutes={j.extra_minutes} km={j.extra_km} />
        <span className="badge soft">{day(j.depart_at)}</span>
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
        {j.legs.map((l) => (
          <li key={l.train.number + l.depart_at}>
            <div className="leg-train">
              <span className="num">{l.train.number}</span>
              <span className="tname">{l.train.name}</span>
              {l.train.classes.length > 0 && <span className="classes">{l.train.classes.join(" ")}</span>}
              <span className={`runs ${l.train.runs_on.length < 7 ? "limited" : ""}`}>{runDays(l.train.runs_on)}</span>
            </div>
            <div className="leg-times">
              {l.from.code} {clock(l.depart_at)} → {l.to.code} {clock(l.arrive_at)}
              {dayDiff(l.depart_at, l.arrive_at) > 0 && <sup>+{dayDiff(l.depart_at, l.arrive_at)}</sup>} · {duration(l.minutes)} · {l.km} km
            </div>
          </li>
        ))}
      </ol>

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
