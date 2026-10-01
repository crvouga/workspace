removed {
  from = github_actions_secret.retired
  lifecycle { destroy = true }
}

removed {
  from = github_repository_file.retired_publisher
  lifecycle { destroy = true }
}
