module "inventory" { source = "../modules/inventory" }
locals { vault_addr = "https://${module.inventory.config.vault.hostname}" }

provider "vaultoperator" { vault_addr = local.vault_addr }
provider "restapi" {
  uri                  = local.vault_addr
  write_returns_object = true
  timeout              = 30
  retries {
    max_retries = 12
    min_wait    = 2
    max_wait    = 10
  }
}

resource "vaultoperator_init" "vault" {
  secret_shares    = module.inventory.config.vault.init.key_shares
  secret_threshold = module.inventory.config.vault.init.key_threshold
  lifecycle { prevent_destroy = true }
}

# These are provider-managed resources, not a script running operator commands.
# Only sealed state is compared: OpenBao never echoes the submitted key.
# The explicit chain submits Shamir shares serially, including during updates.
resource "restapi_object" "unseal_1" {
  path              = "/v1/sys/unseal"
  create_method     = "PUT"
  update_method     = "PUT"
  update_path       = "/v1/sys/unseal"
  read_path         = "/v1/sys/seal-status"
  object_id         = "share-1"
  data              = jsonencode({ key = vaultoperator_init.vault.keys_base64[0], sealed = false })
  ignore_changes_to = ["key", "type", "initialized", "t", "n", "progress", "nonce", "version", "build_date", "commit_date", "migration", "cluster_name", "cluster_id", "recovery_seal", "storage_type", "hcp_link_status", "removed_from_cluster"]
  lifecycle { prevent_destroy = true }
}
resource "restapi_object" "unseal_2" {
  path              = "/v1/sys/unseal"
  create_method     = "PUT"
  update_method     = "PUT"
  update_path       = "/v1/sys/unseal"
  read_path         = "/v1/sys/seal-status"
  object_id         = "share-2"
  data              = jsonencode({ key = vaultoperator_init.vault.keys_base64[1], sealed = false })
  ignore_changes_to = ["key", "type", "initialized", "t", "n", "progress", "nonce", "version", "build_date", "commit_date", "migration", "cluster_name", "cluster_id", "recovery_seal", "storage_type", "hcp_link_status", "removed_from_cluster"]
  depends_on        = [restapi_object.unseal_1]
  lifecycle { prevent_destroy = true }
}
resource "restapi_object" "unseal_3" {
  path              = "/v1/sys/unseal"
  create_method     = "PUT"
  update_method     = "PUT"
  update_path       = "/v1/sys/unseal"
  read_path         = "/v1/sys/seal-status"
  object_id         = "share-3"
  data              = jsonencode({ key = vaultoperator_init.vault.keys_base64[2], sealed = false })
  ignore_changes_to = ["key", "type", "initialized", "t", "n", "progress", "nonce", "version", "build_date", "commit_date", "migration", "cluster_name", "cluster_id", "recovery_seal", "storage_type", "hcp_link_status", "removed_from_cluster"]
  depends_on        = [restapi_object.unseal_2]
  lifecycle { prevent_destroy = true }
}

output "root_token" {
  value     = vaultoperator_init.vault.root_token
  sensitive = true
}
