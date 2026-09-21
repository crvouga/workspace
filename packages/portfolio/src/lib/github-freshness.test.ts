import { describe, expect, test } from 'bun:test';
import {
  freshnessOf,
  isStale,
  STALE_AFTER_DAYS,
  VERY_STALE_AFTER_DAYS,
} from './github-freshness';

const NOW = new Date('2026-09-20T12:00:00.000Z');

const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe('freshnessOf', () => {
  test('a same-day fetch reads as today and is not stale', () => {
    const freshness = freshnessOf(daysAgo(0), NOW);
    expect(freshness.level).toBe('fresh');
    expect(freshness.ageInDays).toBe(0);
    expect(freshness.label).toBe('today');
    expect(isStale(freshness)).toBe(false);
  });

  test('yesterday is still fresh: the daily refresh has not been missed yet', () => {
    const freshness = freshnessOf(daysAgo(1), NOW);
    expect(freshness.level).toBe('fresh');
    expect(freshness.label).toBe('1 day old');
    expect(isStale(freshness)).toBe(false);
  });

  test('a missed refresh crosses into stale at the configured threshold', () => {
    const freshness = freshnessOf(daysAgo(STALE_AFTER_DAYS), NOW);
    expect(freshness.level).toBe('stale');
    expect(freshness.label).toBe(`${String(STALE_AFTER_DAYS)} days old`);
    expect(isStale(freshness)).toBe(true);
  });

  test('a week of missed refreshes reads as very stale', () => {
    const freshness = freshnessOf(daysAgo(VERY_STALE_AFTER_DAYS + 30), NOW);
    expect(freshness.level).toBe('very-stale');
    expect(freshness.ageInDays).toBe(VERY_STALE_AFTER_DAYS + 30);
    expect(isStale(freshness)).toBe(true);
  });

  test('clock skew does not turn a fresh payload into a negative age', () => {
    // The refresh host can be minutes ahead of the render host; a payload from
    // "the future" is fresh, not broken.
    const freshness = freshnessOf(daysAgo(-1), NOW);
    expect(freshness.ageInDays).toBe(0);
    expect(freshness.level).toBe('fresh');
  });

  test('an unusable timestamp reports unknown rather than throwing', () => {
    const freshness = freshnessOf('not-a-date', NOW);
    expect(freshness.level).toBe('unknown');
    expect(freshness.ageInDays).toBe(-1);
    expect(freshness.label).toBe('age unknown');
    // Unknown age must not be treated as stale — that would flip CI red on a
    // malformed field rather than on an actual refresh failure.
    expect(isStale(freshness)).toBe(false);
  });
});
