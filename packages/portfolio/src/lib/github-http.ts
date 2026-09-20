/**
 * One JSON request against the GitHub API, with a timeout and bounded retries.
 *
 * Transient failures (network errors, 429, 5xx) are the common shape of GitHub
 * "downtime" during a build, so they are retried with exponential backoff before
 * the caller falls back to the committed snapshot. Client errors (401/403/404)
 * are configuration problems and fail immediately.
 */

import { GitHubInsightsError, REMEDIATION, errorMessage } from './github-error';

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 400;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export type RequestConfig = {
  readonly fetchFn: typeof fetch;
  readonly attempts?: number | undefined;
  readonly sleepFn?: ((ms: number) => Promise<void>) | undefined;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error: unknown): boolean =>
  error instanceof GitHubInsightsError &&
  (error.code === 'request-failed' ||
    (error.code === 'api-error' && error.message.includes('[retryable]')));

const fetchOnce = async (
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  context: string
): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetchFn(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new GitHubInsightsError(
      'request-failed',
      `${context} request failed: ${errorMessage(error)}. ${REMEDIATION}`
    );
  }
  if (!response.ok) {
    const marker = RETRYABLE_STATUS.has(response.status) ? ' [retryable]' : '';
    throw new GitHubInsightsError(
      'api-error',
      `${context} returned HTTP ${String(response.status)}${marker}. ${REMEDIATION}`
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new GitHubInsightsError(
      'invalid-response',
      `${context} returned malformed JSON: ${errorMessage(error)}. ${REMEDIATION}`
    );
  }
};

export const requestJson = async (
  config: RequestConfig,
  url: string,
  init: RequestInit,
  context: string
): Promise<unknown> => {
  const attempts = Math.max(1, config.attempts ?? DEFAULT_ATTEMPTS);
  const sleep = config.sleepFn ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchOnce(config.fetchFn, url, init, context);
    } catch (error) {
      lastError = error;
      const canRetry = isRetryable(error) && attempt < attempts - 1;
      if (!canRetry) break;
      await sleep(BACKOFF_BASE_MS * 2 ** attempt);
    }
  }
  throw lastError;
};
