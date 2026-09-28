/**
 * Shared plumbing for `scripts/pr-ready.ts`: constants, process spawning,
 * the one-JSON-object output contract, and flag parsing.
 */

export const TRUNK_BRANCH = 'main';
export const REMOTE = 'origin';
export const RULESET_NAME = 'main';
/** Rulesets with these names are deleted by `ruleset --apply`. */
export const LEGACY_RULESET_NAMES: readonly string[] = ['Protect main'];
export const REQUIRED_CHECK_CONTEXTS: readonly string[] = ['Required'];
/** GitHub Actions app id — pins required checks to Actions-reported runs. */
export const ACTIONS_INTEGRATION_ID = 15368;
export const ALLOWED_MERGE_METHODS: readonly string[] = ['merge'];

export const EXIT = {
  ok: 0,
  fail: 1,
  usage: 2,
  conflicts: 3,
  pending: 4,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export type Json = Record<string, unknown>;

/** Thrown by commands; `main` turns it into the failure JSON + exit code. */
export class CommandError extends Error {
  readonly step: string;
  readonly output: string;
  readonly hint: string | undefined;
  readonly code: ExitCode;
  readonly extra: Json;

  constructor(args: {
    step: string;
    output: string;
    hint?: string;
    code?: ExitCode;
    extra?: Json;
  }) {
    super(`${args.step}: ${args.output}`);
    this.step = args.step;
    this.output = args.output;
    this.hint = args.hint;
    this.code = args.code ?? EXIT.fail;
    this.extra = args.extra ?? {};
  }
}

export const usageError = (output: string, hint?: string): CommandError =>
  new CommandError({ step: 'usage', output, hint, code: EXIT.usage });

/** A command's result: the JSON object to print plus the exit code. */
export type Outcome = { code: ExitCode; body: Json };

export const ok = (body: Json, code: ExitCode = EXIT.ok): Outcome => ({
  code,
  body: { ok: code === EXIT.ok, ...body },
});

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
  /** stdout + stderr, trimmed — what goes into failure JSON. */
  output: string;
};

export type RunOptions = {
  env?: Record<string, string>;
  stdin?: string;
};

/** Runs a child process with all output captured; never touches our stdout. */
export async function run(
  cmd: readonly string[],
  options: RunOptions = {}
): Promise<RunResult> {
  const proc = Bun.spawn([...cmd], {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    stdin: options.stdin === undefined ? 'ignore' : new Blob([options.stdin]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  return { code, stdout, stderr, output };
}

/** Like `run`, but a non-zero exit becomes a `CommandError` for `step`. */
export async function runOk(
  step: string,
  cmd: readonly string[],
  options: RunOptions & { hint?: string } = {}
): Promise<string> {
  const result = await run(cmd, options);
  if (result.code !== 0) {
    throw new CommandError({
      step,
      output: result.output,
      hint: options.hint,
    });
  }
  // trimEnd only: leading spaces are significant (e.g. `git status --porcelain`).
  return result.stdout.trimEnd();
}

export const git = (step: string, args: readonly string[]): Promise<string> =>
  runOk(step, ['git', ...args]);

export const gh = (
  step: string,
  args: readonly string[],
  hint?: string
): Promise<string> => runOk(step, ['gh', ...args], { hint });

export function parseJson<T>(step: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CommandError({
      step,
      output: `invalid JSON: ${text.slice(0, 500)}`,
    });
  }
}

export const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

export type FlagSpec = {
  /** Flags that take a value, with aliases (`-m` → `message`). */
  values?: Record<string, string>;
  /** Boolean flags, with aliases. */
  booleans?: Record<string, string>;
  /** Value flags that may repeat (collected into arrays). */
  repeatable?: readonly string[];
  /** Name for leftover positional args, if the command accepts one. */
  positional?: string;
};

export type Flags = {
  values: Record<string, string>;
  lists: Record<string, string[]>;
  booleans: Set<string>;
  positional: string[];
};

function assignValue(
  flags: Flags,
  spec: FlagSpec,
  name: string,
  value: string
): void {
  if (spec.repeatable?.includes(name)) {
    (flags.lists[name] ??= []).push(value);
    return;
  }
  if (name in flags.values) throw usageError(`--${name} given more than once`);
  flags.values[name] = value;
}

function splitArg(arg: string): { key: string; inline: string | undefined } {
  const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
  if (eq === -1) return { key: arg, inline: undefined };
  return { key: arg.slice(0, eq), inline: arg.slice(eq + 1) };
}

export function parseFlags(argv: readonly string[], spec: FlagSpec): Flags {
  const flags: Flags = {
    values: {},
    lists: {},
    booleans: new Set(),
    positional: [],
  };
  const values = { base: 'base', ...spec.values };
  for (let i = 0; i < argv.length; i += 1) {
    const { key, inline } = splitArg(argv[i] ?? '');
    const bool = spec.booleans?.[key.replace(/^--?/, '')];
    const valueName = values[key.replace(/^--?/, '') as keyof typeof values];
    if (key.startsWith('-') && bool && inline === undefined) {
      flags.booleans.add(bool);
    } else if (key.startsWith('-') && valueName) {
      const value = inline ?? argv[(i += 1)];
      if (value === undefined) throw usageError(`${key} needs a value`);
      assignValue(flags, spec, valueName, value);
    } else if (key.startsWith('-')) {
      throw usageError(`unknown flag ${key}`);
    } else if (spec.positional) {
      flags.positional.push(argv[i] ?? '');
    } else {
      throw usageError(`unexpected argument ${argv[i]}`);
    }
  }
  const base = flags.values.base;
  if (base !== undefined && base !== TRUNK_BRANCH) {
    throw usageError(
      `--base ${base} is not allowed`,
      `only ${TRUNK_BRANCH} is supported`
    );
  }
  return flags;
}

export function intFlag(flags: Flags, name: string, fallback: number): number {
  const raw = flags.values[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw usageError(`--${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

/** Exactly one of two mutually exclusive value flags. */
export function exactlyOne(
  flags: Flags,
  a: string,
  b: string
): { name: string; value: string } {
  const hasA = a in flags.values;
  const hasB = b in flags.values;
  if (hasA === hasB) throw usageError(`pass exactly one of --${a} or --${b}`);
  const name = hasA ? a : b;
  return { name, value: flags.values[name] ?? '' };
}
