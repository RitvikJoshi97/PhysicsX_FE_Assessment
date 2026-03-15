import { describe, it, expect } from 'vitest';
import { buildColorScales } from '../usePrecomputedData';

const baseGrid = {
  temperature: [['10°C', '20°C'], ['30°C', '40°C']],
  pressure: [[900, 950], [1000, 1050]],
  kelvin: [['283K', '293K'], ['303K', '313K']],
};

const iterations = [
  {
    step: 0,
    values: [
      [0, 0, { temperature: '5°C', pressure: 850, kelvin: '278K' }],
      [1, 1, { temperature: '50°C', pressure: 1100, kelvin: '323K' }],
    ],
  },
];

describe('buildColorScales', () => {
  it('returns a scale function and range for each metric', () => {
    const { scales, ranges } = buildColorScales(baseGrid as any, iterations as any);
    for (const metric of ['temperature', 'pressure', 'kelvin'] as const) {
      expect(typeof scales[metric]).toBe('function');
      expect(ranges[metric]).toHaveLength(2);
    }
  });

  it('range min is less than or equal to range max', () => {
    const { ranges } = buildColorScales(baseGrid as any, iterations as any);
    for (const metric of ['temperature', 'pressure', 'kelvin'] as const) {
      expect(ranges[metric][0]).toBeLessThanOrEqual(ranges[metric][1]);
    }
  });

  it('range includes values from iterations, not just the base grid', () => {
    const { ranges } = buildColorScales(baseGrid as any, iterations as any);
    // iteration has pressure 850 (below base grid min of 900)
    expect(ranges.pressure[0]).toBe(850);
    // iteration has pressure 1100 (above base grid max of 1050)
    expect(ranges.pressure[1]).toBe(1100);
  });

  it('scale function returns a string (colour)', () => {
    const { scales, ranges } = buildColorScales(baseGrid as any, iterations as any);
    const midpoint = (ranges.pressure[0] + ranges.pressure[1]) / 2;
    const colour = scales.pressure(midpoint);
    expect(typeof colour).toBe('string');
    expect(colour.length).toBeGreaterThan(0);
  });

  it('falls back to [0, 1] domain when all values are NaN', () => {
    const emptyGrid = { temperature: [['']], pressure: [[null]], kelvin: [['']] };
    const { ranges } = buildColorScales(emptyGrid as any, []);
    expect(ranges.temperature).toEqual([0, 1]);
  });
});
