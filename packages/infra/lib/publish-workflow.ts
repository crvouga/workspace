import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServiceSpec } from "./schema.js";

export const PUBLISH_WORKFLOW_PATH = ".github/workflows/publish.yml";
type PublishWorkflowService = Pick<ServiceSpec, "id" | "dockerfile" | "build_context">;
type PublishWorkflowOptions = { infraRepo: string; imagePrefix: string; imageOwner: string };

/** Read-only rendering for llms.txt from the template OpenTofu applies. */
export function renderPublishWorkflow(services: readonly PublishWorkflowService[], options: PublishWorkflowOptions): string {
  const template = readFileSync(join(import.meta.dirname, "../tofu/modules/inventory/publish.yml.tftpl"), "utf8");
  const expanded = template.replace(/%\{ for service in services ~\}([\s\S]*?)%\{ endfor ~\}/, (_, body: string) => services.map(service => body.replace(/\$\{service\.(\w+)\}/g, (_, key: string) => {
    if (key === "job_name") return service.id.replaceAll("-", "_");
    return String(service[key as keyof PublishWorkflowService]);
  })).join(""));
  const values: Record<string, string> = { branch: "main", infra_repo: options.infraRepo, image_owner: options.imageOwner, image_prefix: options.imagePrefix };
  return expanded.replace(/\$\{(branch|infra_repo|image_owner|image_prefix)\}/g, (_, key: string) => values[key]!).replaceAll("$${{", "${{").trimEnd() + "\n";
}
