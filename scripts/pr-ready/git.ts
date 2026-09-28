/**
 * Local git commands for `pr-ready`: worktree snapshot, context, commit,
 * publish, and merge-based sync with the trunk.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CommandError,
  EXIT,
  REMOTE,
  TRUNK_BRANCH,
  exactlyOne,
  git,
  lines,
  ok,
  run,
  runOk,
  usageError,
  type Flags,
  type Outcome,
} from './lib';

const BASE_REF = `${REMOTE}/${TRUNK_BRANCH}`;
const MAX_LISTED_FILES = 20;

export type Worktree = {
  dirty: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  files: string[];
};

export async function currentBranch(): Promise<string> {
  const branch = await git('branch', ['branch', '--show-current']);
  if (!branch) {
    throw new CommandError({
      step: 'branch',
      output: 'HEAD is detached',
      hint: 'check out a feature branch first',
    });
  }
  return branch;
}

export const fetchBase = (): Promise<string> =>
  git('fetch', ['fetch', '--quiet', REMOTE, TRUNK_BRANCH]);

export async function readWorktree(): Promise<Worktree> {
  const entries = lines(
    await git('worktree', ['status', '--porcelain=v1', '--untracked-files=all'])
  );
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  for (const entry of entries) {
    const [x, y] = [entry[0], entry[1]];
    if (x === '?') untracked += 1;
    if (x !== ' ' && x !== '?') staged += 1;
    if (y !== ' ' && y !== '?') unstaged += 1;
  }
  return {
    dirty: entries.length > 0,
    staged,
    unstaged,
    untracked,
    files: entries.slice(0, MAX_LISTED_FILES),
  };
}

export async function upstreamRef(): Promise<string | null> {
  const result = await run([
    'git',
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{u}',
  ]);
  return result.code === 0 ? result.stdout.trim() : null;
}

export async function remoteBranchExists(branch: string): Promise<boolean> {
  const out = await git('ls-remote', ['ls-remote', '--heads', REMOTE, branch]);
  return out.length > 0;
}

export async function mergeInProgress(): Promise<boolean> {
  const result = await run([
    'git',
    'rev-parse',
    '-q',
    '--verify',
    'MERGE_HEAD',
  ]);
  return result.code === 0;
}

export async function conflictedFiles(): Promise<string[]> {
  return lines(
    await git('conflicts', ['diff', '--name-only', '--diff-filter=U'])
  );
}

async function countRange(range: string): Promise<number> {
  return Number(await git('rev-list', ['rev-list', '--count', range]));
}

/** Branch/upstream/base snapshot shared by `status` and the final report. */
export async function localSnapshot(): Promise<Record<string, unknown>> {
  const branch = await currentBranch();
  await fetchBase();
  const upstream = await upstreamRef();
  const [worktree, remoteExists, merging, conflicts, behindBase] =
    await Promise.all([
      readWorktree(),
      remoteBranchExists(branch),
      mergeInProgress(),
      conflictedFiles(),
      countRange(`HEAD..${BASE_REF}`),
    ]);
  const ahead = await countRange(
    upstream ? `${upstream}..HEAD` : `${BASE_REF}..HEAD`
  );
  const behindUpstream = upstream ? await countRange(`HEAD..${upstream}`) : 0;
  return {
    branch,
    base: TRUNK_BRANCH,
    head: await git('rev-parse', ['rev-parse', 'HEAD']),
    worktree,
    upstream,
    remoteBranchExists: remoteExists,
    ahead,
    behindBase,
    behindUpstream,
    mergeInProgress: merging,
    conflicts,
  };
}

export async function contextCommand(): Promise<Outcome> {
  const branch = await currentBranch();
  await fetchBase();
  const [commits, diffstat, files, uncommitted] = await Promise.all([
    git('log', ['log', '--oneline', `${BASE_REF}..HEAD`]),
    git('diff', ['diff', '--stat', `${BASE_REF}...HEAD`]),
    git('diff', ['diff', '--name-status', `${BASE_REF}...HEAD`]),
    git('status', ['status', '--short', '--untracked-files=all']),
  ]);
  return ok({
    branch,
    base: TRUNK_BRANCH,
    commits: lines(commits),
    diffstat,
    files: lines(files),
    uncommitted: lines(uncommitted),
  });
}

// ---------------------------------------------------------------------------
// commit
// ---------------------------------------------------------------------------

async function withMessageFile<T>(
  flags: Flags,
  body: (file: string) => Promise<T>
): Promise<T> {
  const source = exactlyOne(flags, 'message', 'message-file');
  const message =
    source.name === 'message'
      ? source.value
      : await readFile(source.value, 'utf8');
  if (!message.trim()) throw usageError('commit message is empty');
  const dir = await mkdtemp(join(tmpdir(), 'pr-ready-'));
  const file = join(dir, 'COMMIT_EDITMSG');
  try {
    await writeFile(file, message.endsWith('\n') ? message : `${message}\n`);
    return await body(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function commitlint(file: string): Promise<void> {
  await runOk('commitlint', ['bun', 'x', 'commitlint', '--edit', file], {
    hint: 'rewrite the message as a Conventional Commit: type(scope)?: subject, header <= 120 chars',
  });
}

async function hasStagedChanges(): Promise<boolean> {
  const result = await run(['git', 'diff', '--cached', '--quiet']);
  return result.code === 1;
}

export async function commitCommand(flags: Flags): Promise<Outcome> {
  const amend = flags.booleans.has('amend');
  const paths = flags.lists.path ?? [];
  return withMessageFile(flags, async (file) => {
    await commitlint(file);
    await git(
      'add',
      paths.length > 0 ? ['add', '--', ...paths] : ['add', '--all']
    );
    if (!amend && !(await hasStagedChanges())) {
      return ok({ committed: false, reason: 'nothing-to-commit' });
    }
    await git('commit', [
      'commit',
      '--quiet',
      '-F',
      file,
      ...(amend ? ['--amend'] : []),
    ]);
    const [sha, subject] = lines(
      await git('log', ['log', '-1', '--format=%H%n%s'])
    );
    return ok({ committed: true, amended: amend, sha, subject });
  });
}

// ---------------------------------------------------------------------------
// publish
// ---------------------------------------------------------------------------

export async function publishCommand(flags: Flags): Promise<Outcome> {
  const branch = await currentBranch();
  if (branch === TRUNK_BRANCH) {
    throw new CommandError({
      step: 'publish',
      output: `refusing to push the base branch ${TRUNK_BRANCH}`,
      hint: 'create a feature branch first',
      code: EXIT.usage,
    });
  }
  const upstream = await upstreamRef();
  const exists = await remoteBranchExists(branch);
  const force = flags.booleans.has('force-with-lease');
  let args: string[];
  if (!upstream || !exists) args = ['push', '-u', REMOTE, 'HEAD'];
  else if (force) args = ['push', '--force-with-lease', REMOTE, 'HEAD'];
  else args = ['push', REMOTE, 'HEAD'];
  const result = await run(['git', ...args]);
  if (result.code !== 0) {
    throw new CommandError({
      step: 'publish',
      output: result.output,
      hint: 'remote has commits you lack: run `sync` (or fetch + merge the branch), never --force',
    });
  }
  return ok({
    branch,
    pushed: !result.output.includes('Everything up-to-date'),
    forced: force && Boolean(upstream && exists),
    sha: await git('rev-parse', ['rev-parse', 'HEAD']),
    upstream: await upstreamRef(),
  });
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

async function conflictOutcome(output: string): Promise<Outcome> {
  return ok(
    {
      step: 'sync',
      merged: false,
      conflicts: await conflictedFiles(),
      output,
      hint: 'resolve each file keeping both sides, `git add` it, then `sync --continue`',
    },
    EXIT.conflicts
  );
}

async function continueMerge(): Promise<Outcome> {
  if (!(await mergeInProgress())) throw usageError('no merge in progress');
  if ((await conflictedFiles()).length > 0) {
    return conflictOutcome('unresolved conflicts remain');
  }
  await runOk('merge-continue', ['git', 'merge', '--continue'], {
    env: { GIT_EDITOR: 'true' },
  });
  return ok({
    merged: true,
    pushNeeded: true,
    sha: await git('rev-parse', ['rev-parse', 'HEAD']),
  });
}

export async function syncCommand(flags: Flags): Promise<Outcome> {
  await currentBranch();
  if (flags.booleans.has('continue')) return continueMerge();
  if (await mergeInProgress()) {
    throw usageError(
      'a merge is already in progress',
      'resolve it and run `sync --continue`'
    );
  }
  const worktree = await readWorktree();
  if (worktree.staged + worktree.unstaged > 0) {
    throw new CommandError({
      step: 'sync',
      output: 'worktree has uncommitted changes',
      hint: 'commit (or intentionally discard) them first',
      code: EXIT.usage,
      extra: { worktree },
    });
  }
  await fetchBase();
  const result = await run(['git', 'merge', '--no-edit', BASE_REF]);
  if (result.code !== 0) {
    if ((await conflictedFiles()).length > 0)
      return conflictOutcome(result.output);
    throw new CommandError({ step: 'merge', output: result.output });
  }
  if (/Already up[ -]to[ -]date/i.test(result.output)) {
    return ok({ alreadyUpToDate: true, merged: false, pushNeeded: false });
  }
  return ok({
    alreadyUpToDate: false,
    merged: true,
    pushNeeded: true,
    sha: await git('rev-parse', ['rev-parse', 'HEAD']),
  });
}
