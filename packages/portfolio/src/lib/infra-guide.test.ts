import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { infraGuideResponse } from './infra-guide';

test('serves the generated root infrastructure guide verbatim', async () => {
  const expected = readFileSync(
    fileURLToPath(new URL('../../../../llms.txt', import.meta.url)),
    'utf8'
  );
  const response = infraGuideResponse();

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe(
    'text/plain; charset=utf-8'
  );
  expect(await response.text()).toBe(expected);
});
