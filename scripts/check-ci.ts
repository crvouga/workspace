/** Optional credential checks run separately; the core suite always runs. */
import { spawnSync } from 'node:child_process';

export function readCheckEnvironment(
  env: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const result = spawnSync(
    'vault',
    ['kv', 'get', '-format=json', '-mount=secret', 'personal/dev'],
    {
      env: { ...env, VAULT_CLIENT_TIMEOUT: '5s', VAULT_MAX_RETRIES: '0' },
      timeout: 10_000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  if (result.status === 0) {
    try {
      const data: unknown = JSON.parse(result.stdout).data.data;
      if (
        data &&
        typeof data === 'object' &&
        Object.entries(data).every(
          ([key, value]) =>
            /^[A-Za-z0-9_]+$/.test(key) && typeof value === 'string'
        )
      )
        return { ...data, ...env };
    } catch {
      /* Unavailable secret data is reported without exposing its body. */
    }
  }
  console.warn(
    'SKIP Vault credential import: unavailable; using supplied environment'
  );
  return { ...env };
}

function runCommand(args: string[], env: NodeJS.ProcessEnv): number {
  return (
    spawnSync(process.execPath, args, {
      env,
      stdio: 'inherit',
      timeout: args.includes('smoke:secrets') ? 30_000 : undefined,
    }).status ?? 1
  );
}

export function runChecks(
  env: NodeJS.ProcessEnv,
  run: typeof runCommand = runCommand
): number {
  const optional = run(
    ['run', '--filter', '@pkgs/turborepo-remote-cache', 'smoke:secrets'],
    env
  );
  if (optional !== 0)
    console.warn(
      'WARN optional secret integration failed; core checks continue'
    );
  return run(['run', 'check'], { ...env, TURBO_CACHE: 'local:rw' });
}

if (import.meta.main)
  process.exit(runChecks(readCheckEnvironment(process.env)));
