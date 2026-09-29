import { DEFAULT_SEATS, DEFAULT_TOLERANCE, type SeatPrefs, type Tolerance, type TrainRef, type ViaStop } from "../types";
import { TrainPicker } from "./TrainPicker";
import { NumberField, Slider } from "./controls";
import { ViaPicker } from "./ViaPicker";

const QUOTAS: [string, string][] = [
  ["GN", "General"],
  ["TQ", "Tatkal"],
  ["PT", "Premium Tatkal"],
  ["LD", "Ladies"],
  ["SS", "Senior citizen"],
];

export type Draft = { tol: Tolerance; via: ViaStop[]; trains: TrainRef[]; seats: SeatPrefs };

type Props = {
  draft: Draft;
  onChange: (d: Draft) => void;
  onApply?: () => void; // Apply is the form's submit button; the parent handles it
  onCancel: () => void;
  live?: boolean;
  month?: number;
};

/** Filters are edited here as a draft; nothing is searched until Apply. */
export function FiltersPanel({ draft, onChange, onCancel, live, month }: Props) {
  const { tol, via, seats } = draft;
  const setTol = (patch: Partial<Tolerance>) => onChange({ ...draft, tol: { ...tol, ...patch } });
  const setSeats = (patch: Partial<SeatPrefs>) => onChange({ ...draft, seats: { ...seats, ...patch } });

  return (
    <div className="filters">
      <ViaPicker
        via={via}
        onChange={(v) => onChange({ ...draft, via: v, tol: v.length > tol.max_changes ? { ...tol, max_changes: v.length } : tol })}
      />

      <TrainPicker trains={draft.trains} onChange={(t) => onChange({ ...draft, trains: t })} />

      <fieldset className="tolerance">
        <legend>Route</legend>
        <Slider label="Max changes" unit="" range={6} step={1} integer value={tol.max_changes} onChange={(v) => setTol({ max_changes: v })} hint="0 = direct trains only" />
        <Slider
          label="Extra travel time" unit="h" range={24} step={0.5} value={tol.extra_hours} onChange={(v) => setTol({ extra_hours: v })}
          hint="over the fastest direct train" unlimited={tol.no_time_limit} onUnlimited={(v) => setTol({ no_time_limit: v })}
        />
        <Slider
          label="Extra distance" unit="km" range={1000} step={10} value={tol.extra_km} onChange={(v) => setTol({ extra_km: v })}
          hint="over the shortest direct train" unlimited={tol.no_km_limit} onUnlimited={(v) => setTol({ no_km_limit: v })}
        />
        <Slider label="Nearby stations within" unit="km" range={50} step={1} value={tol.nearby_km} onChange={(v) => setTol({ nearby_km: v })} hint="0 turns nearby boarding off" />
        <Slider label="Minimum change time" unit="min" range={180} step={5} integer value={tol.min_transfer_min} onChange={(v) => setTol({ min_transfer_min: v })} hint="at each change" />
        <Slider
          label="Maximum wait at a station" unit="h" range={24} step={0.5} value={tol.max_wait_hours} onChange={(v) => setTol({ max_wait_hours: v })}
          hint="on top of any planned stop" unlimited={tol.no_wait_limit} onUnlimited={(v) => setTol({ no_wait_limit: v })}
        />
        <label className="check">
          <input type="checkbox" checked={tol.include_unreserved} onChange={(e) => setTol({ include_unreserved: e.target.checked })} />
          Include unreserved passenger / MEMU trains
        </label>
      </fieldset>

      <fieldset className="tolerance sleep-set">
        <legend>Sleep</legend>
        <label className="switch">
          <input type="checkbox" role="switch" checked={tol.sleep_on} onChange={(e) => setTol({ sleep_on: e.target.checked })} />
          <span>Do you want a certain amount of sleep on the train?</span>
        </label>
        {tol.sleep_on && (
          <div className="sleep-hours">
            <label htmlFor="sleep-hours">Minimum sleep</label>
            <span className="inline">
              <NumberField id="sleep-hours" value={tol.sleep_hours} onChange={(v) => setTol({ sleep_hours: v })} step={0.5} label="Minimum sleep (hours)" />
              hours
            </span>
            <p className="hint small">
              Sleep starts between 9 pm and midnight (at 9 pm, or when the train leaves if that's later) and must fit on one train. For
              example, a 22:30 departure with {tol.sleep_hours} h needs the train to run until{" "}
              {fmtClock(22 * 60 + 30 + tol.sleep_hours * 60)}. On that train, seats are checked in berth classes only.
            </p>
          </div>
        )}
      </fieldset>

      <fieldset className="tolerance seats-set">
        <legend>Seat availability</legend>
        <div className="field">
          <label htmlFor="seat-quota">Quota</label>
          <select id="seat-quota" value={seats.quota} onChange={(e) => setSeats({ quota: e.target.value })}>
            {QUOTAS.map(([c, n]) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="seat-auto">Auto-check first</label>
          <span className="inline">
            <NumberField id="seat-auto" value={seats.auto_check} onChange={(v) => setSeats({ auto_check: v })} integer label="Auto-check first (routes)" />
            routes
          </span>
        </div>
        <div className="checks">
          <label className="check">
            <input type="checkbox" checked={seats.hide_unavailable} onChange={(e) => setSeats({ hide_unavailable: e.target.checked })} />
            Hide routes with waitlist / no seats
          </label>
          <label className="check">
            <input type="checkbox" checked={seats.rac_ok} onChange={(e) => setSeats({ rac_ok: e.target.checked })} />
            Count RAC as available
          </label>
        </div>
        <p className="hint small">
          {live === false
            ? "Seat availability needs live data (RailRadar key)."
            : `Each train leg is one RailRadar request (cached 15 min). 0 turns auto-check off; you can still check any route by hand.${
                month != null ? ` ${month} requests used this month.` : ""
              }`}
        </p>
      </fieldset>

      <div className="filters-actions">
        <button type="button" className="link" onClick={() => onChange({ tol: DEFAULT_TOLERANCE, via: [], trains: [], seats: DEFAULT_SEATS })}>
          Reset to defaults
        </button>
        <span className="spacer" />
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Apply &amp; find trains
        </button>
      </div>
    </div>
  );
}

function fmtClock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const day = Math.floor(min / 1440);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}${day > 0 ? " next day" : ""}`;
}

/** One-line summary of the applied filters, shown while the panel is closed. */
export function filterSummary(tol: Tolerance, via: ViaStop[], seats: SeatPrefs): string[] {
  const chips = [
    tol.max_changes === 0 ? "Direct only" : `Up to ${tol.max_changes} change${tol.max_changes === 1 ? "" : "s"}`,
    tol.no_time_limit ? "Any duration" : `+${tol.extra_hours} h`,
    tol.no_km_limit ? "Any distance" : `+${tol.extra_km} km`,
  ];
  if (via.length)
    chips.push(
      `Via ${via
        .map((v) => [v.code, v.radius_km ? `±${v.radius_km} km` : "", v.stay_h ? `${v.stay_h} h stop` : ""].filter(Boolean).join(" "))
        .join(" → ")}`,
    );
  if (!tol.no_wait_limit) chips.push(`Wait ≤ ${tol.max_wait_hours} h`);
  if (tol.sleep_on) chips.push(`Sleep ${tol.sleep_hours} h`);
  if (seats.quota !== "GN") chips.push(QUOTAS.find(([c]) => c === seats.quota)?.[1] ?? seats.quota);
  if (seats.hide_unavailable) chips.push(seats.rac_ok ? "Seats/RAC only" : "Confirmed seats only");
  if (tol.nearby_km !== DEFAULT_TOLERANCE.nearby_km) chips.push(`Nearby ${tol.nearby_km} km`);
  if (tol.min_transfer_min !== DEFAULT_TOLERANCE.min_transfer_min) chips.push(`Change ≥ ${tol.min_transfer_min} min`);
  if (tol.include_unreserved) chips.push("Incl. unreserved");
  return chips;
}
