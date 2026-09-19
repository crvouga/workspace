/**
 * Orchestrate the content-generation pipeline.
 *
 * Stage 1 (parallel):
 *   - All screenshots (work + projects + main) — one shared Chromium, bounded
 *     concurrency. Live per-job spinner via listr2.
 *   - Resume PDF — runs concurrently in its own process slot.
 *
 * Stage 2:
 *   - Image derivatives: every raster in `assets/` is re-encoded into the
 *     `public/**\/*.optimized.webp` files the site actually serves.
 *
 * Each parallel job is rendered as its own listr2 task so the user sees the
 * live state of everything at once.
 */
import { mkdir } from 'node:fs/promises';
import { Listr } from 'listr2';
import pretty from 'pretty-ms';
import pc from 'picocolors';

import { writeLine } from './library/cli-output';
import { optimizeImages } from '../scripts/optimize-images';
import {
  ASSETS_DIR,
  captureScreenshot,
  closeSharedBrowser,
  defaultScreenshotConcurrency,
  launchSharedBrowser,
  warmupScreenshotJobs,
  type ScreenshotJob,
} from './screenshot-helpers';
import { buildAllScreenshotJobs } from './screenshot-jobs';
import { generateResume } from './generate-resume';
import type { Browser } from 'playwright';

type Ctx = {
  browser?: Browser;
  screenshotConcurrency: number;
  failures: { stage: string; name: string; error: string }[];
  totals: {
    screenshots: { ok: number; failed: number };
    resume: 'ok' | 'failed' | 'skipped';
    images: 'ok' | 'failed' | 'skipped';
  };
};

function fmtElapsed(ms: number): string {
  return pc.dim(pretty(ms, { compact: false, secondsDecimalDigits: 1 }));
}

const screenshotJobs = buildAllScreenshotJobs();
const ctx: Ctx = {
  screenshotConcurrency: defaultScreenshotConcurrency(),
  failures: [],
  totals: {
    screenshots: { ok: 0, failed: 0 },
    resume: 'skipped',
    images: 'skipped',
  },
};

const tasks = new Listr<Ctx>(
  [
    {
      title: pc.dim('Boot Chromium'),
      task: async (ctx, t) => {
        await mkdir(ASSETS_DIR, { recursive: true });
        const t0 = performance.now();
        ctx.browser = await launchSharedBrowser();
        t.title = `${pc.dim('Boot Chromium')}  ${fmtElapsed(performance.now() - t0)}`;
      },
    },
    {
      title: pc.dim('Warm up hosted apps'),
      task: async (_, t) => {
        const t0 = performance.now();
        await warmupScreenshotJobs(screenshotJobs);
        t.title = `${pc.dim('Warm up hosted apps')}  ${fmtElapsed(performance.now() - t0)}`;
      },
    },
    {
      title: pc.bold(
        `Stage 1 — screenshots (${screenshotJobs.length}) + resume ${pc.dim(
          `[parallel: cs=${ctx.screenshotConcurrency}]`
        )}`
      ),
      task: (_, parent) =>
        parent.newListr(
          [
            {
              title: `Screenshots ${pc.dim(`(${screenshotJobs.length} sites)`)}`,
              task: (_, t) =>
                t.newListr(
                  screenshotJobs.map((job: ScreenshotJob) => ({
                    title: job.name,
                    task: async (ctx, sub) => {
                      if (!ctx.browser)
                        throw new Error('Chromium not booted yet');
                      try {
                        const r = await captureScreenshot(ctx.browser, job);
                        ctx.totals.screenshots.ok += 1;
                        sub.title = `${job.name}  ${fmtElapsed(r.elapsedMs)}`;
                      } catch (err) {
                        ctx.totals.screenshots.failed += 1;
                        const msg =
                          err instanceof Error ? err.message : String(err);
                        ctx.failures.push({
                          stage: 'screenshot',
                          name: job.name,
                          error: msg,
                        });
                        throw new Error(msg);
                      }
                    },
                  })),
                  {
                    concurrent: ctx.screenshotConcurrency,
                    exitOnError: false,
                    rendererOptions: { collapseSubtasks: false },
                  }
                ),
            },
            {
              title: 'Resume PDF',
              task: async (ctx, t) => {
                const t0 = performance.now();
                try {
                  const path = await generateResume();
                  ctx.totals.resume = 'ok';
                  t.title = `Resume PDF ${pc.dim(path)} ${fmtElapsed(performance.now() - t0)}`;
                } catch (err) {
                  ctx.totals.resume = 'failed';
                  const msg = err instanceof Error ? err.message : String(err);
                  ctx.failures.push({
                    stage: 'resume',
                    name: 'Resume PDF',
                    error: msg,
                  });
                  throw new Error(msg);
                }
              },
            },
          ],
          {
            concurrent: true,
            exitOnError: false,
            rendererOptions: { collapseSubtasks: false },
          }
        ),
    },
    {
      title: pc.bold('Stage 2 — image derivatives'),
      task: async (ctx, t) => {
        const t0 = performance.now();
        try {
          const result = await optimizeImages();
          if (result.failed.length > 0) {
            ctx.totals.images = 'failed';
            for (const failure of result.failed) {
              ctx.failures.push({
                stage: 'images',
                name: 'Optimize images',
                error: failure,
              });
            }
            throw new Error(`${result.failed.length} image(s) failed`);
          }
          ctx.totals.images = 'ok';
          t.title = `${pc.bold('Stage 2 — image derivatives')}  ${pc.dim(
            `${result.ok} file(s)`
          )} ${fmtElapsed(performance.now() - t0)}`;
        } catch (err) {
          ctx.totals.images = 'failed';
          throw err instanceof Error ? err : new Error(String(err));
        }
      },
    },
    {
      title: pc.dim('Tear down Chromium'),
      task: async (ctx, t) => {
        await closeSharedBrowser(ctx.browser);
        delete ctx.browser;
        t.title = pc.dim('Tear down Chromium (closed)');
      },
    },
  ],
  {
    concurrent: false, // stages run sequentially; tasks within stages are concurrent
    exitOnError: false,
    rendererOptions: { collapseSubtasks: false, showSubtasks: true },
  }
);

const t0 = performance.now();
let exitCode = 0;
try {
  await tasks.run(ctx);
} catch (err) {
  exitCode = 1;
  console.error(
    pc.red('\nOrchestrator threw:'),
    err instanceof Error ? err.message : err
  );
} finally {
  // Defensive: never leave a Chromium hanging if stage 1 errored before the
  // explicit teardown task ran.
  await closeSharedBrowser(ctx.browser);
}

const elapsed = performance.now() - t0;
const { screenshots, resume, images } = ctx.totals;

const status = (value: 'ok' | 'failed' | 'skipped'): string =>
  value === 'ok'
    ? pc.green('ok')
    : value === 'failed'
      ? pc.red('failed')
      : pc.dim('skipped');

writeLine('');
writeLine(pc.bold('Summary'));
writeLine(
  `  ${pc.cyan('Screenshots')}: ${pc.green(`${screenshots.ok} ok`)}, ${pc.red(
    `${screenshots.failed} failed`
  )} (out of ${screenshotJobs.length})`
);
writeLine(`  ${pc.cyan('Resume PDF')}:  ${status(resume)}`);
writeLine(`  ${pc.cyan('Images')}:      ${status(images)}`);
writeLine(`  ${pc.cyan('Total')}:       ${pretty(elapsed)}`);

if (ctx.failures.length > 0) {
  writeLine('');
  writeLine(pc.red(pc.bold(`Failures (${ctx.failures.length}):`)));
  for (const f of ctx.failures) {
    writeLine(`  ${pc.red('✗')} [${f.stage}] ${f.name} — ${f.error}`);
  }
  // Treat non-trivial failures as a non-zero exit so CI catches them.
  if (resume === 'failed' || images === 'failed') exitCode = 1;
}

process.exit(exitCode);
