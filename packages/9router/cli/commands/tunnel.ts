import { ensureCloudflared, spawnCloudflared } from "../../scripts/lib/cloudflared.ts";
import { applyEnvFile } from "../../scripts/lib/env.ts";
import { fetchVaultKv, defaultVaultKvConfig } from "../../scripts/lib/vault.ts";
import { CURSOR_PUBLIC_BASE_URL, CURSOR_PUBLIC_HOST, ENV_FILE } from "../../scripts/lib/paths.ts";
import { askConfirm } from "../prompt.ts";
import { CommandError, type Command } from "../types.ts";

/** Start a connector for the remotely configured, OpenTofu-owned tunnel. */
export async function tunnelEnvironment(): Promise<NodeJS.ProcessEnv> {
  applyEnvFile(ENV_FILE);
  let token = process.env.TUNNEL_TOKEN?.trim() || process.env["9ROUTER_TUNNEL_TOKEN"]?.trim();
  if (!token) token = (await fetchVaultKv(defaultVaultKvConfig()))["9ROUTER_TUNNEL_TOKEN"];
  if (!token) throw new CommandError("Missing 9ROUTER_TUNNEL_TOKEN. Apply OpenTofu's foundation and vault roots first.");
  return { ...process.env, TUNNEL_TOKEN: token };
}

export async function foregroundTunnel(): Promise<void> {
  console.log(
    "Note: day-to-day use is Daemons: Start (app + tunnel together).",
  );
  console.log("This runs the tunnel in the foreground for debugging.");
  console.log("");

  const ok = await askConfirm(
    "Run foreground tunnel?",
    "Blocks this terminal until you stop it (Ctrl+C). Prefer Daemons: Start for normal use.",
    false,
  );
  if (!ok) {
    console.log("Cancelled.");
    return;
  }

  ensureCloudflared();

  const env = await tunnelEnvironment();

  console.log(`[tunnel] Named tunnel → ${CURSOR_PUBLIC_HOST}`);
  console.log(`[tunnel] Cursor OpenAI base: ${CURSOR_PUBLIC_BASE_URL}/v1`);
  console.log("");

  await new Promise<void>((resolve, reject) => {
    const child = spawnCloudflared(
      ["tunnel", "run"],
      { stdio: "inherit", env },
    );

    child.on("error", (err) => {
      reject(
        new CommandError(`Failed to start cloudflared: ${err.message}`),
      );
    });

    const shutdown = () => {
      child.kill("SIGTERM");
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    child.on("exit", (code, signal) => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      if (signal) {
        console.log(`[tunnel] cloudflared exited on signal ${signal}`);
        resolve();
        return;
      }
      if (code && code !== 0) {
        reject(new CommandError(`cloudflared exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

export const tunnelCommands: Command[] = [
  {
    id: "tunnel",
    name: "Tunnel: Foreground",
    description: "Debug: run the named tunnel in the foreground",
    run: foregroundTunnel,
  },
];
