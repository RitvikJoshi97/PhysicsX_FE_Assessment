import { describe, it, expect } from 'vitest';
import { applyDelta, type FlatState } from '../usePrecomputedData';

function makeState(size: number): FlatState {
  return {
    temperature: new Array(size).fill('0°C'),
    pressure: new Array(size).fill(1000),
    kelvin: new Array(size).fill('273.15K'),
  };
}

describe('applyDelta', () => {
  it('mutates the correct flat index for a single cell', () => {
    const state = makeState(9); // 3x3
    const delta = [[1, 1, { temperature: '25°C', pressure: 1020, kelvin: '298K' }]] as any;
    applyDelta(state, delta, 3);
    const idx = 1 * 3 + 1; // = 4
    expect(state.temperature[idx]).toBe('25°C');
    expect(state.pressure[idx]).toBe(1020);
    expect(state.kelvin[idx]).toBe('298K');
  });

  it('returns the flat indices of changed cells', () => {
    const state = makeState(9);
    const delta = [
      [0, 0, { temperature: '1°C', pressure: 1001, kelvin: '274K' }],
      [2, 2, { temperature: '2°C', pressure: 1002, kelvin: '275K' }],
    ] as any;
    const changed = applyDelta(state, delta, 3);
    expect(changed).toEqual([0, 8]); // 0*3+0=0, 2*3+2=8
  });

  it('returns an empty array when values is empty', () => {
    const state = makeState(9);
    const changed = applyDelta(state, [], 3);
    expect(changed).toEqual([]);
    expect(state.temperature[0]).toBe('0°C'); // unchanged
  });

  it('skips out-of-bounds entries and does not include them in returned indices', () => {
    const state = makeState(9); // 3x3, valid indices 0-8
    const delta = [
      [0, 0, { temperature: '5°C', pressure: 1005, kelvin: '278K' }],
      [99, 99, { temperature: '99°C', pressure: 9999, kelvin: '999K' }], // out of bounds
    ] as any;
    const changed = applyDelta(state, delta, 3);
    expect(changed).toEqual([0]);
    expect(state.temperature[0]).toBe('5°C');
  });

  it('does not corrupt the state on out-of-bounds writes', () => {
    const state = makeState(4); // 2x2
    const before = [...state.temperature];
    applyDelta(state, [[99, 99, { temperature: 'X', pressure: 0, kelvin: 'Y' }]] as any, 2);
    expect(state.temperature).toEqual(before);
  });

  it('applies multiple deltas to different cells correctly', () => {
    const state = makeState(9);
    const delta = [
      [0, 0, { temperature: 'A', pressure: 1, kelvin: 'KA' }],
      [0, 1, { temperature: 'B', pressure: 2, kelvin: 'KB' }],
      [1, 0, { temperature: 'C', pressure: 3, kelvin: 'KC' }],
    ] as any;
    applyDelta(state, delta, 3);
    expect(state.temperature[0]).toBe('A');
    expect(state.temperature[1]).toBe('B');
    expect(state.temperature[3]).toBe('C');
    expect(state.temperature[4]).toBe('0°C'); // untouched
  });
});
