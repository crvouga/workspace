import { describe, expect, test } from 'bun:test';
import { parseRunLink, summarizeChecks, type Check } from './github';
import { CommandError, EXIT, parseFlags } from './lib';
import { DESIRED_RULESET, diffSubset, rulesetDrift } from './settings';

const check = (name: string, bucket: Check['bucket']): Check => ({
  name,
  bucket,
  state: bucket.toUpperCase(),
  link: `https://github.com/o/r/actions/runs/1/job/${name.length}`,
  workflow: 'CI',
});

describe('summarizeChecks', () => {
  test('no checks reported is pending, not green', () => {
    expect(summarizeChecks({ checks: [], noneReported: true }).verdict).toBe(
      'pending'
    );
  });

  test('pass and skipping are green', () => {
    const poll = {
      checks: [check('Required', 'pass'), check('publish', 'skipping')],
      noneReported: false,
    };
    expect(summarizeChecks(poll).verdict).toBe('pass');
  });

  test('any fail or cancel fails even while others are pending', () => {
    const poll = {
      checks: [check('check', 'pending'), check('pr-title', 'cancel')],
      noneReported: false,
    };
    const summary = summarizeChecks(poll);
    expect(summary.verdict).toBe('fail');
    expect(summary.failing.map((c) => c.name)).toEqual(['pr-title']);
  });

  test('pending without failures stays pending', () => {
    const poll = {
      checks: [check('check', 'pending'), check('changes', 'pass')],
      noneReported: false,
    };
    expect(summarizeChecks(poll).verdict).toBe('pending');
  });
});

describe('parseRunLink', () => {
  test('extracts run and job ids', () => {
    expect(
      parseRunLink('https://github.com/o/r/actions/runs/123/job/456')
    ).toEqual({ runId: '123', jobId: '456' });
    expect(parseRunLink('https://github.com/o/r/actions/runs/123')).toEqual({
      runId: '123',
      jobId: null,
    });
    expect(parseRunLink('https://example.com/status')).toBeNull();
  });
});

describe('parseFlags', () => {
  const spec = {
    values: { m: 'message', message: 'message', path: 'path' },
    booleans: { amend: 'amend' },
    repeatable: ['path'],
  };

  test('aliases, repeatable values and booleans', () => {
    const flags = parseFlags(
      ['-m', 'fix: x', '--path', 'a', '--path=b', '--amend'],
      spec
    );
    expect(flags.values.message).toBe('fix: x');
    expect(flags.lists.path).toEqual(['a', 'b']);
    expect(flags.booleans.has('amend')).toBe(true);
  });

  test('rejects a non-trunk --base with a usage error', () => {
    try {
      parseFlags(['--base', 'develop'], spec);
      throw new Error('expected a usage error');
    } catch (error) {
      expect(error).toBeInstanceOf(CommandError);
      expect((error as CommandError).code).toBe(EXIT.usage);
    }
    expect(parseFlags(['--base', 'main'], spec).values.base).toBe('main');
  });

  test('rejects unknown flags', () => {
    expect(() => parseFlags(['--force'], spec)).toThrow(CommandError);
  });
});

describe('ruleset drift', () => {
  test('diffSubset ignores fields the API adds', () => {
    expect(
      diffSubset(
        { a: 1, b: { c: [1] } },
        { a: 1, extra: true, b: { c: [1], d: 2 } }
      )
    ).toEqual([]);
    expect(diffSubset({ a: 1 }, { a: 2 })).toEqual([
      { path: 'a', expected: 1, actual: 2 },
    ]);
  });

  test('the canonical ruleset has no drift against itself plus API extras', () => {
    const live = {
      id: 1,
      ...DESIRED_RULESET,
      node_id: 'x',
      rules: [...DESIRED_RULESET.rules].reverse(),
      current_user_can_bypass: 'never',
    };
    expect(rulesetDrift(live)).toEqual({ drift: [], unexpectedRules: [] });
  });

  test('flags disabled enforcement, missing rules and unexpected rules', () => {
    const live = {
      id: 1,
      name: 'main',
      enforcement: 'disabled',
      rules: [{ type: 'deletion' }, { type: 'creation' }],
    };
    const { drift, unexpectedRules } = rulesetDrift(live);
    expect(drift.map((d) => d.path)).toContain('enforcement');
    expect(drift.map((d) => d.path)).toContain('rules[pull_request]');
    expect(unexpectedRules).toEqual(['creation']);
  });
});
