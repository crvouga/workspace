/**
 * Contribution → shade mapping.
 *
 * Fixed buckets (1–2, 3–5, 6–9, 10+) are GitHub's public documentation, but they
 * flatten a high-volume account into a solid wall of the darkest shade: at ~35
 * contributions a day every square saturates and the map stops carrying any
 * information. Thresholds are therefore derived from each period's own
 * distribution — the quartiles of its active days — so both a heavy year and a
 * light one read as a range of intensities.
 */

import type { ContributionDay, RawContributionDay } from './github-types';

export type LevelThresholds = readonly [number, number, number];

/** Used when a period has no activity at all; every day maps to level 0. */
const EMPTY_THRESHOLDS: LevelThresholds = [1, 2, 3];

const quantile = (sorted: readonly number[], fraction: number): number => {
  const index = Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * fraction)
  );
  return sorted[index] ?? 1;
};

/**
 * Strictly increasing by construction: without the `Math.max` floor a period
 * whose quartiles collide (many identical daily counts) would collapse several
 * shades into one.
 */
export const levelThresholds = (
  days: readonly RawContributionDay[]
): LevelThresholds => {
  const active = days
    .map((day) => day.count)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  if (active.length === 0) return EMPTY_THRESHOLDS;
  const first = quantile(active, 0.25);
  const second = Math.max(first + 1, quantile(active, 0.5));
  const third = Math.max(second + 1, quantile(active, 0.75));
  return [first, second, third];
};

export const levelOf = (
  count: number,
  thresholds: LevelThresholds
): 0 | 1 | 2 | 3 | 4 => {
  if (count <= 0) return 0;
  if (count <= thresholds[0]) return 1;
  if (count <= thresholds[1]) return 2;
  if (count <= thresholds[2]) return 3;
  return 4;
};

export const withLevels = (
  days: readonly RawContributionDay[]
): readonly ContributionDay[] => {
  const thresholds = levelThresholds(days);
  return days.map((day) => ({
    date: day.date,
    count: day.count,
    level: levelOf(day.count, thresholds),
  }));
};
