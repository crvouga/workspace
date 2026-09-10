#!/usr/bin/env bun
/**
 * Print vault.kv_keys from services.yaml for CI / docs.
 *
 * Usage:
 *   bun run scripts/print-vault-kv-keys.ts
 *   bun run scripts/print-vault-kv-keys.ts --format action --config prd
 */
import { assert } from "@pkgs/assert";
import {
  loadServicesConfig,
  vaultAddr,
  vaultConfigOrDefault,
} from "../lib/services.js";
import { vaultKvDataPath } from "../lib/vault-kv.js";

function parseArgs(argv: readonly string[]): {
  format: "list" | "action";
  config: string;
  usedBy: string | null;
} {
  let format: "list" | "action" = "list";
  let config = "prd";
  let usedBy: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--format") {
      const next = argv[++i];
      if (next === "list" || next === "action") format = next;
    } else if (arg === "--config") {
      config = argv[++i] ?? config;
    } else if (arg === "--used-by") {
      usedBy = argv[++i] ?? null;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/print-vault-kv-keys.ts [--format list|action] [--config prd] [--used-by ci]",
      );
      process.exit(0);
    }
  }
  return { format, config, usedBy };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const infra = loadServicesConfig();
  const vault = vaultConfigOrDefault(infra);
  const keys = (vault.kv_keys ?? []).filter((k) => {
    if (!k.configs.includes(args.config)) return false;
    if (args.usedBy && !(k.used_by ?? []).includes(args.usedBy)) return false;
    return true;
  });

  if (args.format === "list") {
    for (const key of keys) {
      console.log(key.name);
    }
    return;
  }

  // GitHub vault-action secret lines
  const path = vaultKvDataPath(args.config);
  console.log(`# Generated from services.yaml vault.kv_keys (config=${args.config})`);
  console.log(`# VAULT_ADDR=${vaultAddr(infra)}`);
  for (const key of keys) {
    console.log(`          ${path} ${key.name} | ${key.name} ;`);
  }
}

main();
