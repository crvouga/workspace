terraform {
  required_version = "~> 1.13.0"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "= 5.26.0" }
  }
  encryption {
    key_provider "pbkdf2" "state" { passphrase = var.state_passphrase }
    method "aes_gcm" "state" { keys = key_provider.pbkdf2.state }
    state {
      method   = method.aes_gcm.state
      enforced = true
    }
    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}

variable "state_passphrase" {
  type      = string
  sensitive = true
}
variable "cloudflare_account_id" { type = string }
variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}
provider "cloudflare" { api_token = var.cloudflare_api_token }
resource "cloudflare_r2_bucket" "state" {
  account_id = var.cloudflare_account_id
  name       = "crvouga-tofu-state"
  lifecycle { prevent_destroy = true }
}

output "bucket" { value = cloudflare_r2_bucket.state.name }

data "cloudflare_api_token_permission_groups_list" "objects" {
  name = "Workers R2 Storage Bucket Item Write"
}
resource "cloudflare_account_token" "state" {
  account_id = var.cloudflare_account_id
  name       = "workspace-opentofu-state"
  policies = [{
    effect            = "allow"
    permission_groups = [{ id = one(data.cloudflare_api_token_permission_groups_list.objects.result).id }]
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.cloudflare_account_id}_default_${cloudflare_r2_bucket.state.name}" = "*"
    })
  }]
}
output "access_key_id" {
  value     = cloudflare_account_token.state.id
  sensitive = true
}
output "secret_access_key" {
  value     = sha256(cloudflare_account_token.state.value)
  sensitive = true
}
