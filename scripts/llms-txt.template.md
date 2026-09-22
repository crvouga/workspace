# {{infraRepo}} — shared infrastructure integration guide

> The one file an agent needs to integrate another codebase with the shared infrastructure owned by `{{infraRepo}}`: Vault (OpenBao) secrets, the self-hosted Turborepo remote cache, the shared Cloudflare R2 object store, and hosting on the managed Railway fleet — every hosted project is **Dockerized and ships as a prebuilt GHCR image**. Values in this file are generated from `packages/infra/services.yaml`, `.github/workflows/ci.yml` and the Vault secret registry; CI fails whenever it drifts from them.

Canonical URL (always current `main`): {{rawUrl}}

## Use this file

- Link it from your project's `AGENTS.md` / `CLAUDE.md` so every session can fetch it:

  ```md
  Shared infra (Vault, Turborepo remote cache, R2 object store, hosting):
  {{rawUrl}}
  ```

- Re-fetch it instead of trusting a cached copy — ports, hostnames and the fleet list change.
- Pick the sections that apply (checklist below); each one is self-contained.
- If anything here disagrees with `services.yaml` in `{{infraRepo}}`, the YAML wins — tell the human the file is stale.

## Ground rules

- **Never invent, print, log, or commit secret values.** If a secret is missing, tell the human the exact key, Vault path and command to set it, then stop and wait.
- **Never install global tooling yourself** (`vault`, `bao`, `jq`, `gh`). Tell the human the install command.
- **Never modify the shared services from another repo** (deploy them, rotate tokens, change policies, edit Railway/Cloudflare by hand). Those changes happen in `{{infraRepo}}`; tell the human exactly what is needed.
- `@pkgs/*` packages in `{{infraRepo}}` are **private workspace packages** — they cannot be installed elsewhere. Use the plain HTTP / S3 / env-var contracts below.
- Keep the app **twelve-factor**: configuration and secrets come from env vars at runtime, never from files baked into the image or the repo.

## Integration checklist

1. Needs secrets (API keys, database URLs)? → [1. Vault](#1-vault-secrets). Every other section depends on it.
2. Uses Turborepo (`turbo.json` exists)? → [2. Turborepo remote cache](#2-turborepo-remote-cache).
3. Stores files / blobs? → [3. Object store](#3-object-store-cloudflare-r2-s3-compatible).
4. Should be publicly hosted at `*.{{zone}}`? → [4. Hosting](#4-hosting-on-the-managed-fleet). The project must be Dockerized and publish prebuilt images.

## Resources at a glance

{{block:resources}}

All credentials live in Vault. Vault is the only thing you authenticate to directly.

---

## 1. Vault (secrets)

**Coordinates**

| Thing   | Value                                                                                    |
| ------- | ---------------------------------------------------------------------------------------- |
| Address | `{{vaultAddr}}` (OpenBao; Vault-compatible API + CLI)                                    |
| Engine  | KV v2 mounted at `{{kvMount}}/`                                                          |
| Path    | `{{kvMount}}/<project>/<config>` (HTTP API: `{{kvMount}}/data/<project>/<config>`)       |
| Project | `{{kvProject}}` — shared by all personal apps; use it unless told otherwise              |
| Configs | {{kvConfigs}} — `dev` for local work, `prd` for CI / production (same key names in both) |

Each KV field becomes one env var. Every config must carry the **same key names** (values may differ). CI read access covers only {{ciReadPaths}} — a new project namespace needs a policy change in `{{infraRepo}}`, so add your app's keys under `{{kvProject}}`.

### Keys that already exist

Reuse these instead of creating duplicates. Adding a key means a human runs `vault kv patch` **and** adds it to `vault.kv_keys` in `services.yaml`.

{{block:kvKeys}}

### Local dev — `vault run`

The human installs the wrapper once per machine (from a `{{infraRepo}}` checkout; needs the `vault` or `bao` CLI and `jq`):

```bash
{{file:packages/vault-service/scripts/install-cli.sh}}   # → ~/.local/bin/vault wrapper
vault login --method=userpass username={{adminUser}}
```

In your project, commit a `.vault.yaml` (coordinates only, no secrets — safe to commit). `vault setup --project {{kvProject}} --config dev` writes it:

```yaml
{{block:vaultYaml}}
```

Then wrap commands:

```bash
vault run -- bun run dev                  # injects every field as env vars
vault run --config prd -- <cmd>           # override config
vault run --dry-run -- <cmd>              # list injected var names only
vault kv get {{kvMount}}/{{kvProject}}/dev          # inspect (human only)
vault kv patch {{kvMount}}/{{kvProject}}/dev KEY=…  # add/update a key (human only)
```

Put `vault run -- …` inside `package.json` scripts rather than asking developers to export variables. List the needed env var **names** (never values) in `.env.example`, and gitignore `.env*` except `.env.example`.

### CI (GitHub Actions) — OIDC, no stored token

Repos under `{{githubOrg}}/*` mint a short-lived Vault token via GitHub OIDC. Never add a `VAULT_TOKEN` repository secret for CI.

```yaml
{{block:oidcExample}}
```

- JWT auth at `{{jwtPath}}/`, role `{{jwtRole}}` → policy `{{jwtPolicy}}`, TTL {{jwtTtl}}.
- The role is bound to `{{jwtBoundRef}}`: pull-request and branch runs **cannot** read Vault. Keep Vault-dependent steps on the default branch, or ask the human to widen the binding. Never work around it with a stored token.
- Vault restarts **sealed** and auto-unseals on deploy. If calls return 503, poll `GET {{vaultAddr}}/v1/sys/health?standbyok=true` until 200 before failing — {{path:.github/actions/vault-secrets/action.yml}} is a wait + retry pattern to copy.
- A repo outside `{{githubOrg}}/*` or a project outside `{{kvProject}}` needs {{path:packages/vault-service/scripts/setup-oidc-auth.sh}} / a policy change — tell the human.

### App runtime — read token + HTTP

Processes that cannot be wrapped in `vault run` (servers loading secrets at boot, Workers) use a long-lived read-only token supplied as the platform secret `VAULT_TOKEN` (policy `{{runtimeTokenPolicy}}`, period {{runtimeTokenPeriod}}; the human mints it). Pass `VAULT_ADDR={{vaultAddr}}`, `VAULT_PROJECT={{kvProject}}`, `VAULT_CONFIG=prd` as plain env.

```ts
const res = await fetch(
  `${VAULT_ADDR}/v1/{{kvMount}}/data/${VAULT_PROJECT}/${VAULT_CONFIG}`,
  { headers: { 'X-Vault-Token': VAULT_TOKEN } }
);
if (!res.ok) throw new Error(`vault ${res.status}`); // 503 = sealed → retry with backoff
const secrets = (await res.json()).data.data as Record<string, string>;
```

Honor `Retry-After` on 429 and cache the result for the process lifetime. **Apps hosted on the fleet do not need this** — declare `secrets:` in `services.yaml` (§4) and they arrive as plain env vars.

---

## 2. Turborepo remote cache

Self-hosted Turborepo remote cache (Turbo's standard HTTP API, Bearer auth). Only applies to projects with a `turbo.json`. Do not use Vercel Remote Cache (`turbo login` / `turbo link`) alongside it.

**Env vars** (all in Vault `{{kvMount}}/{{kvProject}}/{dev,prd}`):

{{block:turboEnv}}

**Local:** with `.vault.yaml` pointing at `{{kvProject}}`, `vault run -- turbo run build` picks everything up. Using a separate Vault project? The human copies the keys from `{{infraRepo}}` with `{{script:seed:turbo-client}} -- --target-project <project> --all-configs`.

**CI:** load the keys with the OIDC step from §1 and expose them as job env:

```yaml
{{block:turboOidcSecrets}}
```

**`turbo.json`:** never put the token there. `TURBO_*` vars are read by the `turbo` binary itself, not by tasks, so strict env mode needs no changes.

**Verify:**

```bash
curl -fsS {{turboApi}}{{turboHealthPath}}                          # up
curl -s -o /dev/null -w '%{http_code}\n' {{turboApi}}/v8/artifacts/status   # 401 (auth gate works)
curl -fsS -H "Authorization: Bearer $TURBO_TOKEN" {{turboApi}}/v8/artifacts/status   # JSON, not 401
vault run -- turbo run build   # 2nd run with unchanged inputs → "cache hit, replaying logs"
```

If the health check fails the cache is down — report it; do not switch providers or disable caching.

---

## 3. Object store (Cloudflare R2, S3-compatible)

Shared buckets, one per Vault config; apps partition them by key prefix.

{{block:buckets}}

**Env vars** (Vault `{{kvMount}}/{{kvProject}}/{dev,prd}`):

{{block:s3Env}}

**Rules**

- **Prefix every key with your app id**: `<app-id>/…` (e.g. `moviefinder/posters/123.webp`). Never write, list, or delete outside your prefix — other apps share the bucket, and `{{objectKeyPrefix}}/` belongs to the Turborepo cache. Make the prefix a single constant at the composition root.
- Read the bucket from `S3_BUCKET`; never hardcode bucket names. dev vs prd is selected purely by the Vault config you run with.
- Use path-style addressing: `${S3_ENDPOINT}/${S3_BUCKET}/${key}`.
- Buckets are private. Serve objects through your app (or presigned URLs), never public bucket URLs.
- Do not create buckets or R2 tokens; provisioning lives in `{{infraRepo}}` (`{{script:provision-r2}}`).

**Clients**

```ts
// Workers / Bun / Node — tiny, fetch-based (what {{infraRepo}} uses)
import { AwsClient } from 'aws4fetch';
const s3 = new AwsClient({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  region: env.S3_REGION, // "auto"
  service: 's3',
});
const base = `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}`;
const key = `myapp/${id}`;
await s3.fetch(`${base}/${key}`, {
  method: 'PUT',
  body: bytes,
  headers: { 'content-type': type },
});
const res = await s3.fetch(`${base}/${key}`); // 404 → missing
```

```ts
// @aws-sdk/client-s3
new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});
```

Any other S3 SDK works with the same five values + path-style. AWS CLI: `aws s3 ls s3://$S3_BUCKET/myapp/ --endpoint-url $S3_ENDPOINT` (with `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` set from the `S3_*` vars).

Recommended shape: hide the SDK behind a small interface — `get(key) → {body, contentType, size} | null`, `put(key, bytes, contentType)` (idempotent), `head(key) → boolean`, `delete(key)` (no-op if missing), `withPrefix(prefix)` — plus an in-memory implementation for tests.

---

## 4. Hosting on the managed fleet

`{{infraRepo}}` hosts apps on Railway (project `{{railwayProject}}`, region `{{railwayRegion}}`) behind `*.{{zone}}` hostnames with TLS and DNS managed by reconcile. **Railway never builds your code.** Every hosted project is Dockerized, CI publishes a **prebuilt image** to GHCR, and the fleet deploys that exact image.

### Contract your project must meet

- **Dockerized.** A `Dockerfile` (multi-stage; build tools in the build stage, minimal runtime stage) that builds with plain `docker build -f <dockerfile> <context>` — no build args or secrets required. The build must run in CI for `linux/amd64`.
- **Prebuilt image.** Built and pushed only by the shared publish workflow below, as `{{ghcrPattern}}:<git-sha>` and `:latest`. Never enable Railway's GitHub/Nixpacks builds, never run `railway up`, never push images by hand. The package is made public automatically.
- **One port.** The container listens on `0.0.0.0:<port>` and that port equals `port` in `services.yaml`. Read `PORT` from env (the fleet sets it via `env:`) with the same default in code.
- **Health check.** `GET <health_path>` (default `/`) returns 2xx within seconds of boot, without auth and without depending on third-party services. Deploys that fail it are marked failed.
- **Config from env only.** Runtime secrets are injected by the fleet from Vault as env vars (`secrets:` in `services.yaml`). Nothing secret in the image, repo, or Dockerfile; no `.env` files read in production. Fail fast at boot with a clear message naming any missing var.
- **Stateless.** Containers can be replaced at any time: no local disk state (use Postgres via `DATABASE_URL` or the object store), logs to stdout/stderr, handle `SIGTERM` gracefully.
- **Small and reproducible.** Pin base images (e.g. `node:22-bookworm-slim`, `oven/bun:1.3`, `nginx:alpine`), commit a lockfile and install with it frozen, and add a `.dockerignore` (`node_modules`, `.git`, `.env*`, build output).

Minimal Dockerfiles to start from:

```dockerfile
# Static site (Vite/Astro/etc.) served by nginx on port 80
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

```dockerfile
# Bun HTTP server on $PORT (default 8080)
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .

FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app /app
USER bun
EXPOSE 8080
CMD ["bun", "run", "src/server.ts"]
```

Verify locally before wiring CI: `docker build -t app . && docker run --rm -p 8080:8080 -e PORT=8080 app`, then `curl -fsS localhost:8080<health_path>`.

### Step 1 — declare the service (in `{{infraRepo}}`)

The fleet only runs what `packages/infra/services.yaml` declares. Ask the human to add an entry (or, when working inside `{{infraRepo}}`, add it and run `{{script:reconcile}}` to review the plan):

```yaml
{{block:serviceExample}}
```

| Field             | Meaning                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `id`              | Service id: Railway service name, GHCR package `{{imagePrefix}}-<id>`, and publish `service_id` |
| `hostname`        | Public hostname on `{{zone}}`; DNS and TLS are provisioned automatically                        |
| `github_repo`     | `owner/name` of the repo that publishes the image                                               |
| `source_code_url` | Link shown on the portfolio                                                                     |
| `dockerfile`      | Dockerfile path, relative to the repo root                                                      |
| `build_context`   | Docker build context, relative to the repo root                                                 |
| `port`            | Port the container listens on                                                                   |
| `health_check`    | Probe the service after deploys                                                                 |
| `health_path`     | Path probed (default `/`); must return 2xx                                                      |
| `env`             | Plain, non-secret env vars                                                                      |
| `secrets`         | `name` + `source: vault` → value copied from Vault `{{kvProject}}/prd` into the service's env   |
| `image`           | Optional external image, used verbatim (skips GHCR publishing entirely)                         |

### Step 2 — add the publish workflow (in your repo)

Commit exactly this as `{{publishWorkflowPath}}` (from `{{infraRepo}}`, `{{script:rollout-publish}} -- --repo <owner/name>` generates and pushes it for every service of that repo). If the repo's default branch is not `main`, change the trigger branch:

```yaml
{{block:publishWorkflow}}
```

It calls `{{infraRepo}}`'s `ci.yml` as a reusable workflow. Inputs:

{{block:workflowCallInputs}}

Caller secrets: `CALLER_GITHUB_TOKEN` (pass `github.token`; used to push to GHCR) and `{{dispatchSecret}}` (an org-level secret on `{{githubOrg}}` with `repo` scope on `{{infraRepo}}`; if missing, the human runs `GITHUB_TOKEN_SUPER=… {{script:rollout-publish}} -- --repo <owner/name> --set-org-dispatch-secret`).

### What happens on every push to `main`

1. Your repo's publish job builds the Dockerfile and pushes `{{ghcrPattern}}:<sha>` + `:latest`.
2. It sends `repository_dispatch` `{{dispatchEvent}}` with `{"id": "<id>", "image_tag": "<sha>"}` to `{{infraRepo}}`.
3. `{{infraRepo}}` CI reconciles DNS / Railway settings from `services.yaml`, syncs the declared Vault secrets into the service, deploys the image at that SHA, and health-checks `https://<hostname><health_path>`.

Check it: `gh run list -R {{infraRepo}} --workflow ci.yml --limit 3`, then `curl -fsS https://<hostname><health_path>`. Never redeploy from the Railway dashboard; a human can redeploy with `gh workflow run ci.yml -R {{infraRepo}} -f service_id=<id> -f image_tag=<sha>`.

### Current fleet

Working examples to copy from — each links to its source repo:

{{block:fleet}}

---

## Troubleshooting

| Symptom                                        | Meaning / fix                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `vault run`: `No value found at {{kvMount}}/…` | KV empty, or wrong project/config in `.vault.yaml` — tell the human                                                            |
| `vault run`: permission denied / 403           | Token expired — the human runs `vault login …`                                                                                 |
| Vault HTTP 503                                 | Sealed (restart in progress) — wait and retry; the human can run `gh workflow run ci.yml -R {{infraRepo}} -f unseal_only=true` |
| OIDC: audience error                           | Missing `jwtGithubAudience: {{vaultAddr}}`                                                                                     |
| OIDC: role / bound claim error                 | Repo not `{{githubOrg}}/*`, or the run is not on `{{jwtBoundRef}}` — see §1 CI                                                 |
| Turbo: 401 from cache                          | `TURBO_TOKEN` missing or wrong in that environment                                                                             |
| Turbo: no remote hits                          | `TURBO_API` / `TURBO_CACHE` not set where `turbo` runs; check `--cache` flags                                                  |
| R2: `SignatureDoesNotMatch`                    | Wrong secret key, region ≠ `auto`, or virtual-host addressing — use path-style                                                 |
| R2: `NoSuchBucket`                             | `S3_BUCKET` does not match the config's bucket                                                                                 |
| Publish: `id-token` / permissions error        | The caller workflow must grant `contents: read`, `packages: write`, `id-token: write` (Step 2 does)                            |
| Publish: `DEPLOY_DISPATCH_TOKEN is not set`    | Org secret missing — see Step 2                                                                                                |
| Deploy: service id not found                   | No `services.yaml` entry for that `service_id` yet — Step 1                                                                    |
| Deploy: health check fails                     | Container not listening on `port`, or `health_path` is not 2xx — reproduce with `docker run` locally                           |

---

## Maintaining this file (agents working inside `{{infraRepo}}`)

`llms.txt` is generated — never edit it by hand. Prose lives in {{path:scripts/llms-txt.template.md}}; values, tables and the publish workflow come from {{path:packages/infra/services.yaml}}, {{path:.github/workflows/ci.yml}}, {{path:packages/turborepo-remote-cache/scripts/vault-secrets-registry.ts}} and {{path:packages/infra/lib/publish-workflow.ts}} via {{path:scripts/llms-txt.ts}}. Run `{{script:llms:sync}}` after changing any of them; `{{script:check:llms}}` (part of `bun run check`) fails CI on drift, on a dangling file reference, or on an unknown `bun run` script.
