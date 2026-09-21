/**
 * Build-time GitHub insights for the portfolio proof section.
 *
 * Runs inside `astro build` under Node: plain fetch only, no Bun APIs.
 *
 * This module is the *live* fetch. It still throws {@link GitHubInsightsError}
 * on every failure — the uptime policy (retry, then fall back to the committed
 * snapshot) lives in lib/github-insights.ts so the fetch stays a pure,
 * fully-validated source of truth.
 */

import { fetchRanges, currentStreakOf } from './github-calendar';
import {
  ENV_TOKEN_KEY,
  GitHubInsightsError,
  MISSING_TOKEN_MESSAGE,
  REMEDIATION,
} from './github-error';
import { requestJson, type RequestConfig } from './github-http';
import { buildRangeWindows } from './github-ranges';
import type { GitHubFetchOptions, GitHubInsights } from './github-types';

export { GitHubInsightsError } from './github-error';
export type { GitHubInsightsErrorCode } from './github-error';
export type {
  ContributionDay,
  ContributionRange,
  GitHubFetchOptions,
  GitHubInsights,
  InsightsSource,
} from './github-types';

const toRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

const resolveToken = (options: GitHubFetchOptions): string => {
  const raw = options.token ?? process.env[ENV_TOKEN_KEY];
  const token = raw?.trim() ?? '';
  if (token.length === 0) {
    throw new GitHubInsightsError('missing-token', MISSING_TOKEN_MESSAGE);
  }
  return token;
};

type Profile = {
  readonly publicRepos: number;
  readonly followers: number;
  /** Bounds how far back the period picker can reach. */
  readonly createdAt: Date;
};

const fetchProfile = async (
  config: RequestConfig,
  login: string,
  token: string
): Promise<Profile> => {
  const context = `GitHub profile endpoint (GET /users/${login})`;
  const json = await requestJson(config, {
    url: `https://api.github.com/users/${encodeURIComponent(login)}`,
    init: {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'portfolio-build',
        Accept: 'application/vnd.github+json',
      },
    },
    context,
  });
  const profile = toRecord(json);
  const publicRepos = profile?.['public_repos'];
  const followers = profile?.['followers'];
  if (typeof publicRepos !== 'number' || typeof followers !== 'number') {
    throw new GitHubInsightsError(
      'invalid-response',
      `${context} returned no public_repos/followers for ${login}. ${REMEDIATION}`
    );
  }
  const rawCreatedAt = profile?.['created_at'];
  const createdAt = new Date(
    typeof rawCreatedAt === 'string' ? rawCreatedAt : 'invalid'
  );
  if (Number.isNaN(createdAt.getTime())) {
    throw new GitHubInsightsError(
      'invalid-response',
      `${context} returned no usable created_at for ${login}. ${REMEDIATION}`
    );
  }
  return { publicRepos, followers, createdAt };
};

/**
 * Fetch and validate the portfolio proof data, or throw {@link GitHubInsightsError}.
 *
 * Both the contribution calendar (GraphQL) and profile stats (REST) are required
 * data — never fallback alternatives — and every failure names the Vault path and
 * the token scope needed to fix it.
 */
export const fetchGitHubInsights = async (
  login: string,
  options: GitHubFetchOptions = {}
): Promise<GitHubInsights> => {
  const token = resolveToken(options);
  const now = options.now ?? new Date();
  const config: RequestConfig = {
    fetchFn: options.fetchFn ?? globalThis.fetch,
    attempts: options.attempts,
    sleepFn: options.sleepFn,
    nowFn: options.nowFn,
  };
  // Sequential, not parallel: the profile's `created_at` decides how many
  // calendar years the calendar query asks for.
  const profile = await fetchProfile(config, login, token);
  const windows = buildRangeWindows(now, profile.createdAt);
  const ranges = await fetchRanges(config, login, token, windows);

  const trailing = ranges[0];
  if (trailing === undefined) {
    throw new GitHubInsightsError(
      'invalid-response',
      `GitHub returned no contribution periods for ${login}. ${REMEDIATION}`
    );
  }
  return {
    fetchedAt: now.toISOString(),
    source: 'live',
    login,
    totalContributions: trailing.totalContributions,
    longestStreak: trailing.longestStreak,
    currentStreak: currentStreakOf(trailing.calendar),
    publicRepos: profile.publicRepos,
    followers: profile.followers,
    ranges,
  };
};
