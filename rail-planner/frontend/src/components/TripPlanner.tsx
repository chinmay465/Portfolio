import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { duration, longDay, todayIST } from "../format";
import { storage, type SavedTrip } from "../storage";
import { DEFAULT_TOLERANCE, type Journey, type RouteResponse, type StationHit, type Tolerance } from "../types";
import { JourneyCard } from "./JourneyCard";
import { SourceNote } from "./SourceNote";
import { StationInput } from "./StationInput";
import { ViaPicker } from "./ViaPicker";

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
  const [tol, setTol] = useState<Tolerance>(saved.tolerance);
  const [via, setVia] = useState<StationHit[]>([]);
  const [recent, setRecent] = useState<SavedTrip[]>(saved.recent);

  const [data, setData] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("fastest");
  const [limit, setLimit] = useState(PAGE);
  const ctrl = useRef<AbortController | null>(null);

  const run = async (f = from, t = to, d = date, tl = tol, lim = PAGE, v = via) => {
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
      const res = await api.routes(f.code, t.code, d, tl, v.map((s) => s.code), lim, c.signal);
      setData(res);
      setLimit(lim);
      storage.remember({ from: f, to: t, date: d }, tl);
      setRecent(storage.load().recent);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (ctrl.current === c) setLoading(false);
    }
  };

  // Re-run automatically when tolerances change after a search.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!data) return;
    const t = setTimeout(() => run(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tol, via]);

  const list = useMemo(() => {
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

  const counts = data && {
    all: data.direct.length + data.alternates.length,
    direct: data.direct.length,
    nearby: data.alternates.filter((j) => j.kind === "nearby").length,
    connection: data.alternates.filter((j) => j.kind === "connection" || j.kind === "through").length,
  };

  const setNum = (k: keyof Tolerance) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.valueAsNumber;
    if (!Number.isNaN(v)) setTol((t) => ({ ...t, [k]: v }));
  };
  const isDefault = JSON.stringify(tol) === JSON.stringify(DEFAULT_TOLERANCE);

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

        <ViaPicker
          via={via}
          onChange={(v) => {
            setVia(v);
            if (v.length > tol.max_changes) setTol((t) => ({ ...t, max_changes: v.length }));
          }}
        />

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
                  run(r.from, r.to, date);
                }}
              >
                {r.from.code} → {r.to.code}
              </button>
            ))}
          </div>
        )}

        <fieldset className="tolerance">
          <legend>
            Alternate routes
            {!isDefault && (
              <button type="button" className="link" onClick={() => setTol(DEFAULT_TOLERANCE)}>
                Reset to defaults
              </button>
            )}
          </legend>
          <Slider
            label="Extra travel time" unit="h" range={24} step={0.5} value={tol.extra_hours} onChange={setNum("extra_hours")}
            hint="over the fastest direct train" unlimited={tol.no_time_limit}
            onUnlimited={(v) => setTol((t) => ({ ...t, no_time_limit: v }))}
          />
          <Slider
            label="Extra distance" unit="km" range={1000} step={10} value={tol.extra_km} onChange={setNum("extra_km")}
            hint="over the shortest direct train" unlimited={tol.no_km_limit}
            onUnlimited={(v) => setTol((t) => ({ ...t, no_km_limit: v }))}
          />
          <Slider
            label="Max changes" unit="" range={6} step={1} value={tol.max_changes} onChange={setNum("max_changes")}
            hint="0 = direct trains only"
          />
          <Slider label="Nearby stations within" unit="km" range={50} step={1} value={tol.nearby_km} onChange={setNum("nearby_km")} hint="0 turns nearby boarding off" />
          <Slider label="Minimum change time" unit="min" range={180} step={5} value={tol.min_transfer_min} onChange={setNum("min_transfer_min")} hint="at each change" />
          <label className="check">
            <input type="checkbox" checked={tol.include_unreserved} onChange={(e) => setTol((t) => ({ ...t, include_unreserved: e.target.checked }))} />
            Include unreserved passenger / MEMU trains
          </label>
        </fieldset>
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
              <button type="button" className="link" onClick={() => setTol((t) => ({ ...t, no_time_limit: true, no_km_limit: true }))}>
                Remove limits
              </button>
            </p>
          )}

          {counts && counts.all > 0 && (
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
          )}

          <div className="list">
            {list.map((j) => (
              <JourneyCard key={j.kind + j.legs.map((l) => l.train.number + l.from.code).join("|")} j={j} route={data} />
            ))}
          </div>
          {data.alternates.length >= limit && (
            <button type="button" className="more" disabled={loading} onClick={() => run(from, to, date, tol, limit + PAGE)}>
              {loading ? "Loading…" : "Show more alternates"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

type SliderProps = {
  label: string;
  unit: string;
  range: number; // slider track length only; the number box accepts any value
  step: number;
  value: number;
  hint: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  unlimited?: boolean;
  onUnlimited?: (v: boolean) => void;
};

function Slider({ label, unit, range, step, value, hint, onChange, unlimited, onUnlimited }: SliderProps) {
  const max = Math.max(range, value);
  return (
    <div className={`slider ${unlimited ? "off" : ""}`}>
      <div className="slider-top">
        <span>{label}</span>
        <span className="val">
          {unlimited ? (
            <span className="nolimit">No limit</span>
          ) : (
            <>
              <input type="number" min={0} step={step} value={value} onChange={onChange} aria-label={`${label} (${unit})`} />
              {unit}
            </>
          )}
        </span>
      </div>
      <input type="range" min={0} max={max} step={step} value={value} onChange={onChange} aria-label={label} disabled={unlimited} />
      <span className="hint">
        {hint}
        {onUnlimited && (
          <label className="nl">
            <input type="checkbox" checked={!!unlimited} onChange={(e) => onUnlimited(e.target.checked)} /> No limit
          </label>
        )}
      </span>
    </div>
  );
}
