---
description: Take the current workspace branch to a green, conflict-free, review-complete pull request without merging it
---

# /pr-ready

Take the current branch from “changes exist” to “PR is green and mergeable”. Run
once per logical unit of work, not after every file save. This repository is a
Bun/Turborepo monorepo. Pull requests run `.github/workflows/ci.yml`; merges to
`main` are what can publish and deploy. This command never merges.

## Hard rules

- **Never merge.** Do not run `gh pr merge`, enable auto-merge, or use any GitHub
  merge API/UI path. A green, conflict-free PR awaiting a human merge is done.
- **Never weaken checks.** Do not add skips, loosen assertions, use `as any`,
  `@ts-ignore`, disable lint rules, edit CI to bypass a failure, or remove a
  failing test. Refactor the implementation instead.
- **Never rewrite history.** No `git rebase`, `git commit --amend`, force push,
  `--force-with-lease`, or `--no-verify`. Sync with `main` by merging.
- **Never deploy from a feature branch.** Do not run Railway, Cloudflare, DNS,
  reconcile `--apply`, or fleet deploy commands. PR CI does not deploy.
- **Protect secrets.** Never stage `.env`, Vault tokens, Railway tokens, deploy
  credentials, generated secret files, or `.vault-token`.
- **Push continuously.** After every merge or logical commit, push it and prove
  local `HEAD` equals `origin/$BRANCH`. Do not leave local commits or staged
  changes unsynced.
- **Run steps individually.** Do not chain independent steps with `&&`; preserve
  the exact failing command and output.
- **Escalate after three unchanged hypotheses.** Do not rerun an unchanged
  failure repeatedly.

## Repo-specific facts

- Root install/check: `bun install --frozen-lockfile`, `bun check`.
- Full local gate with Vault and root TypeScript: `bun run check:ci && bun run typecheck`.
- `bun check` runs Prettier plus `turbo run tc lint test build`.
- Portfolio package: `packages/portfolio`; focused commands use
  `bun run --filter @pkgs/portfolio <script>`.
- Portfolio build/dev need `PORTFOLIO_GITHUB_TOKEN`. Use
  `vault run --config dev -- <command>`; never print or stage the value.
- `bun portfolio` runs the portfolio dev server through Vault and
  `astro dev --force`.
- CI is `.github/workflows/ci.yml`, triggered by `pull_request` and pushes to
  `main`. PRs run the check surface and conditional portfolio URL health check;
  publish/deploy paths are main-only.
- After a PR exists, watch it with `gh pr checks`, not only the latest main run
  helpers (`bun run gh:ci:watch` is for main push runs).
- The repository currently has no checked-in pull-request template. Write a
  complete evidence-based PR body directly; never invent a template contract.

## 1. Pre-flight

Run separately:

```sh
BRANCH="$(git branch --show-current)"
git status --short --branch
git diff --stat
git diff --name-status
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef
```

- If `BRANCH` is `main`, stop. Create/use a feature branch first.
- If the worktree contains changes you did not make and cannot explain, stop and
  report them. Do not fold unrelated work into the PR.
- If GitHub authentication fails, stop; do not fake PR status locally.
- Inspect `.gitignore` / `.dockerignore` before staging generated assets or env
  files. For portfolio work, `packages/portfolio/assets/` is source media and
  may be intentional; `packages/portfolio/dist/` is generated and ignored.

## 2. Sync with main

```sh
git fetch --prune origin main
git merge --no-edit origin/main
```

Merge; never rebase. If the merge conflicts, collect the exact set before
asking for judgement:

```sh
git diff --name-only --diff-filter=U
git diff --cc
```

Resolve only those paths. Preserve both behaviours where compatible and follow
current repo patterns where not. Do not discard one side wholesale, edit
unrelated files, commit, or push while conflicts remain.

After resolving:

```sh
test -z "$(git diff --name-only --diff-filter=U)"
git diff --check
git add <resolved paths>
GIT_EDITOR=true git merge --continue
git push -u origin "$BRANCH"
git fetch origin "$BRANCH"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/$BRANCH)"
```

If a conflict needs a product decision, stop with the report in §8.

## 3. Local verification

Start with the full repo gate when Vault is available:

```sh
bun run check:ci
bun run typecheck
git diff --check
```

For fast iteration after a focused fix, run the affected package first:

```sh
bun run --filter @pkgs/portfolio tc
bun run --filter @pkgs/portfolio lint
bun run --filter @pkgs/portfolio test
```

For portfolio changes that affect build, assets, Docker, or GitHub proof:

```sh
bun portfolio:build
vault run --config dev -- bun run --filter @pkgs/portfolio test:docker
```

Portfolio-specific useful checks:

```sh
bun run --filter @pkgs/portfolio assets:prune
bun run --filter @pkgs/portfolio health-check-urls
```

`assets:prune` must report zero move/delete work before the commit. Never run
`assets:prune -- --apply` unless the asset migration is part of the staged work
and every proposed deletion has been reviewed.

If Vault is unavailable, run the non-secret checks that remain actionable and
state exactly which Vault-dependent checks were skipped. Do not replace a
production build with a fake token or weaken GitHub proof behaviour.

When a local command fails, form one new root-cause hypothesis, make the narrow
fix, and rerun the same command. Do not start broad refactors during diagnosis.

## 4. Inspect, commit, and push

Inspect the complete diff before staging:

```sh
git status --short
git diff --stat
git diff --name-status
git diff --check
```

Stage only reviewed paths. Never use `git add -A` until the status has been
inspected and contains only this logical unit:

```sh
git add <reviewed paths>
git diff --cached --stat
git diff --cached
```

Use one Conventional Commit per logical unit. Subject rules:

- lowercase type: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `perf`, or `ci`
- imperative summary, no period, ≤72 characters
- body only when the reason is not obvious
- use the dominant behaviour, not the last file touched

Do not commit secrets, `.env*`, generated `dist/`, Docker state, or unrelated
workspace changes. Commit without amend or bypass flags:

```sh
git commit -m "<type>(<scope>): <summary>"
git push -u origin "$BRANCH"
git fetch origin "$BRANCH"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/$BRANCH)"
test -z "$(git status --porcelain=v1)"
```

Repeat §3 after any code fix made post-commit.

## 5. Open or update the PR

```sh
git push -u origin "$BRANCH"
gh pr view --json number,url >/dev/null 2>&1 || gh pr create --base main --fill
PR_NUMBER="$(gh pr view --json number --jq .number)"
PR_REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
gh pr view "$PR_NUMBER" --json number,url,title,state,isDraft,mergeable,mergeStateStatus,reviewDecision
```

Write a complete body from the actual diff. Include:

- **Summary:** what changed, named by behaviour.
- **Why:** the user-facing or operational problem.
- **Scope:** exact packages/files or surfaces changed.
- **Verification:** commands and concrete observed results; distinguish local
  checks from CI checks.
- **Risk/rollback:** real risks only, including asset migrations or Docker
  changes when applicable.
- **Not verified:** deployment, hosted DNS, Railway, or any other surface not
  exercised.

Use a temporary body file:

```sh
BODY_FILE="$(mktemp -t pr-ready-body.XXXXXX.md)"
cat > "$BODY_FILE" <<'EOF'
## Summary
<real summary>

## Why
<real reason>

## Scope
<real scope>

## Verification
<commands and observed results>

## Risk / rollback
<real risk or “No known additional risk.”>

## Not verified
<surfaces not exercised>
EOF
gh pr edit "$PR_NUMBER" --body-file "$BODY_FILE"
rm "$BODY_FILE"
```

Do not claim CI is green from local checks. Do not delete or hide reviewer
context. Keep the PR title aligned with the commit's dominant change.

## 6. Drive PR CI green

```sh
gh pr checks "$PR_NUMBER"
gh pr checks "$PR_NUMBER" --watch
```

If a check fails, collect the exact run and failed logs:

```sh
gh run list --branch "$BRANCH" --limit 5 --json databaseId,status,conclusion,url,headSha
RUN_ID="$(gh run list --branch "$BRANCH" --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run view "$RUN_ID" --log-failed > /tmp/pr-ready-ci.log
```

Classify the failure before editing:

- `check`: run `bun run check:ci && bun run typecheck` and fix the named leaf.
- `portfolio-health-check`: run
  `bun run --filter @pkgs/portfolio health-check-urls`; do not suppress a dead
  URL or remove the content entry just to pass.
- `publish`/Docker: inspect the repo-root context, Dockerfile, BuildKit secret
  wiring, and `.dockerignore`; never bake a token into an image.
- Vault/OIDC/auth/runner failure: preserve the exact log and stop if the branch
  cannot repair it.
- Stale/cancelled run: push the already-tested commit and watch the new run.

For reproducible code failures, fix only the stated root cause, rerun the
focused command, then return to §4. Never rerun the same failed commit without
a new hypothesis. Stop after three attempts with no new hypothesis.

## 7. Review feedback and mergeability

Read all review surfaces:

```sh
gh pr view "$PR_NUMBER" --comments
gh api --paginate "repos/$PR_REPO/pulls/$PR_NUMBER/reviews"
gh api --paginate "repos/$PR_REPO/pulls/$PR_NUMBER/comments"
gh api --paginate "repos/$PR_REPO/issues/$PR_NUMBER/comments"
```

For each comment, classify it as **change**, **reply**, **already done**, or
**human decision**. Make accepted code changes in focused commits, run §3,
push, and watch fresh CI. Reply with evidence when the current implementation
is intentional. Never resolve a thread merely to make the PR look clean.

Check mergeability before reporting success:

```sh
gh pr view "$PR_NUMBER" --json mergeable,mergeStateStatus,isDraft,reviewDecision
```

If GitHub reports `CONFLICTING` or `BEHIND`, return to §2, merge
`origin/main`, resolve, verify, commit/push, and watch CI again. Do not rebase.

## 8. Stop and report when blocked

```text
PR not ready.
Branch: <branch>
PR: <url | none>
Failing step: <preflight | sync | local check | commit | CI | review>
Failing leaf/files: <exact name>
Error: <exact output>
Log: <path or none>
Attempts: <hypotheses tried>
Needs: <human decision or missing prerequisite>
```

Stop for missing credentials, product decisions, broken checks, unresolved
conflicts, missing required review, or three attempts with no new hypothesis.

## 9. Final synchronization gate

This is the last operation after all code and review work:

```sh
git fetch --prune origin main
git merge --no-edit origin/main
```

If this creates a merge commit, rerun §3, commit/push verification, and PR CI.
If it conflicts, return to §2.

After the final PR CI is green:

```sh
git push -u origin "$BRANCH"
git fetch origin "$BRANCH"
test -z "$(git status --porcelain=v1)"
test -z "$(git diff --cached --name-only)"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/$BRANCH)"
test "$(git rev-list --left-right --count origin/$BRANCH...HEAD)" = "0 0"
gh pr checks "$PR_NUMBER"
gh pr view "$PR_NUMBER" --json url,mergeable,mergeStateStatus,isDraft,reviewDecision
```

Required finish state: clean worktree, local `HEAD` equals the remote branch,
all required PR checks green, `mergeable` is `MERGEABLE`, state is not
`CONFLICTING` or `BEHIND`, and the PR is awaiting a human merge decision.

## 10. Report success

Report:

- PR URL and title.
- `git log --oneline origin/main..HEAD`.
- Final PR check summary and mergeability JSON.
- Local verification commands and observed results.
- Conflicts and resolutions, if any.
- Review comments changed/replied/already covered/human decision.
- What was not verified: deployment, Railway, DNS, Cloudflare, and production
  health unless explicitly exercised.

Never report “merged”. Human approval owns the merge.
