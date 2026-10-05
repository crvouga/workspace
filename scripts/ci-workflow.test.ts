import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const workflow = parse(
  readFileSync(join(import.meta.dirname, '../.github/workflows/ci.yml'), 'utf8')
);

function dependencies(name: string, visited = new Set<string>()): Set<string> {
  for (const needed of workflow.jobs[name].needs ?? []) {
    if (!visited.has(needed)) {
      visited.add(needed);
      dependencies(needed, visited);
    }
  }
  return visited;
}

test('optional credential failures cannot suppress core checks or block Required', () => {
  expect(dependencies('check').has('vault')).toBe(false);
  expect(dependencies('Required').has('secret-integrations')).toBe(false);
  expect(workflow.jobs['secret-integrations']['continue-on-error']).toBe(true);
});

test('active cache deployment smoke still requires its own credential groups', () => {
  const imports = workflow.jobs.smoke.steps.find(
    (step: { uses?: string }) =>
      step.uses === './.github/actions/turborepo-vault-secrets'
  );
  expect(imports).toBeDefined();
  expect(imports.with.optional).not.toBe('true');
  expect(workflow.jobs.smoke['continue-on-error']).not.toBe(true);
});
