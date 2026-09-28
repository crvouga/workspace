/**
 * `bun run pr:ready <command> [flags]` — the engine behind the `/pr-ready`
 * agent command (`.agents/commands/pr-ready.md`).
 *
 * Every command except `logs` prints exactly one JSON object on stdout; child
 * process output is captured into that object. Exit codes: 0 ok · 1 fail ·
 * 2 usage · 3 merge conflicts · 4 checks pending / timed out.
 */
import {
  checksCommand,
  logsText,
  mergeCommand,
  pollChecks,
  prCommand,
  summarizeChecks,
  viewPr,
} from './pr-ready/github';
import {
  commitCommand,
  contextCommand,
  currentBranch,
  localSnapshot,
  publishCommand,
  syncCommand,
} from './pr-ready/git';
import {
  CommandError,
  EXIT,
  ok,
  parseFlags,
  usageError,
  type FlagSpec,
  type Flags,
  type Outcome,
} from './pr-ready/lib';
import {
  repoCommand,
  requiredContexts,
  rulesetCommand,
} from './pr-ready/settings';

async function statusCommand(): Promise<Outcome> {
  const snapshot = await localSnapshot();
  const branch = await currentBranch();
  const pr = await viewPr(branch);
  const checks = pr ? summarizeChecks(await pollChecks(branch)) : null;
  return ok({
    ...snapshot,
    pr,
    checks: checks && {
      verdict: checks.verdict,
      total: checks.total,
      passed: checks.passed,
      failed: checks.failed,
      pending: checks.pending,
      skipped: checks.skipped,
      failing: checks.failing.map((check) => check.name),
    },
    requiredContexts: await requiredContexts(),
  });
}

type Command = { spec: FlagSpec; run: (flags: Flags) => Promise<Outcome> };

const COMMANDS: Record<string, Command> = {
  status: { spec: {}, run: statusCommand },
  context: { spec: {}, run: contextCommand },
  commit: {
    spec: {
      values: {
        m: 'message',
        message: 'message',
        'message-file': 'message-file',
        path: 'path',
      },
      booleans: { amend: 'amend' },
      repeatable: ['path'],
    },
    run: commitCommand,
  },
  publish: {
    spec: { booleans: { 'force-with-lease': 'force-with-lease' } },
    run: publishCommand,
  },
  sync: { spec: { booleans: { continue: 'continue' } }, run: syncCommand },
  pr: {
    spec: {
      values: { title: 'title', body: 'body', 'body-file': 'body-file' },
      booleans: { ready: 'ready', draft: 'draft' },
    },
    run: prCommand,
  },
  checks: {
    spec: {
      values: { interval: 'interval', timeout: 'timeout' },
      booleans: { once: 'once' },
    },
    run: checksCommand,
  },
  repo: { spec: { booleans: { apply: 'apply' } }, run: repoCommand },
  ruleset: { spec: { booleans: { apply: 'apply' } }, run: rulesetCommand },
  merge: { spec: { booleans: { auto: 'auto' } }, run: mergeCommand },
};

const LOGS_SPEC: FlagSpec = {
  values: { name: 'name', tail: 'tail' },
  positional: 'url',
};

function failure(error: unknown): Outcome {
  if (error instanceof CommandError) {
    return {
      code: error.code,
      body: {
        ok: false,
        step: error.step,
        output: error.output,
        ...(error.hint ? { hint: error.hint } : {}),
        ...error.extra,
      },
    };
  }
  const output = error instanceof Error ? error.message : String(error);
  return { code: EXIT.fail, body: { ok: false, step: 'internal', output } };
}

async function main(argv: readonly string[]): Promise<number> {
  const [name = 'status', ...rest] = argv;
  if (name === 'logs') {
    try {
      process.stdout.write(await logsText(parseFlags(rest, LOGS_SPEC)));
      return EXIT.ok;
    } catch (error) {
      const outcome = failure(error);
      process.stdout.write(`${JSON.stringify(outcome.body, null, 2)}\n`);
      return outcome.code;
    }
  }
  let outcome: Outcome;
  try {
    const command = COMMANDS[name];
    if (!command) {
      throw usageError(
        `unknown command "${name}"`,
        `commands: ${[...Object.keys(COMMANDS), 'logs'].join(', ')}`
      );
    }
    outcome = await command.run(parseFlags(rest, command.spec));
  } catch (error) {
    outcome = failure(error);
  }
  process.stdout.write(`${JSON.stringify(outcome.body, null, 2)}\n`);
  return outcome.code;
}

process.exit(await main(process.argv.slice(2)));
