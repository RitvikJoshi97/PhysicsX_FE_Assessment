import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResultsVisualization from '../ResultsVisualization';

// Mock usePrecomputedData so tests don't need a real server
vi.mock('../usePrecomputedData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../usePrecomputedData')>();
  return {
    ...actual,
    usePrecomputedData: vi.fn(),
  };
});

import { usePrecomputedData } from '../usePrecomputedData';

// Minimal precomputed data for a 2x2 grid with 2 steps
const makeStep = (changedIndices: number[]) => ({
  temperature: { values: ['10°C', '20°C', '30°C', '40°C'], colors: ['#f00', '#f80', '#0f0', '#00f'] },
  pressure: { values: [900, 950, 1000, 1050], colors: ['#f00', '#f80', '#0f0', '#00f'] },
  kelvin: { values: ['283K', '293K', '303K', '313K'], colors: ['#f00', '#f80', '#0f0', '#00f'] },
  changedIndices,
});

const mockData = {
  steps: [makeStep([]), makeStep([0, 1]), makeStep([2, 3])],
  rows: 2,
  cols: 2,
  totalSteps: 2,
  loadedSteps: 2,
  metricRanges: {
    temperature: [10, 40] as [number, number],
    pressure: [900, 1050] as [number, number],
    kelvin: [283, 313] as [number, number],
  },
};

// Stub canvas methods jsdom doesn't implement
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    scale: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
  } as any);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ResultsVisualization — loading state', () => {
  it('shows spinner while loading', () => {
    (usePrecomputedData as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null, loading: true, error: null,
    });
    render(<ResultsVisualization />);
    expect(screen.getByText(/pre-computing/i)).toBeInTheDocument();
  });
});

describe('ResultsVisualization — error state', () => {
  it('shows error message when fetch fails', () => {
    (usePrecomputedData as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null, loading: false, error: 'API error: grid.pressure is not an array',
    });
    render(<ResultsVisualization />);
    expect(screen.getByText(/grid\.pressure is not an array/i)).toBeInTheDocument();
  });
});

describe('ResultsVisualization — loaded state', () => {
  beforeEach(() => {
    (usePrecomputedData as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockData, loading: false, error: null,
    });
  });

  it('renders all three metric tabs', () => {
    render(<ResultsVisualization />);
    expect(screen.getByRole('tab', { name: /temperature/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /pressure/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /kelvin/i })).toBeInTheDocument();
  });

  it('Temperature tab is active by default', () => {
    render(<ResultsVisualization />);
    expect(screen.getByRole('tab', { name: /temperature/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /pressure/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a different tab makes it active', () => {
    render(<ResultsVisualization />);
    fireEvent.click(screen.getByRole('tab', { name: /pressure/i }));
    expect(screen.getByRole('tab', { name: /pressure/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /temperature/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('step back is disabled at step 0', () => {
    render(<ResultsVisualization />);
    expect(screen.getByTitle(/step back/i)).toBeDisabled();
  });

  it('step forward is enabled when loadedSteps > 0', () => {
    render(<ResultsVisualization />);
    expect(screen.getByTitle(/step forward/i)).not.toBeDisabled();
  });

  it('step forward advances the step label', async () => {
    render(<ResultsVisualization />);
    expect(screen.getByText(/base state/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/step forward/i));
    await waitFor(() => {
      expect(screen.getByText(/step 1 \/ 2/i)).toBeInTheDocument();
    });
  });

  it('reset returns to base state', async () => {
    render(<ResultsVisualization />);
    fireEvent.click(screen.getByTitle(/step forward/i));
    await waitFor(() => screen.getByText(/step 1/i));
    fireEvent.click(screen.getByTitle(/reset/i));
    await waitFor(() => {
      expect(screen.getByText(/base state/i)).toBeInTheDocument();
    });
  });

  it('play button toggles to pause', () => {
    render(<ResultsVisualization />);
    const playBtn = screen.getByText(/▶ play/i);
    fireEvent.click(playBtn);
    expect(screen.getByText(/⏸ pause/i)).toBeInTheDocument();
  });

  it('filter checkbox is unchecked initially', () => {
    render(<ResultsVisualization />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('checking filter shows the min/max sliders', () => {
    render(<ResultsVisualization />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByLabelText(/min/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max/i)).toBeInTheDocument();
  });

  it('unchecking filter hides the sliders', () => {
    render(<ResultsVisualization />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox); // enable
    fireEvent.click(checkbox); // disable
    expect(screen.queryByLabelText(/min/i)).not.toBeInTheDocument();
  });

  it('switching metric resets filter to disabled', () => {
    render(<ResultsVisualization />);
    fireEvent.click(screen.getByRole('checkbox')); // enable filter
    expect(screen.getByRole('checkbox')).toBeChecked();
    fireEvent.click(screen.getByRole('tab', { name: /pressure/i }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
