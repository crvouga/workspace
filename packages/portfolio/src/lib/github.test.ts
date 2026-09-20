import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  fetchGitHubInsights,
  GitHubInsightsError,
  type GitHubInsightsErrorCode,
} from './github';
import { TRAILING_RANGE_ID, buildRangeWindows } from './github-ranges';

const ENV_KEY = 'PORTFOLIO_GITHUB_TOKEN';
const LOGIN = 'crvouga';
const CALENDAR_DAYS = 371;
const NOW = new Date('2025-06-01T00:00:00.000Z');
const WINDOW_COUNT = buildRangeWindows(NOW).length;

let savedToken: string | undefined;
beforeEach(() => {
  savedToken = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});
afterEach(() => {
  if (savedToken === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = savedToken;
  }
});

const isoDay = (index: number): string =>
  new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);

/** Index `i` carries count `i % 12`, so every level bucket (0–4) is present. */
const dayCounts = (count: number): number[] =>
  Array.from({ length: count }, (_, i) => i % 12);

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const collection = (counts: readonly number[]): unknown => ({
  contributionCalendar: {
    totalContributions: counts.reduce((sum, c) => sum + c, 0),
    weeks: chunk(
      counts.map((count, i) => ({
        date: isoDay(i),
        contributionCount: count,
      })),
      7
    ).map((days) => ({ contributionDays: days })),
  },
});

/**
 * One aliased field per selectable period; every period gets the same counts
 * unless a test overrides `perRange`.
 */
const calendarPayload = (
  counts: readonly number[],
  perRange: Readonly<Record<number, readonly number[]>> = {}
): unknown => {
  const user: Record<string, unknown> = {};
  for (let i = 0; i < WINDOW_COUNT; i += 1) {
    user[`r${String(i)}`] = collection(perRange[i] ?? counts);
  }
  return { data: { user } };
};

type FetchPlan = {
  readonly graphql: unknown;
  readonly graphqlStatus?: number;
  readonly rest: unknown;
  readonly restStatus?: number;
};

const createFetch = (
  plan: FetchPlan
): { calls: string[]; bodies: string[]; fetchFn: typeof fetch } => {
  const calls: string[] = [];
  const bodies: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push(url);
    if (typeof init?.body === 'string') bodies.push(init.body);
    const json = (body: unknown, status: number): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url.endsWith('/graphql')) {
      return json(plan.graphql, plan.graphqlStatus ?? 200);
    }
    if (url.includes('/users/')) {
      return json(plan.rest, plan.restStatus ?? 200);
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { calls, bodies, fetchFn };
};

/** No real backoff sleeps in tests. */
const noSleep = async (): Promise<void> => undefined;

const expectError = async (
  promise: Promise<unknown>,
  code: GitHubInsightsErrorCode
): Promise<GitHubInsightsError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(GitHubInsightsError);
    const insightsError = error as GitHubInsightsError;
    expect(insightsError.code).toBe(code);
    return insightsError;
  }
  throw new Error(`expected fetchGitHubInsights to reject with ${code}`);
};

const validProfile = { public_repos: 81, followers: 13 };

const fetchOk = async (
  fetchFn: typeof fetch,
  overrides: Record<string, unknown> = {}
) =>
  fetchGitHubInsights(LOGIN, {
    token: 'ghp_test_token',
    fetchFn,
    now: NOW,
    sleepFn: noSleep,
    ...overrides,
  });

describe('fetchGitHubInsights missing token', () => {
  test('throws before any network call for blank, whitespace, and unset tokens', async () => {
    for (const token of ['', '   ']) {
      const { calls, fetchFn } = createFetch({
        graphql: calendarPayload(dayCounts(CALENDAR_DAYS)),
        rest: validProfile,
      });
      const error = await expectError(
        fetchGitHubInsights(LOGIN, { token, fetchFn }),
        'missing-token'
      );
      expect(error.message).toContain(ENV_KEY);
      expect(error.message).toContain('secret/data/personal');
      expect(error.message).toContain('read:user');
      expect(calls.length).toBe(0);
    }

    const { calls, fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS)),
      rest: validProfile,
    });
    await expectError(fetchGitHubInsights(LOGIN, { fetchFn }), 'missing-token');
    expect(calls.length).toBe(0);
  });
});

describe('fetchGitHubInsights success', () => {
  test('returns the validated periods, streaks, and profile stats', async () => {
    const counts = dayCounts(CALENDAR_DAYS);
    const { calls, fetchFn } = createFetch({
      graphql: calendarPayload(counts),
      rest: validProfile,
    });
    const insights = await fetchOk(fetchFn);
    const trailing = insights.ranges[0];

    expect(insights.source).toBe('live');
    expect(insights.login).toBe(LOGIN);
    expect(insights.fetchedAt).toBe(NOW.toISOString());
    expect(trailing?.id).toBe(TRAILING_RANGE_ID);
    expect(trailing?.calendar.length).toBe(CALENDAR_DAYS);
    expect(trailing?.calendar[0]).toEqual({
      date: isoDay(0),
      count: 0,
      level: 0,
    });
    expect(insights.totalContributions).toBe(
      counts.reduce((sum, c) => sum + c, 0)
    );
    expect(insights.longestStreak).toBe(11);
    expect(insights.currentStreak).toBe(10);
    expect(insights.publicRepos).toBe(81);
    expect(insights.followers).toBe(13);

    expect(calls.length).toBe(2);
    expect(calls.some((url) => url.endsWith('/graphql'))).toBe(true);
    expect(calls.some((url) => url.includes(`/users/${LOGIN}`))).toBe(true);
  });

  test('requests every selectable period in one GraphQL document', async () => {
    const { bodies, fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS)),
      rest: validProfile,
    });
    const insights = await fetchOk(fetchFn);
    const body = bodies[0] ?? '';

    expect(insights.ranges.length).toBe(WINDOW_COUNT);
    expect(bodies.length).toBe(1);
    for (let i = 0; i < WINDOW_COUNT; i += 1) {
      expect(body).toContain(`r${String(i)}:contributionsCollection`);
      expect(body).toContain(`"f${String(i)}"`);
      expect(body).toContain(`"t${String(i)}"`);
    }
  });

  test('drops calendar-year periods the account predates', async () => {
    const empty = dayCounts(CALENDAR_DAYS).map(() => 0);
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS), {
        [WINDOW_COUNT - 1]: empty,
      }),
      rest: validProfile,
    });
    const insights = await fetchOk(fetchFn);
    expect(insights.ranges.length).toBe(WINDOW_COUNT - 1);
    expect(insights.ranges.every((range) => range.totalContributions > 0)).toBe(
      true
    );
  });

  test('scales shades to each period instead of saturating at a fixed bucket', async () => {
    const busy = Array.from({ length: CALENDAR_DAYS }, (_, i) => 20 + (i % 80));
    const { fetchFn } = createFetch({
      graphql: calendarPayload(busy),
      rest: validProfile,
    });
    const insights = await fetchOk(fetchFn);
    const levels = new Set(
      insights.ranges[0]?.calendar.map((day) => day.level) ?? []
    );
    // Fixed 10+ buckets would put every one of these days at level 4.
    expect(levels.has(1)).toBe(true);
    expect(levels.has(2)).toBe(true);
    expect(levels.has(3)).toBe(true);
    expect(levels.has(4)).toBe(true);
  });

  test('keeps a legitimate zero follower count', async () => {
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS)),
      rest: { public_repos: 4, followers: 0 },
    });
    const insights = await fetchOk(fetchFn);
    expect(insights.followers).toBe(0);
    expect(insights.publicRepos).toBe(4);
  });
});

describe('fetchGitHubInsights retries', () => {
  test('retries a 503 and succeeds without the caller noticing', async () => {
    let graphqlCalls = 0;
    const payload = JSON.stringify(calendarPayload(dayCounts(CALENDAR_DAYS)));
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/graphql')) {
        graphqlCalls += 1;
        if (graphqlCalls < 3) return new Response('busy', { status: 503 });
        return new Response(payload, { status: 200 });
      }
      return new Response(JSON.stringify(validProfile), { status: 200 });
    }) as typeof fetch;

    const insights = await fetchOk(fetchFn);
    expect(graphqlCalls).toBe(3);
    expect(insights.totalContributions).toBeGreaterThan(0);
  });

  test('does not retry a 401, which is a credential problem', async () => {
    let graphqlCalls = 0;
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/graphql')) {
        graphqlCalls += 1;
        return new Response('nope', { status: 401 });
      }
      return new Response(JSON.stringify(validProfile), { status: 200 });
    }) as typeof fetch;

    await expectError(fetchOk(fetchFn), 'api-error');
    expect(graphqlCalls).toBe(1);
  });
});

describe('fetchGitHubInsights unusable calendar', () => {
  test('GraphQL errors name the read:user token scope', async () => {
    const { fetchFn } = createFetch({
      graphql: { errors: [{ message: 'Bad credentials' }] },
      rest: validProfile,
    });
    const error = await expectError(fetchOk(fetchFn), 'api-error');
    expect(error.message).toContain('read:user');
    expect(error.message).toContain('contribution visibility');
    expect(error.message).toContain('secret/data/personal');
  });

  test('all-zero contributions fail as a visibility failure, not blank data', async () => {
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS).map(() => 0)),
      rest: validProfile,
    });
    const error = await expectError(fetchOk(fetchFn), 'empty-calendar');
    expect(error.message).toContain('no visible contributions');
    expect(error.message).toContain('read:user');
    expect(error.message).toContain('secret/data/personal');
  });

  test('a truncated trailing calendar is rejected', async () => {
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(100)),
      rest: validProfile,
    });
    const error = await expectError(fetchOk(fetchFn), 'invalid-response');
    expect(error.message).toContain('expected at least');
  });
});

describe('fetchGitHubInsights profile failures', () => {
  test('non-2xx profile response names the endpoint and Vault key', async () => {
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS)),
      rest: { message: 'boom' },
      restStatus: 500,
    });
    const error = await expectError(fetchOk(fetchFn), 'api-error');
    expect(error.message).toContain(`/users/${LOGIN}`);
    expect(error.message).toContain('HTTP 500');
    expect(error.message).toContain(ENV_KEY);
  });

  test('malformed profile stats name the endpoint and Vault key', async () => {
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS)),
      rest: { public_repos: 'many' },
    });
    const error = await expectError(fetchOk(fetchFn), 'invalid-response');
    expect(error.message).toContain(`/users/${LOGIN}`);
    expect(error.message).toContain(ENV_KEY);
  });
});
