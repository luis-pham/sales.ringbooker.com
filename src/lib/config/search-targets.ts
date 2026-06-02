export const VERTICAL_QUERIES = {
  hair_salon: ["hair salons", "hair salon", "hair stylist", "hairdresser", "hair studio"],
  nail_salon: ["nail salons", "nail salon", "nail spa", "nail studio"],
  day_spa: ["day spas", "day spa", "spa salon"],
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

export const USE_QUERY_VARIATIONS = false;

export type GridConfig = {
  center: [number, number];
  gridSize: 1 | 2 | 3;
  zoom: string;
  stepDeg: number;
};

export const CITY_GRIDS: Record<string, GridConfig> = {
  Houston_TX: { center: [29.7604, -95.3698], gridSize: 3, zoom: "13z", stepDeg: 0.18 },
  "Los Angeles_CA": { center: [34.0522, -118.2437], gridSize: 3, zoom: "13z", stepDeg: 0.18 },
  Dallas_TX: { center: [32.7767, -96.797], gridSize: 3, zoom: "13z", stepDeg: 0.15 },
  "San Antonio_TX": { center: [29.4241, -98.4936], gridSize: 2, zoom: "13z", stepDeg: 0.15 },
  Atlanta_GA: { center: [33.749, -84.388], gridSize: 2, zoom: "13z", stepDeg: 0.15 },
  Orlando_FL: { center: [28.5383, -81.3792], gridSize: 2, zoom: "13z", stepDeg: 0.12 },
  Miami_FL: { center: [25.7617, -80.1918], gridSize: 2, zoom: "13z", stepDeg: 0.12 },
  Phoenix_AZ: { center: [33.4484, -112.074], gridSize: 2, zoom: "13z", stepDeg: 0.15 },
  Charlotte_NC: { center: [35.2271, -80.8431], gridSize: 2, zoom: "13z", stepDeg: 0.12 },
  Jacksonville_FL: { center: [30.3322, -81.6557], gridSize: 2, zoom: "13z", stepDeg: 0.13 },
  "Las Vegas_NV": { center: [36.1699, -115.1398], gridSize: 1, zoom: "12z", stepDeg: 0 },
  "New Orleans_LA": { center: [29.9511, -90.0715], gridSize: 1, zoom: "12z", stepDeg: 0 },
};

export type SearchTarget = {
  city: string;
  state: string;
  vertical: VerticalKey;
  priority: 1 | 2 | 3;
  enabled: boolean;
};

export const SEARCH_TARGETS: SearchTarget[] = [
  { city: "Houston", state: "TX", vertical: "hair_salon", priority: 1, enabled: true },
  { city: "Houston", state: "TX", vertical: "nail_salon", priority: 1, enabled: true },
  { city: "Atlanta", state: "GA", vertical: "hair_salon", priority: 1, enabled: true },
  { city: "Atlanta", state: "GA", vertical: "nail_salon", priority: 1, enabled: true },
  { city: "Dallas", state: "TX", vertical: "hair_salon", priority: 1, enabled: true },
  { city: "Dallas", state: "TX", vertical: "nail_salon", priority: 1, enabled: true },
  { city: "Orlando", state: "FL", vertical: "hair_salon", priority: 1, enabled: true },
  { city: "Orlando", state: "FL", vertical: "nail_salon", priority: 1, enabled: true },
  { city: "Los Angeles", state: "CA", vertical: "hair_salon", priority: 2, enabled: true },
  { city: "Los Angeles", state: "CA", vertical: "nail_salon", priority: 2, enabled: true },
  { city: "Miami", state: "FL", vertical: "hair_salon", priority: 2, enabled: true },
  { city: "Miami", state: "FL", vertical: "nail_salon", priority: 2, enabled: true },
  { city: "Phoenix", state: "AZ", vertical: "hair_salon", priority: 2, enabled: true },
  { city: "Charlotte", state: "NC", vertical: "hair_salon", priority: 2, enabled: true },
  { city: "Las Vegas", state: "NV", vertical: "nail_salon", priority: 2, enabled: true },
  { city: "San Antonio", state: "TX", vertical: "hair_salon", priority: 2, enabled: true },
  { city: "Jacksonville", state: "FL", vertical: "hair_salon", priority: 2, enabled: true },
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
export const SERPER_MAX_PAGES = 5;

export function getGridConfig(city: string, state: string): GridConfig {
  return CITY_GRIDS[`${city}_${state}`] ?? {
    center: [0, 0],
    gridSize: 1,
    zoom: "12z",
    stepDeg: 0,
  };
}

export function generateGridPoints(config: GridConfig): { lat: number; lng: number; llParam: string }[] {
  const [centerLat, centerLng] = config.center;
  if (config.gridSize === 1 || config.stepDeg === 0) {
    return [
      {
        lat: centerLat,
        lng: centerLng,
        llParam: centerLat !== 0 ? `@${centerLat},${centerLng},${config.zoom}` : "",
      },
    ];
  }

  const half = Math.floor(config.gridSize / 2);
  const points: { lat: number; lng: number; llParam: string }[] = [];

  for (let i = -half; i <= half; i += 1) {
    for (let j = -half; j <= half; j += 1) {
      const lat = Number((centerLat + i * config.stepDeg).toFixed(6));
      const lng = Number((centerLng + j * config.stepDeg).toFixed(6));
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
