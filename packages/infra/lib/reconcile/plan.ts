import { assert } from "@pkgs/assert";
import type { ResourceDurability, ResourceKind } from "../schema.js";
import { durabilityOf } from "../schema.js";

export type PlanOp = "create" | "update" | "delete" | "noop" | "warn";

export type PlanAction = {
  readonly phase: string;
  readonly kind: ResourceKind;
  readonly durability: ResourceDurability;
  readonly op: PlanOp;
  readonly id: string;
  readonly summary: string;
  /** Printed when op is warn for stateful drift. */
  readonly destroyHint?: string;
  readonly apply: () => Promise<void>;
};

export type ReconcileOptions = {
  readonly apply: boolean;
  readonly phases: readonly string[];
  readonly fleetOnly: boolean;
  readonly idFilter: string | null;
};

export function makeAction(
  partial: Omit<PlanAction, "durability"> & { readonly kind: ResourceKind },
): PlanAction {
  assert.nonEmptyString(partial.phase, "plan action phase must be non-empty");
  assert.nonEmptyString(partial.id, "plan action id must be non-empty");
  assert.nonEmptyString(partial.summary, "plan action summary must be non-empty");
  const durability = durabilityOf(partial.kind);
  return { ...partial, durability };
}

export function statefulDestroyCommand(
  kind: string,
  id: string,
): string {
  assert.nonEmptyString(kind, "destroy kind must be non-empty");
  assert.nonEmptyString(id, "destroy id must be non-empty");
  return `bun run reconcile destroy ${kind} --id ${id} --i-understand-stateful`;
}

/**
 * Execute a plan. Stateless deletes run on apply.
 * Stateful deletes never run here — only warn + destroyHint.
 */
export async function runPlan(
  actions: readonly PlanAction[],
  options: { readonly apply: boolean },
): Promise<{ readonly applied: number; readonly warned: number }> {
  assert.array(actions, "actions must be an array");
  assert.ok(typeof options.apply === "boolean", "apply must be a boolean");

  let applied = 0;
  let warned = 0;

  for (const action of actions) {
    if (action.op === "noop") {
      console.log(`OK     [${action.phase}] ${action.summary}`);
      continue;
    }

    if (action.op === "warn") {
      warned += 1;
      console.warn(`[warn] [${action.phase}] ${action.summary}`);
      if (action.destroyHint) {
        console.warn(`       Will NOT delete (stateful). To destroy manually:`);
        console.warn(`         ${action.destroyHint}`);
      }
      continue;
    }

    const isDelete = action.op === "delete";
    if (isDelete && action.durability === "stateful") {
      warned += 1;
      console.warn(
        `[warn] [${action.phase}] refused auto-delete of stateful ${action.kind} "${action.id}": ${action.summary}`,
      );
      console.warn(
        `       ${action.destroyHint ?? statefulDestroyCommand(action.kind, action.id)}`,
      );
      continue;
    }

    const label =
      action.op === "create"
        ? "CREATE"
        : action.op === "update"
          ? "UPDATE"
          : "DELETE";
    if (!options.apply) {
      console.log(`[plan] ${label} [${action.phase}] ${action.summary}`);
      continue;
    }

    console.log(`${label}  [${action.phase}] ${action.summary}`);
    await action.apply();
    applied += 1;
  }

  return { applied, warned };
}
