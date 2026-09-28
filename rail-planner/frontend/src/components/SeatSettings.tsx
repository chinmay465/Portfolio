import type { SeatPrefs } from "../types";

const CLASSES = ["SL", "3A", "3E", "2A", "1A", "CC", "EC", "2S"];
const QUOTAS: [string, string][] = [
  ["GN", "General"],
  ["TQ", "Tatkal"],
  ["PT", "Premium Tatkal"],
  ["LD", "Ladies"],
  ["SS", "Senior citizen"],
];

type Props = { prefs: SeatPrefs; onChange: (p: SeatPrefs) => void; live?: boolean; month?: number; message?: string };

export function SeatSettings({ prefs, onChange, live, month, message }: Props) {
  const set = <K extends keyof SeatPrefs>(k: K, v: SeatPrefs[K]) => onChange({ ...prefs, [k]: v });
  return (
    <fieldset className="tolerance seats-set">
      <legend>Seat availability</legend>
      <div className="field">
        <label htmlFor="seat-cls">Class</label>
        <select id="seat-cls" value={prefs.cls} onChange={(e) => set("cls", e.target.value)}>
          {CLASSES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="seat-quota">Quota</label>
        <select id="seat-quota" value={prefs.quota} onChange={(e) => set("quota", e.target.value)}>
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
          <input
            id="seat-auto"
            type="number"
            min={0}
            value={prefs.auto_check}
            onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && set("auto_check", Math.max(0, Math.floor(e.target.valueAsNumber)))}
          />
          routes
        </span>
      </div>
      <div className="checks">
        <label className="check">
          <input type="checkbox" checked={prefs.hide_unavailable} onChange={(e) => set("hide_unavailable", e.target.checked)} />
          Hide routes with waitlist / no seats
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.rac_ok} onChange={(e) => set("rac_ok", e.target.checked)} />
          Count RAC as available
        </label>
      </div>
      <p className="hint small">
        {live === false || message
          ? message ?? "Seat availability needs live data (RailRadar key)."
          : `Each train leg costs one RailRadar request (cached 15 min). A multi-change route costs one per leg.${month != null ? ` ${month} requests used this month.` : ""}`}
      </p>
    </fieldset>
  );
}
