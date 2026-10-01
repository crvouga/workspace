# Local 9router

Local Bun CLI for the routing app at http://127.0.0.1:20128. Start with `bun start` in this package. It can download/build the upstream app, start/stop local daemons, sync provider connections, configure Cursor and read runtime credentials from Vault.

The Cloudflare tunnel, DNS, remote ingress rules and Vault secrets are owned exclusively by [OpenTofu](../infra/tofu/README.md). There is no CLI provisioning command. Apply the foundation and vault roots, then start the connector. It reads `9ROUTER_TUNNEL_TOKEN` from `secret/personal/prd` (or `TUNNEL_TOKEN` from the environment) and runs `cloudflared tunnel run`; the connector never changes remote resources.

Public endpoint: https://9router.chrisvouga.dev. Runtime secret fields: `9ROUTER_PASSWORD`, `9ROUTER_JWT_SECRET`, `9ROUTER_API_KEY_SECRET`, `9ROUTER_MACHINE_ID_SALT`. Provider API keys must be configured in the OpenTofu vault secrets input before syncing them into the app. Secrets: Pull writes downloaded values into the ignored local `.env`.

Local dependencies: Bun, Node, git, npm and `cloudflared` (`brew install cloudflared`). CLI data is in `data/`; PID and log files are in `.pids/`. `providers.yaml` and `combos.yaml` describe application provider/combination behavior, not infrastructure.
