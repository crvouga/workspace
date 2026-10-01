import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const library = resolve(
  import.meta.dirname,
  '../packages/vault-service/cli/lib/run.sh'
);

function run(secrets: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'vault-run-test-'));
  const stub = join(directory, 'vault-fixture');
  writeFileSync(stub, '#!/bin/bash\nprintf \'%s\' "$KV_FIXTURE"\n', {
    mode: 0o700,
  });
  try {
    return Bun.spawnSync(
      [
        '/bin/bash',
        '-c',
        `
      source "$RUN_LIBRARY"
      require_cmd() { :; }
      export_vault_auth() { :; }
      resolve_vault_bin() { VAULT_REAL_BIN="$FIXTURE_BINARY"; }
      resolve_secret_path() { SECRET_PATH=secret/personal/prd; }
      vault_run -- "$BUN_BINARY" -e 'console.log("RESULT=" + JSON.stringify(Object.fromEntries(JSON.parse(process.env.TEST_KEYS).map(key => [key, process.env[key]]))))'
    `,
      ],
      {
        env: {
          ...process.env,
          RUN_LIBRARY: library,
          FIXTURE_BINARY: stub,
          BUN_BINARY: process.execPath,
          TEST_KEYS: JSON.stringify(Object.keys(secrets)),
          KV_FIXTURE: JSON.stringify({ data: { data: secrets } }),
        },
      }
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
}

test('vault run preserves numeric key prefixes, empty values, quotes and newlines', () => {
  const secrets = {
    '9ROUTER_PASSWORD': 'fixture-password',
    EMPTY: '',
    MULTILINE: 'first\nsecond',
    LITERAL: '\'"$HOME $(echo should-not-run)\\',
  };
  const result = run(secrets);
  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toBe('');
  const line = result.stdout
    .toString()
    .split('\n')
    .find((line) => line.startsWith('RESULT='));
  expect(JSON.parse(line!.slice('RESULT='.length))).toEqual(secrets);
});

test('vault run rejects invalid names without exposing their values', () => {
  const result = run({ 'INVALID=NAME': 'fixture-value-must-not-be-logged' });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain('Secret names must contain');
  expect(result.stderr.toString()).not.toContain(
    'fixture-value-must-not-be-logged'
  );
  expect(result.stdout.toString()).not.toContain(
    'fixture-value-must-not-be-logged'
  );
});
