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

/** Calendar years offered alongside the trailing window (current year first). */
const CALENDAR_YEAR_COUNT = 4;

/**
 * Hard cap on selectable periods. The panel-switching CSS enumerates one rule
 * per index, so widening this requires widening that rule set too.
 */
export const MAX_RANGE_WINDOWS = 8;

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

/**
 * Trailing 12 months first (the default panel), then calendar years newest to
 * oldest. Years the account predates come back empty and are dropped after the
 * fetch rather than guessed at here.
 */
export const buildRangeWindows = (now: Date): readonly RangeWindow[] => {
  const today = startOfUtcDay(now);
  const currentYear = today.getUTCFullYear();
  const years = Array.from(
    { length: CALENDAR_YEAR_COUNT },
    (_, offset) => currentYear - offset
  );
  const windows: readonly RangeWindow[] = [
    {
      id: TRAILING_RANGE_ID,
      label: 'Last 12 months',
      from: toIsoDay(new Date(today.getTime() - TRAILING_DAYS * DAY_MS)),
      to: toIsoDay(today),
      kind: 'trailing',
    },
    ...years.map((year) => calendarYearWindow(year, today)),
  ];
  if (windows.length > MAX_RANGE_WINDOWS) {
    throw new Error(
      `buildRangeWindows produced ${String(windows.length)} windows, max is ${String(MAX_RANGE_WINDOWS)}`
    );
  }
  return windows;
};

/** GraphQL `DateTime` bounds covering the window's full inclusive days. */
export const windowBounds = (
  window: RangeWindow
): { readonly from: string; readonly to: string } => ({
  from: `${window.from}T00:00:00Z`,
  to: `${window.to}T23:59:59Z`,
});
