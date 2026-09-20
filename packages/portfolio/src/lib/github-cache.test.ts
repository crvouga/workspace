import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSnapshot, writeSnapshot } from './github-cache';
import { loadGitHubInsights } from './github-insights';
import { summarizeRange } from './github-calendar';
import { buildRangeWindows } from './github-ranges';
import type { GitHubInsights } from './github-types';

const DAY_MS = 86_400_000;
const CREATED_AT = '2019-04-02T03:05:59Z';
const TEMP_DIRS: string[] = [];

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    const dir = TEMP_DIRS.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

const tempSnapshot = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-snapshot-'));
  TEMP_DIRS.push(dir);
  return join(dir, 'github-insights.json');
};

const days = (start: string, length: number) => {
  const base = new Date(`${start}T00:00:00Z`).getTime();
  return Array.from({ length }, (_, i) => ({
    date: new Date(base + i * DAY_MS).toISOString().slice(0, 10),
    count: i % 9,
  }));
};

const insightsFixture = (): GitHubInsights => {
  const trailing = summarizeRange(
    {
      id: 'last-12-months',
      label: 'Last 12 months',
      from: '2025-09-20',
      to: '2026-09-20',
      totalContributions: 4321,
    },
    days('2025-09-20', 366)
  );
  return {
    fetchedAt: '2026-09-20T20:29:41.349Z',
    source: 'live',
    login: 'crvouga',
    totalContributions: 4321,
    longestStreak: 76,
    currentStreak: 8,
    publicRepos: 81,
    followers: 13,
    ranges: [trailing],
  };
};

/** Stands in for GitHub being unreachable at build time. */
const failingFetch = (async () => {
  throw new TypeError('fetch failed');
}) as unknown as typeof fetch;

const noSleep = async (): Promise<void> => undefined;

/** Keeps assertions free of optional chaining, which reads as branching. */
const required = <T>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
};

describe('snapshot round trip', () => {
  test('rehydrates every day, shade, and statistic it stored', () => {
    const path = tempSnapshot();
    const original = insightsFixture();
    expect(writeSnapshot(original, path)).toBe(true);

    const restored = required(readSnapshot(path), 'snapshot');
    const before = required(original.ranges[0], 'original range');
    const after = required(restored.ranges[0], 'restored range');
    expect(restored.source).toBe('cache');
    expect(restored.totalContributions).toBe(original.totalContributions);
    expect(restored.publicRepos).toBe(original.publicRepos);
    expect(after.calendar).toEqual(before.calendar);
    expect(after.activeDays).toBe(before.activeDays);
    expect(after.busiestCount).toBe(before.busiestCount);
    expect(after.longestStreak).toBe(before.longestStreak);
  });

  test('returns null for a missing file', () => {
    expect(readSnapshot(join(tmpdir(), 'definitely-not-here.json'))).toBeNull();
  });

  test('rejects malformed, truncated, and stale-version snapshots', () => {
    const path = tempSnapshot();
    for (const body of [
      'not json',
      '{}',
      JSON.stringify({ version: 1, ranges: [] }),
      JSON.stringify({ ...insightsFixture(), version: 0 }),
    ]) {
      writeFileSync(path, body, 'utf8');
      expect(readSnapshot(path)).toBeNull();
    }
  });
});

describe('loadGitHubInsights uptime policy', () => {
  test('serves the snapshot when GitHub is unreachable', async () => {
    const path = tempSnapshot();
    writeSnapshot(insightsFixture(), path);

    const result = await loadGitHubInsights('crvouga', {
      token: 'ghp_test_token',
      fetchFn: failingFetch,
      sleepFn: noSleep,
      snapshotPath: path,
      persist: false,
    });

    const insights = required(result.insights, 'cached insights');
    expect(insights.source).toBe('cache');
    expect(insights.totalContributions).toBe(4321);
    expect(result.warning).toContain('request failed');
  });

  test('serves the snapshot when the token is missing entirely', async () => {
    const path = tempSnapshot();
    writeSnapshot(insightsFixture(), path);

    const result = await loadGitHubInsights('crvouga', {
      token: '',
      snapshotPath: path,
      persist: false,
    });

    expect(required(result.insights, 'cached insights').source).toBe('cache');
  });

  test('refreshes the snapshot after a successful fetch', async () => {
    const path = tempSnapshot();
    const fixture = insightsFixture();
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/graphql')) {
        const weeks = [
          {
            contributionDays: required(
              fixture.ranges[0],
              'fixture range'
            ).calendar.map((day) => ({
              date: day.date,
              contributionCount: day.count,
            })),
          },
        ];
        const collection = {
          contributionCalendar: { totalContributions: 4321, weeks },
        };
        const user: Record<string, unknown> = {};
        const windows = buildRangeWindows(new Date(), new Date(CREATED_AT));
        windows.forEach((_, i) => {
          user[`r${String(i)}`] = collection;
        });
        return new Response(JSON.stringify({ data: { user } }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          public_repos: 81,
          followers: 13,
          created_at: CREATED_AT,
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const result = await loadGitHubInsights('crvouga', {
      token: 'ghp_test_token',
      fetchFn,
      sleepFn: noSleep,
      snapshotPath: path,
    });

    expect(required(result.insights, 'live insights').source).toBe('live');
    expect(required(readSnapshot(path), 'snapshot').totalContributions).toBe(
      4321
    );
  });

  test('throws when there is no live data and no snapshot', async () => {
    const path = tempSnapshot();
    expect(
      loadGitHubInsights('crvouga', {
        token: 'ghp_test_token',
        fetchFn: failingFetch,
        sleepFn: noSleep,
        snapshotPath: path,
        persist: false,
      })
    ).rejects.toThrow('request failed');
  });

  test('degrades to a notice instead of throwing when allowMissing is set', async () => {
    const path = tempSnapshot();
    const result = await loadGitHubInsights('crvouga', {
      token: 'ghp_test_token',
      fetchFn: failingFetch,
      sleepFn: noSleep,
      snapshotPath: path,
      persist: false,
      allowMissing: true,
    });
    expect(result.insights).toBeNull();
    expect(result.warning).toContain('request failed');
  });
});
