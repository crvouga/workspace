import { describe, expect, it } from "bun:test";
import { planRailwayProjectName } from "./railway-project.js";

const portfolio = ["portfolio", "vault", "turborepo"];

describe("planRailwayProjectName", () => {
  it("renames the single project that hosts the declared services", () => {
    const plan = planRailwayProjectName({
      desiredName: "Workspace",
      declaredServiceNames: portfolio,
      projects: [{ id: "proj-infra", name: "infra", serviceNames: portfolio }],
    });
    expect(plan).toEqual({
      op: "rename",
      projectId: "proj-infra",
      from: "infra",
      to: "Workspace",
    });
  });

  it("is a no-op when the live project already has the desired name", () => {
    const plan = planRailwayProjectName({
      desiredName: "Workspace",
      declaredServiceNames: portfolio,
      projects: [{ id: "proj-infra", name: "Workspace", serviceNames: ["portfolio"] }],
    });
    expect(plan).toEqual({ op: "noop", projectId: "proj-infra", name: "Workspace" });
  });

  it("creates a project when the account has none", () => {
    const plan = planRailwayProjectName({
      desiredName: "Workspace",
      declaredServiceNames: portfolio,
      projects: [],
    });
    expect(plan).toEqual({ op: "create", name: "Workspace" });
  });

  it("creates alongside unrelated projects that do not host declared services", () => {
    const plan = planRailwayProjectName({
      desiredName: "Workspace",
      declaredServiceNames: portfolio,
      projects: [{ id: "other", name: "sandbox", serviceNames: ["notes"] }],
    });
    expect(plan).toEqual({ op: "create", name: "Workspace" });
  });

  it("refuses to create when the only existing project reported no services", () => {
    const plan = planRailwayProjectName({
      desiredName: "Workspace",
      declaredServiceNames: portfolio,
      projects: [{ id: "proj-infra", name: "infra", serviceNames: [] }],
    });
    expect(plan.op).toBe("conflict");
  });

  it("conflicts when declared services live on more than one project", () => {
    const plan = planRailwayProjectName({
      desiredName: "Workspace",
      declaredServiceNames: portfolio,
      projects: [
        { id: "a", name: "infra", serviceNames: ["portfolio"] },
        { id: "b", name: "other", serviceNames: ["vault"] },
      ],
    });
    expect(plan.op).toBe("conflict");
  });

  it("conflicts when the desired name exists apart from the project that hosts services", () => {
    const plan = planRailwayProjectName({
      desiredName: "Workspace",
      declaredServiceNames: portfolio,
      projects: [
        { id: "empty", name: "Workspace", serviceNames: [] },
        { id: "real", name: "infra", serviceNames: portfolio },
      ],
    });
    expect(plan.op).toBe("conflict");
  });

  it("conflicts when two projects share the desired name", () => {
    const plan = planRailwayProjectName({
      desiredName: "Workspace",
      declaredServiceNames: portfolio,
      projects: [
        { id: "a", name: "Workspace", serviceNames: ["portfolio"] },
        { id: "b", name: "Workspace", serviceNames: [] },
      ],
    });
    expect(plan.op).toBe("conflict");
  });
});
