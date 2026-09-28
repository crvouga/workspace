import { describe, expect, test } from 'bun:test';
import { levelOf, levelThresholds, withLevels } from './github-levels';

const days = (counts: readonly number[]) =>
  counts.map((count, i) => ({ date: `2025-01-${String(i + 1)}`, count }));

describe('levelThresholds', () => {
  test('are strictly increasing even when quartiles collide', () => {
    const [a, b, c] = levelThresholds(days([5, 5, 5, 5, 5, 5]));
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  test('ignore empty days, so a quiet period still shows contrast', () => {
    const counts = [0, 0, 0, 0, 1, 2, 3, 4];
    const levels = withLevels(days(counts)).map((day) => day.level);
    expect(levels.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(new Set(levels.slice(4)).size).toBeGreaterThan(1);
  });

  test('scale with the period, so a heavy period does not saturate', () => {
    const heavy = withLevels(
      days(Array.from({ length: 100 }, (_, i) => 20 + i))
    );
    const levels = new Set(heavy.map((day) => day.level));
    expect(levels).toEqual(new Set([1, 2, 3, 4]));
  });

  test('an all-zero period maps entirely to level 0', () => {
    const levels = withLevels(days([0, 0, 0])).map((day) => day.level);
    expect(levels).toEqual([0, 0, 0]);
  });
});

describe('levelOf', () => {
  test('buckets on inclusive upper bounds', () => {
    const thresholds = [2, 5, 9] as const;
    expect(levelOf(0, thresholds)).toBe(0);
    expect(levelOf(1, thresholds)).toBe(1);
    expect(levelOf(2, thresholds)).toBe(1);
    expect(levelOf(3, thresholds)).toBe(2);
    expect(levelOf(5, thresholds)).toBe(2);
    expect(levelOf(6, thresholds)).toBe(3);
    expect(levelOf(9, thresholds)).toBe(3);
    expect(levelOf(10, thresholds)).toBe(4);
  });
});
