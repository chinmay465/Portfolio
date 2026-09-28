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
  params: Omit<Tolerance, "extra_hours" | "extra_km" | "no_time_limit" | "no_km_limit"> & {
    via: string[];
    extra_hours: number | null;
    extra_km: number | null;
  };
  data_source: DataSource;
  hidden_by_limits: number;
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
  extra_hours: 3,
  extra_km: 150,
  no_time_limit: false,
  no_km_limit: false,
  max_changes: 1,
  nearby_km: 15,
  min_transfer_min: 20,
  include_unreserved: false,
};
