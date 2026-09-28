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
  train: { number: string; name: string; type: string; classes: string[]; reserved: boolean };
  from: StationRef;
  to: StationRef;
  depart_at: string;
  arrive_at: string;
  minutes: number;
  km: number;
  origin_date: string;
  booking_windows: BookingWindow[];
};

export type Journey = {
  kind: "direct" | "nearby" | "connection";
  depart_at: string;
  arrive_at: string;
  minutes: number;
  km: number;
  extra_minutes: number | null;
  extra_km: number | null;
  legs: Leg[];
  transfer: { station: StationRef; wait_minutes: number } | null;
  access: { board_offset_km: number; alight_offset_km: number };
};

export type NearbyStation = StationRef & { distance_km: number };

export type RouteResponse = {
  from: StationRef & { state: string };
  to: StationRef & { state: string };
  journey_date: string;
  params: Tolerance;
  baseline: null | {
    minutes: number;
    km: number;
    source: "direct" | "best_alternate";
    max_minutes: number;
    max_km: number;
  };
  nearby_stations: { from: NearbyStation[]; to: NearbyStation[] };
  direct: Journey[];
  alternates: Journey[];
};

export type Tolerance = {
  extra_hours: number;
  extra_km: number;
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
  };
  windows: BookingWindow[];
};

export const DEFAULT_TOLERANCE: Tolerance = {
  extra_hours: 3,
  extra_km: 150,
  nearby_km: 15,
  min_transfer_min: 45,
  include_unreserved: false,
};
