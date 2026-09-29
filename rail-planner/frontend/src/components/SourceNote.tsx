import type { DataSource } from "../types";

function asOf(value?: string | null): string {
  if (!value) return "undated";
  const [y, m] = value.split("-");
  return m ? new Date(Number(y), Number(m) - 1).toLocaleString("en-IN", { month: "short", year: "numeric" }) : y;
}

export function SourceNote({ source }: { source: DataSource }) {
  const live = source.kind === "live";
  return (
    <div className={`source ${live ? "live" : "stale"}`} role={live ? undefined : "note"}>
      {live ? (
        <span>
          <b>Live timetable</b> from RailRadar
          {source.requests !== undefined && (
            <span className="muted">
              {" "}
              · {source.requests} API request{source.requests === 1 ? "" : "s"}, {source.cache_hits} cached
              {source.month_requests != null && ` · ${source.month_requests} this month`}
            </span>
          )}
        </span>
      ) : source.run_days ? (
        <span>
          <b>Stored timetable ({asOf(source.as_of)}).</b> Running days are included, but trains and times may have changed
          since, and specials (0xxxx) may no longer run. Check on IRCTC or RailOne before booking.
        </span>
      ) : (
        <span>
          <b>Offline snapshot ({asOf(source.as_of)}).</b> Some trains may be withdrawn and running days aren't known, so every
          train is shown as daily. Check on IRCTC or RailOne before booking.
        </span>
      )}
      {source.warnings.map((w) => (
        <span key={w} className="warn">
          {w}
        </span>
      ))}
    </div>
  );
}
