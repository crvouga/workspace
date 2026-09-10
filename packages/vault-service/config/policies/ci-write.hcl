# CI write access for GitHub Actions (node SSH credential updates / KV patch).
path "secret/data/personal/prd" {
  capabilities = ["create", "update", "patch", "read"]
}

path "secret/metadata/personal/prd" {
  capabilities = ["read", "list"]
}
