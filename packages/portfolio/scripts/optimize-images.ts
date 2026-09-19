#!/usr/bin/env bun
/**
 * Re-encode every raster in `assets/` into the `public/**\/*.optimized.webp`
 * derivatives the site actually serves.
 *
 * `assets/` holds the committed source screenshots and photos (not served, and
 * excluded from the Docker build context); `public/` holds only what ships.
 * Derivatives are committed too, so CI never needs ImageMagick — this script is
 * a local content-pipeline step, wired into `bun run gen` and available as
 * `bun run assets:optimize`.
 *
 * Usage:
 *   bun run assets:optimize
 *   bun run assets:optimize -- --width 1200 --quality 78
 */
import { execFile } from 'node:child_process';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pLimit from 'p-limit';

import { writeLine } from '../src/library/cli-output';

const execFileAsync = promisify(execFile);

const SOURCE_DIR = path.resolve('./assets');
const OUT_DIR = path.resolve('./public');

/** Static literal → Record lookup; extensions are compared lowercased. */
const RASTER_EXTENSION_BY_EXT: Record<string, true> = {
  '.png': true,
  '.jpg': true,
  '.jpeg': true,
  '.heic': true,
};

/** Preferred source when two files map to one derivative: png < jpg < heic. */
const SOURCE_RANK_BY_EXT: Record<string, number> = {
  '.png': 0,
  '.jpg': 1,
  '.jpeg': 1,
  '.heic': 2,
};

const DERIVATIVE_SUFFIX = '.optimized.webp';

const DEFAULT_WIDTH = 1400;
const DEFAULT_QUALITY = 80;
const MAX_CONCURRENCY = 8;

const USAGE =
  'Usage: bun run assets:optimize [--width <px>] [--quality <1-100>]';
const MISSING_MAGICK_MESSAGE =
  'assets:optimize requires ImageMagick. Install it with: brew install imagemagick';

export type OptimizeOptions = {
  readonly width?: number;
  readonly quality?: number;
};

export type OptimizeResult = {
  readonly ok: number;
  readonly failed: string[];
};

type Args = {
  readonly width: number;
  readonly quality: number;
};

type EncodeRequest = {
  readonly source: string;
  readonly target: string;
  readonly width: number;
  readonly quality: number;
};

type EncodeSizes = { readonly before: number; readonly after: number };

type EncodeResult = {
  readonly source: string;
  /** Sizes on success, an error message on failure. */
  readonly outcome: EncodeSizes | string;
};

type Summary = {
  readonly ok: number;
  readonly failed: string[];
  readonly sourceBytes: number;
  readonly outputBytes: number;
};

/** `assets/a/b.png` absolute → `public/a/b.optimized.webp` absolute. */
export const derivativePathFor = (sourcePath: string): string => {
  const relative = path.relative(SOURCE_DIR, sourcePath);
  const parsed = path.parse(relative);
  return path.join(OUT_DIR, parsed.dir, `${parsed.name}${DERIVATIVE_SUFFIX}`);
};

const isRaster = (filePath: string): boolean =>
  RASTER_EXTENSION_BY_EXT[path.extname(filePath).toLowerCase()] === true;

const rankOf = (filePath: string): number =>
  SOURCE_RANK_BY_EXT[path.extname(filePath).toLowerCase()] ?? 9;

const kib = (bytes: number): number => Math.round(bytes / 1024);

const relativeToSources = (filePath: string): string =>
  path.relative(SOURCE_DIR, filePath);

async function listRasters(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await listRasters(entryPath)));
    else if (entry.isFile() && isRaster(entryPath)) found.push(entryPath);
  }
  return found.sort();
}

/**
 * Group sources by the derivative they produce. Two originals can share a stem
 * (`desk.jpg` + `.HEIC`), so the winner is picked by extension rank and path
 * order rather than by walk order.
 */
function groupByTarget(sources: readonly string[]): {
  readonly primary: readonly { source: string; target: string }[];
  readonly duplicates: readonly string[];
} {
  const byTarget = new Map<string, string[]>();
  for (const source of sources) {
    const target = derivativePathFor(source);
    const bucket = byTarget.get(target);
    if (bucket === undefined) byTarget.set(target, [source]);
    else bucket.push(source);
  }

  const primary: { source: string; target: string }[] = [];
  const duplicates: string[] = [];
  for (const [target, bucket] of byTarget) {
    const ordered = [...bucket].sort(
      (a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b)
    );
    const winner = ordered[0];
    if (winner === undefined) continue;
    primary.push({ source: winner, target });
    duplicates.push(...ordered.slice(1));
  }
  return { primary, duplicates };
}

async function assertMagickAvailable(): Promise<void> {
  try {
    await execFileAsync('magick', ['-version']);
  } catch {
    throw new Error(MISSING_MAGICK_MESSAGE);
  }
}

async function encodeOne(
  request: EncodeRequest
): Promise<EncodeSizes | string> {
  const { source, target, width, quality } = request;
  // The extension decides ImageMagick's output format — the temp file MUST end
  // in .webp, or the encoder silently writes PNG bytes into a .webp name.
  const temp = `${target}.${process.pid}.tmp.webp`;
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await execFileAsync('magick', [
      source,
      '-auto-orient',
      '-resize',
      `${width}x>`,
      '-strip',
      '-quality',
      String(quality),
      '-define',
      'webp:method=6',
      temp,
    ]);
    await rename(temp, target);
    const [before, after] = await Promise.all([stat(source), stat(target)]);
    return { before: before.size, after: after.size };
  } catch (error) {
    await rm(temp, { force: true });
    const message = error instanceof Error ? error.message : String(error);
    return `${relativeToSources(source)}: ${message}`;
  }
}

async function encodeAll(
  targets: readonly { source: string; target: string }[],
  args: Args
): Promise<EncodeResult[]> {
  const limit = pLimit(Math.min(os.cpus().length, MAX_CONCURRENCY));
  return Promise.all(
    targets.map((entry) =>
      limit(async (): Promise<EncodeResult> => ({
        source: entry.source,
        outcome: await encodeOne({ ...entry, ...args }),
      }))
    )
  );
}

function reportDuplicates(duplicates: readonly string[]): void {
  if (duplicates.length === 0) return;
  writeLine(
    `Ignoring ${duplicates.length} source(s) sharing a derivative target:`
  );
  for (const duplicate of duplicates) {
    writeLine(`  · ${relativeToSources(duplicate)}`);
  }
  writeLine('');
}

function summarize(results: readonly EncodeResult[]): Summary {
  let sourceBytes = 0;
  let outputBytes = 0;
  const failed: string[] = [];

  for (const { source, outcome } of results) {
    if (typeof outcome === 'string') {
      failed.push(outcome);
      writeLine(`  ✗   ${relativeToSources(source)}`);
      continue;
    }
    sourceBytes += outcome.before;
    outputBytes += outcome.after;
    writeLine(
      `  ok  ${relativeToSources(source)}  ${kib(outcome.before)} KiB → ${kib(outcome.after)} KiB`
    );
  }

  return {
    ok: results.length - failed.length,
    failed,
    sourceBytes,
    outputBytes,
  };
}

function writeSummary(summary: Summary, total: number): void {
  const saved =
    summary.sourceBytes === 0
      ? 0
      : Math.round((1 - summary.outputBytes / summary.sourceBytes) * 100);
  writeLine(
    `\n${summary.ok}/${total} encoded · ${kib(summary.sourceBytes)} KiB → ${kib(summary.outputBytes)} KiB (-${saved}%)`
  );
  if (summary.failed.length === 0) return;
  writeLine(`\n${summary.failed.length} failure(s):`);
  for (const failure of summary.failed) writeLine(`  ✗ ${failure}`);
}

/**
 * Encode every raster under `assets/` into `public/`.
 *
 * Always regenerates: the output is a pure function of `assets/`, so there is
 * no cache or mtime heuristic to go stale.
 */
export async function optimizeImages(
  options: OptimizeOptions = {}
): Promise<OptimizeResult> {
  await assertMagickAvailable();
  const sourceStat = await stat(SOURCE_DIR).catch(() => null);
  if (sourceStat === null || !sourceStat.isDirectory()) {
    throw new Error(`No assets/ directory at ${SOURCE_DIR} to optimize`);
  }

  const args: Args = {
    width: options.width ?? DEFAULT_WIDTH,
    quality: options.quality ?? DEFAULT_QUALITY,
  };
  const sources = await listRasters(SOURCE_DIR);
  if (sources.length === 0) {
    writeLine(`No rasters found under ${SOURCE_DIR}`);
    return { ok: 0, failed: [] };
  }

  const { primary, duplicates } = groupByTarget(sources);
  writeLine(
    `Optimizing ${primary.length} image(s) → ${args.width}px webp q${args.quality}\n`
  );
  reportDuplicates(duplicates);

  const summary = summarize(await encodeAll(primary, args));
  writeSummary(summary, primary.length);
  return { ok: summary.ok, failed: summary.failed };
}

const NUMERIC_FLAG_BY_NAME: Record<string, keyof Args> = {
  '--width': 'width',
  '--quality': 'quality',
};

function assertValidRange(args: Args): void {
  if (!Number.isFinite(args.width) || args.width <= 0) {
    console.error(`Invalid --width: ${String(args.width)}`);
    process.exit(2);
  }
  if (
    !Number.isFinite(args.quality) ||
    args.quality <= 0 ||
    args.quality > 100
  ) {
    console.error(`Invalid --quality: ${String(args.quality)}`);
    process.exit(2);
  }
}

/** Returns the parsed options, or null when `--help` was handled. */
function parseArgs(argv: readonly string[]): Args | null {
  const args: { width: number; quality: number } = {
    width: DEFAULT_WIDTH,
    quality: DEFAULT_QUALITY,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i] ?? '';
    if (flag === '--help' || flag === '-h') {
      writeLine(USAGE);
      return null;
    }
    const name = NUMERIC_FLAG_BY_NAME[flag];
    if (name === undefined) {
      console.error(`Unknown argument: ${flag}`);
      process.exit(2);
    }
    args[name] = Number(argv[i + 1] ?? args[name]);
    i += 1;
  }

  assertValidRange(args);
  return args;
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.exit(0);
  } else {
    try {
      const result = await optimizeImages(args);
      process.exit(result.failed.length > 0 ? 1 : 0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}
