/**
 * Build-time GitHub insights for the portfolio proof section.
 *
 * Runs inside `astro build` under Node: plain fetch only, no Bun APIs.
 *
 * Failure policy: deterministic. The proof section is hiring evidence, so a
 * missing credential or an unusable GitHub response aborts the build with an
 * actionable error instead of silently rendering a blank map. The credential is
 * the Vault-owned `PORTFOLIO_GITHUB_TOKEN` (a GitHub user token with
 * `read:user`); no cache or stale payload ever satisfies a build.
 */

export type ContributionDay = {
  date: string; // YYYY-MM-DD
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export type GitHubInsights = {
  fetchedAt: string; // ISO date
  totalContributions: number; // last 12 months
  longestStreak: number;
  currentStreak: number;
  publicRepos: number;
  followers: number;
  calendar: ContributionDay[]; // oldest → newest
};

export type GitHubFetchOptions = {
  readonly token?: string;
  readonly fetchFn?: typeof fetch;
  readonly now?: Date;
};

/** Reasons the GitHub proof build can fail; every one names its remediation. */
export type GitHubInsightsErrorCode =
  | 'missing-token'
  | 'request-failed'
  | 'api-error'
  | 'invalid-response'
  | 'empty-calendar';

export class GitHubInsightsError extends Error {
  readonly code: GitHubInsightsErrorCode;

  constructor(code: GitHubInsightsErrorCode, message: string) {
    super(message);
    this.name = 'GitHubInsightsError';
    this.code = code;
  }
}

const ENV_TOKEN_KEY = 'PORTFOLIO_GITHUB_TOKEN';
const VAULT_PATH = 'secret/data/personal/{dev|prd}';
const GRAPHQL_URL = 'https://api.github.com/graphql';
const REQUEST_TIMEOUT_MS = 10_000;
/** A full trailing year; GitHub normally returns 370–371 days. */
const MIN_CALENDAR_DAYS = 365;

const MISSING_TOKEN_MESSAGE = `${ENV_TOKEN_KEY} is required. Expected ${VAULT_PATH} → ${ENV_TOKEN_KEY}. Locally run: vault run --config dev -- bun run --filter @pkgs/portfolio build. GitHub contribution access also requires read:user.`;

const REMEDIATION = `Verify ${ENV_TOKEN_KEY} in ${VAULT_PATH}.`;

const contributionCalendarQuery = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}`;

const resolveToken = (options: GitHubFetchOptions): string => {
  const raw = options.token ?? process.env[ENV_TOKEN_KEY];
  const token = raw?.trim() ?? '';
  if (token.length === 0) {
    throw new GitHubInsightsError('missing-token', MISSING_TOKEN_MESSAGE);
  }
  return token;
};

/** GitHub's own contribution-level buckets. */
const toLevel = (count: number): 0 | 1 | 2 | 3 | 4 => {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const toRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

const requestJson = async (
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
    throw new GitHubInsightsError(
      'api-error',
      `${context} returned HTTP ${String(response.status)}. ${REMEDIATION}`
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

type GraphQLDay = {
  readonly date?: string;
  readonly contributionCount?: number;
};

type GraphQLWeek = {
  readonly contributionDays?: readonly GraphQLDay[];
};

type GraphQLCalendarResponse = {
  readonly errors?: readonly { readonly message?: string }[];
  readonly data?: {
    readonly user?: {
      readonly contributionsCollection?: {
        readonly contributionCalendar?: {
          readonly totalContributions?: number;
          readonly weeks?: readonly GraphQLWeek[];
        };
      };
    };
  };
};

const toDay = (day: GraphQLDay): ContributionDay => {
  const count =
    typeof day.contributionCount === 'number' ? day.contributionCount : 0;
  return { date: day.date ?? '', count, level: toLevel(count) };
};

const flattenCalendar = (weeks: readonly GraphQLWeek[]): ContributionDay[] =>
  weeks.flatMap((week) => week.contributionDays ?? []).map(toDay);

const assertUsableCalendar = (
  calendar: readonly ContributionDay[],
  login: string,
  context: string
): void => {
  // A profile with activity set to private yields an empty/all-zero calendar;
  // that is a credential-scope failure, never valid empty activity.
  if (calendar.length === 0 || calendar.every((day) => day.count === 0)) {
    throw new GitHubInsightsError(
      'empty-calendar',
      `GitHub returned no visible contributions for ${login}. ${ENV_TOKEN_KEY} must be a user token with read:user access; verify the account's contribution visibility and the ${VAULT_PATH} secret.`
    );
  }
  if (calendar.length < MIN_CALENDAR_DAYS) {
    throw new GitHubInsightsError(
      'invalid-response',
      `${context} returned ${String(calendar.length)} days, expected at least ${String(MIN_CALENDAR_DAYS)}. ${REMEDIATION}`
    );
  }
};

const fetchCalendar = async (
  fetchFn: typeof fetch,
  login: string,
  token: string
): Promise<{
  calendar: ContributionDay[];
  totalContributions: number;
}> => {
  const context = 'GitHub GraphQL contribution calendar';
  const json = await requestJson(
    fetchFn,
    GRAPHQL_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'portfolio-build',
      },
      body: JSON.stringify({
        query: contributionCalendarQuery,
        variables: { login },
      }),
    },
    context
  );
  const typed = json as GraphQLCalendarResponse;
  if (Array.isArray(typed.errors) && typed.errors.length > 0) {
    const detail = typed.errors
      .map((e) => e.message ?? 'unknown error')
      .join('; ');
    throw new GitHubInsightsError(
      'api-error',
      `${context} returned errors: ${detail}. ${ENV_TOKEN_KEY} must be a user token with read:user access; verify the account's contribution visibility and the ${VAULT_PATH} secret.`
    );
  }
  const calendarJson =
    typed.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendarJson || !Array.isArray(calendarJson.weeks)) {
    throw new GitHubInsightsError(
      'invalid-response',
      `${context} returned no contribution calendar for ${login}. ${REMEDIATION}`
    );
  }
  const calendar = flattenCalendar(calendarJson.weeks);
  assertUsableCalendar(calendar, login, context);
  if (typeof calendarJson.totalContributions !== 'number') {
    throw new GitHubInsightsError(
      'invalid-response',
      `${context} returned no totalContributions for ${login}. ${REMEDIATION}`
    );
  }
  return { calendar, totalContributions: calendarJson.totalContributions };
};

type RestUserResponse = {
  readonly public_repos?: unknown;
  readonly followers?: unknown;
};

const fetchProfile = async (
  fetchFn: typeof fetch,
  login: string,
  token: string
): Promise<{ publicRepos: number; followers: number }> => {
  const context = `GitHub profile endpoint (GET /users/${login})`;
  const json = await requestJson(
    fetchFn,
    `https://api.github.com/users/${encodeURIComponent(login)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'portfolio-build',
        Accept: 'application/vnd.github+json',
      },
    },
    context
  );
  const profile = toRecord(json) as RestUserResponse | null;
  if (
    typeof profile?.public_repos !== 'number' ||
    typeof profile.followers !== 'number'
  ) {
    throw new GitHubInsightsError(
      'invalid-response',
      `${context} returned no public_repos/followers for ${login}. ${REMEDIATION}`
    );
  }
  return { publicRepos: profile.public_repos, followers: profile.followers };
};

const computeStreaks = (
  calendar: readonly ContributionDay[]
): { longestStreak: number; currentStreak: number } => {
  let longestStreak = 0;
  let run = 0;
  for (const day of calendar) {
    run = day.count > 0 ? run + 1 : 0;
    if (run > longestStreak) longestStreak = run;
  }
  // Current streak counts back from today; today counts if it has ≥1
  // contribution, otherwise the streak is measured through yesterday.
  let currentStreak = 0;
  for (let i = calendar.length - 1; i >= 0; i -= 1) {
    const day = calendar[i];
    if (day === undefined) break;
    if (day.count > 0) {
      currentStreak += 1;
      continue;
    }
    if (i === calendar.length - 1) continue; // today without contributions yet
    break;
  }
  return { longestStreak, currentStreak };
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
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const fetchedAt = (options.now ?? new Date()).toISOString();

  const [calendarData, profile] = await Promise.all([
    fetchCalendar(fetchFn, login, token),
    fetchProfile(fetchFn, login, token),
  ]);

  const { longestStreak, currentStreak } = computeStreaks(
    calendarData.calendar
  );
  return {
    fetchedAt,
    totalContributions: calendarData.totalContributions,
    longestStreak,
    currentStreak,
    publicRepos: profile.publicRepos,
    followers: profile.followers,
    calendar: calendarData.calendar,
  };
};
