#!/usr/bin/env bun
/**
 * Print KEY=VALUE build inputs for one publishable service (CI GITHUB_OUTPUT).
 *
 * Usage:
 *   bun run scripts/print-publish-inputs.ts --id portfolio
 */
import { assert } from "@pkgs/assert";
import {
  findService,
  imagePrefix,
  infraGithubRepo,
  loadServicesConfig,
} from "../lib/services.js";

const argv = process.argv.slice(2);
const idIndex = argv.indexOf("--id");
const id = idIndex === -1 ? "" : (argv[idIndex + 1] ?? "");
assert.nonEmptyString(id, "print-publish-inputs requires --id <service id>");

const config = loadServicesConfig();
const service = findService(config, id);
if (!service) {
  console.error(`No service with id "${id}"`);
  process.exit(1);
}
assert.defined(service, `no service with id "${id}"`);
assert.ok(
  service.github_repo === infraGithubRepo(config),
  `service "${id}" is not built by ${infraGithubRepo(config)}`,
);
assert.nonEmptyString(service.dockerfile, `service "${id}" has no dockerfile`);
assert.nonEmptyString(
  service.build_context,
  `service "${id}" has no build_context`,
);

const vars: Record<string, string> = {
  dockerfile: service.dockerfile,
  context: service.build_context,
  image_owner: config.image_owner,
  image_prefix: imagePrefix(config),
};
for (const [key, value] of Object.entries(vars)) {
  assert.nonEmptyString(value, `${key} must be non-empty`);
  console.log(`${key}=${value}`);
}
