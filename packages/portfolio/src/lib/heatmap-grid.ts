/**
 * Pure geometry for the contribution heatmap.
 *
 * Columns are derived from each day's real weekday rather than by chunking the
 * flat day list into sevens: GitHub's first and last weeks are partial, so
 * naive chunking shears every row after the first partial week.
 */

import type { ContributionDay } from './github';

export type HeatmapCell = {
  readonly day: ContributionDay;
  readonly column: number;
  /** 0 = Sunday, matching GitHub's row order. */
  readonly row: number;
  /** Native tooltip / screen-reader text. */
  readonly label: string;
};

export type HeatmapMonthLabel = {
  readonly label: string;
  readonly column: number;
};

export type HeatmapGrid = {
  readonly columns: number;
  readonly cells: readonly HeatmapCell[];
  readonly months: readonly HeatmapMonthLabel[];
};

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;

/** Minimum column gap between month labels so short months do not collide. */
const MONTH_LABEL_MIN_GAP = 3;

/** A label needs room to the right of its column to stay inside the viewBox. */
const MONTH_LABEL_TAIL_ROOM = 2;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const parseDay = (date: string): Date => new Date(`${date}T00:00:00Z`);

const describe = (day: ContributionDay): string => {
  const parsed = parseDay(day.date);
  const month = MONTH_NAMES[parsed.getUTCMonth()] ?? '';
  const pretty = `${month} ${String(parsed.getUTCDate())}, ${String(parsed.getUTCFullYear())}`;
  const noun = day.count === 1 ? 'contribution' : 'contributions';
  return day.count === 0
    ? `No contributions on ${pretty}`
    : `${String(day.count)} ${noun} on ${pretty}`;
};

/** The Sunday on or before the first day, so column 0 is a real week start. */
const gridStart = (first: ContributionDay): number => {
  const firstDate = parseDay(first.date);
  return firstDate.getTime() - firstDate.getUTCDay() * DAY_MS;
};

const toCells = (
  calendar: readonly ContributionDay[],
  startMs: number
): readonly HeatmapCell[] =>
  calendar.map((day) => {
    const date = parseDay(day.date);
    const offsetDays = Math.floor((date.getTime() - startMs) / DAY_MS);
    return {
      day,
      column: Math.floor(offsetDays / DAYS_PER_WEEK),
      row: date.getUTCDay(),
      label: describe(day),
    };
  });

/** First (topmost) day of each column, which is what a month label names. */
const firstDayPerColumn = (
  cells: readonly HeatmapCell[]
): Map<number, ContributionDay> => {
  const byColumn = new Map<number, ContributionDay>();
  for (const cell of cells) {
    if (!byColumn.has(cell.column)) byColumn.set(cell.column, cell.day);
  }
  return byColumn;
};

const toMonthLabels = (
  cells: readonly HeatmapCell[],
  columns: number
): readonly HeatmapMonthLabel[] => {
  const byColumn = firstDayPerColumn(cells);
  const labels: HeatmapMonthLabel[] = [];
  let previousMonth = -1;
  for (let column = 0; column < columns; column += 1) {
    const day = byColumn.get(column);
    if (day === undefined) continue;
    const month = parseDay(day.date).getUTCMonth();
    const changed = month !== previousMonth;
    previousMonth = month;
    if (!changed) continue;
    const last = labels[labels.length - 1];
    const tooClose =
      last !== undefined && column - last.column < MONTH_LABEL_MIN_GAP;
    if (tooClose || column > columns - MONTH_LABEL_TAIL_ROOM) continue;
    labels.push({ label: MONTH_NAMES[month] ?? '', column });
  }
  return labels;
};

export const buildHeatmapGrid = (
  calendar: readonly ContributionDay[]
): HeatmapGrid => {
  const first = calendar[0];
  if (first === undefined) {
    throw new Error('buildHeatmapGrid requires a non-empty calendar');
  }
  const cells = toCells(calendar, gridStart(first));
  const columns =
    cells.reduce((max, cell) => Math.max(max, cell.column), 0) + 1;
  return { columns, cells, months: toMonthLabels(cells, columns) };
};
