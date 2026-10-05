import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GUIDE_PATH = fileURLToPath(
  new URL('../../../../llms.txt', import.meta.url)
);

const GUIDE = readFileSync(GUIDE_PATH, 'utf8');

export const infraGuideResponse = (): Response =>
  new Response(GUIDE, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
