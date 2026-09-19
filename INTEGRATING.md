# Integrating with shared infra (for agents in other repos)

You are working in a project **other than** `crvouga/workspace`. That repo owns
shared infrastructure your project may consume. This file is everything you need
to wire into it. Link to it from your project's `AGENTS.md` / `CLAUDE.md`:

```md
Shared infra (Vault, Turborepo remote cache, R2 object store):
https://raw.githubusercontent.com/crvouga/workspace/main/INTEGRATING.md
```

## Ground rules

- **Never invent, print, or commit secret values.** If a secret is missing, tell
  the human the exact key + path and the command to set it; stop and wait.
- **Never install global tooling yourself** (`vault`, `bao`, `jq`). Tell the human
  the install command.
- **Do not modify the shared services** (deploy, rotate tokens, change policies).
  Those changes happen in `crvouga/workspace`; tell the human what's needed.
- `@pkgs/*` packages in `crvouga/workspace` are **private workspace packages** —
  they cannot be installed from another repo. Use the plain HTTP / S3 / env-var
  contracts below.

## Resources at a glance

| Resource        | Endpoint                                 | Auth                                                            |
| --------------- | ---------------------------------------- | --------------------------------------------------------------- |
| Vault (OpenBao) | `https://vault.chrisvouga.dev`           | `vault login` locally; GitHub OIDC in CI; read token at runtime |
| Turborepo cache | `https://turborepo.chrisvouga.dev`       | `Authorization: Bearer $TURBO_TOKEN`                            |
| Object store    | Cloudflare R2 (S3 API) via `S3_ENDPOINT` | SigV4 with `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`          |

All credentials live in Vault. Vault is the only thing you authenticate to directly.

---

## 1. Vault (secrets)

**Coordinates**

| Thing   | Value                                                                     |
| ------- | ------------------------------------------------------------------------- |
| Address | `https://vault.chrisvouga.dev` (OpenBao; Vault-compatible API + CLI)      |
| Engine  | KV v2 mounted at `secret/`                                                |
| Path    | `secret/<project>/<config>` (API: `secret/data/<project>/<config>`)       |
| Project | `personal` — shared by all personal apps (use this unless told otherwise) |
| Configs | `dev` (local / default) and `prd` (production / deploy)                   |

Each KV field becomes one env var. `dev` and `prd` must carry the **same key
names** (values may differ). CI read access only covers `secret/data/personal/*`
out of the box — a new project namespace needs a policy change in
`crvouga/workspace`, so prefer `personal` and add your app's keys there.

### Local dev — `vault run`

The human installs the wrapper once per machine (from a `crvouga/workspace`
checkout; requires the `vault` or `bao` CLI + `jq`):

```bash
packages/vault-service/scripts/install-cli.sh   # → ~/.local/bin/vault wrapper
vault login --method=userpass username=crvouga   # or: vault login <token>
```

In your project, commit a `.vault.yaml` (coordinates only, no secrets — safe to commit):

```yaml
addr: https://vault.chrisvouga.dev
mount: secret
project: personal
config: dev
```

(`vault setup --project personal --config dev` writes it.) Then wrap commands:

```bash
vault run -- bun run dev                  # injects every field as env vars
vault run --config prd -- <cmd>           # override config
vault run --dry-run -- <cmd>              # list injected var names only
vault kv get secret/personal/dev          # inspect (human only)
vault kv patch secret/personal/dev KEY=…  # add/update a key (human only)
```

Put `vault run -- …` in `package.json` scripts rather than asking devs to export vars.
List needed env var **names** (no values) in `.env.example`.

### CI (GitHub Actions) — OIDC, no stored token

Repos under `crvouga/*` can mint a short-lived Vault token via OIDC. Never add a
`VAULT_TOKEN` repo secret for CI.

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: hashicorp/vault-action@v4
    with:
      url: https://vault.chrisvouga.dev
      method: jwt
      path: jwt
      role: github-actions
      jwtGithubAudience: https://vault.chrisvouga.dev
      secrets: |
        secret/data/personal/prd DATABASE_URL | DATABASE_URL ;
        secret/data/personal/prd SOME_KEY     | SOME_KEY
```

- Role `github-actions` → policy `ci-read` (read `secret/data/personal/*`), ~10 min TTL.
- The role may be bound to `refs/heads/main`. If PR/branch runs fail with a
  role/claim error, that's why — keep Vault-dependent steps on `main`, or ask the
  human to widen the binding. Don't work around it with a stored token.
- Vault restarts **sealed** and auto-unseals on deploy. If OIDC calls return 503,
  poll `GET /v1/sys/health?standbyok=true` until 200 before failing (see
  `.github/actions/vault-secrets/action.yml` in `crvouga/workspace` for a
  wait + retry pattern to copy).
- Repo outside `crvouga/*` or project outside `personal` → tell the human; it
  needs `packages/vault-service/scripts/setup-oidc-auth.sh` / a policy change.

### App runtime — read token + HTTP

For processes that can't be wrapped in `vault run` (Workers, servers loading
secrets at boot), use a long-lived read-only token provided as a platform secret
`VAULT_TOKEN` (the human mints it; `personal-read` policy). Also pass
`VAULT_ADDR`, `VAULT_PROJECT=personal`, `VAULT_CONFIG=prd` as plain env.

```ts
const res = await fetch(
  `${VAULT_ADDR}/v1/secret/data/${VAULT_PROJECT}/${VAULT_CONFIG}`,
  { headers: { 'X-Vault-Token': VAULT_TOKEN } }
);
if (!res.ok) throw new Error(`vault ${res.status}`); // 503 = sealed; retry with backoff
const secrets = (await res.json()).data.data as Record<string, string>;
```

Handle 429 by honoring `Retry-After`. Cache the result for the process lifetime.
Services deployed on the shared Railway fleet get secrets injected by
`packages/infra/services.yaml` (`secrets: - name: X, source: vault`) — ask the
human to add the entry rather than fetching yourself.

---

## 2. Turborepo remote cache

Self-hosted Turborepo remote cache (Turbo's standard HTTP API, Bearer auth).
Only applies if the project uses Turborepo (`turbo.json`). Don't use Vercel
Remote Cache (`turbo login` / `turbo link`) alongside it.

**Env vars** (all in Vault `secret/personal/{dev,prd}`):

| Var                        | Value                                                  |
| -------------------------- | ------------------------------------------------------ |
| `TURBO_API`                | `https://turborepo.chrisvouga.dev` (no trailing slash) |
| `TURBO_TOKEN`              | shared bearer token — from Vault, never committed      |
| `TURBO_TEAM`               | `local` (any non-empty slug; keep consistent)          |
| `TURBO_CACHE`              | `remote:rw`                                            |
| `TURBO_LOG_ORDER`          | optional, `stream`                                     |
| `TURBO_TELEMETRY_DISABLED` | optional, `1`                                          |

**Local:** with `.vault.yaml` pointing at `personal`, `vault run -- turbo run build`
picks everything up. Using a separate Vault project instead? The human can copy
the keys over from `crvouga/workspace`:
`bun run seed:turbo-client -- --target-project <project> --all-configs`.

**CI:** load the four keys with the OIDC step above and expose them as job env:

```yaml
secrets: |
  secret/data/personal/prd TURBO_TOKEN | TURBO_TOKEN ;
  secret/data/personal/prd TURBO_API   | TURBO_API ;
  secret/data/personal/prd TURBO_TEAM  | TURBO_TEAM ;
  secret/data/personal/prd TURBO_CACHE | TURBO_CACHE
```

**`turbo.json`:** never put the token there. If you use strict env mode, make sure
`TURBO_*` aren't stripped (they're read by the turbo binary itself, not tasks, so
usually nothing is needed).

**Verify:**

```bash
curl -fsS https://turborepo.chrisvouga.dev/health                          # up
curl -s -o /dev/null -w '%{http_code}\n' \
  https://turborepo.chrisvouga.dev/v8/artifacts/status                     # 401 (auth gate works)
curl -fsS -H "Authorization: Bearer $TURBO_TOKEN" \
  https://turborepo.chrisvouga.dev/v8/artifacts/status                     # JSON, not 401
vault run -- turbo run build   # 2nd run with unchanged inputs → "cache hit, replaying logs"
```

If `/health` fails the cache is down — report it; don't switch providers or disable caching.

---

## 3. Object store (Cloudflare R2, S3-compatible)

Two **shared** buckets; apps partition them by key prefix.

| Vault config | Bucket                |
| ------------ | --------------------- |
| `dev`        | `crvouga-development` |
| `prd`        | `crvouga-production`  |

**Env vars** (Vault `secret/personal/{dev,prd}`):

| Var                    | Meaning                                         |
| ---------------------- | ----------------------------------------------- |
| `S3_ENDPOINT`          | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_REGION`            | always `auto`                                   |
| `S3_ACCESS_KEY_ID`     | R2 access key                                   |
| `S3_SECRET_ACCESS_KEY` | R2 secret key                                   |
| `S3_BUCKET`            | bucket for that config (table above)            |

**Rules**

- **Always prefix every key with your app id**: `<app-id>/…` (e.g.
  `moviefinder/posters/123.webp`). Never write, list, or delete outside your
  prefix — other apps share the bucket (`turbo-cache/` belongs to the Turborepo
  cache). Make the prefix a single constant at the composition root.
- Read the bucket from `S3_BUCKET`; never hardcode bucket names. dev and prd
  are selected purely by which Vault config you run with.
- Use path-style addressing: `${S3_ENDPOINT}/${S3_BUCKET}/${key}`.
- Buckets are private. Serve objects through your app (or presigned URLs), not
  public bucket URLs.
- Don't create buckets or R2 tokens; provisioning lives in `crvouga/workspace`
  (`bun run provision-r2`).

**Clients**

```ts
// Workers / Bun / Node — tiny, fetch-based (what crvouga/workspace uses)
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

Other languages: any S3 SDK works with the same five values + path-style.
AWS CLI: `aws s3 ls s3://$S3_BUCKET/myapp/ --endpoint-url $S3_ENDPOINT`
(with `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` set from the `S3_*` vars).

Recommended shape (mirrors `@pkgs/object-store`): hide the SDK behind a small
interface — `get(key) → {body, contentType, size} | null`, `put(key, bytes,
contentType)` (idempotent), `head(key) → boolean`, `delete(key)` (no-op if
missing), `withPrefix(prefix)` — plus an in-memory implementation for tests.

---

## 4. Deploying on the shared fleet (optional)

Apps can be hosted on the shared Railway project with a `*.chrisvouga.dev`
hostname. This requires an entry in `packages/infra/services.yaml` in
`crvouga/workspace` (id, hostname, `github_repo`, dockerfile, port, `secrets`
from Vault) — ask the human to add it. The app repo then publishes its image by
calling the shared workflow:

```yaml
jobs:
  publish:
    if: github.ref == 'refs/heads/main'
    uses: crvouga/workspace/.github/workflows/ci.yml@main
    permissions: { contents: read, packages: write, id-token: write }
    with:
      service_id: <id from services.yaml>
      dockerfile: ./Dockerfile
      context: .
    secrets:
      CALLER_GITHUB_TOKEN: ${{ github.token }}
      DEPLOY_DISPATCH_TOKEN: ${{ secrets.DEPLOY_DISPATCH_TOKEN }}
```

This pushes `ghcr.io/crvouga/chrisvouga-<id>:<sha>` and dispatches a deploy.
The container must listen on the `port` declared in `services.yaml` and answer
its `health_path` (or `/`) with 2xx.

---

## Troubleshooting

| Symptom                                            | Meaning / fix                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `vault run`: `No value found at secret/personal/…` | KV empty or wrong project/config in `.vault.yaml` — tell the human                                                           |
| `vault run`: permission denied / 403               | Token expired — human runs `vault login …`                                                                                   |
| Vault HTTP 503                                     | Sealed (restart in progress) — wait/retry; human can run `gh workflow run ci.yml -f unseal_only=true` in `crvouga/workspace` |
| OIDC: audience error                               | Missing `jwtGithubAudience: https://vault.chrisvouga.dev`                                                                    |
| OIDC: role / bound claim error                     | Repo not `crvouga/*`, or run not on `main` — see §1 CI                                                                       |
| Turbo: 401 from cache                              | `TURBO_TOKEN` missing/wrong in that environment                                                                              |
| Turbo: no remote hits                              | `TURBO_API`/`TURBO_CACHE` not set where `turbo` runs; check `--cache` flags                                                  |
| R2: `SignatureDoesNotMatch`                        | Wrong secret key, region ≠ `auto`, or virtual-host addressing — use path-style                                               |
| R2: `NoSuchBucket`                                 | `S3_BUCKET` doesn't match the config's bucket                                                                                |

Source of truth for all of the above: `packages/infra/services.yaml` in
[`crvouga/workspace`](https://github.com/crvouga/workspace). If something here
disagrees with that file, the file wins.
