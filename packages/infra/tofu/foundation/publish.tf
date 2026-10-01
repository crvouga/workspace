data "github_repository" "app" {
  for_each = toset([for service in local.config.services : service.github_repo
    if try(service.kind, "railway") == "railway" && service.github_repo != local.config.github.infra_repo
  ])
  full_name = each.key
}

resource "github_repository_file" "publish" {
  for_each            = data.github_repository.app
  repository          = each.value.name
  branch              = each.value.default_branch
  file                = ".github/workflows/publish.yml"
  overwrite_on_create = true
  commit_message      = "ci: manage image publishing with OpenTofu [skip ci]"
  lifecycle { ignore_changes = [commit_message, overwrite_on_create] }
  content = templatefile("${path.module}/../modules/inventory/publish.yml.tftpl", {
    branch       = each.value.default_branch
    infra_repo   = local.config.github.infra_repo
    image_owner  = local.config.image_owner
    image_prefix = local.config.image_prefix
    services = [for service in local.config.services : merge(service, { job_name = replace(service.id, "-", "_") })
      if try(service.github_repo, null) == each.key
    ]
  })
}
