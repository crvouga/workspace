import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
import { parse as parseYaml } from "yaml";

export type {
  AliasSpec,
  CloudflareConfig,
  CloudflareRedirectSpec,
  GithubConfig,
  InfraConfig,
  LegacyConfig,
  NeonConfig,
  ObjectStoreSpec,
  RailwayPlatformConfig,
  RailwayServiceConfig,
  RailwayVolumeConfig,
  ResourceDurability,
  ResourceKind,
  SecretSource,
  SecretSpec,
  ServiceKind,
  ServiceSpec,
  ServicesConfig,
  TunnelSpec,
  VaultConfig,
  VaultKvKeySpec,
} from "./schema.js";

export { durabilityOf, RESOURCE_DURABILITY } from "./schema.js";

import type {
  CloudflareConfig,
  GithubConfig,
  InfraConfig,
  ServiceSpec,
  ServicesConfig,
  VaultConfig,
} from "./schema.js";

export function zoneSlug(zone: string): string {
  assert.nonEmptyString(zone, "zone must be non-empty");
  const slug = zone.replace(/\./g, "-");
  assert.nonEmptyString(slug, "zone slug must be non-empty");
  return slug;
}

export function imagePrefix(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(config.zone, "zone must be non-empty");
  const prefix = config.image_prefix?.trim() || zoneSlug(config.zone);
  assert.nonEmptyString(prefix, "image prefix must be non-empty");
  return prefix;
}

export function vaultHostname(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const explicit = config.vault?.hostname?.trim();
  if (explicit) {
    assert.nonEmptyString(explicit, "vault hostname must be non-empty");
    return explicit;
  }
  assert.nonEmptyString(config.zone, "zone must be non-empty");
  return `vault.${config.zone}`;
}

export function vaultAddr(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const addr = `https://${vaultHostname(config)}`;
  assert.ok(addr.startsWith("https://"), "vault addr must be https", { addr });
  return addr;
}

/** Hostname for vault; infra must not manage or prune its DNS during partial syncs. */
export function standaloneVaultHostname(config: ServicesConfig): string {
  return vaultHostname(config);
}

export function vaultConfigOrDefault(config: ServicesConfig): VaultConfig {
  assert.record(config, "services config must be a record");
  if (config.vault) return config.vault;
  return {
    kv: { mount: "secret", project: "personal", configs: ["dev", "prd"] },
  };
}

export function cloudflareConfigOrDefault(
  config: ServicesConfig,
): CloudflareConfig {
  assert.record(config, "services config must be a record");
  return (
    config.cloudflare ?? {
      ssl_mode: "strict",
      placeholder_ipv4: "192.0.2.1",
      dns: { proxied: false, prune_orphans: true },
    }
  );
}

export function githubConfigOrDefault(config: ServicesConfig): GithubConfig {
  assert.record(config, "services config must be a record");
  if (config.github) return config.github;
  const infra =
    config.infra_github_repo?.trim() ||
    (() => {
      throw new Error("services.yaml: github.infra_repo or infra_github_repo is required");
    })();
  return {
    org: infra.split("/")[0] ?? "crvouga",
    infra_repo: infra,
    skip_rollout_repos: config.skip_rollout_repos,
  };
}

export function railwayProjectName(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const project = config.railway?.project?.trim();
  if (!project) throw new Error("services.yaml: railway.project is required");
  assert.nonEmptyString(project, "services.yaml railway.project must be non-empty");
  return project;
}

export function railwayEnvironmentName(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const name = config.railway?.environment?.trim() || "production";
  assert.nonEmptyString(name, "railway environment name must be non-empty");
  return name;
}

export function railwayRegion(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const region = config.railway?.region?.trim() || "us-east4";
  assert.nonEmptyString(region, "railway region must be non-empty");
  return region;
}

export function railwayServicePrefix(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const prefix = config.railway?.service_prefix?.trim() ?? "";
  assert.string(prefix, "railway service prefix must be a string");
  return prefix;
}

export function railwayDefaultReplicas(config: ServicesConfig): number {
  assert.record(config, "services config must be a record");
  const n = config.railway?.replicas ?? 1;
  assert.integer(n, "railway.replicas must be an integer");
  assert.ok(n >= 1, "railway.replicas must be >= 1", { n });
  return n;
}

export function railwayServiceReplicas(
  config: ServicesConfig,
  service: ServiceSpec,
): number {
  assert.record(config, "services config must be a record");
  assert.record(service, "service must be a record");
  const n = service.railway?.replicas ?? railwayDefaultReplicas(config);
  assert.integer(n, "service replicas must be an integer");
  assert.ok(n >= 1, "service replicas must be >= 1", { n });
  return n;
}

export function railwayServiceName(config: ServicesConfig, id: string): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  const prefix = railwayServicePrefix(config);
  const name = prefix ? `${prefix}-${id}` : id;
  assert.nonEmptyString(name, "railway service name must be non-empty");
  return name;
}

/** Legacy Fly.io app names kept the `crvouga-` prefix after Railway dropped it. */
export function legacyFlyAppName(_config: ServicesConfig, id: string): string {
  assert.nonEmptyString(id, "service id must be non-empty");
  const name = `crvouga-${id}`;
  assert.ok(name.startsWith("crvouga-"), "legacy fly app name must keep crvouga- prefix", {
    name,
  });
  return name;
}

export function railwaySleep(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  return service.railway?.sleep !== false;
}

export function railwayIsPublic(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  if (service.internal) return false;
  return service.railway?.public !== false;
}

export function railwayVolume(service: ServiceSpec) {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  return service.railway?.volume;
}

export function railwayStartCommand(service: ServiceSpec): string | undefined {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  const cmd = service.railway?.start_command?.trim();
  const result = cmd || undefined;
  assert.ok(
    result === undefined || result.length > 0,
    "start command must be undefined or non-empty",
  );
  return result;
}

export function serviceHealthPath(service: ServiceSpec): string | undefined {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  if (service.health_check === false) return undefined;
  const path = service.health_path ?? "/";
  assert.nonEmptyString(path, "service health path must be non-empty");
  return path;
}

export function railwayHealthcheckSetting(
  service: ServiceSpec,
): string | null | undefined {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  if (service.railway?.health_check === false) return null;

  if (service.railway?.health_path != null) {
    const override = service.railway.health_path.trim();
    assert.string(override, "railway health path override must be a string");
    return override.length > 0 ? override : null;
  }

  return railwayHealthcheckPath(service);
}

/** @deprecated Prefer `railwayHealthcheckSetting` for provision/update. */
export function railwayHealthcheckPath(service: ServiceSpec): string | undefined {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  if (service.health_check === false) return undefined;

  const raw = service.railway?.health_path ?? service.health_path ?? "/";
  const pathOnly = raw.split("?")[0]?.trim();
  if (!pathOnly?.startsWith("/")) return undefined;
  if (pathOnly.includes("-")) return undefined;
  const result = pathOnly || "/";
  assert.nonEmptyString(result, "railway healthcheck path must be non-empty");
  return result;
}

export function infraGithubRepo(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const fromGithub = config.github?.infra_repo?.trim();
  if (fromGithub) {
    assert.nonEmptyString(fromGithub, "github.infra_repo must be non-empty");
    return fromGithub;
  }
  const repo = config.infra_github_repo?.trim();
  if (!repo) throw new Error("services.yaml: github.infra_repo (or infra_github_repo) is required");
  assert.nonEmptyString(repo, "services.yaml infra_github_repo must be non-empty");
  return repo;
}

export function imagePackageName(config: ServicesConfig, id: string): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  const name = `${imagePrefix(config)}-${id}`;
  assert.nonEmptyString(name, "image package name must be non-empty");
  return name;
}

export function isPublicService(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  return service.internal !== true;
}

export function isRailwayService(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  return (service.kind ?? "railway") === "railway";
}

export function isTunnelService(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  return service.kind === "tunnel";
}

export function imageRepo(config: ServicesConfig, id: string): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  assert.nonEmptyString(config.image_owner, "image owner must be non-empty");
  const repo = `ghcr.io/${config.image_owner}/${imagePackageName(config, id)}`;
  assert.ok(repo.startsWith("ghcr.io/"), "image repo must be ghcr.io", { repo });
  return repo;
}

/** True when the service pulls a non-GHCR image via `image:`. */
export function usesExternalImage(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  return Boolean(service.image?.trim());
}

export function imageRef(config: ServicesConfig, id: string, tag?: string): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  if (tag !== undefined) assert.string(tag, "image tag must be a string");
  const service = findService(config, id);
  const external = service?.image?.trim();
  if (external) return external;
  const resolvedTag = tag?.trim() || config.default_image_tag;
  assert.nonEmptyString(resolvedTag, "resolved image tag must be non-empty");
  const ref = `${imageRepo(config, id)}:${resolvedTag}`;
  assert.nonEmptyString(ref, "image ref must be non-empty");
  return ref;
}

export function isAlwaysOn(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  return !railwaySleep(service);
}

export function resolveRedirectTarget(
  config: ServicesConfig,
  redirect: { to_service?: string; to?: string },
): string {
  assert.record(config, "services config must be a record");
  if (redirect.to?.trim()) {
    assert.nonEmptyString(redirect.to.trim(), "redirect.to must be non-empty");
    return redirect.to.trim();
  }
  if (redirect.to_service?.trim()) {
    const svc = findService(config, redirect.to_service.trim());
    if (!svc?.hostname) {
      throw new Error(
        `cloudflare.redirects: to_service "${redirect.to_service}" has no hostname`,
      );
    }
    return svc.hostname;
  }
  throw new Error("cloudflare.redirects entry needs to_service or to");
}

function validateService(service: ServiceSpec): void {
  ha.record(service, "service spec must be a record");
  ha.nonEmptyString(service.id, "service id must be non-empty");
  const kind = service.kind ?? "railway";

  if (kind === "tunnel") {
    if (!service.hostname) {
      throw new Error(`Tunnel service "${service.id}" missing hostname`);
    }
    return;
  }

  if (!service.github_repo || !service.source_code_url) {
    throw new Error(`Service "${service.id}" missing github_repo or source_code_url`);
  }
  if (!service.dockerfile || service.build_context === undefined) {
    throw new Error(`Service "${service.id}" missing dockerfile or build_context`);
  }
  if (service.internal) {
    if (service.hostname) {
      throw new Error(`Service "${service.id}" is internal but has hostname`);
    }
  } else if (railwayIsPublic(service)) {
    if (!service.hostname) {
      throw new Error(`Service "${service.id}" missing hostname`);
    }
    if (service.port == null) {
      throw new Error(`Service "${service.id}" missing port`);
    }
  }
}

export function loadServicesConfig(
  path = join(import.meta.dirname, "..", "services.yaml"),
): InfraConfig {
  assert.nonEmptyString(path, "services config path must be non-empty");
  const raw = parseYaml(readFileSync(path, "utf8")) as InfraConfig;
  assert.record(raw, "services config must be a record");
  if (!raw?.zone?.trim()) {
    throw new Error(`Invalid services config at ${path}: zone is required`);
  }
  assert.nonEmptyString(raw.zone.trim(), "services config zone must be non-empty");
  if (!raw?.railway?.project?.trim() || !raw?.railway?.region?.trim()) {
    throw new Error(
      `Invalid services config at ${path}: railway.project and railway.region are required`,
    );
  }
  if (!raw?.services?.length) {
    throw new Error(`Invalid services config at ${path}`);
  }
  assert.nonEmptyArray(raw.services, "services config services must be non-empty");
  for (const service of raw.services) {
    validateService(service);
  }
  return raw;
}

/** Alias for loadServicesConfig — preferred name going forward. */
export const loadInfraConfig = loadServicesConfig;

export function findService(
  config: ServicesConfig,
  id: string,
): ServiceSpec | undefined {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  assert.array(config.services, "services must be an array");
  return config.services.find((s) => s.id === id);
}

export type DnsTarget = { readonly id: string; readonly hostname: string };

/** Public hostnames for Cloudflare DNS sync (fleet only — excludes standalone). */
export function allDnsTargets(config: ServicesConfig): readonly DnsTarget[] {
  assert.record(config, "services config must be a record");
  assert.array(config.services, "services must be an array");
  const targets: DnsTarget[] = [];
  for (const service of config.services) {
    ha.nonEmptyString(service.id, "service id must be non-empty");
    if (service.standalone) continue;
    if (!isRailwayService(service)) continue;
    if (!isPublicService(service) || !railwayIsPublic(service) || !service.hostname) {
      continue;
    }
    targets.push({ id: service.id, hostname: service.hostname });
  }
  assert.array(targets, "dns targets must be an array");
  return targets;
}

export function recordName(hostname: string, zone: string): string {
  assert.nonEmptyString(hostname, "hostname must be non-empty");
  assert.nonEmptyString(zone, "zone must be non-empty");
  const name = hostname === zone ? "@" : hostname.replace(`.${zone}`, "");
  assert.nonEmptyString(name, "record name must be non-empty");
  return name;
}

/** Canonical FQDN for comparing Cloudflare record names (relative vs absolute). */
export function normalizeDnsHostname(name: string, zone: string): string {
  assert.string(name, "dns hostname must be a string");
  assert.nonEmptyString(zone, "zone must be non-empty");
  const trimmed = name.replace(/\.$/, "").trim();
  if (!trimmed || trimmed === "@") return zone;
  if (trimmed === zone) return zone;
  if (trimmed.endsWith(`.${zone}`)) return trimmed;
  const fqdn = `${trimmed}.${zone}`;
  assert.nonEmptyString(fqdn, "normalized hostname must be non-empty");
  return fqdn;
}

export function allVaultSecretNames(config: ServicesConfig): readonly string[] {
  assert.record(config, "services config must be a record");
  assert.array(config.services, "services must be an array");
  const names = new Set<string>();
  for (const service of config.services) {
    ha.nonEmptyString(service.id, "service id must be non-empty");
    for (const secret of service.secrets ?? []) {
      ha.nonEmptyString(secret.name, "secret name must be non-empty");
      if (secret.source === "vault") names.add(secret.name);
    }
  }
  for (const key of config.vault?.kv_keys ?? []) {
    ha.nonEmptyString(key.name, "kv key name must be non-empty");
    names.add(key.name);
  }
  const sorted = [...names].sort();
  assert.array(sorted, "vault secret names must be an array");
  return sorted;
}

/** Group deployable services by github_repo for rollout script. */
export function groupByGithubRepo(
  config: ServicesConfig,
): Map<string, ServiceSpec[]> {
  assert.record(config, "services config must be a record");
  assert.array(config.services, "services must be an array");
  const gh = githubConfigOrDefault(config);
  const skip = new Set(gh.skip_rollout_repos ?? config.skip_rollout_repos ?? []);
  const map = new Map<string, ServiceSpec[]>();
  for (const service of config.services) {
    if (!isRailwayService(service)) continue;
    if (!service.github_repo) continue;
    ha.nonEmptyString(service.github_repo, "service github_repo must be non-empty");
    if (skip.has(service.github_repo)) continue;
    const list = map.get(service.github_repo) ?? [];
    list.push(service);
    map.set(service.github_repo, list);
  }
  assert.instanceOf(map, Map, "grouped repos must be a Map");
  return map;
}

export function deployableServices(config: ServicesConfig): readonly ServiceSpec[] {
  assert.record(config, "services config must be a record");
  assert.array(config.services, "services must be an array");
  const services = config.services.filter(
    (service) => isRailwayService(service) && !service.standalone,
  );
  assert.array(services, "deployable services must be an array");
  return services;
}

export function fleetServices(config: ServicesConfig): readonly ServiceSpec[] {
  assert.record(config, "services config must be a record");
  const services = deployableServices(config);
  assert.array(services, "fleet services must be an array");
  return services;
}

export function railwayServices(config: ServicesConfig): readonly ServiceSpec[] {
  assert.record(config, "services config must be a record");
  return config.services.filter(isRailwayService);
}

/** @deprecated Use legacyFlyAppName for Fly teardown; railwayServiceName for Railway. */
export const flyAppName = legacyFlyAppName;
/** @deprecated Use railwayProjectName */
export const flyOrg = railwayProjectName;
/** @deprecated Use railwayRegion */
export const flyRegion = railwayRegion;
/** @deprecated Use railwayServicePrefix */
export const flyAppPrefix = railwayServicePrefix;
/** @deprecated */
export function flyAppHostname(config: ServicesConfig, id: string): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  const hostname = `${railwayServiceName(config, id)}.up.railway.app`;
  assert.nonEmptyString(hostname, "fly app hostname must be non-empty");
  return hostname;
}
/** @deprecated Use railwaySleep */
export function flyMinMachines(service: ServiceSpec): number {
  assert.record(service, "service spec must be a record");
  const min = railwaySleep(service) ? 0 : 1;
  assert.nonNegative(min, "min machines must be non-negative");
  return min;
}
/** @deprecated Use railwayIsPublic */
export const flyIsPublic = railwayIsPublic;
