import { describe, it, expect } from 'vitest';
import { parseValue } from '../usePrecomputedData';

describe('parseValue', () => {
  it('parses plain numbers', () => {
    expect(parseValue(42)).toBe(42);
    expect(parseValue(0)).toBe(0);
    expect(parseValue(-15.5)).toBe(-15.5);
  });

  it('parses numeric strings', () => {
    expect(parseValue('1013')).toBe(1013);
    expect(parseValue('23.5')).toBe(23.5);
  });

  it('parses strings with units by stopping at the first non-numeric character', () => {
    expect(parseValue('23.5°C')).toBe(23.5);
    expect(parseValue('-10.0°C')).toBe(-10.0);
    expect(parseValue('296.53K')).toBe(296.53);
  });

  it('returns NaN for empty string', () => {
    expect(parseValue('')).toBeNaN();
  });

  it('returns NaN for null', () => {
    expect(parseValue(null)).toBeNaN();
  });

  it('returns NaN for undefined', () => {
    expect(parseValue(undefined)).toBeNaN();
  });

  it('returns NaN for non-numeric strings', () => {
    expect(parseValue('abc')).toBeNaN();
  });
});
