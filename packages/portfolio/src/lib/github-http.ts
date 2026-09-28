/**
 * One JSON request against the GitHub API, with a timeout and bounded retries.
 *
 * Transient failures (network errors, 429, 5xx) are the common shape of GitHub
 * "downtime" during a build, so they are retried with exponential backoff before
 * the caller falls back to the committed snapshot. Client errors (401/403/404)
 * are configuration problems and fail immediately.
 *
 * When GitHub names its own wait — `Retry-After`, or `x-ratelimit-reset` on an
 * exhausted quota — that wait is honored in place of the backoff, because 400ms
 * is not a meaningful answer to "you are rate limited for the next minute". A
 * wait longer than {@link MAX_RETRY_WAIT_MS} is treated as *not* retryable
 * instead: a build must not idle for the rest of a rate-limit hour when the
 * committed snapshot is sitting right there.
 */

import { GitHubInsightsError, REMEDIATION, errorMessage } from './github-error';

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 400;

/**
 * Longest a single retry may sleep. Two of these plus three request timeouts is
 * the worst case a build pays before falling back — about 2.5 minutes.
 */
export const MAX_RETRY_WAIT_MS = 60_000;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export type RequestConfig = {
  readonly fetchFn: typeof fetch;
  readonly attempts?: number | undefined;
  readonly sleepFn?: ((ms: number) => Promise<void>) | undefined;
  /** Clock for interpreting `Retry-After` HTTP dates; tests pin it. */
  readonly nowFn?: (() => number) | undefined;
};

export type JsonRequest = {
  readonly url: string;
  readonly init: RequestInit;
  /** Names the endpoint in every error message. */
  readonly context: string;
  /**
   * Validates the decoded body *inside* the retry loop. GraphQL reports its
   * own outages with HTTP 200 and an `errors[]` array, so a body check that
   * ran after `requestJson` returned could never be retried.
   */
  readonly validate?: ((json: unknown) => void) | undefined;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** `Retry-After` is either delta-seconds or an HTTP date; both are legal. */
const parseRetryAfter = (value: string, now: number): number => {
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - now);
};

/**
 * How long GitHub asked us to wait, in ms, or 0 when it asked for nothing.
 * `x-ratelimit-reset` only counts once the quota is actually spent — the header
 * is present on every response, including successful ones.
 */
const requestedWaitMs = (response: Response, now: number): number => {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter !== null) return parseRetryAfter(retryAfter, now);
  if (response.headers.get('x-ratelimit-remaining') !== '0') return 0;
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  return Number.isFinite(reset) ? Math.max(0, reset * 1000 - now) : 0;
};

const statusError = (
  response: Response,
  context: string,
  now: number
): GitHubInsightsError => {
  const wait = requestedWaitMs(response, now);
  // A wait we would refuse to sit through is not a retry, it is a fallback.
  const retryable =
    RETRYABLE_STATUS.has(response.status) && wait <= MAX_RETRY_WAIT_MS;
  const detail =
    wait > 0 ? ` (GitHub asked for ${String(Math.round(wait / 1000))}s)` : '';
  return new GitHubInsightsError(
    'api-error',
    `${context} returned HTTP ${String(response.status)}${detail}. ${REMEDIATION}`,
    { retryable, retryAfterMs: wait }
  );
};

const fetchOnce = async (
  config: RequestConfig,
  request: JsonRequest
): Promise<unknown> => {
  const { context } = request;
  const now = config.nowFn ?? Date.now;
  let response: Response;
  try {
    response = await config.fetchFn(request.url, {
      ...request.init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new GitHubInsightsError(
      'request-failed',
      `${context} request failed: ${errorMessage(error)}. ${REMEDIATION}`,
      { retryable: true }
    );
  }
  if (!response.ok) throw statusError(response, context, now());
  let json: unknown;
  try {
    json = (await response.json()) as unknown;
  } catch (error) {
    throw new GitHubInsightsError(
      'invalid-response',
      `${context} returned malformed JSON: ${errorMessage(error)}. ${REMEDIATION}`
    );
  }
  request.validate?.(json);
  return json;
};

/** Server-requested wait wins over the backoff curve, but never the cap. */
const waitFor = (error: unknown, attempt: number): number => {
  const backoff = BACKOFF_BASE_MS * 2 ** attempt;
  const requested =
    error instanceof GitHubInsightsError ? error.retryAfterMs : 0;
  return Math.min(MAX_RETRY_WAIT_MS, Math.max(backoff, requested));
};

export const requestJson = async (
  config: RequestConfig,
  request: JsonRequest
): Promise<unknown> => {
  const attempts = Math.max(1, config.attempts ?? DEFAULT_ATTEMPTS);
  const sleep = config.sleepFn ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchOnce(config, request);
    } catch (error) {
      lastError = error;
      const canRetry =
        error instanceof GitHubInsightsError &&
        error.retryable &&
        attempt < attempts - 1;
      if (!canRetry) break;
      await sleep(waitFor(error, attempt));
    }
  }
  throw lastError;
};
