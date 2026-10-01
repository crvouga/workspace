# The protected publisher was adopted through Mockingbird PR #243.
removed {
  from = github_repository_pull_request.publisher_migration
  lifecycle { destroy = true }
}
removed {
  from = github_repository_file.publisher_migration
  lifecycle { destroy = true }
}
removed {
  from = github_branch.publisher_migration
  lifecycle { destroy = true }
}
