import { describe, it, expect } from 'vitest';
import { validateApiShape } from '../usePrecomputedData';

const validGrid = {
  temperature: [['10°C']],
  pressure: [[1013]],
  kelvin: [['283.15K']],
};

const validIterations = [
  { step: 0, values: [[0, 0, { temperature: '11°C', pressure: 1014, kelvin: '284K' }]] },
];

describe('validateApiShape', () => {
  it('does not throw for valid data', () => {
    expect(() => validateApiShape(validGrid, validIterations)).not.toThrow();
  });

  it('throws when grid is null', () => {
    expect(() => validateApiShape(null, validIterations))
      .toThrow('grid is missing or not an object');
  });

  it('throws when grid is a non-object primitive', () => {
    expect(() => validateApiShape('oops', validIterations))
      .toThrow('grid is missing or not an object');
  });

  it('throws when grid.temperature is missing', () => {
    expect(() => validateApiShape({ pressure: [[1013]], kelvin: [['283K']] }, validIterations))
      .toThrow('grid.temperature is not an array');
  });

  it('throws when grid.pressure is not an array', () => {
    expect(() => validateApiShape({ ...validGrid, pressure: 'bad' }, validIterations))
      .toThrow('grid.pressure is not an array');
  });

  it('throws when iterations is not an array', () => {
    expect(() => validateApiShape(validGrid, 'bad'))
      .toThrow('iterations is not an array');
  });

  it('throws when an iteration has no values array', () => {
    expect(() => validateApiShape(validGrid, [{ step: 0 }]))
      .toThrow('iterations[0].values is not an array');
  });

  it('throws on the correct index when a later iteration is malformed', () => {
    expect(() => validateApiShape(validGrid, [validIterations[0], { step: 1 }]))
      .toThrow('iterations[1].values is not an array');
  });
});
