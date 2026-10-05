mock_provider "railway" {
  mock_resource "railway_project" {
    defaults = {
      id = "12345678-1234-4234-8234-123456789012"
    }
  }
  mock_resource "railway_service" {
    defaults = { id = "12345678-1234-4234-8234-123456789014" }
  }
}
mock_provider "graphql" {}
mock_provider "cloudflare" {
  mock_resource "cloudflare_zone" {
    defaults = { id = "83db052d18159889dd290724ac7d52d9" }
  }
  mock_data "cloudflare_api_token_permission_groups_list" {
    defaults = { result = [{ id = "r2-write-permission", name = "Workers R2 Storage Bucket Item Write", scopes = [] }] }
  }
}
mock_provider "github" {}
mock_provider "neon" {}
mock_provider "atlas" {}
mock_provider "time" {}
mock_provider "random" {}

# The service module has its own tests. The Railway mock cannot synthesize
# the computed ID inside the configured default_environment object.
override_module {
  target  = module.vault_service
  outputs = { id = "12345678-1234-4234-8234-123456789014" }
}

variables {
  railway_token         = "test-railway-token"
  cloudflare_api_token  = "test-cloudflare-token"
  github_token          = "test-github-token"
  cloudflare_zone_id    = "test-zone-id"
  cloudflare_account_id = "test-account-id"
  neon_api_key          = "test-neon-key"
  state_access_key      = "test-state-key"
  state_secret_key      = "test-state-secret"
  vault_inputs = jsonencode({
    secrets = { prd = {
      DOCKER_USERNAME               = "test-docker-user"
      DOCKER_PASSWORD               = "test-docker-password"
      DOPPLER_SERVICE_TOKEN         = "test-doppler-token"
      GENEBYGENE_CLIENT_ID          = "test-genebygene-id"
      GENEBYGENE_CLIENT_SECRET      = "test-genebygene-secret"
      MOCKINGBIRD_JUNCTION_API_KEY  = "test-junction-key"
      PADDLE_API_KEY                = "test-paddle-key"
      MOCKINGBIRD_STRIPE_SECRET_KEY = "test-stripe-key"
    } }
    admin_passwords = {}
  })
}

run "complete_adoption_plan" {
  command = plan
  assert {
    condition     = neon_project.openbao.allowed_ips == null
    error_message = "An unrestricted Neon project must omit the optional allowlist, rather than supply an invalid empty list."
  }
  assert {
    condition     = length(github_repository_file.publish) == 14
    error_message = "Foundation adoption must preserve a publisher for every application repository."
  }
}

run "missing_secret_blocks_adoption" {
  command = plan
  variables {
    vault_inputs = jsonencode({ secrets = { prd = {} }, admin_passwords = {} })
  }
  expect_failures = [github_actions_secret.repository]
}

run "empty_secret_blocks_adoption" {
  command = plan
  variables {
    vault_inputs = jsonencode({ secrets = { prd = { DOCKER_PASSWORD = "  " } }, admin_passwords = {} })
  }
  expect_failures = [github_actions_secret.repository]
}
