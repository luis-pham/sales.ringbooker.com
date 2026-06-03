/**
 * Validates SEARCH_TARGETS + CITY_GRIDS config and prints a coverage summary.
 * Run: npm run validate:targets   (tsx scripts/validate-search-targets.ts)
 * Exits non-zero if any hard error is found.
 */
import {
  CITY_GRIDS,
  CORE_VERTICALS,
  SEARCH_TARGETS,
  SERPER_MAX_PAGES,
  VERTICAL_QUERIES,
  generateGridPoints,
  getGridConfig,
  type VerticalKey,
} from "../src/lib/config/search-targets";

const VALID_VERTICALS = new Set(Object.keys(VERTICAL_QUERIES));
const VALID_PRIORITIES = new Set([1, 2, 3, 4]);
const EST_LEADS_PER_GRID_POINT = 12; // rough yield per grid point per vertical

const errors: string[] = [];
const warnings: string[] = [];

// 1. Duplicate (city, state, vertical) targets
const seen = new Set<string>();
for (const t of SEARCH_TARGETS) {
  const key = `${t.city}|${t.state}|${t.vertical}`;
  if (seen.has(key)) errors.push(`Duplicate target: ${key}`);
  seen.add(key);
}

// 2. Per-target field validation
for (const t of SEARCH_TARGETS) {
  const id = `${t.city}, ${t.state} (${t.vertical})`;
  if (!t.city) errors.push(`Missing city: ${id}`);
  if (!t.state) errors.push(`Missing state: ${id}`);
  if (!VALID_VERTICALS.has(t.vertical)) errors.push(`Unknown vertical "${t.vertical}": ${id}`);
  if (!VALID_PRIORITIES.has(t.priority)) errors.push(`Invalid priority ${t.priority}: ${id}`);

  const grid = CITY_GRIDS[`${t.city}_${t.state}`];
  if (!grid) {
    errors.push(`No CITY_GRIDS entry for ${t.city}_${t.state}: ${id}`);
  } else {
    if (!Array.isArray(grid.center) || grid.center.length !== 2) errors.push(`Bad center for ${t.city}_${t.state}`);
    if (!Number.isInteger(grid.gridSize) || grid.gridSize < 1) errors.push(`Bad gridSize for ${t.city}_${t.state}`);
  }

  // Core-vertical advisory (enabled targets should stick to the core set)
  if (t.enabled && !CORE_VERTICALS.includes(t.vertical as VerticalKey)) {
    warnings.push(`Enabled non-core vertical "${t.vertical}": ${id}`);
  }
}

// 3. Verify every grid produces exactly gridSize² points
for (const [key, grid] of Object.entries(CITY_GRIDS)) {
  const pts = generateGridPoints(grid).length;
  const expected = grid.gridSize <= 1 || grid.stepDeg === 0 ? 1 : grid.gridSize * grid.gridSize;
  if (pts !== expected) errors.push(`Grid ${key}: expected ${expected} points, got ${pts}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
type Stat = { cities: Set<string>; targets: number; gridPoints: number; serperCalls: number; estLeads: number };
const byPriority: Record<number, Stat> = {
  1: { cities: new Set(), targets: 0, gridPoints: 0, serperCalls: 0, estLeads: 0 },
  2: { cities: new Set(), targets: 0, gridPoints: 0, serperCalls: 0, estLeads: 0 },
  3: { cities: new Set(), targets: 0, gridPoints: 0, serperCalls: 0, estLeads: 0 },
  4: { cities: new Set(), targets: 0, gridPoints: 0, serperCalls: 0, estLeads: 0 },
};

let enabledTargets = 0;
for (const t of SEARCH_TARGETS) {
  const s = byPriority[t.priority];
  if (!s) continue;
  const pts = generateGridPoints(getGridConfig(t.city, t.state)).length;
  s.cities.add(`${t.city}_${t.state}`);
  s.targets += 1;
  s.gridPoints += pts;
  s.serperCalls += pts * SERPER_MAX_PAGES;
  s.estLeads += pts * EST_LEADS_PER_GRID_POINT;
  if (t.enabled) enabledTargets += 1;
}

const allCities = new Set(SEARCH_TARGETS.map((t) => `${t.city}_${t.state}`));
const totalGridPoints = Object.values(byPriority).reduce((a, s) => a + s.gridPoints, 0);
const totalSerper = Object.values(byPriority).reduce((a, s) => a + s.serperCalls, 0);
const totalEstLeads = Object.values(byPriority).reduce((a, s) => a + s.estLeads, 0);

console.log("\n══════════════════════ SEARCH TARGET VALIDATION ══════════════════════\n");
console.log(`Total distinct cities : ${allCities.size}`);
console.log(`Total targets         : ${SEARCH_TARGETS.length}  (${enabledTargets} enabled)\n`);

for (const p of [1, 2, 3, 4]) {
  const s = byPriority[p];
  console.log(
    `P${p}: ${String(s.cities.size).padStart(2)} cities · ${String(s.targets).padStart(3)} targets · ` +
    `${String(s.gridPoints).padStart(4)} grid pts · ~${s.serperCalls} serper calls · ~${s.estLeads} est leads`,
  );
}

console.log(`\nTotal grid points (× verticals) : ${totalGridPoints}`);
console.log(`Est. total Serper calls/cycle   : ${totalSerper}  (~$${(totalSerper * 0.001).toFixed(2)})`);
console.log(`Est. total leads                : ${totalEstLeads}`);

if (warnings.length) {
  console.log(`\n⚠ Warnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length) {
  console.log(`\n✗ ERRORS (${errors.length}):`);
  for (const e of errors) console.log(`  - ${e}`);
  console.log("\nValidation FAILED.\n");
  process.exit(1);
}

console.log("\n✓ All checks passed.\n");
