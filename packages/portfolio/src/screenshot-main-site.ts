import { mkdir } from 'node:fs/promises';
import { writeLine } from './library/cli-output';
import { ASSETS_DIR, runScreenshotJobs } from './screenshot-helpers';
import { buildMainSiteJobs } from './screenshot-jobs';

const main = async (): Promise<void> => {
  writeLine('Starting screenshot capture for main site...\n');
  await mkdir(ASSETS_DIR, { recursive: true });

  const jobs = buildMainSiteJobs();
  if (jobs.length === 0) {
    writeLine('No SITE_URL configured; nothing to capture.');
    return;
  }

  await runScreenshotJobs('main-site', jobs);
  writeLine('\n✓ Screenshot capture complete!');
};

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
