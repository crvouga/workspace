/**
 * Desired-state schema for packages/infra/services.yaml.
 * Every infrastructure resource is declared here; reconcile converges to it.
 */
export type ResourceDurability = "stateless" | "stateful";

export type SecretSource =
  | { readonly source: "vault" }
  | { readonly source: "env" }
  | { readonly source: "github" }
  | { readonly source: "neon"; readonly neon_project: string }
  | { readonly source: "literal"; readonly value: string };

export type SecretSpec = {
  readonly name: string;
} & SecretSource;

export type AliasSpec = {
  readonly zone: string;
  readonly hosts: readonly string[];
  readonly target: string;
};

export type CloudflareRedirectSpec = {
  readonly from: string;
  /** Prefer to_service; hostname used when set. */
  readonly to_service?: string;
  readonly to?: string;
  readonly status?: number;
};

export type CloudflareDnsConfig = {
  readonly proxied?: boolean;
  readonly prune_orphans?: boolean;
};

export type CloudflareConfig = {
  readonly ssl_mode?: "off" | "flexible" | "full" | "strict";
  readonly placeholder_ipv4?: string;
  readonly dns?: CloudflareDnsConfig;
  readonly redirects?: readonly CloudflareRedirectSpec[];
};

export type RailwayVolumeConfig = {
  readonly name: string;
  readonly mount_path: string;
  readonly size_gb?: number;
};

export type RailwayServiceConfig = {
  readonly sleep?: boolean;
  readonly public?: boolean;
  readonly health_path?: string;
  readonly health_check?: boolean;
  readonly start_command?: string;
  readonly volume?: RailwayVolumeConfig;
  readonly replicas?: number;
};

export type RailwayPlatformConfig = {
  readonly project: string;
  readonly environment: string;
  readonly region: string;
  readonly service_prefix?: string;
  readonly replicas?: number;
  readonly cleanup_statuses?: readonly string[];
  readonly ghcr_credentials?: boolean;
};

export type GhcrServiceConfig = {
  readonly visibility?: "public" | "private";
};

export type ServiceKind = "railway" | "tunnel";

export type ServiceSpec = {
  readonly id: string;
  readonly kind?: ServiceKind;
  readonly hostname?: string;
  readonly internal?: boolean;
  readonly standalone?: boolean;
  readonly railway?: RailwayServiceConfig;
  readonly ghcr?: GhcrServiceConfig;
  readonly github_repo?: string;
  readonly source_code_url?: string;
  readonly dockerfile?: string;
  readonly build_context?: string;
  readonly image?: string;
  readonly port?: number;
  readonly health_check?: boolean;
  readonly health_path?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly secrets?: readonly SecretSpec[];
  readonly depends_on?: readonly string[];
};

export type VaultKvConfig = {
  readonly mount: string;
  readonly project: string;
  readonly configs: readonly string[];
};

export type VaultInitConfig = {
  readonly key_shares: number;
  readonly key_threshold: number;
  readonly keys_store?: string;
};

export type VaultUnsealConfig = {
  readonly on_deploy?: boolean;
};

export type VaultMountSpec = {
  readonly type: string;
  readonly path: string;
};

export type VaultPolicySpec = {
  readonly name: string;
  readonly file: string;
};

export type VaultJwtRoleSpec = {
  readonly name: string;
  readonly policy: string;
  readonly bound_repos?: readonly string[];
  readonly bound_ref?: string;
  readonly ttl?: string;
  readonly max_ttl?: string;
  readonly audience?: string;
};

export type VaultJwtAuthSpec = {
  readonly path: string;
  readonly roles: readonly VaultJwtRoleSpec[];
};

export type VaultUserpassUserSpec = {
  readonly username: string;
  readonly policy: string;
};

export type VaultUserpassAuthSpec = {
  readonly users: readonly VaultUserpassUserSpec[];
};

export type VaultAuthConfig = {
  readonly jwt?: VaultJwtAuthSpec;
  readonly userpass?: VaultUserpassAuthSpec;
};

export type VaultTokenSpec = {
  readonly name: string;
  readonly policy: string;
  readonly period: string;
  readonly sink: string;
};

export type VaultKvKeySpec = {
  readonly name: string;
  readonly configs: readonly string[];
  readonly used_by?: readonly string[];
  readonly required?: boolean;
};

export type VaultConfig = {
  readonly hostname?: string;
  readonly kv: VaultKvConfig;
  readonly init?: VaultInitConfig;
  readonly unseal?: VaultUnsealConfig;
  readonly mounts?: readonly VaultMountSpec[];
  readonly policies?: readonly VaultPolicySpec[];
  readonly auth?: VaultAuthConfig;
  readonly tokens?: readonly VaultTokenSpec[];
  readonly kv_keys?: readonly VaultKvKeySpec[];
  readonly readiness?: { readonly wait_unsealed?: boolean };
};

export type GithubSecretSpec = {
  readonly name: string;
} & SecretSource;

export type GithubConfig = {
  readonly org: string;
  readonly infra_repo: string;
  readonly skip_rollout_repos?: readonly string[];
  readonly org_secrets?: readonly GithubSecretSpec[];
  readonly repo_secrets?: readonly GithubSecretSpec[];
};

export type NeonProjectSpec = {
  readonly id: string;
  readonly neon_project_id?: string;
  readonly purpose: string;
  readonly secret_name: string;
  readonly migrations?: string;
};

export type NeonConfig = {
  readonly projects: readonly NeonProjectSpec[];
};

export type ObjectStoreSpec = {
  readonly id: string;
  readonly provider: "r2";
  readonly bucket?: string;
  readonly bucket_secret: string;
  readonly endpoint_secret: string;
  readonly region_secret: string;
  readonly access_key_secret: string;
  readonly secret_key_secret: string;
  readonly key_prefix: string;
  readonly namespaces?: readonly string[];
};

export type TunnelLocalSpec = {
  readonly host: string;
  readonly port: number;
};

export type TunnelSpec = {
  readonly id: string;
  readonly provider: "cloudflare";
  readonly name: string;
  readonly hostname: string;
  readonly local: TunnelLocalSpec;
  readonly secrets?: readonly string[];
};

export type DigitalOceanDestroySpec = {
  readonly droplet: string;
  readonly project: string;
  readonly purge_vault_keys?: readonly string[];
};

export type LegacyConfig = {
  readonly fly_destroy?: readonly string[];
  readonly digitalocean_destroy?: readonly DigitalOceanDestroySpec[];
};

/** Full desired-state document (services.yaml). */
export type InfraConfig = {
  readonly zone: string;
  readonly image_owner: string;
  readonly default_image_tag: string;
  readonly image_prefix?: string;
  /** @deprecated Prefer github.infra_repo */
  readonly infra_github_repo?: string;
  /** @deprecated Prefer github.skip_rollout_repos */
  readonly skip_rollout_repos?: readonly string[];
  readonly cloudflare?: CloudflareConfig;
  readonly railway: RailwayPlatformConfig;
  readonly github?: GithubConfig;
  readonly vault?: VaultConfig;
  readonly neon?: NeonConfig;
  readonly object_stores?: readonly ObjectStoreSpec[];
  readonly tunnels?: readonly TunnelSpec[];
  readonly legacy?: LegacyConfig;
  readonly aliases?: readonly AliasSpec[];
  readonly services: readonly ServiceSpec[];
};

/** @deprecated Alias — use InfraConfig */
export type ServicesConfig = InfraConfig;

/** Resource kinds known to the reconcile engine. */
export const RESOURCE_DURABILITY = {
  cloudflare_dns_record: "stateless",
  cloudflare_redirect_rule: "stateless",
  cloudflare_ssl_mode: "stateless",
  railway_custom_domain: "stateless",
  railway_variable: "stateless",
  railway_deployment_cleanup: "stateless",
  ghcr_visibility: "stateless",
  vault_policy: "stateless",
  vault_auth_config: "stateless",
  github_oidc_binding: "stateless",
  tunnel_dns_route: "stateless",
  railway_service: "stateful",
  railway_project: "stateful",
  railway_volume: "stateful",
  neon_database: "stateful",
  object_store_bucket: "stateful",
  vault_kv_data: "stateful",
  vault_seal_state: "stateful",
  cloudflare_tunnel: "stateful",
  legacy_fly_app: "stateful",
  legacy_digitalocean_droplet: "stateful",
} as const satisfies Record<string, ResourceDurability>;

export type ResourceKind = keyof typeof RESOURCE_DURABILITY;

export function durabilityOf(kind: ResourceKind): ResourceDurability {
  return RESOURCE_DURABILITY[kind];
}
