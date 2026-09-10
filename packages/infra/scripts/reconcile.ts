#!/usr/bin/env bun
/**
 * Desired-state reconcile for packages/infra/services.yaml.
 *
 * Usage:
 *   bun run reconcile
 *   bun run reconcile --apply --fleet-only
 *   bun run reconcile --phase dns --apply
 *   bun run reconcile destroy railway --id foo --i-understand-stateful
 */
import { assert } from "@pkgs/assert";
import {
  destroyStateful,
  reconcile,
  type ReconcileOptions,
} from "../lib/reconcile/index.js";

const ALL_PHASES = [
  "github",
  "neon",
  "vault",
  "object_stores",
  "railway",
  "ghcr",
  "dns",
  "tunnels",
  "legacy",
  "kv_keys",
  "all",
] as const;

function printHelp(): void {
  console.log(`Usage:
  bun run reconcile [--apply] [--fleet-only] [--phase <name>] [--id <id>]
  bun run reconcile destroy <kind> --id <id> --i-understand-stateful

Phases: ${ALL_PHASES.filter((p) => p !== "all").join(", ")} (default: all)

Delete policy:
  Stateless drift is removed on --apply.
  Stateful resources are never auto-deleted; use destroy … --i-understand-stateful.
`);
}

function parseReconcileArgs(argv: readonly string[]): ReconcileOptions {
  assert.array(argv, "argv must be an array");
  let apply = false;
  let fleetOnly = false;
  let idFilter: string | null = null;
  const phases: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") apply = true;
    else if (arg === "--fleet-only") fleetOnly = true;
    else if (arg === "--id") {
      idFilter = argv[++i] ?? "";
      assert.nonEmptyString(idFilter, "--id requires a value");
    } else if (arg === "--phase") {
      const phase = argv[++i] ?? "";
      assert.nonEmptyString(phase, "--phase requires a value");
      phases.push(phase);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(2);
    }
  }

  return {
    apply,
    fleetOnly,
    idFilter,
    phases: phases.length > 0 ? phases : ["all"],
  };
}

function parseDestroyArgs(argv: readonly string[]): {
  readonly kind: string;
  readonly id: string;
  readonly acknowledged: boolean;
} {
  assert.array(argv, "argv must be an array");
  const kind = argv[0] ?? "";
  assert.nonEmptyString(kind, "destroy requires <kind>");
  let id = "";
  let acknowledged = false;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") id = argv[++i] ?? "";
    else if (arg === "--i-understand-stateful") acknowledged = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown destroy argument: ${arg}`);
      process.exit(2);
    }
  }
  assert.nonEmptyString(id, "destroy requires --id");
  return { kind, id, acknowledged };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "destroy") {
    const args = parseDestroyArgs(argv.slice(1));
    await destroyStateful(args);
    return;
  }
  const options = parseReconcileArgs(argv);
  await reconcile(options);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
