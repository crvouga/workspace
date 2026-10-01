removed {
  from = vault_auth_backend.retired_oidc
  lifecycle { destroy = true }
}

removed {
  from = vault_mount.retired_smoke
  lifecycle { destroy = true }
}
