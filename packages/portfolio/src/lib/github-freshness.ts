/**
 * How old the rendered proof data is, and what that should say to a reader.
 *
 * The snapshot fallback keeps the site up when GitHub is down, but on its own it
 * degrades silently: a payload from last March renders exactly like one from
 * this morning, differing only in a date nobody reads. Age is therefore a
 * first-class value — shown in the caption, and asserted by the scheduled
 * refresh so a quietly-rotting snapshot turns CI red instead of shipping.
 *
 * Nothing here can fail a render. The worst an unusable timestamp does is
 * report `unknown`, which the caption states plainly.
 */

const DAY_MS = 86_400_000;

/**
 * The scheduled refresh runs daily (see ci.yml), so anything past two days
 * means a refresh was missed, not merely that the clock moved.
 */
export const STALE_AFTER_DAYS = 2;

/**
 * A week of missed refreshes. Past this the headline numbers are stated as
 * history rather than as the current state of the account.
 */
export const VERY_STALE_AFTER_DAYS = 7;

export type FreshnessLevel = 'fresh' | 'stale' | 'very-stale' | 'unknown';

export type Freshness = {
  readonly level: FreshnessLevel;
  /** Whole days since the fetch; -1 when the timestamp is unusable. */
  readonly ageInDays: number;
  /** Reader-facing age, e.g. "today", "3 days old". */
  readonly label: string;
};

const levelFor = (ageInDays: number): FreshnessLevel => {
  if (ageInDays >= VERY_STALE_AFTER_DAYS) return 'very-stale';
  if (ageInDays >= STALE_AFTER_DAYS) return 'stale';
  return 'fresh';
};

const labelFor = (ageInDays: number): string => {
  if (ageInDays <= 0) return 'today';
  if (ageInDays === 1) return '1 day old';
  return `${String(ageInDays)} days old`;
};

export const freshnessOf = (fetchedAt: string, now: Date): Freshness => {
  const fetched = Date.parse(fetchedAt);
  if (Number.isNaN(fetched)) {
    return { level: 'unknown', ageInDays: -1, label: 'age unknown' };
  }
  // Clock skew between the fetch host and the render host can make a fresh
  // payload look like it arrives from the future; that is not staleness.
  const ageInDays = Math.max(0, Math.floor((now.getTime() - fetched) / DAY_MS));
  return { level: levelFor(ageInDays), ageInDays, label: labelFor(ageInDays) };
};

export const isStale = (freshness: Freshness): boolean =>
  freshness.level === 'stale' || freshness.level === 'very-stale';
