import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { duration, longDay, todayIST } from "../format";
import { isBookable, journeyPicks, journeySeat, legId, useSeats } from "../seats";
import { storage, type SavedTrip } from "../storage";
import type { ClassChoice, ClassMode, Journey, Leg, RouteResponse, SeatPrefs, StationHit, Tolerance } from "../types";
import { FiltersPanel, filterSummary, type Draft } from "./FiltersPanel";
import { JourneyCard } from "./JourneyCard";
import { SourceNote } from "./SourceNote";
import { StationInput } from "./StationInput";

const PAGE = 50;

type Filter = "all" | "direct" | "nearby" | "connection";
type Sort = "fastest" | "earliest" | "shortest";

export function TripPlanner() {
  const saved = useMemo(() => storage.load(), []);
  const [from, setFrom] = useState<StationHit | null>(saved.last?.from ?? null);
  const [to, setTo] = useState<StationHit | null>(saved.last?.to ?? null);
  const [date, setDate] = useState(() => {
    const d = saved.last?.date;
    return d && d >= todayIST() ? d : todayIST(1);
  });
  const [recent, setRecent] = useState<SavedTrip[]>(saved.recent);

  // Applied filters (used by searches) and the draft being edited in the panel.
  const [tol, setTol] = useState<Tolerance>(saved.tolerance);
  const [via, setVia] = useState<StationHit[]>([]);
  const [seatPrefs, setSeatPrefs] = useState<SeatPrefs>(saved.seats);
  const [draft, setDraft] = useState<Draft | null>(null);

  const [choice, setChoice] = useState<ClassChoice>({ mode: saved.classMode, base: saved.classMode, overrides: {} });

  const [data, setData] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("fastest");
  const [limit, setLimit] = useState(PAGE);
  const ctrl = useRef<AbortController | null>(null);
  const { seats, check, usage } = useSeats();

  const run = async (opts: { f?: StationHit | null; t?: StationHit | null; tl?: Tolerance; v?: StationHit[]; lim?: number } = {}) => {
    const f = opts.f ?? from;
    const t = opts.t ?? to;
    const tl = opts.tl ?? tol;
    const v = opts.v ?? via;
    const lim = opts.lim ?? PAGE;
    if (!f || !t) {
      setError("Pick both stations from the suggestions.");
      return;
    }
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError(null);
    try {
      const res = await api.routes(f.code, t.code, date, tl, v.map((s) => s.code), lim, c.signal);
      setData(res);
      setLimit(lim);
      storage.remember({ from: f, to: t, date }, tl);
      setRecent(storage.load().recent);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (ctrl.current === c) setLoading(false);
    }
  };

  const applyDraft = () => {
    if (!draft) return;
    setTol(draft.tol);
    setVia(draft.via);
    setSeatPrefs(draft.seats);
    storage.saveFilters(draft.tol, draft.seats);
    setDraft(null);
    if (from && to) run({ tl: draft.tol, v: draft.via });
  };

  const setMode = (mode: ClassMode) => {
    setChoice((c) => (mode === "custom" ? { ...c, mode } : { mode, base: mode, overrides: {} }));
    if (mode !== "custom") storage.saveClassMode(mode);
  };
  const pickClass = (leg: Leg, cls: string) => {
    // Changing any train's class switches to Custom and keeps every other train's current pick.
    setChoice((c) => ({ mode: "custom", base: c.mode === "custom" ? c.base : c.mode, overrides: { ...c.overrides, [legId(leg)]: cls } }));
  };

  const sorted = useMemo(() => {
    if (!data) return [];
    let items: Journey[] = [...data.direct, ...data.alternates];
    if (filter !== "all") items = items.filter((j) => j.kind === filter || (filter === "connection" && j.kind === "through"));
    const by: Record<Sort, (a: Journey, b: Journey) => number> = {
      fastest: (a, b) => a.minutes - b.minutes || a.km - b.km,
      earliest: (a, b) => a.depart_at.localeCompare(b.depart_at),
      shortest: (a, b) => a.km - b.km || a.minutes - b.minutes,
    };
    return items.sort(by[sort]);
  }, [data, filter, sort]);

  // Seat checks need a RailRadar key, whichever source the timetable came from.
  const live = !!data?.data_source.live_configured;
  const q = seatPrefs.quota;

  // Hide routes whose seats are known to be waitlisted / regret / missing the class. Unchecked routes stay.
  const { list, hiddenBySeats, unchecked } = useMemo(() => {
    let hidden = 0;
    let open = 0;
    const out = sorted.filter((j) => {
      const s = journeySeat(j, seats, choice, q);
      if (!s) open++;
      if (seatPrefs.hide_unavailable && s && !isBookable(s, seatPrefs.rac_ok)) {
        hidden++;
        return false;
      }
      return true;
    });
    return { list: out, hiddenBySeats: hidden, unchecked: open };
  }, [sorted, seats, choice, q, seatPrefs]);

  // Auto-check seats for the first N visible routes (live only). When the filter hides some, later ones move up
  // and get checked, capped at 3xN per search so a fully booked corridor can't drain the monthly quota.
  const autoChecked = useRef(0);
  useEffect(() => {
    autoChecked.current = 0;
  }, [data, q]);
  useEffect(() => {
    const n = seatPrefs.auto_check;
    if (!live || n <= 0) return;
    const todo = list.slice(0, n).filter((j) => !journeySeat(j, seats, choice, q));
    const picks = todo.flatMap((j) => journeyPicks(j, choice, q)).filter((p) => !seats[p.key]);
    const budget = 3 * n * 2 - autoChecked.current; // ~2 legs per route
    if (!picks.length || budget <= 0) return;
    const send = picks.slice(0, budget);
    autoChecked.current += send.length;
    check(send, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, list, seatPrefs.auto_check, q, choice]);

  const seatErrors = useMemo(
    () => [...new Set(Object.values(seats).flatMap((s) => (s !== "loading" && s.error ? [s.error] : [])))].slice(0, 2),
    [seats],
  );

  const counts = data && {
    all: data.direct.length + data.alternates.length,
    direct: data.direct.length,
    nearby: data.alternates.filter((j) => j.kind === "nearby").length,
    connection: data.alternates.filter((j) => j.kind === "connection" || j.kind === "through").length,
  };

  return (
    <div className="planner">
      <form
        className="card search"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="row stations">
          <StationInput label="From" value={from} onChange={setFrom} placeholder="City or station code" />
          <button
            type="button"
            className="swap"
            aria-label="Swap stations"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            ⇄
          </button>
          <StationInput label="To" value={to} onChange={setTo} placeholder="City or station code" />
          <div className="field date">
            <label htmlFor="date">Journey date</label>
            <input id="date" type="date" value={date} min={todayIST()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Searching…" : "Find trains"}
          </button>
        </div>

        {recent.length > 0 && (
          <div className="recent">
            <span className="muted small">Recent</span>
            {recent.map((r) => (
              <button
                type="button"
                key={r.from.code + r.to.code}
                className="chip"
                onClick={() => {
                  setFrom(r.from);
                  setTo(r.to);
                  run({ f: r.from, t: r.to });
                }}
              >
                {r.from.code} → {r.to.code}
              </button>
            ))}
          </div>
        )}

        {draft ? (
          <FiltersPanel
            draft={draft}
            onChange={setDraft}
            onApply={applyDraft}
            onCancel={() => setDraft(null)}
            live={data ? live : undefined}
            month={usage?.month}
          />
        ) : (
          <div className="filter-bar">
            <div className="chips">
              {filterSummary(tol, via, seatPrefs).map((c) => (
                <span key={c} className="chip static">
                  {c}
                </span>
              ))}
            </div>
            <button type="button" className="ghost" onClick={() => setDraft({ tol, via, seats: seatPrefs })}>
              + Add filters
            </button>
          </div>
        )}
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {data && (
        <section className={`results ${loading ? "stale" : ""}`} aria-live="polite">
          <div className="summary">
            <SourceNote source={data.data_source} />
            <h2>
              {data.from.name} → {data.to.name}
              <span className="muted"> · {longDay(data.journey_date + "T12:00:00+05:30")}</span>
            </h2>
            {data.baseline ? (
              <p>
                {data.baseline.source === "direct" ? (
                  <>
                    Fastest direct <b>{duration(data.baseline.minutes)}</b>, shortest <b>{data.baseline.km} km</b>.{" "}
                  </>
                ) : (
                  <>
                    No direct train, so the best alternate sets the baseline: <b>{duration(data.baseline.minutes)}</b>, <b>{data.baseline.km} km</b>.{" "}
                  </>
                )}
                Alternates allowed up to{" "}
                <b>{data.baseline.max_minutes === null ? "any duration" : duration(data.baseline.max_minutes)}</b> and{" "}
                <b>{data.baseline.max_km === null ? "any distance" : `${data.baseline.max_km} km`}</b>.
              </p>
            ) : (
              <p>No trains found for this pair. Try a larger nearby radius or extra time.</p>
            )}
            {(data.nearby_stations.from.length > 0 || data.nearby_stations.to.length > 0) && (
              <p className="muted small">
                Also checking{" "}
                {[...data.nearby_stations.from, ...data.nearby_stations.to].map((s) => `${s.name} (${s.distance_km} km)`).join(", ")}
              </p>
            )}
          </div>

          {data.hidden_by_limits > 0 && (
            <p className="hidden-note">
              {data.hidden_by_limits} more route{data.hidden_by_limits === 1 ? "" : "s"}
              {data.params.via.length > 0 ? " through your via stations" : ""} exceed your time/distance limits
              {data.fastest_hidden_minutes !== null && <> (fastest takes {duration(data.fastest_hidden_minutes)})</>}.{" "}
              <button
                type="button"
                className="link"
                onClick={() => {
                  const next = { ...tol, no_time_limit: true, no_km_limit: true };
                  setTol(next);
                  storage.saveFilters(next, seatPrefs);
                  run({ tl: next });
                }}
              >
                Remove limits
              </button>
            </p>
          )}
          {data.hidden_by_sleep > 0 && (
            <p className="hidden-note">
              {data.hidden_by_sleep} route{data.hidden_by_sleep === 1 ? "" : "s"} hidden: no train on them allows {data.params.min_sleep_hours} h of sleep
              starting 9 pm–midnight.
            </p>
          )}

          {counts && counts.all > 0 && (
            <>
              <div className="classbar" role="radiogroup" aria-label="Seat class">
                <span className="muted small">Seat class</span>
                {(
                  [
                    ["best", "Best possible"],
                    ["cheapest", "Cheapest"],
                    ["custom", "Custom"],
                  ] as [ClassMode, string][]
                ).map(([m, label]) => (
                  <button key={m} type="button" role="radio" aria-checked={choice.mode === m} className={choice.mode === m ? "on" : ""} onClick={() => setMode(m)}>
                    {label}
                  </button>
                ))}
                <span className="muted small">
                  {choice.mode === "custom" ? "pick a class on each train below" : `${choice.mode === "best" ? "highest" : "lowest"} class each train has`}
                </span>
              </div>
              <div className="toolbar">
                <div className="tabs" role="tablist">
                  {(["all", "direct", "nearby", "connection"] as Filter[]).map((f) => (
                    <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)} disabled={counts[f] === 0 && f !== "all"}>
                      {{ all: "All", direct: "Direct", nearby: "Nearby station", connection: "With changes" }[f]} <span className="n">{counts[f]}</span>
                    </button>
                  ))}
                </div>
                <label className="sort">
                  Sort
                  <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="fastest">Fastest</option>
                    <option value="earliest">Earliest departure</option>
                    <option value="shortest">Shortest distance</option>
                  </select>
                </label>
              </div>
            </>
          )}

          {seatErrors.length > 0 && (
            <p className="error" role="alert">
              Seat check failed: {seatErrors.join(" · ")}
            </p>
          )}

          {live && (hiddenBySeats > 0 || unchecked > 0) && (
            <p className="seat-note">
              {hiddenBySeats > 0 && <>{hiddenBySeats} route{hiddenBySeats === 1 ? "" : "s"} hidden (waitlist or no seats). </>}
              {unchecked > 0 && (
                <>
                  {unchecked} route{unchecked === 1 ? "" : "s"} not checked yet.{" "}
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      check(
                        list
                          .filter((j) => !journeySeat(j, seats, choice, q))
                          .slice(0, 10)
                          .flatMap((j) => journeyPicks(j, choice, q)),
                        q,
                      )
                    }
                  >
                    Check seats for the next 10
                  </button>
                </>
              )}
            </p>
          )}

          <div className="list">
            {list.map((j) => (
              <JourneyCard
                key={j.kind + j.legs.map((l) => l.train.number + l.from.code).join("|")}
                j={j}
                route={data}
                seats={live ? seats : undefined}
                choice={choice}
                quota={q}
                onPickClass={(leg, cls) => {
                  pickClass(leg, cls);
                  const nextChoice: ClassChoice = {
                    mode: "custom",
                    base: choice.mode === "custom" ? choice.base : choice.mode,
                    overrides: { ...choice.overrides, [legId(leg)]: cls },
                  };
                  if (live) check(journeyPicks(j, nextChoice, q).filter((p) => p.leg === leg), q);
                }}
                onCheckSeats={() => check(journeyPicks(j, choice, q), q)}
                onRefreshSeats={() => check(journeyPicks(j, choice, q), q, true)}
              />
            ))}
          </div>
          {data.alternates.length >= limit && (
            <button type="button" className="more" disabled={loading} onClick={() => run({ lim: limit + PAGE })}>
              {loading ? "Loading…" : "Show more alternates"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
