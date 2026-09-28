#!/usr/bin/env bun
/**
 * Refresh the committed GitHub snapshot, `src/data/github-insights.json`.
 *
 * This is the job that keeps the proof data fresh. The site is static, so the
 * numbers are frozen at image-build time; the scheduled run in ci.yml calls this
 * script, commits whatever it rewrites, and then rebuilds — which is also what
 * moves the offline fallback forward, so it can no longer rot while nobody is
 * looking.
 *
 * Unlike the build path this is deliberately *strict*: it never falls back to
 * the existing snapshot, and it exits non-zero when the live fetch fails. A
 * silent fallback here would defeat the entire point — the schedule would keep
 * "succeeding" while serving older and older numbers. A red scheduled run is
 * the signal that the token expired or GitHub is genuinely unreachable; the
 * live site stays up on the snapshot either way.
 *
 * Usage:
 *   bun run scripts/refresh-github-insights.ts
 *   bun run scripts/refresh-github-insights.ts --login crvouga --check
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { fetchGitHubInsights } from '../src/lib/github';
import { snapshotPath, writeSnapshot } from '../src/lib/github-cache';
import { errorMessage } from '../src/lib/github-error';
import { freshnessOf, isStale } from '../src/lib/github-freshness';
import { writeLine } from '../src/library/cli-output';

const DEFAULT_LOGIN = 'crvouga';

type Args = {
  readonly login: string;
  /** Report staleness without writing; used to assert the schedule is alive. */
  readonly check: boolean;
};

const parseArgs = (argv: readonly string[]): Args => {
  const loginIndex = argv.indexOf('--login');
  const login =
    loginIndex >= 0 ? (argv[loginIndex + 1] ?? DEFAULT_LOGIN) : DEFAULT_LOGIN;
  return { login, check: argv.includes('--check') };
};

const readRaw = (path: string): string => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

/** Prints the age of the snapshot already on disk; non-zero when it is stale. */
const checkOnly = (path: string): number => {
  const raw = readRaw(path);
  if (raw === '') {
    writeLine(`No snapshot at ${path}.`);
    return 1;
  }
  const parsed: unknown = JSON.parse(raw);
  const fetchedAt =
    typeof parsed === 'object' && parsed !== null
      ? String((parsed as Record<string, unknown>)['fetchedAt'])
      : '';
  const freshness = freshnessOf(fetchedAt, new Date());
  writeLine(`Snapshot ${fetchedAt} (${freshness.label}).`);
  return isStale(freshness) ? 1 : 0;
};

/** Lets the CI step decide whether there is anything to commit. */
const emitChanged = (changed: boolean): void => {
  const output = process.env['GITHUB_OUTPUT'];
  if (output === undefined || output === '') return;
  appendFileSync(output, `changed=${String(changed)}\n`, 'utf8');
};

const refresh = async (login: string, path: string): Promise<number> => {
  const before = readRaw(path);
  const insights = await fetchGitHubInsights(login);
  if (!writeSnapshot(insights, path)) {
    writeLine('Snapshot could not be written.');
    return 1;
  }
  const changed = readRaw(path) !== before;
  writeLine(
    `Refreshed ${login}: ${String(insights.totalContributions)} contributions ` +
      `(12mo), ${String(insights.publicRepos)} repos, streak ${String(insights.currentStreak)}.`
  );
  writeLine(changed ? 'Snapshot changed.' : 'Snapshot already current.');
  emitChanged(changed);
  return 0;
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const path = snapshotPath();
  if (args.check) {
    process.exit(checkOnly(path));
  }
  try {
    process.exit(await refresh(args.login, path));
  } catch (error) {
    writeLine(`GitHub refresh failed: ${errorMessage(error)}`);
    writeLine(
      'The live site keeps serving the committed snapshot; fix the token or ' +
        'wait out the incident, then re-run this job.'
    );
    process.exit(1);
  }
};

await main();
