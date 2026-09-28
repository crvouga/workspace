#!/usr/bin/env bun
/**
 * Print the ids of services whose image THIS repo builds, as JSON (for the CI
 * publish matrix): railway services whose `github_repo` is this repo, minus
 * standalone services (vault is owned by the CI vault job).
 *
 * Usage:
 *   bun run scripts/list-publish-service-ids.ts
 */
import { assert } from "@pkgs/assert";
import {
  deployableServices,
  infraGithubRepo,
  loadServicesConfig,
} from "../lib/services.js";

const config = loadServicesConfig();
const infraRepo = infraGithubRepo(config);
assert.nonEmptyString(infraRepo, "infra repo must be non-empty");

const ids = deployableServices(config)
  .filter((service) => service.github_repo === infraRepo)
  .map((service) => service.id);
assert.nonEmptyArray(ids, `no publishable services point at ${infraRepo}`);
for (const id of ids) {
  assert.nonEmptyString(id, "publish service id must be non-empty");
}
console.log(JSON.stringify(ids));
