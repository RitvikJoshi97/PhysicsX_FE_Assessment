"""
generate_test_data.py

Generates data_test.json: a 100×100 grid with 30 iterations.
Same shape as data.json — drop-in replacement for stress testing.

Usage:
    python3 generate_test_data.py
"""

import json
import random

ROWS = 100
COLS = 100
ITERATIONS = 30
TEMP_RANGE = (-60, 120)   # °C
PRESSURE_RANGE = (900, 1200)
SEED = 42

random.seed(SEED)


def make_temp(value: float) -> str:
    return f"{value:.1f}°C"


def make_kelvin(value: float) -> str:
    return f"{value:.2f}K"


def make_cell(temp: float, pressure: int) -> dict:
    return {
        "temperature": make_temp(temp),
        "pressure": pressure,
        "kelvin": make_kelvin(temp + 0.03),
    }


# ── Base grid ──────────────────────────────────────────────────────────────────

# Start with a base temperature field — slight spatial variation so the colour
# scale looks interesting rather than random noise.
base_temps = []
base_pressures = []

for r in range(ROWS):
    temp_row = []
    pressure_row = []
    for c in range(COLS):
        # Gentle wave pattern + noise
        wave = 30 * (r / ROWS) * (c / COLS)
        noise = random.uniform(-10, 10)
        temp = round(wave + noise, 1)
        temp = max(TEMP_RANGE[0], min(TEMP_RANGE[1], temp))

        pressure = random.randint(*PRESSURE_RANGE)
        temp_row.append(temp)
        pressure_row.append(pressure)

    base_temps.append(temp_row)
    base_pressures.append(pressure_row)

grid = {
    "temperature": [[make_temp(t) for t in row] for row in base_temps],
    "pressure":    base_pressures,
    "kelvin":      [[make_kelvin(t + 0.03) for t in row] for row in base_temps],
}

# ── Iterations ─────────────────────────────────────────────────────────────────
# Each iteration updates every cell (full grid replacement per step),
# simulating a time-series field evolving over 30 steps.

iterations = []
current_temps = [row[:] for row in base_temps]
current_pressures = [row[:] for row in base_pressures]

for step in range(ITERATIONS):
    values = []
    for r in range(ROWS):
        for c in range(COLS):
            # Evolve: drift toward a target + noise
            delta_temp = random.uniform(-3, 3)
            new_temp = round(current_temps[r][c] + delta_temp, 1)
            new_temp = max(TEMP_RANGE[0], min(TEMP_RANGE[1], new_temp))
            current_temps[r][c] = new_temp

            delta_pressure = random.randint(-5, 5)
            new_pressure = current_pressures[r][c] + delta_pressure
            new_pressure = max(PRESSURE_RANGE[0], min(PRESSURE_RANGE[1], new_pressure))
            current_pressures[r][c] = new_pressure

            values.append([r, c, make_cell(new_temp, new_pressure)])

    iterations.append({"step": step, "values": values})

    if step % 5 == 0:
        print(f"  step {step}/{ITERATIONS} done")

# ── Write ──────────────────────────────────────────────────────────────────────

output = [{"grid": grid, "iterations": iterations}]

with open("data_test.json", "w") as f:
    json.dump(output, f, separators=(",", ":"))

total_cells = ITERATIONS * ROWS * COLS
size_mb = len(json.dumps(output, separators=(",", ":"))) / 1_000_000

print(f"\ndata_test.json written")
print(f"  Grid:       {ROWS}×{COLS}")
print(f"  Iterations: {ITERATIONS}")
print(f"  Total cell updates: {total_cells:,}")
print(f"  File size:  {size_mb:.1f} MB")
