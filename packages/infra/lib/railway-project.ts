/**
 * railway.project is the desired Railway project name.
 * Reconcile renames the project that already hosts the declared services,
 * and creates a project only when none does.
 */
import { assert } from "@pkgs/assert";
import {
  createProject,
  getProject,
  listProjectSnapshots,
  resolveEnvironment,
  updateProjectName,
  type RailwayProject,
  type RailwayProjectSnapshot,
} from "./railway-api.js";
import {
  railwayDeclaredServiceNames,
  railwayEnvironmentName,
  railwayProjectName,
  type ServicesConfig,
} from "./services.js";

export type RailwayProjectNamePlan =
  | { readonly op: "noop"; readonly projectId: string; readonly name: string }
  | {
      readonly op: "rename";
      readonly projectId: string;
      readonly from: string;
      readonly to: string;
    }
  | { readonly op: "create"; readonly name: string }
  | { readonly op: "conflict"; readonly summary: string };

export class RailwayProjectConflictError extends Error {
  readonly summary: string;

  constructor(summary: string) {
    assert.nonEmptyString(summary, "railway project conflict summary must be non-empty");
    super(summary);
    this.name = "RailwayProjectConflictError";
    this.summary = summary;
  }
}

export type ConvergedRailwayProject = {
  readonly plan: RailwayProjectNamePlan;
  readonly project: RailwayProject | null;
  readonly projectId: string | null;
  readonly environmentId: string | null;
};

function intersects(
  serviceNames: readonly string[],
  declared: ReadonlySet<string>,
): boolean {
  assert.array(serviceNames, "service names must be an array");
  return serviceNames.some((name) => declared.has(name));
}

export function planRailwayProjectName(input: {
  readonly desiredName: string;
  readonly declaredServiceNames: readonly string[];
  readonly projects: readonly RailwayProjectSnapshot[];
}): RailwayProjectNamePlan {
  assert.record(input, "railway project name plan input must be a record");
  assert.nonEmptyString(input.desiredName, "desired railway project name must be non-empty");
  assert.array(input.declaredServiceNames, "declared service names must be an array");
  assert.array(input.projects, "railway projects must be an array");

  const seenIds = new Set<string>();
  for (const project of input.projects) {
    assert.nonEmptyString(project.id, "railway project id must be non-empty");
    assert.nonEmptyString(project.name, "railway project name must be non-empty");
    assert.array(project.serviceNames, "railway project service names must be an array");
    if (seenIds.has(project.id)) {
      throw new Error(`duplicate railway project id ${project.id}`);
    }
    seenIds.add(project.id);
  }
  for (const name of input.declaredServiceNames) {
    assert.nonEmptyString(name, "declared railway service name must be non-empty");
  }

  const declared = new Set<string>(input.declaredServiceNames);
  const named = input.projects.filter((project) => project.name === input.desiredName);
  if (named.length > 1) {
    const ids = named.map((project) => project.id).join(", ");
    return {
      op: "conflict",
      summary: `Multiple Railway projects are named "${input.desiredName}" (${ids})`,
    };
  }

  const owners = input.projects.filter((project) => intersects(project.serviceNames, declared));
  const match = named[0];
  if (match) {
    const otherOwners = owners.filter((project) => project.id !== match.id);
    if (otherOwners.length > 0) {
      const listed = otherOwners
        .map((project) => `"${project.name}" (${project.id})`)
        .join(", ");
      return {
        op: "conflict",
        summary: `Railway project "${match.name}" (${match.id}) matches railway.project, but declared services also live on ${listed}`,
      };
    }
    return { op: "noop", projectId: match.id, name: match.name };
  }

  if (owners.length === 1) {
    const owner = owners[0];
    assert.defined(owner, "owning railway project must be defined");
    return {
      op: "rename",
      projectId: owner.id,
      from: owner.name,
      to: input.desiredName,
    };
  }

  if (owners.length > 1) {
    const listed = owners.map((project) => `"${project.name}" (${project.id})`).join(", ");
    return {
      op: "conflict",
      summary: `railway.project "${input.desiredName}" was not found, and declared services live on multiple Railway projects: ${listed}`,
    };
  }

  const unidentified = input.projects.filter((project) => project.serviceNames.length === 0);
  if (
    input.declaredServiceNames.length > 0 &&
    input.projects.length > 0 &&
    unidentified.length === input.projects.length
  ) {
    const listed = input.projects.map((project) => `"${project.name}"`).join(", ");
    return {
      op: "conflict",
      summary: `No Railway project is named "${input.desiredName}" and none reported the declared services. Existing projects (${listed}) reported no services, so reconcile will not create another project.`,
    };
  }

  return { op: "create", name: input.desiredName };
}

export function describeRailwayProjectPlan(plan: RailwayProjectNamePlan): string {
  assert.record(plan, "railway project name plan must be a record");
  if (plan.op === "noop") return `Railway project "${plan.name}"`;
  if (plan.op === "rename") return `Railway project "${plan.from}" → "${plan.to}"`;
  if (plan.op === "create") return `Railway project "${plan.name}"`;
  return plan.summary;
}

async function loadProject(
  projectId: string,
  environmentName: string,
): Promise<{ readonly project: RailwayProject; readonly environmentId: string }> {
  assert.nonEmptyString(projectId, "railway project id must be non-empty");
  assert.nonEmptyString(environmentName, "railway environment name must be non-empty");
  const project = await getProject(projectId);
  assert.nonEmptyString(project.id, "loaded railway project id must be non-empty");
  const environment = resolveEnvironment(project, environmentName);
  assert.nonEmptyString(environment.id, "railway environment id must be non-empty");
  return { project, environmentId: environment.id };
}

export async function convergeRailwayProject(
  config: ServicesConfig,
  options: { readonly apply: boolean; readonly allowCreate?: boolean },
): Promise<ConvergedRailwayProject> {
  assert.record(config, "services config must be a record");
  assert.record(options, "converge railway project options must be a record");
  assert.ok(typeof options.apply === "boolean", "apply must be a boolean");
  const allowCreate = options.allowCreate !== false;
  assert.ok(typeof allowCreate === "boolean", "allowCreate must be a boolean");

  const desiredName = railwayProjectName(config);
  const environmentName = railwayEnvironmentName(config);
  const declaredServiceNames = railwayDeclaredServiceNames(config);
  const projects = await listProjectSnapshots();
  assert.array(projects, "railway project snapshots must be an array");
  const plan = planRailwayProjectName({
    desiredName,
    declaredServiceNames,
    projects,
  });

  if (plan.op === "conflict") {
    throw new RailwayProjectConflictError(plan.summary);
  }

  if (plan.op === "noop" || plan.op === "rename") {
    if (plan.op === "rename" && options.apply) {
      await updateProjectName(plan.projectId, plan.to);
    }
    const loaded = await loadProject(plan.projectId, environmentName);
    if (options.apply && plan.op === "rename" && loaded.project.name !== plan.to) {
      throw new Error(
        `Railway project rename did not stick: expected "${plan.to}", got "${loaded.project.name}"`,
      );
    }
    return {
      plan,
      project: loaded.project,
      projectId: loaded.project.id,
      environmentId: loaded.environmentId,
    };
  }

  if (!options.apply || !allowCreate) {
    return { plan, project: null, projectId: null, environmentId: null };
  }

  const created = await createProject(plan.name);
  assert.nonEmptyString(created.id, "created railway project id must be non-empty");
  assert.ok(created.name === plan.name, "created railway project name must match desired name", {
    name: created.name,
    desired: plan.name,
  });
  const environment = resolveEnvironment(created, environmentName);
  assert.nonEmptyString(environment.id, "created railway environment id must be non-empty");
  return {
    plan,
    project: created,
    projectId: created.id,
    environmentId: environment.id,
  };
}
