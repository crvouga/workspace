/**
 * Uptime policy for the proof section.
 *
 * Order of preference:
 *   1. live GitHub data (retried on transient failures), which also refreshes
 *      the committed snapshot;
 *   2. the committed snapshot, rendered with a visible "cached" caption;
 *   3. nothing — a notice card in `astro dev`, a hard build failure otherwise.
 *
 * Step 2 is why a GitHub incident, an expired token, or a rate-limit window
 * cannot take the site's build down.
 */

import { fetchGitHubInsights } from './github';
import { readSnapshot, writeSnapshot } from './github-cache';
import { GitHubInsightsError, errorMessage } from './github-error';
import type { GitHubFetchOptions, GitHubInsights } from './github-types';

export type LoadOptions = GitHubFetchOptions & {
  /** `astro dev` renders a notice instead of failing the build. */
  readonly allowMissing?: boolean;
  /** Skips the snapshot write; set for dev servers and tests. */
  readonly persist?: boolean;
  readonly snapshotPath?: string;
};

export type LoadResult = {
  readonly insights: GitHubInsights | null;
  /** Human-readable reason the live fetch was not used, if it was not. */
  readonly warning: string | null;
};

const fallback = (
  reason: string,
  options: LoadOptions
): GitHubInsights | null =>
  readSnapshot(options.snapshotPath) ?? logMiss(reason);

const logMiss = (reason: string): null => {
  console.warn(`[portfolio] no GitHub snapshot available (${reason})`);
  return null;
};

export const loadGitHubInsights = async (
  login: string,
  options: LoadOptions = {}
): Promise<LoadResult> => {
  try {
    const insights = await fetchGitHubInsights(login, options);
    if (options.persist !== false) {
      writeSnapshot(insights, options.snapshotPath);
    }
    return { insights, warning: null };
  } catch (error) {
    if (!(error instanceof GitHubInsightsError)) throw error;
    const reason = errorMessage(error);
    console.warn(`[portfolio] GitHub proof fetch failed: ${reason}`);
    const cached = fallback(reason, options);
    if (cached !== null) {
      return { insights: cached, warning: reason };
    }
    if (options.allowMissing === true) {
      return { insights: null, warning: reason };
    }
    throw error;
  }
};
