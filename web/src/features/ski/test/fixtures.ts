import type { components } from "@/shared/api/schema";

type Schemas = components["schemas"];

export const RESORT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
export const RESORT_2_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
export const ME_REF: Schemas["PersonRefOut"] = {
  person_id: "7b9f6d52-5d3a-4c53-9a3e-1d0c3f4d9b11",
  display_name: "Mateo",
};
export const LUCIA_REF: Schemas["PersonRefOut"] = {
  person_id: "33333333-3333-4333-8333-333333333333",
  display_name: "Lucia Gomez",
};

export function makeResort(overrides: Partial<Schemas["ResortOut"]> = {}): Schemas["ResortOut"] {
  return {
    id: RESORT_ID,
    slug: "cerro-catedral",
    name: "Cerro Catedral",
    country: "AR",
    region: "Rio Negro",
    lat: -41.17,
    lng: -71.44,
    base_elev_m: 1030,
    summit_elev_m: 2100,
    website_url: "",
    ...overrides,
  };
}

export function makeReport(overrides: Partial<Schemas["SnowReportOut"]> = {}): Schemas["SnowReportOut"] {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    source: "open_meteo",
    observed_at: "2027-07-02T10:00:00Z",
    fetched_at: "2027-07-02T10:05:00Z",
    base_cm: 120,
    new_24h_cm: 15.5,
    forecast_72h_cm: 30,
    temp_c: -4,
    lifts_open: null,
    lifts_total: null,
    runs_open: null,
    runs_total: null,
    status_text: "",
    reporter: null,
    stale: false,
    age_hours: 2,
    ...overrides,
  };
}

export function makeTripResort(overrides: Partial<Schemas["TripResortOut"]> = {}): Schemas["TripResortOut"] {
  return { resort: makeResort(), nights: 5, position: 0, latest_report: makeReport(), ...overrides };
}

export function makePassRow(overrides: Partial<Schemas["PassRowOut"]> = {}): Schemas["PassRowOut"] {
  return {
    person: LUCIA_REF,
    resort_id: RESORT_ID,
    product: "Pase 5 dias",
    days: 5,
    status: "bought",
    price: "250.00",
    currency: "USD",
    ...overrides,
  };
}

export function makeOverview(overrides: Partial<Schemas["SkiOverviewOut"]> = {}): Schemas["SkiOverviewOut"] {
  return {
    resorts: [makeTripResort()],
    passes: { rows: [makePassRow()], missing: [{ person: ME_REF, resort_id: RESORT_ID }] },
    gear: { rows: [], rent_counts: {}, sizes: [], sizes_hidden: 0 },
    levels: [],
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<Schemas["SkiProfileOut"]> = {}): Schemas["SkiProfileOut"] {
  return {
    discipline: "ski",
    level: "beginner",
    owns_gear: false,
    boot_size_eu: null,
    height_cm: null,
    weight_kg: null,
    share_sizes_with_trip: false,
    ...overrides,
  };
}
