export type StationRef = { code: string; name: string };
export type StationHit = StationRef & { state: string };

export type WindowKind = "general" | "tatkal_ac" | "tatkal_non_ac";
export type WindowStatus = "upcoming" | "open" | "departed";

export type BookingWindow = {
  kind: WindowKind;
  label: string;
  opens_at: string;
  status: WindowStatus;
  classes: string[];
  note: string;
};

export type Leg = {
  train: { number: string; name: string; type: string; classes: string[]; reserved: boolean; runs_on: string[] };
  from: StationRef;
  to: StationRef;
  passes: StationRef[];
  depart_at: string;
  arrive_at: string;
  minutes: number;
  km: number;
  origin_date: string;
  booking_windows: BookingWindow[];
};

export type Journey = {
  kind: "direct" | "nearby" | "connection" | "through";
  depart_at: string;
  arrive_at: string;
  minutes: number;
  km: number;
  extra_minutes: number | null;
  extra_km: number | null;
  legs: Leg[];
  transfer: Transfer | null;
  transfers: Transfer[];
  changes: number;
  via: StationRef[];
  access: { board_offset_km: number; alight_offset_km: number };
  sleep: { leg: number; train: string; start: string; end: string; hours: number } | null;
  max_sleep_minutes: number;
};

export type Transfer = { station: StationRef; wait_minutes: number; tight: boolean };

export type DataSource = {
  kind: "live" | "snapshot" | null;
  live_configured?: boolean;
  requests?: number;
  cache_hits?: number;
  month_requests?: number | null;
  warnings: string[];
};

export type NearbyStation = StationRef & { distance_km: number };

export type RouteResponse = {
  from: StationRef & { state: string };
  to: StationRef & { state: string };
  journey_date: string;
  params: Omit<Tolerance, "extra_hours" | "extra_km" | "no_time_limit" | "no_km_limit" | "sleep_on" | "sleep_hours"> & {
    min_sleep_hours: number | null;
    via: string[];
    extra_hours: number | null;
    extra_km: number | null;
  };
  data_source: DataSource;
  hidden_by_limits: number;
  hidden_by_sleep: number;
  fastest_hidden_minutes: number | null;
  baseline: null | {
    minutes: number;
    km: number;
    source: "direct" | "best_alternate";
    max_minutes: number | null; // null = no limit
    max_km: number | null;
  };
  nearby_stations: { from: NearbyStation[]; to: NearbyStation[] };
  direct: Journey[];
  alternates: Journey[];
};

export type Tolerance = {
  extra_hours: number;
  extra_km: number;
  no_time_limit: boolean;
  no_km_limit: boolean;
  max_changes: number;
  nearby_km: number;
  min_transfer_min: number;
  include_unreserved: boolean;
  sleep_on: boolean; // want uninterrupted sleep on one train?
  sleep_hours: number; // how much, starting 21:00-24:00
};

export type WindowsResponse = {
  journey_date: string;
  origin_date: string;
  train: null | {
    number: string;
    name: string;
    board: StationRef;
    board_day: number;
    classes: string[];
    reserved: boolean;
    runs_on: string[];
    runs_on_date: boolean;
  };
  windows: BookingWindow[];
  data_source: DataSource;
};

export const DEFAULT_TOLERANCE: Tolerance = {
  extra_hours: 5,
  extra_km: 100,
  no_time_limit: false,
  no_km_limit: false,
  max_changes: 2,
  nearby_km: 15,
  min_transfer_min: 20,
  include_unreserved: false,
  sleep_on: false,
  sleep_hours: 8,
};

export type SeatCategory = "available" | "rac" | "waitlist" | "regret" | "closed" | "no_class" | "unknown";

export type SeatResult = {
  train: string;
  from: string;
  to: string;
  date: string;
  cls: string;
  checked_cls: string | null; // class actually checked (nearest one when the train lacks `cls`)
  quota: string;
  category: SeatCategory;
  count: number | null;
  label: string;
  raw: string;
  prediction: string | null;
  prediction_pct: number | null;
  checked_at: string | null;
  error?: string;
};

export type SeatsResponse = {
  source: "live" | null;
  results: SeatResult[];
  requests?: number;
  cache_hits?: number;
  month_requests?: number;
  message?: string;
};

export type ClassMode = "best" | "cheapest" | "custom";

export type SeatPrefs = {
  quota: string;
  auto_check: number; // check seats for the first N results automatically (0 = off)
  hide_unavailable: boolean; // hide routes with any waitlisted / regret / closed / missing-class leg
  rac_ok: boolean; // treat RAC as bookable
};

export const DEFAULT_SEATS: SeatPrefs = { quota: "GN", auto_check: 3, hide_unavailable: false, rac_ok: true };

/** Which class to check on each train: Best/Cheapest pick per train from its own classes; Custom = per-train overrides. */
export type ClassChoice = {
  mode: ClassMode;
  base: "best" | "cheapest"; // what non-overridden trains use while in Custom
  overrides: Record<string, string>; // legId -> class
};

export const seatKey = (train: string, from: string, to: string, date: string, cls: string, quota: string) =>
  [train, from, to, date, cls, quota].join("|");
