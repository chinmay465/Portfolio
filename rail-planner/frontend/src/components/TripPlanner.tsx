import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { clock, day, duration, longDay, todayIST } from "../format";
import { isBookable, journeyPicks, journeySeat, legId, useSeats } from "../seats";
import { storage, type SavedTrip } from "../storage";
import type { ClassChoice, ClassMode, KindFilter, Leg, ListQuery, RouteResponse, SeatPrefs, SortKey, SortOrder, StationHit, Tolerance, TrainRef, ViaStop } from "../types";
import { FiltersPanel, filterSummary, type Draft } from "./FiltersPanel";
import { JourneyCard } from "./JourneyCard";
import { SourceNote } from "./SourceNote";
import { StationInput } from "./StationInput";

const PAGE_SIZES = [10, 25, 50, 100, 0]; // 0 = all on one page
const pageSizeKey = "rail-planner:page-size";
function savedPageSize(): number {
  try {
    const n = Number(localStorage.getItem(pageSizeKey));
    return PAGE_SIZES.includes(n) && localStorage.getItem(pageSizeKey) !== null ? n : 25;
  } catch {
    return 25;
  }
}

type Sort = SortKey;
type Dir = SortOrder;
type Filter = KindFilter;

// Each sort, with what ascending/descending mean for it.
const SORTS: Record<Sort, { label: string; asc: string; desc: string }> = {
  duration: { label: "Travel time", asc: "shortest first", desc: "longest first" },
  departure: { label: "Departure", asc: "earliest first", desc: "latest first" },
  arrival: { label: "Arrival", asc: "earliest first", desc: "latest first" },
  distance: { label: "Distance", asc: "shortest first", desc: "longest first" },
  changes: { label: "Changes", asc: "fewest first", desc: "most first" },
};

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
  const [via, setVia] = useState<ViaStop[]>([]);
  const [trains, setTrains] = useState<TrainRef[]>([]);
  const [seatPrefs, setSeatPrefs] = useState<SeatPrefs>(saved.seats);
  const [draft, setDraft] = useState<Draft | null>(null);

  const [choice, setChoice] = useState<ClassChoice>({ mode: saved.classMode, base: saved.classMode, overrides: {} });

  const [data, setData] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("duration");
  const [dir, setDir] = useState<Dir>("asc");
  const [pageSize, setPageSize] = useState(savedPageSize);
  const [page, setPage] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const { seats, check, usage } = useSeats();

  const run = async (
    opts: {
      f?: StationHit | null;
      t?: StationHit | null;
      tl?: Tolerance;
      v?: ViaStop[];
      tr?: TrainRef[];
      q?: Partial<ListQuery>;
      size?: number;
      pg?: number; // page index; any change other than paging goes back to page 0
    } = {},
  ) => {
    const q: ListQuery = { sort, order: dir, kind: filter, ...opts.q };
    const f = opts.f ?? from;
    const t = opts.t ?? to;
    const tl = opts.tl ?? tol;
    const v = opts.v ?? via;
    const tr = opts.tr ?? trains;
    const size = opts.size ?? pageSize;
    const pg = opts.pg ?? 0;
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
      const res = await api.routes(f.code, t.code, date, tl, v, tr, q, size, pg * size, c.signal);
      setData(res);
      setPage(pg);
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
    setTrains(draft.trains);
    setSeatPrefs(draft.seats);
    storage.saveFilters(draft.tol, draft.seats);
    setDraft(null);
    if (from && to) run({ tl: draft.tol, v: draft.via, tr: draft.trains });
  };

  // Quick add/remove of a train from a result card or a chip: searches straight away.
  const setTrainsAndRun = (next: TrainRef[]) => {
    setTrains(next);
    if (from && to) run({ tr: next });
  };

  const setMode = (mode: ClassMode) => {
    setChoice((c) => (mode === "custom" ? { ...c, mode } : { mode, base: mode, overrides: {} }));
    if (mode !== "custom") storage.saveClassMode(mode);
  };
  const pickClass = (leg: Leg, cls: string) => {
    // Changing any train's class switches to Custom and keeps every other train's current pick.
    setChoice((c) => ({ mode: "custom", base: c.mode === "custom" ? c.base : c.mode, overrides: { ...c.overrides, [legId(leg)]: cls } }));
  };

  // Sorting and the Direct / Nearby / With-changes tabs are done by the server over every route;
  // the page shows them in the order received.
  const sorted = useMemo(() => data?.results ?? [], [data]);
  const setQuery = (q: Partial<ListQuery>) => {
    if (q.sort) setSort(q.sort);
    if (q.order) setDir(q.order);
    if (q.kind) setFilter(q.kind);
    if (data) run({ q });
  };

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

  const counts = data?.counts;

  return (
    <div className="planner">
      <form
        className="card search"
        onSubmit={(e) => {
          e.preventDefault();
          // One trigger at a time: while filters are open, Enter means Apply.
          if (draft) applyDraft();
          else run();
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
          {!draft && (
            <button type="submit" className="primary" disabled={loading}>
              {loading ? "Searching…" : "Find trains"}
            </button>
          )}
        </div>

        {!draft && recent.length > 0 && (
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
              {trains.map((t) => (
                <span key={t.number} className="chip static train-chip">
                  Train {t.number}
                  <button
                    type="button"
                    aria-label={`Stop filtering by train ${t.number}`}
                    disabled={loading}
                    onClick={() => setTrainsAndRun(trains.filter((x) => x.number !== t.number))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <button type="button" className="ghost" onClick={() => setDraft({ tol, via, trains, seats: seatPrefs })}>
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
            {data.params.via_groups.some((g) => g.radius_km > 0) && (
              <p className="muted small">
                {data.params.via_groups
                  .filter((g) => g.radius_km > 0)
                  .map(
                    (g) =>
                      `Via ${g.stations[0]?.name ?? g.code} ± ${g.radius_km} km counts ${g.stations.length} station${g.stations.length === 1 ? "" : "s"}: ${g.stations.map((x) => x.code).join(", ")}`,
                  )
                  .join(" · ")}
              </p>
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
              {data.params.via.length > 0 ? " through your via stations" : ""}
              {data.params.trains.length > 0 ? ` using train ${data.params.trains.join(" / ")}` : ""} exceed your time/distance/wait limits
              {data.fastest_hidden_minutes !== null && <> (fastest takes {duration(data.fastest_hidden_minutes)})</>}.{" "}
              <button
                type="button"
                className="link"
                disabled={!!draft}
                title={draft ? "Apply or cancel your filter changes first" : undefined}
                onClick={() => {
                  const next = { ...tol, no_time_limit: true, no_km_limit: true, no_wait_limit: true };
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

          {data.results.length === 0 && (data.params.depart_after || data.params.arrive_by) && (
            <p className="hidden-note">
              No routes
              {data.params.depart_after && <> leave at or after {data.params.depart_after}</>}
              {data.params.depart_after && data.params.arrive_by && " and"}
              {data.params.arrive_by && <> reach {data.to.name} by {day(data.params.arrive_by)} {clock(data.params.arrive_by)}</>} within your
              other filters. Try an earlier start, a later deadline, or more changes.
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
                    <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setQuery({ kind: f })} disabled={!!draft || (counts[f] === 0 && f !== "all")}>
                      {{ all: "All", direct: "Direct", nearby: "Nearby station", connection: "With changes" }[f]} <span className="n">{counts[f]}</span>
                    </button>
                  ))}
                </div>
                <div className="sort">
                  <label htmlFor="sort-key">Sort</label>
                  <select id="sort-key" value={sort} disabled={!!draft} onChange={(e) => setQuery({ sort: e.target.value as Sort })}>
                    {(Object.keys(SORTS) as Sort[]).map((k) => (
                      <option key={k} value={k}>
                        {SORTS[k].label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="sort-dir"
                    disabled={!!draft}
                    onClick={() => setQuery({ order: dir === "asc" ? "desc" : "asc" })}
                    aria-label={`Sort ${dir === "asc" ? "ascending" : "descending"}: ${SORTS[sort][dir]}. Click to reverse.`}
                    title="Reverse order"
                  >
                    {dir === "asc" ? "↑" : "↓"} {SORTS[sort][dir]}
                  </button>
                </div>
              </div>
              <p className="muted small sorted-note">
                {data.total} route{data.total === 1 ? "" : "s"}, sorted by {SORTS[data.sort.by].label.toLowerCase()},{" "}
                {SORTS[data.sort.by][data.sort.order]}
                {data.total > data.results.length && (
                  <>
                    {" "}
                    · showing {data.offset + 1}–{data.offset + data.results.length}
                  </>
                )}
              </p>
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
                pinned={trains.map((t) => t.number)}
                onPinTrain={
                  draft
                    ? undefined
                    : (t) =>
                        setTrainsAndRun(
                          trains.some((x) => x.number === t.number) ? trains.filter((x) => x.number !== t.number) : [...trains, t],
                        )
                }
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
          <Pager
            total={data.total}
            offset={data.offset}
            count={data.results.length}
            page={page}
            pageSize={pageSize}
            disabled={loading || !!draft}
            onPage={(pg) => {
              run({ pg });
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onPageSize={(n) => {
              setPageSize(n);
              try {
                localStorage.setItem(pageSizeKey, String(n));
              } catch {
                /* storage unavailable */
              }
              run({ size: n });
            }}
          />
        </section>
      )}
    </div>
  );
}

function Pager(props: {
  total: number;
  offset: number;
  count: number;
  page: number;
  pageSize: number;
  disabled: boolean;
  onPage: (pg: number) => void;
  onPageSize: (n: number) => void;
}) {
  const { total, offset, count, page, pageSize, disabled, onPage, onPageSize } = props;
  const pages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <nav className="pager" aria-label="Results pages">
      <label className="page-size">
        Results per page
        <select value={pageSize} disabled={disabled} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? `All (${total})` : n}
            </option>
          ))}
        </select>
      </label>
      {pages > 1 && (
        <div className="pages">
          <button type="button" disabled={disabled || page === 0} onClick={() => onPage(page - 1)}>
            ‹ Prev
          </button>
          <span>
            Page {page + 1} of {pages} · {offset + 1}–{offset + count} of {total}
          </span>
          <button type="button" disabled={disabled || page >= pages - 1} onClick={() => onPage(page + 1)}>
            Next ›
          </button>
        </div>
      )}
    </nav>
  );
}
