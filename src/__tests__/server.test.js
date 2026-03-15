import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server.js';

// Minimal fixture data — 5 iterations on a 2x2 grid
const gridData = {
  temperature: [['10°C', '20°C'], ['30°C', '40°C']],
  pressure: [[900, 950], [1000, 1050]],
  kelvin: [['283K', '293K'], ['303K', '313K']],
};

const iterationsData = Array.from({ length: 5 }, (_, i) => ({
  step: i,
  values: [[0, 0, { temperature: `${i}°C`, pressure: 900 + i, kelvin: `${273 + i}K` }]],
}));

const app = createApp(gridData, iterationsData);

describe('GET /api/grid', () => {
  it('returns 200 with grid data', async () => {
    const res = await request(app).get('/api/grid');
    expect(res.status).toBe(200);
    expect(res.body.grid).toBeDefined();
  });

  it('grid has temperature, pressure, kelvin arrays', async () => {
    const res = await request(app).get('/api/grid');
    expect(Array.isArray(res.body.grid.temperature)).toBe(true);
    expect(Array.isArray(res.body.grid.pressure)).toBe(true);
    expect(Array.isArray(res.body.grid.kelvin)).toBe(true);
  });
});

describe('GET /api/iterations — pagination', () => {
  it('returns first page with correct count', async () => {
    const res = await request(app).get('/api/iterations?page=0&size=3');
    expect(res.status).toBe(200);
    expect(res.body.iterations).toHaveLength(3);
    expect(res.body.page).toBe(0);
    expect(res.body.size).toBe(3);
  });

  it('returns total count of all iterations', async () => {
    const res = await request(app).get('/api/iterations?page=0&size=3');
    expect(res.body.total).toBe(5);
  });

  it('sets hasMore true when more pages exist', async () => {
    const res = await request(app).get('/api/iterations?page=0&size=3');
    expect(res.body.hasMore).toBe(true);
  });

  it('second page does not overlap with first page', async () => {
    const page0 = await request(app).get('/api/iterations?page=0&size=3');
    const page1 = await request(app).get('/api/iterations?page=1&size=3');
    const steps0 = page0.body.iterations.map((i) => i.step);
    const steps1 = page1.body.iterations.map((i) => i.step);
    const overlap = steps0.filter((s) => steps1.includes(s));
    expect(overlap).toHaveLength(0);
  });

  it('last page sets hasMore false', async () => {
    const res = await request(app).get('/api/iterations?page=1&size=3');
    expect(res.body.hasMore).toBe(false);
  });

  it('page beyond end returns empty iterations and hasMore false', async () => {
    const res = await request(app).get('/api/iterations?page=999&size=3');
    expect(res.body.iterations).toHaveLength(0);
    expect(res.body.hasMore).toBe(false);
  });

  it('clamps size to maximum of 100', async () => {
    const res = await request(app).get('/api/iterations?page=0&size=9999');
    expect(res.body.size).toBe(100);
  });

  it('clamps size to minimum of 1', async () => {
    const res = await request(app).get('/api/iterations?page=0&size=0');
    expect(res.body.size).toBe(1);
  });

  it('defaults page to 0 when omitted', async () => {
    const res = await request(app).get('/api/iterations');
    expect(res.body.page).toBe(0);
  });

  it('defaults size to 3 when omitted', async () => {
    const res = await request(app).get('/api/iterations');
    expect(res.body.size).toBe(3);
  });

  it('handles non-numeric page param without crashing', async () => {
    const res = await request(app).get('/api/iterations?page=abc&size=3');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(0); // NaN → max(0, NaN) → 0
  });
});
