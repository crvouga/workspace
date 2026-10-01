module "inventory" { source = "../modules/inventory" }
locals {
  config     = module.inventory.config
  vault      = one([for service in local.config.services : service if service.id == "vault"])
  vault_addr = "https://${local.config.vault.hostname}"
}

resource "cloudflare_zone" "primary" {
  account = { id = var.cloudflare_account_id }
  name    = local.config.zone
  type    = "full"
  lifecycle { prevent_destroy = true }
}

resource "railway_project" "workspace" {
  name                = local.config.railway.project
  default_environment = { name = local.config.railway.environment }
  lifecycle { prevent_destroy = true }
}

resource "neon_project" "openbao" {
  name                      = one(local.config.neon.projects).name
  region_id                 = one(local.config.neon.projects).region_id
  pg_version                = one(local.config.neon.projects).pg_version
  history_retention_seconds = one(local.config.neon.projects).history_retention_seconds
  branch {
    name          = one(local.config.neon.projects).branch.name
    database_name = one(local.config.neon.projects).branch.database_name
    role_name     = one(local.config.neon.projects).branch.role_name
  }
  lifecycle { prevent_destroy = true }
}

resource "cloudflare_dns_record" "additional" {
  for_each = local.config.cloudflare.dns.records
  zone_id  = cloudflare_zone.primary.id
  name     = each.value.name
  type     = each.value.type
  content  = each.value.content
  ttl      = each.value.ttl
  proxied  = each.value.proxied
  priority = try(each.value.priority, null)
  lifecycle { prevent_destroy = true }
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "additional" {
  for_each   = local.config.cloudflare.additional_tunnels
  account_id = var.cloudflare_account_id
  name       = each.value.name
  config_src = "cloudflare"
  lifecycle { prevent_destroy = true }
}
resource "cloudflare_zero_trust_tunnel_cloudflared_config" "additional" {
  for_each   = local.config.cloudflare.additional_tunnels
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.additional[each.key].id
  config     = each.value.config
}

module "vault_service" {
  source         = "../modules/railway-service"
  project_id     = railway_project.workspace.id
  environment_id = railway_project.workspace.default_environment.id
  zone_id        = cloudflare_zone.primary.id
  region         = local.config.railway.region
  service        = local.vault
  image          = "ghcr.io/${local.config.image_owner}/${local.config.image_prefix}-vault:${var.vault_image_tag}"
  depends_on     = [atlas_schema.openbao]
  variables = {
    DB_CONNECTION_URI = neon_project.openbao.connection_uri
    BAO_API_ADDR      = local.vault_addr
    PORT              = local.vault.env.PORT
  }
}

# Railway's provider returns when a redeploy is queued. Let the new OpenBao
# process start before the next root checks its seal and submits shares.
resource "time_sleep" "vault_start" {
  create_duration = "90s"
  triggers = {
    image    = var.vault_image_tag
    service  = sha256(jsonencode(local.vault))
    database = sha256(neon_project.openbao.connection_uri)
  }
  depends_on = [module.vault_service]
}

resource "cloudflare_zone_setting" "ssl" {
  zone_id    = cloudflare_zone.primary.id
  setting_id = "ssl"
  value      = local.config.cloudflare.ssl_mode
}

resource "cloudflare_r2_bucket" "shared" {
  for_each   = { for store in local.config.object_stores : store.id => store }
  account_id = var.cloudflare_account_id
  name       = each.value.bucket
  lifecycle { prevent_destroy = true }
}

data "cloudflare_api_token_permission_groups_list" "r2" {
  name = "Workers R2 Storage Bucket Item Write"
}
resource "cloudflare_account_token" "r2" {
  account_id = var.cloudflare_account_id
  name       = "workspace-object-store"
  policies = [{
    effect            = "allow"
    permission_groups = [{ id = one(data.cloudflare_api_token_permission_groups_list.r2.result).id }]
    resources = jsonencode({ for bucket in cloudflare_r2_bucket.shared :
      "com.cloudflare.edge.r2.bucket.${var.cloudflare_account_id}_default_${bucket.name}" => "*"
    })
  }]
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "router" {
  account_id = var.cloudflare_account_id
  name       = one(local.config.tunnels).name
  lifecycle { prevent_destroy = true }
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "router" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.router.id
  config = {
    ingress = [
      { hostname = one(local.config.tunnels).hostname, service = "http://${one(local.config.tunnels).local.host}:${one(local.config.tunnels).local.port}" },
      { service = "http_status:404" }
    ]
  }
}

resource "cloudflare_dns_record" "router" {
  zone_id = cloudflare_zone.primary.id
  name    = one(local.config.tunnels).hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.router.id}.cfargotunnel.com"
  ttl     = 1
  proxied = true
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "router" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.router.id
}

locals {
  bootstrap_secrets = {
    RAILWAY_TOKEN         = var.railway_token
    CF_API_TOKEN          = var.cloudflare_api_token
    DB_CONNECTION_URI     = neon_project.openbao.connection_uri
    NEON_API_KEY          = var.neon_api_key
    TOFU_STATE_PASSPHRASE = var.state_passphrase
    TOFU_STATE_ACCESS_KEY = var.state_access_key
    TOFU_STATE_SECRET_KEY = var.state_secret_key
    TOFU_VAULT_INPUTS     = var.vault_inputs
  }
}
resource "github_actions_secret" "bootstrap" {
  for_each = toset(["RAILWAY_TOKEN", "CF_API_TOKEN", "DB_CONNECTION_URI", "NEON_API_KEY", "TOFU_STATE_PASSPHRASE", "TOFU_STATE_ACCESS_KEY", "TOFU_STATE_SECRET_KEY", "TOFU_VAULT_INPUTS"])
  # The secret values are sensitive; the addresses are public, stable names.
  repository      = split("/", local.config.github.infra_repo)[1]
  secret_name     = each.key
  plaintext_value = local.bootstrap_secrets[each.key]
}

resource "github_actions_variable" "account" {
  repository    = split("/", local.config.github.infra_repo)[1]
  variable_name = "CLOUDFLARE_ACCOUNT_ID"
  value         = var.cloudflare_account_id
}
resource "github_actions_variable" "zone" {
  repository    = split("/", local.config.github.infra_repo)[1]
  variable_name = "CLOUDFLARE_ZONE_ID"
  value         = cloudflare_zone.primary.id
}
resource "github_actions_variable" "migration_ready" {
  repository    = split("/", local.config.github.infra_repo)[1]
  variable_name = "TOFU_MIGRATION_READY"
  value         = tostring(var.migration_ready)
}

# crvouga is a personal account, so distribute the dispatch credential to the
# actual repositories instead of attempting to create organization secrets.
resource "github_actions_secret" "dispatch" {
  for_each        = toset([for service in local.config.services : split("/", service.github_repo)[1] if try(service.github_repo, null) != null])
  repository      = each.key
  secret_name     = "DEPLOY_DISPATCH_TOKEN"
  plaintext_value = var.github_token
}

resource "cloudflare_dns_record" "redirect" {
  zone_id = cloudflare_zone.primary.id
  name    = local.config.zone
  type    = "A"
  content = local.config.cloudflare.placeholder_ipv4
  ttl     = 1
  proxied = true
}

resource "cloudflare_ruleset" "redirects" {
  zone_id = cloudflare_zone.primary.id
  name    = local.config.cloudflare.redirect_ruleset_name
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"
  rules = [for redirect in local.config.cloudflare.redirects : {
    action      = "redirect"
    expression  = "(http.host eq \"${redirect.from}\")"
    description = "Redirect ${redirect.from}"
    enabled     = true
    action_parameters = {
      from_value = {
        status_code           = redirect.status
        preserve_query_string = true
        target_url = {
          expression = "concat(\"https://${one([for service in local.config.services : service.hostname if service.id == redirect.to_service])}\", http.request.uri.path)"
        }
      }
    }
  }]
}

output "project_id" { value = railway_project.workspace.id }
output "zone_id" { value = cloudflare_zone.primary.id }
output "environment_id" { value = railway_project.workspace.default_environment.id }
output "vault_addr" { value = local.vault_addr }
output "buckets" { value = { for key, bucket in cloudflare_r2_bucket.shared : key => bucket.name } }
output "router_token" {
  value     = data.cloudflare_zero_trust_tunnel_cloudflared_token.router.token
  sensitive = true
}
output "r2_access_key_id" {
  value     = cloudflare_account_token.r2.id
  sensitive = true
}
output "r2_secret_access_key" {
  value     = sha256(cloudflare_account_token.r2.value)
  sensitive = true
}
output "vault_image_tag" { value = var.vault_image_tag }
