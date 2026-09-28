import { mkdir } from 'node:fs/promises';
import { writeLine } from './library/cli-output';
import { ASSETS_DIR, runScreenshotJobs } from './screenshot-helpers';
import { buildProjectJobs } from './screenshot-jobs';

const main = async (): Promise<void> => {
  writeLine('Starting screenshot capture for project websites...\n');
  await mkdir(ASSETS_DIR, { recursive: true });

  const jobs = buildProjectJobs();
  if (jobs.length === 0) {
    writeLine('No projects with public deployments found.');
    return;
  }

  writeLine(
    `Found ${jobs.length} project${jobs.length === 1 ? '' : 's'} with public deployments.\n`
  );
  await runScreenshotJobs('project-websites', jobs);
  writeLine('\n✓ Screenshot capture complete!');
};

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
