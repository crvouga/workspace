import { describe, expect, test } from 'bun:test';
import {
  MAX_RANGE_WINDOWS,
  TRAILING_RANGE_ID,
  buildRangeWindows,
  windowBounds,
} from './github-ranges';

const NOW = new Date('2026-09-20T20:29:41.000Z');

describe('buildRangeWindows', () => {
  test('leads with the trailing year, then calendar years newest first', () => {
    const windows = buildRangeWindows(NOW);
    expect(windows[0]?.id).toBe(TRAILING_RANGE_ID);
    expect(windows[0]?.from).toBe('2025-09-20');
    expect(windows[0]?.to).toBe('2026-09-20');
    expect(windows.slice(1).map((w) => w.id)).toEqual([
      '2026',
      '2025',
      '2024',
      '2023',
    ]);
  });

  test('stops the current year at today, not at a future December', () => {
    const windows = buildRangeWindows(NOW);
    expect(windows[1]?.to).toBe('2026-09-20');
    expect(windows[2]?.to).toBe('2025-12-31');
  });

  test('never exceeds the number of panel-switching CSS rules', () => {
    expect(buildRangeWindows(NOW).length).toBeLessThanOrEqual(
      MAX_RANGE_WINDOWS
    );
  });

  test('keeps every window inside the one-year GraphQL limit', () => {
    const YEAR_MS = 366 * 86_400_000;
    for (const window of buildRangeWindows(NOW)) {
      const bounds = windowBounds(window);
      const span =
        new Date(bounds.to).getTime() - new Date(bounds.from).getTime();
      expect(span).toBeGreaterThan(0);
      expect(span).toBeLessThanOrEqual(YEAR_MS);
    }
  });

  test('ids are safe to use as DOM ids', () => {
    for (const window of buildRangeWindows(NOW)) {
      expect(window.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
