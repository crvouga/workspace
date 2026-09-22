# Infra (Railway)

> Integrating another repo (Vault, Turborepo cache, R2, hosting)? Follow the generated [`llms.txt`](llms.txt).

Railway deployment for all services on the zone defined in [`services.yaml`](services.yaml) (`zone: chrisvouga.dev`).

Project repos build and push their own public image to `ghcr.io/<image_owner>/<image_prefix>-<id>` (e.g. `ghcr.io/crvouga/chrisvouga-todo-app`), while the images for services whose code lives here (`turborepo`, `vault`, `portfolio`) are built and pushed by this repo's CI publish job. This repo otherwise **consumes** those images — GitHub Actions provisions Railway services via the GraphQL API, syncs DNS/secrets, deploys, and health-checks.

Cloudflare DNS points custom domains at Railway (CNAME + TXT verification). Railway terminates TLS on custom domains; Cloudflare SSL mode is **Full (strict)** with DNS-only records.

Platform paths, service names, and GHCR prefixes are derived from `services.yaml` — not hardcoded in scripts.

**Scale to zero (default):** most services use Railway serverless sleep (`railway.sleep: true`).

**Always on:** `vault` only (`railway.sleep: false`). Vault is **standalone** — not redeployed by the fleet **Deploy** matrix; the monorepo **CI** vault job owns it.

## Architecture

```
Sibling repos ──▶ ci.yml (workflow_call) ──▶ GHCR image ──▶ repository_dispatch ─┐
                                                                                │
Monorepo push/PR ──▶ ci.yml: vault-state → vault? → check → publish? ───────────────┤
                                                                                ▼
                                                            ci.yml deploy jobs
                                                 prepare → reconcile --apply --fleet-only
                                                       → railway-deploy? → health
                                                                                │
                                                                                ▼
                                                Railway (infra / production)
                                                                                │
                                                                                ▼
                                                       *.<zone> via Cloudflare DNS
```

## Configuration ([`services.yaml`](services.yaml))

| Field                    | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `zone`                   | Primary DNS zone (e.g. `chrisvouga.dev`)                                |
| `image_owner`            | GHCR org/user                                                           |
| `infra_github_repo`      | GitHub repo slug for this infra repo                                    |
| `railway.project`        | Railway project name (e.g. `infra`)                                     |
| `railway.environment`    | Environment name (default `production`)                                 |
| `railway.region`         | Deployment region (default `us-east4`)                                  |
| `railway.service_prefix` | Optional service name prefix (default: none — names match service `id`) |
| `railway.sleep`          | Per service: `true` (serverless) or `false` (always on)                 |

Derived automatically: `image_prefix` (`chrisvouga`), Vault URL (`https://vault.<zone>`).

Inspect derived values:

```bash
bun run print-platform-env
```

## First deploy

Vault must exist before fleet scripts can read secrets from KV. Bootstrap does **not** use `vault run` — GitHub secrets (or exported env) only.

### 1. Deploy vault (standalone)

Seed GitHub secrets from the vault repo:

```bash
cd packages/vault-service
export CLOUDFLARE_API_TOKEN='...'   # Zone:DNS:Edit for chrisvouga.dev
./scripts/seed-github-secrets.sh    # CF_API_TOKEN, DB_CONNECTION_URI, RAILWAY_TOKEN
```

Push `packages/vault-service/**` to `main` (CI vault job) or run Actions → **CI** with `unseal_only` after the first deploy. The vault job uses `packages/vault-service/scripts/railway-*.sh` — no Vault OIDC / KV required.

After first deploy: `./scripts/init.sh`, store unseal keys in `crvouga.kv`.

Local alternative (no CI):

```bash
export RAILWAY_TOKEN=... CLOUDFLARE_API_TOKEN=... DB_CONNECTION_URI=...
cd packages/vault-service && make deploy
```

### 2. Seed Vault KV

In `secret/data/personal/prd` on Vault (`https://vault.<zone>`):

| Key                     | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `RAILWAY_TOKEN`         | Railway account API token                                               |
| `GITHUB_TOKEN_SUPER`    | PAT with `repo` + `admin:org` — triggers workflows, cross-repo dispatch |
| `CLOUDFLARE_API_TOKEN`  | DNS sync                                                                |
| `CLOUDFLARE_ACCOUNT_ID` | DNS sync                                                                |
| Per-app keys            | See `secrets:` blocks in `services.yaml`                                |

### 3. Provision fleet on Railway

```bash
vault run -- bun run provision-railway --apply
# or: export RAILWAY_TOKEN=... && bun run provision-railway --apply
```

Creates project `infra`, fleet services (excludes vault), custom domains, and volumes. After migrating from prefixed names, run `bun run rename-railway --apply` once.

### 4. Run CI deploy

Actions → **CI** → Run workflow (or let **CI** chain deploy after check/publish/vault). The fleet matrix excludes standalone vault.

### 5. DNS cutover

After validating services on Railway default URLs:

```bash
vault run -- bun run sync-dns --apply --wait-for-certs
bun run health-check --all-public
```

Fleet DNS sync does not manage `vault.<zone>` — that record is owned by the CI vault job / `cd packages/vault-service && make sync-dns`.

### 6. Fly teardown (post-cutover)

```bash
bun run destroy-fly --apply
```

Remove `FLY_TOKEN` from Vault after Fly apps are destroyed.

## Per-service deploy

Sibling repos call `ci.yml` (`workflow_call`) to build/push their GHCR image, then dispatch `deploy-service` with `{ id, image_tag }` back to infra. Infra deploys a single Railway service.

Manual single-service deploy:

```bash
gh workflow run ci.yml -f service_id=portfolio -f image_tag=abc123
```

## Local scripts

```bash
bun install
bun run typecheck
bun check                             # CI-equivalent check (format + tc + lint + test + build)
bun run check:ci                      # full CI reproduction (also runs the Vault dev-secret gate)
bun run reconcile                     # dry-run desired-state plan from services.yaml
bun run reconcile --apply --fleet-only  # converge Railway/DNS/secrets/GHCR (stateless prune)
bun run provision-railway --check --fleet-only   # CI drift check (excludes standalone vault)
bun run deploy-railway --id portfolio
bun run sync-dns --apply
```

See [`.agents/commands/ci.md`](.agents/commands/ci.md) for the full check/CI reference.

## Agent commands & `/pr-ready`

`/pr-ready` takes the current branch from uncommitted work to a merged PR:
commit (commitlint-checked), push, merge `main`, resolve conflicts, open the
PR, loop CI until the `Required` check is green, then `gh pr merge --merge --auto`.
The agent only writes commit/PR text, resolves conflicts, and fixes CI root
causes; all git/GitHub work runs through `bun run pr:ready <command>`
([`scripts/pr-ready.ts`](scripts/pr-ready.ts)), which prints one JSON object per
command (`status`, `context`, `commit`, `publish`, `sync`, `pr`, `checks`,
`logs`, `repo`, `ruleset`, `merge`).

Merge gate (read-only unless `--apply`; writes need repo admin):

```bash
bun run pr:ready repo       # merge-commit only, auto-merge, delete branch on merge
bun run pr:ready ruleset    # `main` ruleset: PR required, `Required` check, no force-push/deletion
```

Commands live once in [`.agents/commands/`](.agents/commands/) and are symlinked
into `.claude/commands`, `.cursor/commands`, `.opencode/command`,
`.windsurf/workflows`, `.github/prompts` and `.agents/skills/<name>/SKILL.md`.
**Edit `.agents/commands/*.md`, never the links.** After adding or renaming one,
run `bun run agents:sync`; `bun run check:agents` (part of `bun check`) fails on drift.

Desired state lives in [`packages/infra/services.yaml`](packages/infra/services.yaml). Stateful destroy requires `bun run reconcile destroy <kind> --id … --i-understand-stateful`.

## Parallel validation (pre-cutover)

1. `provision-railway --apply` + `deploy-railway` for all services
2. Health-check via Railway URLs: `bun run health-check --id todo-app --base-url https://<railway-url>`
3. When ready: `sync-dns --apply --wait-for-certs` for production hostnames

## Repo layout

Single flat Turborepo + Bun workspace. Every package is `@pkgs/*` and lives under `packages/`:

```
packages/
  turborepo-remote-cache/  # Turborepo remote cache server (@pkgs/turborepo-remote-cache) + support scripts
  portfolio/               # chrisvouga.dev static site + content registry (@pkgs/portfolio)
  infra/                   # services.yaml + lib/ + infra/fleet ops scripts (@pkgs/infra)
  {assert,logger,object-store,secret-store,secret-string,vault}/  # @pkgs/* libs
  9router/                 # local 9router CLI (@pkgs/9router)
  vault-service/           # OpenBao (CI vault job)
  workstation/             # ws CLI + portable local-machine config (bun run ws:install)
.github/
  workflows/ci.yml         # the only workflow: PR check, vault rebuild, publish, fleet deploy, sibling publish calls
  actions/
    vault-secrets/         # prd pipeline secrets via Vault OIDC
    turborepo-vault-secrets/  # dev/prd turborepo-cache secrets via Vault OIDC
```

Ops scripts are invoked via root wrappers, e.g. `bun run sync-dns`, `bun run provision-railway --apply` (each delegates to `bun run --filter @pkgs/infra …`).
