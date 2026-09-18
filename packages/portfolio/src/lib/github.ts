/**
 * Build-time GitHub insights for the portfolio proof section.
 *
 * Runs inside `astro build` under Node: plain fetch only, no Bun APIs.
 *
 * Failure policy: GitHub is a nice-to-have, never a build blocker. Every
 * request has a hard timeout; any failure warns and degrades gracefully:
 *   - GraphQL (needs token) fails or no token → REST fallback (counts only,
 *     empty calendar).
 *   - REST also fails → returns null, the page omits the proof section.
 *
 * Successful payloads are cached for 24h at
 * `node_modules/.cache/portfolio-github.json` so token-less local builds can
 * reuse a previous token-authenticated fetch (the cache stores the full
 * object, calendar included).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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

type CalendarCache = {
  calendar: ContributionDay[];
  totalContributions: number;
  fetchedAt: string;
};

// Resolved from the build working directory (packages/portfolio), since
// import.meta.url paths break once bundled into dist/.prerender chunks.
const CACHE_PATH = join(
  process.cwd(),
  'node_modules/.cache/portfolio-github.json'
);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

const readToken = (): string | null =>
  process.env['PORTFOLIO_GITHUB_TOKEN'] ??
  process.env['GITHUB_TOKEN'] ??
  process.env['GH_TOKEN'] ??
  null;

const readCache = async (): Promise<CalendarCache | null> => {
  try {
    const raw = JSON.parse(await readFile(CACHE_PATH, 'utf8')) as CalendarCache;
    if (Date.now() - Date.parse(raw.fetchedAt) > CACHE_TTL_MS) return null;
    if (!Array.isArray(raw.calendar)) return null;
    return raw;
  } catch {
    return null;
  }
};

const writeCache = async (cache: CalendarCache): Promise<void> => {
  try {
    await mkdir(dirname(CACHE_PATH), { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(cache), 'utf8');
  } catch (error) {
    console.warn('[github] cache write failed', error);
  }
};

/** GitHub's own contribution-level buckets. */
const toLevel = (count: number): 0 | 1 | 2 | 3 | 4 => {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
};

const fetchJson = async (
  url: string,
  init: RequestInit
): Promise<unknown | null> => {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[github] ${response.status} from ${url}`);
      return null;
    }
    return (await response.json()) as unknown;
  } catch (error) {
    console.warn('[github] request failed', url, error);
    return null;
  }
};

type GraphQLCalendarResponse = {
  data?: {
    user?: {
      contributionsCollection?: {
        contributionCalendar?: {
          totalContributions: number;
          weeks?: {
            contributionDays?: { date: string; contributionCount: number }[];
          }[];
        };
      };
    };
  };
};

const fetchCalendar = async (
  login: string,
  token: string
): Promise<{ calendar: ContributionDay[]; totalContributions: number } | null> => {
  const body = {
    query: `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}`,
    variables: { login },
  };
  const json = (await fetchJson('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'portfolio-build',
    },
    body: JSON.stringify(body),
  })) as GraphQLCalendarResponse | null;
  const calendarJson =
    json?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendarJson || !Array.isArray(calendarJson.weeks)) return null;
  const calendar: ContributionDay[] = calendarJson.weeks
    .flatMap((week) => week.contributionDays ?? [])
    .map((day) => ({
      date: day.date,
      count: day.contributionCount,
      level: toLevel(day.contributionCount),
    }));
  if (calendar.length === 0) return null;
  // A profile with activity set to private yields an all-zero calendar; treat
  // that as no calendar rather than rendering a blank heatmap.
  const hasActivity =
    calendarJson.totalContributions > 0 ||
    calendar.some((day) => day.count > 0);
  if (!hasActivity) return null;
  return { calendar, totalContributions: calendarJson.totalContributions };
};

type RestUserResponse = {
  public_repos?: number;
  followers?: number;
};

const fetchUserCounts = async (
  login: string,
  token: string | null
): Promise<{ publicRepos: number; followers: number } | null> => {
  const json = (await fetchJson(`https://api.github.com/users/${login}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'User-Agent': 'portfolio-build',
      Accept: 'application/vnd.github+json',
    },
  })) as RestUserResponse | null;
  if (
    typeof json?.public_repos !== 'number' ||
    typeof json?.followers !== 'number'
  ) {
    return null;
  }
  return { publicRepos: json.public_repos, followers: json.followers };
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

const EMPTY_CALENDAR: CalendarCache = {
  calendar: [],
  totalContributions: 0,
  fetchedAt: '',
};

const resolveCalendar = async (
  login: string,
  token: string | null,
  now: string
): Promise<CalendarCache> => {
  if (token === null) {
    console.warn(
      '[github] no token (GITHUB_TOKEN/GH_TOKEN) — contribution calendar unavailable, REST counts only'
    );
    return { ...EMPTY_CALENDAR, fetchedAt: now };
  }
  const fetched = await fetchCalendar(login, token);
  if (fetched === null) {
    console.warn('[github] contribution calendar unavailable — REST counts only');
    return { ...EMPTY_CALENDAR, fetchedAt: now };
  }
  const calendarData: CalendarCache = {
    calendar: fetched.calendar,
    totalContributions: fetched.totalContributions,
    fetchedAt: now,
  };
  await writeCache(calendarData);
  return calendarData;
};

const toInsights = (
  counts: { publicRepos: number; followers: number },
  calendarData: CalendarCache
): GitHubInsights => {
  const { calendar, totalContributions, fetchedAt } = calendarData;
  const { longestStreak, currentStreak } = computeStreaks(calendar);
  return {
    fetchedAt,
    totalContributions,
    longestStreak,
    currentStreak,
    publicRepos: counts.publicRepos,
    followers: counts.followers,
    calendar,
  };
};

export const fetchGitHubInsights = async (
  login: string
): Promise<GitHubInsights | null> => {
  const token = readToken();
  const now = new Date().toISOString();
  const cached = await readCache();
  const counts = await fetchUserCounts(login, token);
  // Nothing at all (no counts, no cache, no token): GitHub is unreachable.
  if (counts === null && cached === null && token === null) return null;
  const calendarData =
    cached ?? (await resolveCalendar(login, token, now));
  const countsOrDefault = counts ?? { publicRepos: 0, followers: 0 };
  return toInsights(countsOrDefault, calendarData);
};