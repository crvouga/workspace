import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  fetchGitHubInsights,
  GitHubInsightsError,
  type GitHubInsightsErrorCode,
} from './github';

const ENV_KEY = 'PORTFOLIO_GITHUB_TOKEN';
const LOGIN = 'crvouga';
const CALENDAR_DAYS = 371;

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

const calendarPayload = (counts: readonly number[]): unknown => ({
  data: {
    user: {
      contributionsCollection: {
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
      },
    },
  },
});

type FetchPlan = {
  readonly graphql: unknown;
  readonly graphqlStatus?: number;
  readonly rest: unknown;
  readonly restStatus?: number;
};

const createFetch = (
  plan: FetchPlan
): { calls: string[]; fetchFn: typeof fetch } => {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push(url);
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
  return { calls, fetchFn };
};

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
  test('returns the validated calendar, streaks, and profile stats', async () => {
    const counts = dayCounts(CALENDAR_DAYS);
    const { calls, fetchFn } = createFetch({
      graphql: calendarPayload(counts),
      rest: { public_repos: 81, followers: 13 },
    });
    const now = new Date('2025-06-01T00:00:00.000Z');
    const insights = await fetchGitHubInsights(LOGIN, {
      token: 'ghp_test_token',
      fetchFn,
      now,
    });

    expect(insights.calendar.length).toBe(CALENDAR_DAYS);
    expect(insights.fetchedAt).toBe(now.toISOString());
    expect(insights.calendar[0]).toEqual({
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

  test('maps every contribution bucket boundary to the GitHub level', async () => {
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS)),
      rest: validProfile,
    });
    const insights = await fetchGitHubInsights(LOGIN, {
      token: 'ghp_test_token',
      fetchFn,
    });
    const levelFor = (count: number): number | undefined =>
      insights.calendar.find((day) => day.count === count)?.level;
    expect(levelFor(0)).toBe(0);
    expect(levelFor(1)).toBe(1);
    expect(levelFor(2)).toBe(1);
    expect(levelFor(3)).toBe(2);
    expect(levelFor(5)).toBe(2);
    expect(levelFor(6)).toBe(3);
    expect(levelFor(9)).toBe(3);
    expect(levelFor(10)).toBe(4);
    expect(levelFor(11)).toBe(4);
  });

  test('keeps a legitimate zero follower count', async () => {
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS)),
      rest: { public_repos: 4, followers: 0 },
    });
    const insights = await fetchGitHubInsights(LOGIN, {
      token: 'ghp_test_token',
      fetchFn,
    });
    expect(insights.followers).toBe(0);
    expect(insights.publicRepos).toBe(4);
  });
});

describe('fetchGitHubInsights unusable calendar', () => {
  test('GraphQL errors name the read:user token scope', async () => {
    const { fetchFn } = createFetch({
      graphql: { errors: [{ message: 'Bad credentials' }] },
      rest: validProfile,
    });
    const error = await expectError(
      fetchGitHubInsights(LOGIN, { token: 'ghp_test_token', fetchFn }),
      'api-error'
    );
    expect(error.message).toContain('read:user');
    expect(error.message).toContain('contribution visibility');
    expect(error.message).toContain('secret/data/personal');
  });

  test('all-zero contributions fail as a visibility failure, not blank data', async () => {
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS).map(() => 0)),
      rest: validProfile,
    });
    const error = await expectError(
      fetchGitHubInsights(LOGIN, { token: 'ghp_test_token', fetchFn }),
      'empty-calendar'
    );
    expect(error.message).toContain('no visible contributions');
    expect(error.message).toContain('read:user');
    expect(error.message).toContain('secret/data/personal');
  });
});

describe('fetchGitHubInsights profile failures', () => {
  test('non-2xx profile response names the endpoint and Vault key', async () => {
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS)),
      rest: { message: 'boom' },
      restStatus: 500,
    });
    const error = await expectError(
      fetchGitHubInsights(LOGIN, { token: 'ghp_test_token', fetchFn }),
      'api-error'
    );
    expect(error.message).toContain(`/users/${LOGIN}`);
    expect(error.message).toContain('HTTP 500');
    expect(error.message).toContain(ENV_KEY);
  });

  test('malformed profile stats name the endpoint and Vault key', async () => {
    const { fetchFn } = createFetch({
      graphql: calendarPayload(dayCounts(CALENDAR_DAYS)),
      rest: { public_repos: 'many' },
    });
    const error = await expectError(
      fetchGitHubInsights(LOGIN, { token: 'ghp_test_token', fetchFn }),
      'invalid-response'
    );
    expect(error.message).toContain(`/users/${LOGIN}`);
    expect(error.message).toContain(ENV_KEY);
  });
});
