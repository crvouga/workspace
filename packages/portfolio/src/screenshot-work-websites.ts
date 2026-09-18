import { mkdir } from 'node:fs/promises';
import { writeLine } from './library/cli-output';
import { PUBLIC_DIR, runScreenshotJobs } from './screenshot-helpers';
import { buildWorkJobs } from './screenshot-jobs';

const main = async (): Promise<void> => {
  writeLine('Starting screenshot capture for work websites...\n');
  await mkdir(PUBLIC_DIR, { recursive: true });

  const jobs = buildWorkJobs();
  if (jobs.length === 0) {
    writeLine('No work entries with infoUrl found.');
    return;
  }

  writeLine(
    `Found ${jobs.length} work entr${jobs.length === 1 ? 'y' : 'ies'} with URLs.\n`
  );
  await runScreenshotJobs('work-websites', jobs);
  writeLine('\n✓ Screenshot capture complete!');
};

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
