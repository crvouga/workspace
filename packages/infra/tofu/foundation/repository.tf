locals {
  merge_gate = local.config.github.pr_ready
  pr_rule    = one([for rule in local.merge_gate.ruleset.rules : rule.parameters if rule.type == "pull_request"])
  check_rule = one([for rule in local.merge_gate.ruleset.rules : rule.parameters if rule.type == "required_status_checks"])
}

resource "github_repository" "workspace" {
  name                        = split("/", local.config.github.infra_repo)[1]
  description                 = local.merge_gate.repo_settings.description
  homepage_url                = local.merge_gate.repo_settings.homepage
  visibility                  = local.merge_gate.repo_settings.visibility
  archived                    = local.merge_gate.repo_settings.archived
  topics                      = local.merge_gate.repo_settings.topics
  has_issues                  = local.merge_gate.repo_settings.has_issues
  has_projects                = local.merge_gate.repo_settings.has_projects
  has_wiki                    = local.merge_gate.repo_settings.has_wiki
  has_discussions             = local.merge_gate.repo_settings.has_discussions
  is_template                 = local.merge_gate.repo_settings.is_template
  web_commit_signoff_required = local.merge_gate.repo_settings.web_commit_signoff_required
  allow_forking               = local.merge_gate.repo_settings.allow_forking
  merge_commit_title          = local.merge_gate.repo_settings.merge_commit_title
  merge_commit_message        = local.merge_gate.repo_settings.merge_commit_message
  allow_merge_commit          = local.merge_gate.repo_settings.allow_merge_commit
  allow_squash_merge          = local.merge_gate.repo_settings.allow_squash_merge
  allow_rebase_merge          = local.merge_gate.repo_settings.allow_rebase_merge
  allow_auto_merge            = local.merge_gate.repo_settings.allow_auto_merge
  allow_update_branch         = local.merge_gate.repo_settings.allow_update_branch
  delete_branch_on_merge      = local.merge_gate.repo_settings.delete_branch_on_merge
  security_and_analysis {
    secret_scanning {
      status = local.merge_gate.repo_settings.security_and_analysis.secret_scanning.status
    }
    secret_scanning_push_protection {
      status = local.merge_gate.repo_settings.security_and_analysis.secret_scanning_push_protection.status
    }
    secret_scanning_non_provider_patterns {
      status = local.merge_gate.repo_settings.security_and_analysis.secret_scanning_non_provider_patterns.status
    }
  }
  lifecycle { prevent_destroy = true }
}

resource "github_actions_repository_permissions" "workspace" {
  repository           = github_repository.workspace.name
  enabled              = local.merge_gate.actions.enabled
  allowed_actions      = local.merge_gate.actions.allowed_actions
  sha_pinning_required = local.merge_gate.actions.sha_pinning_required
}

resource "github_workflow_repository_permissions" "workspace" {
  repository                       = github_repository.workspace.name
  default_workflow_permissions     = local.merge_gate.actions.default_workflow_permissions
  can_approve_pull_request_reviews = local.merge_gate.actions.can_approve_pull_request_reviews
}

# GitHub represents disabled vulnerability alerts as a 404, so there is no
# provider resource to import. The first reviewed apply creates the resource by
# enabling alerts; subsequent plans detect drift normally.
resource "github_repository_vulnerability_alerts" "workspace" {
  repository = github_repository.workspace.name
  enabled    = local.merge_gate.security.vulnerability_alerts
}

resource "github_repository_dependabot_security_updates" "workspace" {
  repository = github_repository.workspace.name
  enabled    = local.merge_gate.security.dependabot_security_updates
  depends_on = [github_repository_vulnerability_alerts.workspace]
}

resource "github_repository_collaborators" "workspace" {
  repository = github_repository.workspace.name
  dynamic "user" {
    for_each = { for collaborator in local.merge_gate.collaborators : collaborator.username => collaborator }
    content {
      username   = user.value.username
      permission = user.value.permission
    }
  }
}

resource "github_issue_labels" "workspace" {
  repository = github_repository.workspace.name
  dynamic "label" {
    for_each = { for label in local.merge_gate.labels : label.name => label }
    content {
      name        = label.value.name
      color       = label.value.color
      description = label.value.description
    }
  }
}

resource "github_branch_default" "main" {
  repository = github_repository.workspace.name
  branch     = local.merge_gate.repo_settings.default_branch
}
resource "github_repository_ruleset" "main" {
  repository  = github_repository.workspace.name
  name        = local.merge_gate.ruleset.name
  target      = local.merge_gate.ruleset.target
  enforcement = local.merge_gate.ruleset.enforcement
  conditions {
    ref_name {
      include = local.merge_gate.ruleset.conditions.ref_name.include
      exclude = local.merge_gate.ruleset.conditions.ref_name.exclude
    }
  }
  rules {
    deletion         = true
    non_fast_forward = true
    pull_request {
      allowed_merge_methods             = local.pr_rule.allowed_merge_methods
      dismiss_stale_reviews_on_push     = local.pr_rule.dismiss_stale_reviews_on_push
      require_code_owner_review         = local.pr_rule.require_code_owner_review
      require_last_push_approval        = local.pr_rule.require_last_push_approval
      required_approving_review_count   = local.pr_rule.required_approving_review_count
      required_review_thread_resolution = local.pr_rule.required_review_thread_resolution
    }
    required_status_checks {
      strict_required_status_checks_policy = local.check_rule.strict_required_status_checks_policy
      dynamic "required_check" {
        for_each = local.check_rule.required_status_checks
        content {
          context        = required_check.value.context
          integration_id = required_check.value.integration_id
        }
      }
    }
  }
}

import {
  to = github_repository.workspace
  id = "workspace"
}
import {
  to = github_branch_default.main
  id = "workspace"
}
import {
  to = github_repository_ruleset.main
  id = "workspace:23686210"
}
import {
  to = github_actions_repository_permissions.workspace
  id = "workspace"
}
import {
  to = github_workflow_repository_permissions.workspace
  id = "workspace"
}
import {
  to = github_repository_collaborators.workspace
  id = "workspace"
}
import {
  to = github_issue_labels.workspace
  id = "workspace"
}
import {
  to = github_repository_dependabot_security_updates.workspace
  id = "workspace"
}
