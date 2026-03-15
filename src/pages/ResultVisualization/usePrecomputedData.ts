/**
 * usePrecomputedData
 *
 * Fetches grid + iteration data once, then pre-computes the full grid state
 * and color for every cell at every step. Stepping becomes an O(1) index lookup
 * with no React reconciliation, no color computation, and no array allocation.
 *
 * Scalability notes:
 * - Flat arrays instead of nested: better cache locality, avoids GC pressure
 * - Incremental delta application: each step costs O(changed cells), not O(all cells)
 * - Color scale is fixed for the whole session: no recomputation on metric switch
 * - For very large datasets the pre-computation loop can be moved to a Web Worker
 *   by passing the raw JSON via postMessage — the hook interface stays identical.
 */

import { useEffect, useState } from "react";
import { scaleSequential } from "d3-scale";
import { interpolateRdYlBu } from "d3-scale-chromatic";

// ── Types ────────────────────────────────────────────────────────────────────

export type MetricKey = "temperature" | "pressure" | "kelvin";

type CellMetrics = {
  temperature: string;
  pressure: number;
  kelvin: string;
};

type IterationValue = [number, number, CellMetrics];

type Iteration = {
  step: number;
  values: IterationValue[];
};

type GridData = {
  temperature: string[][];
  pressure: number[][];
  kelvin: string[][];
};

/** Flat arrays for a single metric at a single step. Index = row * cols + col. */
export type FlatMetricSlice = {
  values: (string | number)[]; // display strings / numbers
  colors: string[];            // pre-computed hex colors
};

/**
 * All metrics for one step, plus the set of flat indices that changed
 * relative to the previous step. Empty for step 0 (base state).
 * Used by GridCanvas to do a partial repaint instead of a full redraw.
 */
export type PrecomputedStep = Record<MetricKey, FlatMetricSlice> & {
  changedIndices: number[];
};

export type { MetricRanges };

export type PrecomputedData = {
  steps: PrecomputedStep[];  // steps[0] = base, steps[1] = after iter[0], …
  rows: number;
  cols: number;
  totalSteps: number;        // total iterations reported by the server
  loadedSteps: number;       // iterations pre-computed so far (may be < totalSteps while paginating)
  metricRanges: MetricRanges;
};

// ── Internal helpers ─────────────────────────────────────────────────────────

const METRICS: MetricKey[] = ["temperature", "pressure", "kelvin"];

/** Neutral grey used when a cell has no data or an unparseable value. */
const NO_DATA_COLOR = "#d1d5db";
/** Display label shown in the tooltip / cell for missing data. */
const NO_DATA_LABEL = "—";

/**
 * Parse a cell value to a number.
 * Returns NaN for null / undefined / empty string / non-numeric strings
 * so callers can detect and handle missing data explicitly.
 */
export function parseValue(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return NaN;
  return typeof v === "number" ? v : parseFloat(String(v));
}

/**
 * Validate that the API response has the expected shape before we try to
 * index into it. Throws a descriptive error rather than a cryptic crash.
 */
export function validateApiShape(grid: unknown, iterations: unknown): void {
  if (!grid || typeof grid !== "object")
    throw new Error("API error: grid is missing or not an object");

  const g = grid as Record<string, unknown>;
  for (const key of ["temperature", "pressure", "kelvin"] as const) {
    if (!Array.isArray(g[key]))
      throw new Error(`API error: grid.${key} is not an array`);
  }

  if (!Array.isArray(iterations))
    throw new Error("API error: iterations is not an array");

  for (let i = 0; i < (iterations as unknown[]).length; i++) {
    const iter = (iterations as unknown[])[i] as Record<string, unknown>;
    if (!Array.isArray(iter?.values))
      throw new Error(`API error: iterations[${i}].values is not an array`);
  }
}

type ColorScales = Record<MetricKey, (v: number) => string>;
type MetricRanges = Record<MetricKey, [number, number]>;

/** Build one fixed color scale per metric from the full value range. */
export function buildColorScales(
  baseGrid: GridData,
  iterations: Iteration[]
): { scales: ColorScales; ranges: MetricRanges } {
  const scales = {} as ColorScales;
  const ranges = {} as MetricRanges;

  for (const metric of METRICS) {
    let min = Infinity;
    let max = -Infinity;

    const track = (v: string | number) => {
      const n = parseValue(v);
      // Skip NaN — missing / bad values don't influence the scale domain
      if (!isNaN(n)) {
        if (n < min) min = n;
        if (n > max) max = n;
      }
    };

    for (const row of baseGrid[metric])
      for (const v of row) track(v as string | number);

    for (const iter of iterations)
      for (const [, , m] of iter.values)
        track(m[metric] as string | number);

    // Guard: if all values were missing, use a neutral domain
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }

    // RdYlBu: 0 = red (hot), 1 = blue (cold) → domain [max, min]
    scales[metric] = scaleSequential(interpolateRdYlBu).domain([max, min]);
    ranges[metric] = [min, max];
  }

  return { scales, ranges };
}

/** Flat mutable state — one value array per metric. */
export type FlatState = Record<MetricKey, (string | number)[]>;

function flattenGrid(gridData: GridData, rows: number, cols: number): FlatState {
  const size = rows * cols;
  const state: FlatState = {
    temperature: new Array(size),
    pressure: new Array(size),
    kelvin: new Array(size),
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      state.temperature[idx] = gridData.temperature[r]?.[c] ?? "";
      state.pressure[idx] = gridData.pressure[r]?.[c] ?? 0;
      state.kelvin[idx] = gridData.kelvin[r]?.[c] ?? "";
    }
  }

  return state;
}

/**
 * Apply a sparse delta in-place. Only touches the cells listed in `values`,
 * so cost = O(changed cells), regardless of grid size.
 * Out-of-bounds entries are silently skipped rather than corrupting the array.
 * Returns the flat indices of every cell that was written.
 */
export function applyDelta(
  state: FlatState,
  values: IterationValue[],
  cols: number
): number[] {
  const changed: number[] = [];
  const size = state.temperature.length;
  for (const [row, col, metrics] of values) {
    const idx = row * cols + col;
    if (idx < 0 || idx >= size) continue; // guard against malformed delta
    state.temperature[idx] = metrics.temperature;
    state.pressure[idx] = metrics.pressure;
    state.kelvin[idx] = metrics.kelvin;
    changed.push(idx);
  }
  return changed;
}

/** Snapshot the current flat state into a PrecomputedStep (colors + display values). */
function snapshotStep(
  state: FlatState,
  scales: ColorScales,
  size: number,
  changedIndices: number[]
): PrecomputedStep {
  const step = {} as PrecomputedStep;

  for (const metric of METRICS) {
    const src = state[metric];
    const colors = new Array<string>(size);
    const values = new Array<string | number>(size);

    for (let i = 0; i < size; i++) {
      const n = parseValue(src[i]);
      if (isNaN(n)) {
        // Missing or unparseable value → neutral colour + explicit label
        colors[i] = NO_DATA_COLOR;
        values[i] = NO_DATA_LABEL;
      } else {
        colors[i] = scales[metric](n);
        values[i] = src[i];
      }
    }

    step[metric] = { values, colors };
  }

  step.changedIndices = changedIndices;
  return step;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of iteration steps to fetch per page. */
const PAGE_SIZE = 3;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePrecomputedData() {
  const [data, setData] = useState<PrecomputedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);

        // ── Phase 1: fetch grid + first page in parallel ──────────────────
        const [gridRes, iterRes] = await Promise.all([
          fetch("http://localhost:5001/api/grid"),
          fetch(`http://localhost:5001/api/iterations?page=0&size=${PAGE_SIZE}`),
        ]);

        if (!gridRes.ok || !iterRes.ok)
          throw new Error("Failed to fetch data from server");

        const [gridJson, iterJson] = await Promise.all([
          gridRes.json(),
          iterRes.json(),
        ]);

        validateApiShape(gridJson.grid, iterJson.iterations);

        const gridData = gridJson.grid as GridData;
        const firstPage = iterJson.iterations as Iteration[];
        const { total, hasMore: firstHasMore } = iterJson as {
          total: number;
          hasMore: boolean;
        };

        const rows = gridData.temperature.length;
        const cols = gridData.temperature[0]?.length ?? 0;
        const cellCount = rows * cols;

        // Color scale is fixed from page 0 data for the whole session.
        // This keeps colours stable as subsequent pages arrive.
        const { scales, ranges } = buildColorScales(gridData, firstPage);

        // Working flat state — mutated in-place as pages arrive
        const state = flattenGrid(gridData, rows, cols);
        const steps: PrecomputedStep[] = [snapshotStep(state, scales, cellCount, [])];

        for (const iter of firstPage) {
          const changed = applyDelta(state, iter.values, cols);
          steps.push(snapshotStep(state, scales, cellCount, changed));
        }

        if (cancelled) return;

        // Show the grid immediately with the first page — UI is responsive now
        setData({
          steps: [...steps],
          rows,
          cols,
          totalSteps: total,
          loadedSteps: firstPage.length,
          metricRanges: ranges,
        });
        setLoading(false);

        // ── Phase 2: fetch remaining pages in the background ─────────────
        if (firstHasMore) {
          let page = 1;
          let hasMore = true;

          while (hasMore && !cancelled) {
            const res = await fetch(
              `http://localhost:5001/api/iterations?page=${page}&size=${PAGE_SIZE}`
            );

            if (!res.ok || cancelled) break;

            const json = await res.json();
            const newIters = json.iterations as Iteration[];
            hasMore = json.hasMore as boolean;

            for (const iter of newIters) {
              const changed = applyDelta(state, iter.values, cols);
              steps.push(snapshotStep(state, scales, cellCount, changed));
            }

            if (!cancelled) {
              setData((prev) =>
                prev
                  ? { ...prev, steps: [...steps], loadedSteps: steps.length - 1, metricRanges: prev.metricRanges }
                  : null
              );
            }

            page++;
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
