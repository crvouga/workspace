import { describe, expect, test } from 'bun:test';
import { buildHeatmapGrid } from './heatmap-grid';
import type { ContributionDay } from './github-types';

const DAY_MS = 86_400_000;

const days = (start: string, length: number): ContributionDay[] => {
  const base = new Date(`${start}T00:00:00Z`).getTime();
  return Array.from({ length }, (_, i) => ({
    date: new Date(base + i * DAY_MS).toISOString().slice(0, 10),
    count: i % 3,
    level: (i % 5) as 0 | 1 | 2 | 3 | 4,
  }));
};

describe('buildHeatmapGrid rows', () => {
  test('places every day on its real weekday row, not its index', () => {
    // 2025-09-20 is a Saturday: the first column holds one day, on row 6.
    const grid = buildHeatmapGrid(days('2025-09-20', 30));
    const first = grid.cells[0];
    expect(first?.row).toBe(6);
    expect(first?.column).toBe(0);
    const second = grid.cells[1];
    expect(second?.row).toBe(0);
    expect(second?.column).toBe(1);
  });

  test('a partial first week does not shear the rest of the grid', () => {
    const grid = buildHeatmapGrid(days('2025-09-20', 371));
    for (const cell of grid.cells) {
      const weekday = new Date(`${cell.day.date}T00:00:00Z`).getUTCDay();
      expect(cell.row).toBe(weekday);
    }
  });

  test('columns advance once per week', () => {
    const grid = buildHeatmapGrid(days('2025-01-05', 28));
    expect(grid.columns).toBe(4);
  });
});

describe('buildHeatmapGrid month labels', () => {
  test('labels months in order without crowding or overflow', () => {
    const grid = buildHeatmapGrid(days('2025-09-20', 371));
    expect(grid.months.length).toBeGreaterThanOrEqual(10);
    let previous = -Infinity;
    for (const month of grid.months) {
      expect(month.column).toBeGreaterThan(previous);
      expect(month.column).toBeLessThanOrEqual(grid.columns - 2);
      previous = month.column;
      expect(month.label).toMatch(/^[A-Z][a-z]{2}$/);
    }
  });

  test('names the month each labelled column starts in', () => {
    const grid = buildHeatmapGrid(days('2025-01-05', 120));
    const names = grid.months.map((month) => month.label);
    expect(names[0]).toBe('Jan');
    expect(names).toContain('Feb');
    expect(names).toContain('Mar');
  });
});

describe('buildHeatmapGrid guards', () => {
  test('rejects an empty calendar instead of rendering a blank grid', () => {
    expect(() => buildHeatmapGrid([])).toThrow('non-empty calendar');
  });
});
