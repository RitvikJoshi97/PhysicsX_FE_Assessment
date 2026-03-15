import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePrecomputedData, type MetricKey, type MetricRanges } from "./usePrecomputedData";
import GridCanvas, { type CellHoverHandler } from "./GridCanvas";
import "./ResultsVisualization.css";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "temperature", label: "Temperature" },
  { key: "pressure", label: "Pressure" },
  { key: "kelvin", label: "Kelvin" },
];

/** Interval (ms) for each speed notch: 1 = slowest, 5 = fastest. */
const SPEED_INTERVALS = [2000, 1200, 800, 400, 200] as const;

const ResultsVisualization: React.FC = () => {
  const { data, loading, error } = usePrecomputedData();

  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("temperature");
  // 0 = base grid, 1..totalSteps = after iteration N
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // 1 = slowest (2 s/step), 3 = default (0.8 s/step), 5 = fastest (0.2 s/step)
  const [speedNotch, setSpeedNotch] = useState(3);

  const [filterEnabled, setFilterEnabled] = useState(false);
  // filterRange is in the metric's native numeric units
  const [filterRange, setFilterRange] = useState<[number, number]>([0, 1]);

  // Tracks whether the last step transition was a forward step so GridCanvas
  // can do a partial repaint instead of a full redraw.
  const stepDirectionRef = useRef<"forward" | "full-redraw">("full-redraw");

  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    row: number;
    col: number;
    value: string | number;
  }>({ visible: false, x: 0, y: 0, row: 0, col: 0, value: "" });

  // Keep a ref so the interval callback always sees the latest step
  const stepRef = useRef(currentStep);
  stepRef.current = currentStep;

  // Playback — interval driven by effect, no stale closures
  useEffect(() => {
    if (!isPlaying || !data) return;

    const id = setInterval(() => {
      const next = stepRef.current + 1;
      if (next > data.loadedSteps) {
        setIsPlaying(false);
        return;
      }
      stepDirectionRef.current = "forward";
      setCurrentStep(next);
    }, SPEED_INTERVALS[speedNotch - 1]);

    return () => clearInterval(id);
  }, [isPlaying, data, speedNotch]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((playing) => {
      if (!playing && data && stepRef.current >= data.loadedSteps) {
        stepDirectionRef.current = "full-redraw";
        setCurrentStep(0);
      }
      return !playing;
    });
  }, [data]);

  const handleReset = useCallback(() => {
    stepDirectionRef.current = "full-redraw";
    setIsPlaying(false);
    setCurrentStep(0);
  }, []);

  const handleStepBack = useCallback(() => {
    stepDirectionRef.current = "full-redraw";
    setIsPlaying(false);
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const handleStepForward = useCallback(() => {
    if (!data) return;
    stepDirectionRef.current = "forward";
    setIsPlaying(false);
    setCurrentStep((s) => Math.min(data.loadedSteps, s + 1));
  }, [data]);

  const handleCellHover = useCallback<CellHoverHandler>(
    (row, col, value, x, y) => {
      setTooltip({ visible: true, x, y, row, col, value });
    },
    []
  );

  const handleCellLeave = useCallback(() => {
    setTooltip((t) => ({ ...t, visible: false }));
  }, []);

  if (loading || error || !data) {
    return (
      <div className="rv-page">
      <div className="rv-container">
        <div className="rv-header">
          <h2 className="rv-title">Results Visualisation</h2>
        </div>
        <div className="rv-grid-wrapper rv-grid-wrapper--placeholder">
          {error ? (
            <div className="rv-state-screen rv-state-screen--error">
              <p>⚠ {error}</p>
            </div>
          ) : (
            <div className="rv-state-screen">
              <div className="rv-spinner" />
              <p>Pre-computing visualisation…</p>
            </div>
          )}
        </div>
      </div>
      </div>
    );
  }

  const { steps, rows, cols, totalSteps, loadedSteps } = data;
  const isBackgroundLoading = loadedSteps < totalSteps;
  const currentSlice = steps[currentStep][selectedMetric];

  // null = full redraw; array = repaint only the cells that changed this step.
  // We use partial repaint only when advancing forward through steps (same metric).
  const canvasChangedIndices: number[] | null =
    stepDirectionRef.current === "forward" ? steps[currentStep].changedIndices : null;
  const progressPct = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
  const stepLabel =
    currentStep === 0 ? "Base state" : `Step ${currentStep} / ${totalSteps}`;

  return (
    <div className="rv-page">
    <div className="rv-container">
      <div className="rv-header">
        <h2 className="rv-title">Results Visualisation</h2>
        <span className="rv-meta">
          {rows}×{cols} · {totalSteps} iterations
          {isBackgroundLoading && (
            <span className="rv-meta-loading"> · loading {loadedSteps}/{totalSteps}…</span>
          )}
        </span>
      </div>

      {/* Metric tabs + filter on the same row */}
      <div className="rv-toolbar">
        <div className="rv-tabs" role="tablist">
          {METRICS.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={selectedMetric === key}
              className={`rv-tab ${selectedMetric === key ? "rv-tab--active" : ""}`}
              onClick={() => {
                stepDirectionRef.current = "full-redraw";
                setSelectedMetric(key);
                if (data) {
                  const [lo, hi] = data.metricRanges[key];
                  setFilterRange([lo, hi]);
                }
                setFilterEnabled(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rv-filter">
          <label className="rv-filter-toggle">
            <input
              type="checkbox"
              checked={filterEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  const [lo, hi] = data.metricRanges[selectedMetric];
                  setFilterRange([lo, hi]);
                }
                setFilterEnabled(e.target.checked);
                stepDirectionRef.current = "full-redraw";
              }}
            />
            <span>Filter range</span>
          </label>

          {filterEnabled && (() => {
            const [lo, hi] = data.metricRanges[selectedMetric];
            return (
              <div className="rv-filter-sliders">
                <div className="rv-filter-range">
                  <label htmlFor="filter-min" className="rv-filter-range-label">Min</label>
                  <input
                    id="filter-min"
                    type="range"
                    className="rv-filter-slider"
                    min={lo}
                    max={hi}
                    step={(hi - lo) / 100}
                    value={filterRange[0]}
                    onChange={(e) => {
                      const v = Math.min(Number(e.target.value), filterRange[1]);
                      setFilterRange([v, filterRange[1]]);
                      stepDirectionRef.current = "full-redraw";
                    }}
                  />
                  <span className="rv-filter-value">{filterRange[0].toFixed(1)}</span>
                </div>
                <div className="rv-filter-range">
                  <label htmlFor="filter-max" className="rv-filter-range-label">Max</label>
                  <input
                    id="filter-max"
                    type="range"
                    className="rv-filter-slider"
                    min={lo}
                    max={hi}
                    step={(hi - lo) / 100}
                    value={filterRange[1]}
                    onChange={(e) => {
                      const v = Math.max(Number(e.target.value), filterRange[0]);
                      setFilterRange([filterRange[0], v]);
                      stepDirectionRef.current = "full-redraw";
                    }}
                  />
                  <span className="rv-filter-value">{filterRange[1].toFixed(1)}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Canvas grid — 1 DOM node regardless of grid size */}
      <div className="rv-grid-wrapper">
        <GridCanvas
          slice={currentSlice}
          rows={rows}
          cols={cols}
          changedIndices={canvasChangedIndices}
          filterRange={filterEnabled ? filterRange : null}
          onCellHover={handleCellHover}
          onCellLeave={handleCellLeave}
        />
      </div>

      {/* Progress bar */}
      <div className="rv-progress" role="progressbar" aria-valuenow={progressPct}>
        <div className="rv-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Controls */}
      <div className="rv-controls">
        <div className="rv-buttons">
          <button
            className="rv-btn"
            onClick={handleStepBack}
            disabled={currentStep <= 0}
            title="Step back"
          >
            ‹
          </button>
          <button className="rv-btn rv-btn--primary" onClick={handlePlayPause}>
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            className="rv-btn"
            onClick={handleStepForward}
            disabled={currentStep >= loadedSteps}
            title={currentStep >= loadedSteps && isBackgroundLoading ? "Loading next steps…" : "Step forward"}
          >
            ›
          </button>
          <button className="rv-btn" onClick={handleReset} title="Reset">
            ↺ Reset
          </button>
        </div>

        <div className="rv-speed">
          <span className="rv-speed-label">Slow</span>
          <input
            type="range"
            className="rv-speed-slider"
            min={1}
            max={5}
            step={1}
            value={speedNotch}
            onChange={(e) => setSpeedNotch(Number(e.target.value))}
            aria-label="Playback speed"
          />
          <span className="rv-speed-label">Fast</span>
          <span className="rv-speed-value">
            {(SPEED_INTERVALS[speedNotch - 1] / 1000).toFixed(1)}s
          </span>
        </div>

        <div className="rv-step-info">{stepLabel}</div>
      </div>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="rv-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          <span className="rv-tooltip-coords">
            Row {tooltip.row}, Col {tooltip.col}
          </span>
          <span className="rv-tooltip-value">{tooltip.value}</span>
        </div>
      )}
    </div>
    </div>
  );
};

export default ResultsVisualization;
