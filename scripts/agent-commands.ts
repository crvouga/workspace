/**
 * One copy of every agent command, symlinked into each agent harness.
 *
 * Canonical files live in `.agents/commands/<name>.md`. `bun run agents:sync`
 * creates/repairs relative symlinks for every harness and removes dangling
 * ones; `bun run check:agents` (`--check`) changes nothing and exits 1 on drift.
 */
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  unlink,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const COMMANDS_DIR = '.agents/commands';
const SKILLS_DIR = '.agents/skills';

type Harness = {
  name: string;
  linkPath: (command: string) => string;
  dir: string;
};

const HARNESSES: readonly Harness[] = [
  {
    name: 'Claude Code',
    dir: '.claude/commands',
    linkPath: (n) => `.claude/commands/${n}.md`,
  },
  {
    name: 'Cursor',
    dir: '.cursor/commands',
    linkPath: (n) => `.cursor/commands/${n}.md`,
  },
  {
    name: 'OpenCode',
    dir: '.opencode/command',
    linkPath: (n) => `.opencode/command/${n}.md`,
  },
  {
    name: 'Windsurf',
    dir: '.windsurf/workflows',
    linkPath: (n) => `.windsurf/workflows/${n}.md`,
  },
  {
    name: 'GitHub Copilot',
    dir: '.github/prompts',
    linkPath: (n) => `.github/prompts/${n}.prompt.md`,
  },
  {
    name: 'Codex / Agent Skills',
    dir: SKILLS_DIR,
    linkPath: (n) => `${SKILLS_DIR}/${n}/SKILL.md`,
  },
];

const check = process.argv.includes('--check');
const errors: string[] = [];
const changes: string[] = [];

async function pathKind(path: string): Promise<'missing' | 'link' | 'other'> {
  try {
    return (await lstat(path)).isSymbolicLink() ? 'link' : 'other';
  } catch {
    return 'missing';
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(resolve(path));
    return true;
  } catch {
    return false;
  }
}

async function listCommands(): Promise<string[]> {
  const entries = await readdir(join(ROOT, COMMANDS_DIR));
  return entries
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => entry.slice(0, -3))
    .sort();
}

async function validateFrontmatter(command: string): Promise<void> {
  const file = `${COMMANDS_DIR}/${command}.md`;
  const text = await readFile(join(ROOT, file), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const frontmatter = match?.[1] ?? '';
  if (!new RegExp(`^name: ${command}\\s*$`, 'm').test(frontmatter)) {
    errors.push(`${file}: frontmatter must contain \`name: ${command}\``);
  }
  if (!/^description: \S/m.test(frontmatter)) {
    errors.push(`${file}: frontmatter must contain \`description:\``);
  }
}

async function ensureLink(linkPath: string, command: string): Promise<void> {
  const absLink = join(ROOT, linkPath);
  const target = relative(
    dirname(absLink),
    join(ROOT, COMMANDS_DIR, `${command}.md`)
  );
  const kind = await pathKind(absLink);
  if (kind === 'link' && (await readlink(absLink)) === target) return;
  if (kind === 'other') {
    errors.push(
      `${linkPath}: is a regular file, expected a symlink to ${target} (move its content into ${COMMANDS_DIR}/)`
    );
    return;
  }
  if (check) {
    errors.push(
      `${linkPath}: ${kind === 'missing' ? 'missing' : 'stale'} symlink (want -> ${target})`
    );
    return;
  }
  await mkdir(dirname(absLink), { recursive: true });
  if (kind === 'link') await unlink(absLink);
  await symlink(target, absLink);
  changes.push(`linked ${linkPath} -> ${target}`);
}

/** Symlinks in a harness dir whose target no longer exists (e.g. a removed command). */
async function pruneDangling(harness: Harness): Promise<void> {
  const dir = join(ROOT, harness.dir);
  const entries = await readdir(dir).catch(() => [] as string[]);
  for (const entry of entries) {
    const isSkill = harness.dir === SKILLS_DIR;
    const linkPath = isSkill
      ? `${harness.dir}/${entry}/SKILL.md`
      : `${harness.dir}/${entry}`;
    const absLink = join(ROOT, linkPath);
    if ((await pathKind(absLink)) !== 'link') continue;
    if (await exists(join(dirname(absLink), await readlink(absLink)))) continue;
    if (check) {
      errors.push(`${linkPath}: dangling symlink`);
      continue;
    }
    if (isSkill) await rm(join(dir, entry), { recursive: true, force: true });
    else await unlink(absLink);
    changes.push(
      `removed dangling ${isSkill ? `${harness.dir}/${entry}/` : linkPath}`
    );
  }
}

const commands = await listCommands();
for (const command of commands) {
  await validateFrontmatter(command);
  for (const harness of HARNESSES)
    await ensureLink(harness.linkPath(command), command);
}
for (const harness of HARNESSES) await pruneDangling(harness);

for (const change of changes) console.log(change);
if (errors.length > 0) {
  for (const error of errors) console.error(`::error::${error}`);
  console.error(
    check
      ? 'Agent command links are out of sync. Run `bun run agents:sync` and commit the result.'
      : 'Fix the errors above, then rerun `bun run agents:sync`.'
  );
  process.exit(1);
}
console.log(
  `${check ? 'checked' : 'synced'} ${commands.length} command(s) across ${HARNESSES.length} harnesses`
);
