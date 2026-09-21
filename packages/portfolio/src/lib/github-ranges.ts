/**
 * Contribution periods offered by the proof section's date picker.
 *
 * GitHub's `contributionsCollection` accepts at most a one-year window, so each
 * selectable period is its own window and the whole set is fetched in a single
 * aliased GraphQL document (see lib/github.ts).
 */

export type RangeWindow = {
  /** Stable, DOM-id-safe identifier; also the radio input value. */
  readonly id: string;
  readonly label: string;
  /** Inclusive YYYY-MM-DD bounds. */
  readonly from: string;
  readonly to: string;
  /** Calendar-year windows may legitimately be empty (pre-account years). */
  readonly kind: 'trailing' | 'calendar-year';
};

const DAY_MS = 86_400_000;

/** GitHub's own trailing window is 371 days once padded to week boundaries. */
const TRAILING_DAYS = 365;

/**
 * Cap on selectable periods: the trailing window plus four calendar years.
 *
 * This is mostly about page weight. Each period embeds ~370 `<rect>` elements,
 * and the heatmap was the single heaviest thing on the homepage — nine panels
 * meant over three thousand rects for a section whose older years nobody reads.
 * It also stops an implausible `createdAt` (a placeholder date, a clock skew)
 * from generating decades of empty panels. Excess years are dropped
 * oldest-first rather than failing the build.
 */
export const MAX_RANGE_WINDOWS = 5;

export const TRAILING_RANGE_ID = 'last-12-months';

const startOfUtcDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

export const toIsoDay = (date: Date): string => date.toISOString().slice(0, 10);

const calendarYearWindow = (year: number, today: Date): RangeWindow => {
  const label = String(year);
  const isCurrentYear = year === today.getUTCFullYear();
  return {
    id: label,
    label,
    from: `${label}-01-01`,
    to: isCurrentYear ? toIsoDay(today) : `${label}-12-31`,
    kind: 'calendar-year',
  };
};

/** Current year down to the account's first year, newest first. */
const calendarYears = (today: Date, accountCreatedAt: Date): number[] => {
  const currentYear = today.getUTCFullYear();
  const firstYear = Math.min(currentYear, accountCreatedAt.getUTCFullYear());
  const years: number[] = [];
  for (let year = currentYear; year >= firstYear; year -= 1) years.push(year);
  // Oldest years go first if the cap bites; the trailing window keeps its slot.
  return years.slice(0, MAX_RANGE_WINDOWS - 1);
};

/**
 * Trailing 12 months first (the default panel), then every calendar year back
 * to the one the account was created in, newest to oldest. Years with no
 * contributions come back empty and are dropped after the fetch — the account's
 * first year is usually partial, and a blank grid behind a selectable chip is
 * worse than no chip.
 */
export const buildRangeWindows = (
  now: Date,
  accountCreatedAt: Date
): readonly RangeWindow[] => {
  const today = startOfUtcDay(now);
  return [
    {
      id: TRAILING_RANGE_ID,
      label: 'Last 12 months',
      from: toIsoDay(new Date(today.getTime() - TRAILING_DAYS * DAY_MS)),
      to: toIsoDay(today),
      kind: 'trailing',
    },
    ...calendarYears(today, accountCreatedAt).map((year) =>
      calendarYearWindow(year, today)
    ),
  ];
};

/** GraphQL `DateTime` bounds covering the window's full inclusive days. */
export const windowBounds = (
  window: RangeWindow
): { readonly from: string; readonly to: string } => ({
  from: `${window.from}T00:00:00Z`,
  to: `${window.to}T23:59:59Z`,
});
