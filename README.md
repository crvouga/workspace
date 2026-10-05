# Workspace

Bun + Turborepo monorepo for the portfolio at https://www.chrisvouga.dev, a Turborepo remote cache, an OpenBao secrets service, shared libraries and local workstation tools.

Infrastructure is managed exclusively by **OpenTofu**. The resource definitions, canonical fleet inventory, provider locks and migration instructions live in [packages/infra/tofu](packages/infra/tofu/README.md). No custom provisioning or reconciliation controllers remain.

```bash
bun install
bun run check                 # requires OpenTofu 1.13.0 and Playwright Chromium
bun run infra plan            # foundation: Railway project, Vault host, Neon, R2, Cloudflare, GitHub
bun run infra:bootstrap plan  # initialization and seal state
bun run infra:vault plan      # policies, authentication, tokens and KV values
bun run infra:fleet plan      # application services, images, variables and DNS
```

Import existing resources before applying. State and plans are encrypted; credentials and secret tfvars are never committed. See the migration guide for bootstrap and import prerequisites.

| Package                                                                                    | Purpose                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `portfolio`                                                                                | Astro static site, content registry, GitHub insights and generated resume |
| `turborepo-remote-cache`                                                                   | Bun cache server, R2 artifacts and Vault runtime configuration            |
| `infra`                                                                                    | OpenTofu infrastructure and read-only build/health adapters               |
| `vault-service`                                                                            | OpenBao runtime image and local Vault auth/read CLI                       |
| `9router`                                                                                  | Local routing app and connector for the OpenTofu-managed tunnel           |
| `workstation`                                                                              | Portable local machine configuration; `ws` dashboard                      |
| `assert`, `logger`, `object-store`, `openrouter`, `secret-store`, `secret-string`, `vault` | Shared libraries                                                          |

The single [CI workflow](.github/workflows/ci.yml) validates, builds images, applies OpenTofu and probes production health. Sibling repositories call its `workflow_call` image publisher and dispatch image revisions back to this repository. OpenTofu manages their publisher files and dispatch secrets.

The generated [llms.txt](llms.txt) explains how other projects integrate with Vault, PostgreSQL, remote caching, object storage and fleet hosting. The portfolio publishes it at [www.chrisvouga.dev/llms.txt](https://www.chrisvouga.dev/llms.txt) with an identical `/llm.txt` alias. Regenerate it with `bun run llms:sync` after changing the infrastructure inventory or integration contract.

Local setup: `vault login`, then `bun run setup` downloads runtime settings without writing infrastructure. `bun run dev` starts the cache server on port 8787. [Workstation setup](packages/workstation/README.md) uses `bun run ws:install`.

After pushing, watch the complete CI run with `bun run gh:ci:watch`; local checks do not validate production deployment.
