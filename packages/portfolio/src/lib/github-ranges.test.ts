import { describe, expect, test } from 'bun:test';
import {
  MAX_RANGE_WINDOWS,
  TRAILING_RANGE_ID,
  buildRangeWindows,
  windowBounds,
} from './github-ranges';

const NOW = new Date('2026-09-20T20:29:41.000Z');
const CREATED = new Date('2019-04-02T03:05:59.000Z');

describe('buildRangeWindows', () => {
  test('leads with the trailing year, then calendar years newest first', () => {
    const windows = buildRangeWindows(NOW, CREATED);
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

  test('caps at MAX_RANGE_WINDOWS, keeping the newest years', () => {
    // An older account does not get more panels: each one costs ~370 rects,
    // and the oldest years are the ones nobody reads.
    const older = buildRangeWindows(NOW, new Date('2012-11-05T00:00:00.000Z'));
    expect(older.length).toBe(MAX_RANGE_WINDOWS);
    expect(older.at(-1)?.id).toBe('2023');
  });

  test('a young account yields only the years it actually spans', () => {
    const newer = buildRangeWindows(NOW, new Date('2025-01-10T00:00:00.000Z'));
    expect(newer.map((w) => w.id)).toEqual([TRAILING_RANGE_ID, '2026', '2025']);
  });

  test('an account created this year yields just the current year', () => {
    const windows = buildRangeWindows(
      NOW,
      new Date('2026-03-01T00:00:00.000Z')
    );
    expect(windows.map((w) => w.id)).toEqual([TRAILING_RANGE_ID, '2026']);
  });

  test('a creation date in the future cannot produce a backwards range', () => {
    const windows = buildRangeWindows(
      NOW,
      new Date('2031-01-01T00:00:00.000Z')
    );
    expect(windows.map((w) => w.id)).toEqual([TRAILING_RANGE_ID, '2026']);
  });

  test('an implausible creation date is capped, keeping the newest years', () => {
    const windows = buildRangeWindows(NOW, new Date(0));
    expect(windows.length).toBe(MAX_RANGE_WINDOWS);
    expect(windows[0]?.id).toBe(TRAILING_RANGE_ID);
    expect(windows[1]?.id).toBe('2026');
  });

  test('stops the current year at today, not at a future December', () => {
    const windows = buildRangeWindows(NOW, CREATED);
    expect(windows[1]?.to).toBe('2026-09-20');
    expect(windows[2]?.to).toBe('2025-12-31');
  });

  test('keeps every window inside the one-year GraphQL limit', () => {
    const YEAR_MS = 366 * 86_400_000;
    for (const window of buildRangeWindows(NOW, CREATED)) {
      const bounds = windowBounds(window);
      const span =
        new Date(bounds.to).getTime() - new Date(bounds.from).getTime();
      expect(span).toBeGreaterThan(0);
      expect(span).toBeLessThanOrEqual(YEAR_MS);
    }
  });

  test('ids are safe to use as DOM ids', () => {
    for (const window of buildRangeWindows(NOW, CREATED)) {
      expect(window.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
