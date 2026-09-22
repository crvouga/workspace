#!/usr/bin/env bun
/**
 * Push the sibling-repo publish workflow (lib/publish-workflow.ts) to every repo
 * listed in services.yaml. Each job calls the monorepo's single `.github/workflows/ci.yml` (workflow_call);
 * ci.yml builds/pushes the image and dispatches `deploy-service` back to infra.
 *
 * Usage:
 *   bun run rollout-publish
 *   bun run rollout-publish -- --dry-run
 *   bun run rollout-publish -- --repo crvouga/snake
 *   GITHUB_TOKEN_SUPER=... bun run rollout-publish -- --set-org-dispatch-secret
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";
import { assert, hotAssert, type Assert } from "@pkgs/assert";
import {
  groupByGithubRepo,
  imagePrefix,
  infraGithubRepo,
  loadServicesConfig,
  zoneSlug,
} from "../lib/services.js";
import {
  LEGACY_PUBLISH_WORKFLOW_PATH,
  PUBLISH_WORKFLOW_PATH,
  renderPublishWorkflow,
} from "../lib/publish-workflow.js";

const ha: Assert = hotAssert();

type Args = {
  dryRun: boolean;
  repoFilter: string;
  setOrgDispatchSecret: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  assert.ok(Array.isArray(argv), "rollout argv must be an array");
  let dryRun = false;
  let repoFilter = "";
  let setOrgDispatchSecret = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--repo") {
      const next = argv[++i];
      assert.ok(
        next === undefined || typeof next === "string",
        "rollout --repo value must be a string when present",
      );
      repoFilter = next ?? "";
    }
    else if (arg === "--set-org-dispatch-secret") setOrgDispatchSecret = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run rollout-publish [--dry-run] [--repo owner/name] [--set-org-dispatch-secret]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  const result = { dryRun, repoFilter, setOrgDispatchSecret };
  assert.ok(typeof result.dryRun === "boolean", "rollout dryRun must be a boolean");
  assert.string(result.repoFilter, "rollout repoFilter must be a string");
  assert.ok(
    typeof result.setOrgDispatchSecret === "boolean",
    "rollout setOrgDispatchSecret must be a boolean",
  );
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assert.defined(args, "rollout args must be defined");
  const config = loadServicesConfig();
  assert.defined(config, "rollout services config must be defined");
  const groups = groupByGithubRepo(config);
  assert.ok(groups instanceof Map, "rollout repo groups must be a Map");
  const infraRepo = infraGithubRepo(config);
  assert.nonEmptyString(infraRepo, "rollout infra repo must be non-empty");
  const prefix = imagePrefix(config);
  assert.nonEmptyString(prefix, "rollout image prefix must be non-empty");
  const slug = zoneSlug(config.zone);
  assert.nonEmptyString(slug, "rollout zone slug must be non-empty");

  const ghToken =
    process.env["GITHUB_TOKEN_SUPER"]?.trim() ||
    process.env["GH_TOKEN"]?.trim() ||
    process.env["GITHUB_TOKEN"]?.trim();
  assert.ok(
    ghToken === undefined || typeof ghToken === "string",
    "rollout github token must be a string when present",
  );

  if (args.setOrgDispatchSecret) {
    if (!ghToken) throw new Error("GITHUB_TOKEN_SUPER required for --set-org-dispatch-secret");
    assert.nonEmptyString(ghToken, "rollout github token must be non-empty after friendly check");
    if (args.dryRun) {
      console.log("[dry-run] Would set org secret DEPLOY_DISPATCH_TOKEN");
    } else {
      process.env["GH_TOKEN"] = ghToken;
      await $`gh secret set DEPLOY_DISPATCH_TOKEN --org crvouga --body ${ghToken}`.quiet();
      console.log("Set org secret DEPLOY_DISPATCH_TOKEN");
    }
  }

  const workRoot = mkdtempSync(join(tmpdir(), `${slug}-rollout-`));
  assert.nonEmptyString(workRoot, "rollout work root must be non-empty");

  try {
    for (const [repo, services] of groups) {
      ha.nonEmptyString(repo, "rollout repo must be non-empty");
      ha.array(services, "rollout repo services must be an array");
      if (args.repoFilter && repo !== args.repoFilter) continue;

      const workflow = renderPublishWorkflow(services, {
        infraRepo,
        imagePrefix: prefix,
        imageOwner: config.image_owner,
      });
      const relPath = PUBLISH_WORKFLOW_PATH;
      const legacyPath = LEGACY_PUBLISH_WORKFLOW_PATH;

      console.log(`\n${repo} (${services.length} service(s))`);
      if (args.dryRun) {
        console.log("--- publish.yml ---");
        console.log(workflow);
        if (args.setOrgDispatchSecret) {
          console.log(`[dry-run] Would set DEPLOY_DISPATCH_TOKEN on ${repo}`);
        }
        continue;
      }

      if (!ghToken) {
        throw new Error("GITHUB_TOKEN_SUPER or GH_TOKEN required for push");
      }
      assert.nonEmptyString(ghToken, "rollout github token must be non-empty after friendly check");

      if (args.setOrgDispatchSecret) {
        process.env["GH_TOKEN"] = ghToken;
        await $`gh secret set DEPLOY_DISPATCH_TOKEN --repo ${repo} --body ${ghToken}`.quiet();
        console.log(`  set DEPLOY_DISPATCH_TOKEN on ${repo}`);
      }

      const cloneDir = join(workRoot, repo.replace("/", "__"));
      process.env["GH_TOKEN"] = ghToken;
      await $`gh repo clone ${repo} ${cloneDir} -- --depth 1`.quiet();

      const workflowPath = join(cloneDir, relPath);
      mkdirSync(join(cloneDir, ".github/workflows"), { recursive: true });

      const existing = existsSync(workflowPath)
        ? readFileSync(workflowPath, "utf8")
        : null;
      assert.ok(
        existing === null || typeof existing === "string",
        "rollout existing workflow must be a string when present",
      );

      const staleLegacy = existsSync(join(cloneDir, legacyPath));
      if (existing === workflow && !staleLegacy) {
        console.log("  unchanged — skip");
        continue;
      }

      writeFileSync(workflowPath, workflow);
      await $`git -C ${cloneDir} add ${relPath}`.quiet();
      if (staleLegacy) {
        await $`git -C ${cloneDir} rm -q ${legacyPath}`.quiet();
      }
      await $`git -C ${cloneDir} commit -m ${"ci: call infra ci.yml from publish workflow"}`.quiet()
        .nothrow();
      const push = await $`git -C ${cloneDir} push origin main`.quiet().nothrow();
      if (push.exitCode !== 0) {
        throw new Error(`git push failed for ${repo}: ${push.stderr.toString()}`);
      }
      console.log("  pushed to main");
    }
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }

  console.log("\nRollout complete");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
