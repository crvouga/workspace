---
name: ci
description: Run the local check gate, commit and push, then watch every CI job on GitHub Actions and fix failures until the run is green.
---

<!-- Canonical file; harness copies are symlinks (`bun run agents:sync`). -->

# Check & CI

End-to-end loop for this monorepo. **Do not stop until every step succeeds.**
If any step fails, fix it and restart from the failed gate (re-run local checks
after code fixes).

```
Local checks → Commit & push → Watch GitHub Actions → Done
     ↑______________ fix & loop on any failure ______________|
```

## The loop (required order)

### 1. Local checks

```bash
bun run check:ci && bun run typecheck
```

Runs, in order:

1. `bun install --frozen-lockfile` — lockfile in sync with `package.json`
2. `check:vault-secrets` — Vault `dev` config
3. `check:smoke:secrets` — smoke every registered secret
4. `vault run --config dev -- bun check` — prettier + `turbo run tc lint test build` with Vault `dev` secrets (needed for `@pkgs/portfolio` `PORTFOLIO_GITHUB_TOKEN`)
5. `bun run typecheck` — root `tsc` (includes `packages/workstation`)

`bun check` alone does not inject Vault secrets. Portfolio production builds require
`PORTFOLIO_GITHUB_TOKEN`, so prefer `bun run check:ci` (or
`vault run --config dev -- bun check`). CI injects the same key via OIDC before turbo.

> Turbo caches locally (`.turbo/`). CI is always fresh. If a fix seems ignored:
> `bun run check -- --force` and `bun run typecheck`. Vault session required for
> secret gates and portfolio build (`vault run --config dev -- …` / logged-in vault).

**On failure:** fix in the order reported, re-run `bun run check:ci && bun run typecheck`,
repeat until green. Then go to step 2.

| Failure           | Fix                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Lockfile mismatch | `bun install`, then re-check                                                                                        |
| Prettier          | `bun run format` (or `bunx prettier --write <file>`), then re-check                                                 |
| `tc`              | Fix TS in the named package (`tsconfig.strict.json` for turborepo + `@pkgs/*` libs; `@pkgs/infra` uses root config) |
| `lint`            | Package eslint (`--max-warnings 0`); shared rules in `packages/eslint-rules`                                        |
| `test`            | Fix assertion (`bun test`)                                                                                          |
| `build`           | `@pkgs/turborepo-remote-cache` is `test -f Dockerfile`; `@pkgs/portfolio` needs `PORTFOLIO_GITHUB_TOKEN` via Vault  |

A green local run is **not** done — local `check` does not cover CI `publish` /
`vault` / `deploy` (Docker, Railway, DNS).

If Vault is down locally, skip `check:ci` and say clearly that Vault-dependent
gates (secret smoke + portfolio build token) must pass via CI OIDC — then continue
the loop only for non-secret surfaces you can still exercise.

### 2. Commit & push

Only after local checks are green and the change is good to merge:

1. Inspect: `git status`, `git diff`, `git log --oneline -10`
2. Stage only intended files — never secrets (`VAULT_TOKEN`, `RAILWAY_TOKEN`, deploy tokens) or generated artifacts
3. Conventional Commit (subject ≤ 50 chars, lowercase type):
   - `fix: …` — broken checks / CI
   - `feat: …` — new behavior
   - `refactor: …` — non-behavior
   - `chore: …` — housekeeping  
     Body only when the why is unclear.
4. `git add <files> && git commit -m "…"`
5. `git push` (triggers CI on `main`)

No separate merge — push to `main` **is** the merge. Immediately go to step 3.

If the `main` ruleset is active (`bun run pr:ready ruleset`), direct pushes to
`main` are rejected — use `/pr-ready` to land the change through a PR instead.

**On failure** (hooks reject commit, push rejected, etc.): fix, re-run local
checks if code changed, commit again, push again.

### 3. Watch GitHub Actions (all jobs)

```bash
bun run gh:ci:watch     # block until latest CI run finishes; exit 0 only on success
bun run gh:ci:status    # recent runs
bun run gh:ci:log       # failed-step logs if red
bun run gh:ci           # open Actions in browser
```

Watch the **full** workflow for the push you just made
(`changes → vault-state → vault? → check → portfolio-health-check? → publish-plan? → publish? → deploy-prepare → deploy-reconcile → deploy-railway? → health-check-all`), not only the `check` job.

**On failure** (`gh:ci:watch` non-zero):

1. `bun run gh:ci:log` (or `gh run view <id> --log-failed`)
2. Fix the root cause locally (CI failures count like local failures)
3. Restart the loop from **step 1** (`check:ci` + typecheck)
4. Commit, push, `gh:ci:watch` again

**Repeat until the watched run is green.** Never declare done after local green
or push alone.

| Job / area                 | Typical cause                                                  | Where to look                                                                                      |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `check` (Vault OIDC)       | Missing/invalid Vault `dev` secrets                            | `vault-secrets-registry.ts`, `check:vault-secrets`                                                 |
| `publish-plan` / `publish` | `services.yaml` inventory / Docker / context / `.dockerignore` | `list-publish-service-ids.ts`, `print-publish-inputs.ts`, `packages/*/Dockerfile`, `.dockerignore` |
| `vault`                    | Image / migrate / unseal                                       | `packages/vault-service/**`                                                                        |
| `deploy-*`                 | Reconcile / Railway / DNS / health                             | `packages/infra/services.yaml`, deploy logs                                                        |
| `smoke` (dispatch)         | Prod mid-redeploy                                              | Wait for deploy; smoke waits on `health-check-all` in `ci.yml`                                     |

### 4. Done

Only when:

1. Local `bun run check:ci && bun run typecheck` is green, **and**
2. Changes are committed and pushed to `main`, **and**
3. `bun run gh:ci:watch` exited 0 for that push’s CI run.

## Vault-only gates

```bash
bun run check:vault-secrets        # dev (CI gate)
bun run check:vault-secrets:prd    # prd (deploy gate)
```

Needs a Vault session. Registry: `packages/turborepo-remote-cache/scripts/vault-secrets-registry.ts`.

## Helper commands

| Command                       | What it does                            |
| ----------------------------- | --------------------------------------- |
| `bun run ci:format`           | `prettier --check .`                    |
| `bun run ci:install`          | `bun install --frozen-lockfile`         |
| `bun run tc`                  | `turbo run tc`                          |
| `bun run typecheck`           | Root `tsc --noEmit`                     |
| `bun run check:vault-secrets` | Vault `dev`                             |
| `bun run check:smoke:secrets` | Secret smoke                            |
| `bun run gh:ci:watch`         | Block until latest CI succeeds or fails |
| `bun run gh:ci:status`        | List recent CI runs                     |
| `bun run gh:ci:log`           | Failed-step logs                        |

## CI workflow shape

```
changes → vault-state → vault? → check → portfolio-health-check? → publish-plan? → publish? → deploy-prepare → deploy-reconcile → deploy-railway? → health-check-all
```

`.github/workflows/ci.yml` is the **only** workflow. It serves every path:

- `push` on `main` and production dispatches — `vault-state` checks readiness first; if Vault is sealed or unavailable, `vault` deploys and unseals it before checks. PRs never mutate production and use the existing Vault.
- `workflow_dispatch` — manual `check` / `publish` / vault rebuild / fleet redeploy (`service_id`, `image_tag`, `apply_dns`)
- `workflow_call` — sibling repos publish their GHCR image (`service_id`, `dockerfile`, `context`, `image_prefix`); `notify_deploy: true` dispatches the deploy back to infra
- monorepo pushes publish every service whose `github_repo` is this repo (`publish-plan` → `publish` matrix; currently `portfolio` + `turborepo`) and redeploy exactly those at the pushed SHA
- `repository_dispatch deploy-service` — sibling publish notify → single-service fleet deploy

Composite actions under `.github/actions/` (`vault-secrets`, `turborepo-vault-secrets`) load Vault secrets via OIDC.

## Hard rules

- Never commit `VAULT_TOKEN`, `RAILWAY_TOKEN`, or deploy tokens.
- Never disable structural size limits or patch dependencies — refactor instead.
- Keep `bun.lock` in sync (`bun install` after changing `package.json`).
- Don’t force-push or amend a pushed commit; create a new commit.
- **Always:** local checks → commit & push → watch GitHub Actions until green.

## Infra reconcile

Desired state: [`packages/infra/services.yaml`](../../packages/infra/services.yaml).

```bash
bun run reconcile                 # dry-run
bun run reconcile --apply --fleet-only
bun run reconcile destroy railway --id <id> --i-understand-stateful
```

`--apply` prunes **stateless** drift only. Stateful deletes need the explicit
destroy flag (never in CI).
