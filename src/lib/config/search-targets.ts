export const VERTICAL_QUERIES = {
  hair_salon: ["hair salons", "hair salon", "hair stylist", "hairdresser", "hair studio"],
  nail_salon: ["nail salons", "nail salon", "nail spa", "nail studio"],
  day_spa: ["day spas", "day spa", "spa salon"],
  med_spa: ["med spa", "medical spa", "medspa", "aesthetic clinic"],
  lash_studio: ["lash studio", "lash extension", "eyelash salon"],
  waxing_studio: ["waxing salon", "waxing studio", "body wax"],
  barbershop: ["barbershop", "barber shop", "barber"],
  tattoo_studio: ["tattoo studio", "tattoo shop", "tattoo parlor"],
  pet_grooming: ["pet grooming", "dog grooming", "pet salon"],
  hvac: ["HVAC contractor", "air conditioning repair", "heating cooling"],
  plumber: ["plumber", "plumbing service"],
  electrician: ["electrician", "electrical contractor"],
} as const;

export type VerticalKey = keyof typeof VERTICAL_QUERIES;

/** Core verticals targeted by the city expansion. Others (barber/hvac/etc) remain disabled. */
export const CORE_VERTICALS: VerticalKey[] = ["hair_salon", "nail_salon", "day_spa", "med_spa"];

export const USE_QUERY_VARIATIONS = false;

export type GridConfig = {
  center: [number, number];
  /** N — produces exactly N×N grid points centered on `center`. */
  gridSize: number;
  zoom: string;
  stepDeg: number;
};

export const CITY_GRIDS: Record<string, GridConfig> = {
  // ── Existing cities ────────────────────────────────────────────────────────
  // NOTE (Step 3): Houston/LA/Dallas/Atlanta/Miami grids were enlarged for better
  // metro coverage. This only takes effect on the next 30-day re-scrape and is
  // dedupe-safe (place_id upsert). If any of these is already fully crawled
  // (status=done) and you do NOT want the wider grid yet, revert that one entry.
  Houston_TX: { center: [29.7604, -95.3698], gridSize: 5, zoom: "13z", stepDeg: 0.15 }, // was 3×3
  "Los Angeles_CA": { center: [34.0522, -118.2437], gridSize: 5, zoom: "13z", stepDeg: 0.15 }, // was 3×3
  Dallas_TX: { center: [32.7767, -96.797], gridSize: 4, zoom: "13z", stepDeg: 0.15 }, // was 3×3
  Atlanta_GA: { center: [33.749, -84.388], gridSize: 4, zoom: "13z", stepDeg: 0.13 }, // was 3×3 (gridSize 2)
  Miami_FL: { center: [25.7617, -80.1918], gridSize: 4, zoom: "13z", stepDeg: 0.11 }, // was 3×3 (gridSize 2)
  // Preserved coverage: gridSize bumped 2→3 to keep the same 9 points under the
  // corrected (exact N×N) generateGridPoints — identical lat/lng, no change.
  "San Antonio_TX": { center: [29.4241, -98.4936], gridSize: 3, zoom: "13z", stepDeg: 0.15 },
  Orlando_FL: { center: [28.5383, -81.3792], gridSize: 3, zoom: "13z", stepDeg: 0.12 },
  Phoenix_AZ: { center: [33.4484, -112.074], gridSize: 3, zoom: "13z", stepDeg: 0.15 },
  Charlotte_NC: { center: [35.2271, -80.8431], gridSize: 3, zoom: "13z", stepDeg: 0.12 },
  Jacksonville_FL: { center: [30.3322, -81.6557], gridSize: 3, zoom: "13z", stepDeg: 0.13 },
  "Las Vegas_NV": { center: [36.1699, -115.1398], gridSize: 1, zoom: "12z", stepDeg: 0 },
  "New Orleans_LA": { center: [29.9511, -90.0715], gridSize: 1, zoom: "12z", stepDeg: 0 },

  // ── P3 expansion ───────────────────────────────────────────────────────────
  "New York City_NY": { center: [40.7128, -74.006], gridSize: 6, zoom: "14z", stepDeg: 0.05 },
  "New Jersey_NJ": { center: [40.73, -74.13], gridSize: 4, zoom: "13z", stepDeg: 0.07 },
  Chicago_IL: { center: [41.8781, -87.6298], gridSize: 5, zoom: "13z", stepDeg: 0.1 },
  Philadelphia_PA: { center: [39.9526, -75.1652], gridSize: 4, zoom: "13z", stepDeg: 0.07 },
  "Washington DC_DC": { center: [38.9072, -77.0369], gridSize: 4, zoom: "13z", stepDeg: 0.06 },
  Tampa_FL: { center: [27.9506, -82.4572], gridSize: 3, zoom: "13z", stepDeg: 0.12 },
  "San Diego_CA": { center: [32.7157, -117.1611], gridSize: 3, zoom: "13z", stepDeg: 0.12 },
  "San Francisco_CA": { center: [37.7749, -122.4194], gridSize: 4, zoom: "14z", stepDeg: 0.05 },
  Seattle_WA: { center: [47.6062, -122.3321], gridSize: 3, zoom: "13z", stepDeg: 0.1 },
  Nashville_TN: { center: [36.1627, -86.7816], gridSize: 3, zoom: "13z", stepDeg: 0.12 },
  Denver_CO: { center: [39.7392, -104.9903], gridSize: 3, zoom: "13z", stepDeg: 0.12 },
  Raleigh_NC: { center: [35.7796, -78.6382], gridSize: 3, zoom: "13z", stepDeg: 0.11 },
  // Dallas suburbs
  Plano_TX: { center: [33.0198, -96.6989], gridSize: 2, zoom: "13z", stepDeg: 0.06 },
  Frisco_TX: { center: [33.1507, -96.8236], gridSize: 2, zoom: "13z", stepDeg: 0.06 },
  Irving_TX: { center: [32.814, -96.9489], gridSize: 2, zoom: "13z", stepDeg: 0.06 },
  // Houston suburbs
  "Sugar Land_TX": { center: [29.6197, -95.6349], gridSize: 2, zoom: "13z", stepDeg: 0.06 },
  Katy_TX: { center: [29.7858, -95.8245], gridSize: 2, zoom: "13z", stepDeg: 0.06 },
  Pearland_TX: { center: [29.5636, -95.286], gridSize: 2, zoom: "13z", stepDeg: 0.06 },
  // Atlanta suburbs
  Marietta_GA: { center: [33.9526, -84.5499], gridSize: 2, zoom: "13z", stepDeg: 0.05 },
  "Sandy Springs_GA": { center: [33.9304, -84.3733], gridSize: 2, zoom: "13z", stepDeg: 0.05 },

  // ── P4 expansion ───────────────────────────────────────────────────────────
  Boston_MA: { center: [42.3601, -71.0589], gridSize: 3, zoom: "13z", stepDeg: 0.08 },
  Minneapolis_MN: { center: [44.9778, -93.265], gridSize: 3, zoom: "13z", stepDeg: 0.11 },
  Detroit_MI: { center: [42.3314, -83.0458], gridSize: 3, zoom: "13z", stepDeg: 0.11 },
  Columbus_OH: { center: [39.9612, -82.9988], gridSize: 3, zoom: "13z", stepDeg: 0.11 },
  Indianapolis_IN: { center: [39.7684, -86.1581], gridSize: 3, zoom: "13z", stepDeg: 0.11 },
  Austin_TX: { center: [30.2672, -97.7431], gridSize: 3, zoom: "13z", stepDeg: 0.11 },
  Portland_OR: { center: [45.5152, -122.6784], gridSize: 3, zoom: "13z", stepDeg: 0.1 },
  Sacramento_CA: { center: [38.5816, -121.4944], gridSize: 3, zoom: "13z", stepDeg: 0.11 },
  "San Jose_CA": { center: [37.3382, -121.8863], gridSize: 3, zoom: "13z", stepDeg: 0.09 },
  Baltimore_MD: { center: [39.2904, -76.6122], gridSize: 3, zoom: "13z", stepDeg: 0.08 },
  Memphis_TN: { center: [35.1495, -90.049], gridSize: 2, zoom: "13z", stepDeg: 0.07 },
  "Virginia Beach_VA": { center: [36.8529, -75.978], gridSize: 2, zoom: "13z", stepDeg: 0.07 },
};

export type SearchTarget = {
  city: string;
  state: string;
  vertical: VerticalKey;
  priority: 1 | 2 | 3 | 4;
  enabled: boolean;
};

export const SEARCH_TARGETS: SearchTarget[] = [
  // ── P1 ─────────────────────────────────────────────────────────────────────
  { city: "Houston", state: "TX", vertical: "hair_salon", priority: 1, enabled: true },
  { city: "Houston", state: "TX", vertical: "nail_salon", priority: 1, enabled: true },
  { city: "Atlanta", state: "GA", vertical: "hair_salon", priority: 1, enabled: true },
  { city: "Atlanta", state: "GA", vertical: "nail_salon", priority: 1, enabled: true },
  { city: "Dallas", state: "TX", vertical: "hair_salon", priority: 1, enabled: true },
  { city: "Dallas", state: "TX", vertical: "nail_salon", priority: 1, enabled: true },
  { city: "Orlando", state: "FL", vertical: "hair_salon", priority: 1, enabled: true },
  { city: "Orlando", state: "FL", vertical: "nail_salon", priority: 1, enabled: true },

  // ── P2 ─────────────────────────────────────────────────────────────────────
  { city: "Los Angeles", state: "CA", vertical: "hair_salon", priority: 2, enabled: true },
  { city: "Los Angeles", state: "CA", vertical: "nail_salon", priority: 2, enabled: true },
  { city: "Miami", state: "FL", vertical: "hair_salon", priority: 2, enabled: true },
  { city: "Miami", state: "FL", vertical: "nail_salon", priority: 2, enabled: true },
  { city: "Phoenix", state: "AZ", vertical: "hair_salon", priority: 2, enabled: true },
  { city: "Charlotte", state: "NC", vertical: "hair_salon", priority: 2, enabled: true },
  { city: "Las Vegas", state: "NV", vertical: "nail_salon", priority: 2, enabled: true },
  { city: "San Antonio", state: "TX", vertical: "hair_salon", priority: 2, enabled: true },
  { city: "Jacksonville", state: "FL", vertical: "hair_salon", priority: 2, enabled: true },

  // ── P3 expansion (enabled: rolling out now) ──────────────────────────────────
  { city: "New York City", state: "NY", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "New York City", state: "NY", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "New York City", state: "NY", vertical: "day_spa", priority: 3, enabled: true },
  { city: "New Jersey", state: "NJ", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "New Jersey", state: "NJ", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Chicago", state: "IL", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Chicago", state: "IL", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Philadelphia", state: "PA", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Philadelphia", state: "PA", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Washington DC", state: "DC", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Washington DC", state: "DC", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Washington DC", state: "DC", vertical: "day_spa", priority: 3, enabled: true },
  { city: "Tampa", state: "FL", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Tampa", state: "FL", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "San Diego", state: "CA", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "San Diego", state: "CA", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "San Francisco", state: "CA", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "San Francisco", state: "CA", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "San Francisco", state: "CA", vertical: "day_spa", priority: 3, enabled: true },
  { city: "Seattle", state: "WA", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Seattle", state: "WA", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Nashville", state: "TN", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Nashville", state: "TN", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Denver", state: "CO", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Denver", state: "CO", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Raleigh", state: "NC", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Raleigh", state: "NC", vertical: "nail_salon", priority: 3, enabled: true },
  // Dallas suburbs
  { city: "Plano", state: "TX", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Plano", state: "TX", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Frisco", state: "TX", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Frisco", state: "TX", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Irving", state: "TX", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Irving", state: "TX", vertical: "nail_salon", priority: 3, enabled: true },
  // Houston suburbs
  { city: "Sugar Land", state: "TX", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Sugar Land", state: "TX", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Katy", state: "TX", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Katy", state: "TX", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Pearland", state: "TX", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Pearland", state: "TX", vertical: "nail_salon", priority: 3, enabled: true },
  // Atlanta suburbs
  { city: "Marietta", state: "GA", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Marietta", state: "GA", vertical: "nail_salon", priority: 3, enabled: true },
  { city: "Sandy Springs", state: "GA", vertical: "hair_salon", priority: 3, enabled: true },
  { city: "Sandy Springs", state: "GA", vertical: "nail_salon", priority: 3, enabled: true },

  // ── P4 expansion (disabled: staged — flip enabled:true to roll out) ──────────
  { city: "Boston", state: "MA", vertical: "hair_salon", priority: 4, enabled: false },
  { city: "Boston", state: "MA", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "Minneapolis", state: "MN", vertical: "hair_salon", priority: 4, enabled: false },
  { city: "Minneapolis", state: "MN", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "Detroit", state: "MI", vertical: "hair_salon", priority: 4, enabled: false },
  { city: "Detroit", state: "MI", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "Columbus", state: "OH", vertical: "hair_salon", priority: 4, enabled: false },
  { city: "Columbus", state: "OH", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "Indianapolis", state: "IN", vertical: "hair_salon", priority: 4, enabled: false },
  { city: "Austin", state: "TX", vertical: "hair_salon", priority: 4, enabled: false },
  { city: "Austin", state: "TX", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "Portland", state: "OR", vertical: "hair_salon", priority: 4, enabled: false },
  { city: "Portland", state: "OR", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "Sacramento", state: "CA", vertical: "hair_salon", priority: 4, enabled: false },
  { city: "Sacramento", state: "CA", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "San Jose", state: "CA", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "San Jose", state: "CA", vertical: "day_spa", priority: 4, enabled: false },
  { city: "Baltimore", state: "MD", vertical: "hair_salon", priority: 4, enabled: false },
  { city: "Baltimore", state: "MD", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "Memphis", state: "TN", vertical: "hair_salon", priority: 4, enabled: false },
  { city: "Memphis", state: "TN", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "Virginia Beach", state: "VA", vertical: "nail_salon", priority: 4, enabled: false },
  { city: "Virginia Beach", state: "VA", vertical: "day_spa", priority: 4, enabled: false },

  // ── Disabled experimental verticals (unchanged) ──────────────────────────────
  { city: "Houston", state: "TX", vertical: "day_spa", priority: 3, enabled: false },
  { city: "Houston", state: "TX", vertical: "barbershop", priority: 3, enabled: false },
  { city: "Atlanta", state: "GA", vertical: "day_spa", priority: 3, enabled: false },
  { city: "Houston", state: "TX", vertical: "hvac", priority: 3, enabled: false },
  { city: "Dallas", state: "TX", vertical: "hvac", priority: 3, enabled: false },
  { city: "Houston", state: "TX", vertical: "pet_grooming", priority: 3, enabled: false },
];

export const RESCRAPE_INTERVAL_DAYS = 30;
export const SEARCH_JOB_STAGGER_MS = 90_000;
export const SERPER_MAX_RESULTS_PER_CALL = 100;
// Grid already provides geographic breadth; 3 pages/point gives good coverage
// while avoiding low-quality page 4-5 results that inflate downstream enrich cost.
export const SERPER_MAX_PAGES = 3;

export function getGridConfig(city: string, state: string): GridConfig {
  return CITY_GRIDS[`${city}_${state}`] ?? {
    center: [0, 0],
    gridSize: 1,
    zoom: "12z",
    stepDeg: 0,
  };
}

/**
 * Generate exactly `gridSize × gridSize` points centered on `config.center`.
 * Works for both even and odd gridSize: points are offset by (N-1)/2 so the
 * grid stays centered (e.g. N=4 → offsets -1.5,-0.5,0.5,1.5).
 */
export function generateGridPoints(config: GridConfig): { lat: number; lng: number; llParam: string }[] {
  const [centerLat, centerLng] = config.center;
  const n = Math.max(1, Math.floor(config.gridSize));

  if (n <= 1 || config.stepDeg === 0) {
    return [
      {
        lat: centerLat,
        lng: centerLng,
        llParam: centerLat !== 0 ? `@${centerLat},${centerLng},${config.zoom}` : "",
      },
    ];
  }

  const offset = (n - 1) / 2;
  const points: { lat: number; lng: number; llParam: string }[] = [];

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const lat = Number((centerLat + (i - offset) * config.stepDeg).toFixed(6));
      const lng = Number((centerLng + (j - offset) * config.stepDeg).toFixed(6));
      points.push({ lat, lng, llParam: `@${lat},${lng},${config.zoom}` });
    }
  }

  return points;
}

export function estimateSerperCalls(city: string, state: string, vertical: VerticalKey): number {
  const gridPoints = generateGridPoints(getGridConfig(city, state)).length;
  const queries = USE_QUERY_VARIATIONS ? VERTICAL_QUERIES[vertical]?.length ?? 1 : 1;
  return gridPoints * queries * SERPER_MAX_PAGES;
}
