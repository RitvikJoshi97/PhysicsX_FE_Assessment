/**
 * GridCanvas
 *
 * Renders the grid onto a <canvas> element instead of DOM nodes.
 * For an N×M grid this means:
 *   - 1 DOM element regardless of grid size (vs N*M divs)
 *   - Zero React reconciliation on step change — just one canvas repaint
 *   - Tooltip hit-testing via mouse coordinate math, not DOM event bubbling
 *
 * Drawing cost = O(rows * cols) per frame, which is unavoidable, but it runs
 * entirely in the browser's native 2D compositor rather than through React's
 * virtual DOM and style diffing.
 */

import React, { useCallback, useEffect, useRef } from "react";
import type { FlatMetricSlice } from "./usePrecomputedData";

/** Parse a display value back to a number for filter comparisons. */
function parseValue(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return NaN;
  return typeof v === "number" ? v : parseFloat(String(v));
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Ideal cell size in CSS pixels. Will shrink to fit the container. */
const CELL_MAX_PX = 56;
/** Never go below this — text is hidden at small sizes anyway. */
const CELL_MIN_PX = 8;
/** Gap between cells (in logical px). */
const GAP = 2;
/** Hide cell labels when cells are too small to read them. */
const TEXT_MIN_PX = 28;
/** Background colour shown in the gap between cells. */
const GAP_COLOR = "#e5e7eb";

// ── Drawing ───────────────────────────────────────────────────────────────────

function draw(
  canvas: HTMLCanvasElement,
  slice: FlatMetricSlice,
  rows: number,
  cols: number,
  filterRange: [number, number] | null = null
): void {
  const dpr = window.devicePixelRatio || 1;

  // Fit cell size to container width
  const containerW = canvas.parentElement?.clientWidth ?? 800;
  const rawCell = Math.floor((containerW - GAP) / cols) - GAP;
  const cellPx = Math.min(CELL_MAX_PX, Math.max(CELL_MIN_PX, rawCell));

  const canvasW = cols * (cellPx + GAP) + GAP;
  const canvasH = rows * (cellPx + GAP) + GAP;

  // Resize canvas backing store for DPR — also clears it
  canvas.width = canvasW * dpr;
  canvas.height = canvasH * dpr;
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // Background (fills the gap colour)
  ctx.fillStyle = GAP_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const showText = cellPx >= TEXT_MIN_PX;
  if (showText) {
    const fontSize = Math.max(9, Math.floor(cellPx * 0.21));
    ctx.font = `600 ${fontSize}px Inter, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const x = GAP + c * (cellPx + GAP);
      const y = GAP + r * (cellPx + GAP);

      const n = parseValue(slice.values[idx]);
      const inRange = filterRange === null || isNaN(n) || (n >= filterRange[0] && n <= filterRange[1]);
      ctx.globalAlpha = inRange ? 1 : 0.12;
      ctx.fillStyle = slice.colors[idx];
      ctx.fillRect(x, y, cellPx, cellPx);

      if (showText) {
        ctx.fillStyle = "rgba(0,0,0,0.68)";
        ctx.fillText(
          String(slice.values[idx]),
          x + cellPx / 2,
          y + cellPx / 2,
          cellPx - 6
        );
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Repaint only the cells whose flat indices are listed in `changedIndices`.
 * Canvas dimensions are unchanged — no clear, no full redraw.
 * Cost = O(changed cells), which can be a tiny fraction of the full grid.
 */
function drawPartial(
  canvas: HTMLCanvasElement,
  slice: FlatMetricSlice,
  cols: number,
  changedIndices: number[],
  filterRange: [number, number] | null = null
): void {
  const dpr = window.devicePixelRatio || 1;
  const containerW = canvas.parentElement?.clientWidth ?? 800;
  const rawCell = Math.floor((containerW - GAP) / cols) - GAP;
  const cellPx = Math.min(CELL_MAX_PX, Math.max(CELL_MIN_PX, rawCell));
  const stride = cellPx + GAP;

  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.scale(dpr, dpr);

  const showText = cellPx >= TEXT_MIN_PX;
  if (showText) {
    const fontSize = Math.max(9, Math.floor(cellPx * 0.21));
    ctx.font = `600 ${fontSize}px Inter, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  for (const idx of changedIndices) {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const x = GAP + c * stride;
    const y = GAP + r * stride;

    const n = parseValue(slice.values[idx]);
    const inRange = filterRange === null || isNaN(n) || (n >= filterRange[0] && n <= filterRange[1]);
    ctx.globalAlpha = inRange ? 1 : 0.12;
    ctx.fillStyle = slice.colors[idx];
    ctx.fillRect(x, y, cellPx, cellPx);

    if (showText) {
      ctx.fillStyle = "rgba(0,0,0,0.68)";
      ctx.fillText(String(slice.values[idx]), x + cellPx / 2, y + cellPx / 2, cellPx - 6);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────

export type CellHoverHandler = (
  row: number,
  col: number,
  value: string | number,
  clientX: number,
  clientY: number
) => void;

interface GridCanvasProps {
  slice: FlatMetricSlice;
  rows: number;
  cols: number;
  /** null = full redraw (metric switch / reset). Array = repaint only those cells. */
  changedIndices: number[] | null;
  /** null = show all cells. [min, max] = dim cells outside this numeric range. */
  filterRange: [number, number] | null;
  onCellHover: CellHoverHandler;
  onCellLeave: () => void;
}

const GridCanvas: React.FC<GridCanvasProps> = ({
  slice,
  rows,
  cols,
  changedIndices,
  filterRange,
  onCellHover,
  onCellLeave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Full redraw when metric switches, on first load, or on reset (changedIndices null).
  // Partial repaint when stepping through iterations (changedIndices is the delta set).
  // Also redraws fully whenever filterRange changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (changedIndices !== null && changedIndices.length > 0) {
      drawPartial(canvas, slice, cols, changedIndices, filterRange);
    } else if (changedIndices === null) {
      draw(canvas, slice, rows, cols, filterRange);
    }
    // changedIndices === [] means base state was loaded — full draw already happened
  }, [slice, rows, cols, changedIndices, filterRange]);

  // Refit on window resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw(canvas, slice, rows, cols, filterRange));
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [slice, rows, cols, filterRange]);

  // Hit-test: convert mouse coords → cell index via simple math
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Cell stride in CSS pixels (matches draw() calculation)
      const containerW = rect.width;
      const rawCell = Math.floor((containerW - GAP) / cols) - GAP;
      const cellPx = Math.min(CELL_MAX_PX, Math.max(CELL_MIN_PX, rawCell));
      const stride = cellPx + GAP;

      const col = Math.floor((x - GAP) / stride);
      const row = Math.floor((y - GAP) / stride);

      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        onCellHover(row, col, slice.values[row * cols + col], e.clientX, e.clientY);
      }
    },
    [slice, rows, cols, onCellHover]
  );

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={onCellLeave}
      style={{ display: "block", cursor: "crosshair" }}
    />
  );
};

export default GridCanvas;
