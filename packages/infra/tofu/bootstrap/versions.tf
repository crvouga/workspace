terraform {
  required_version = "~> 1.13.0"
  required_providers {
    vaultoperator = { source = "rickardgranberg/vaultoperator", version = "= 0.1.11" }
    restapi       = { source = "Mastercard/restapi", version = "= 3.0.0" }
  }
  backend "s3" {}
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
    remote_state_data_sources {
      default { method = method.aes_gcm.state }
    }
  }
}
