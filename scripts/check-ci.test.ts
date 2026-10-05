import { expect, test } from 'bun:test';
import { readCheckEnvironment, runChecks } from './check-ci';

test('unavailable Vault preserves supplied credentials for independent checks', () => {
  const env = {
    PATH: '/no-vault-fixture',
    PORTFOLIO_GITHUB_TOKEN: 'fixture-token',
  };
  expect(readCheckEnvironment(env)).toEqual(env);
});

test('optional integrations fail independently and core checks always run', () => {
  const calls: string[][] = [];
  const result = runChecks({ TURBO_CACHE: 'invalid' }, (args, env) => {
    calls.push(args);
    if (args.includes('smoke:secrets')) return 1;
    expect(env.TURBO_CACHE).toBe('local:rw');
    return 0;
  });
  expect(result).toBe(0);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(['run', 'check']);
});

test('a core check failure propagates even after an optional integration failure', () => {
  expect(
    runChecks({}, (args) => (args.includes('smoke:secrets') ? 1 : 2))
  ).toBe(2);
});
