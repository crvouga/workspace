run "fleet_contract" {
  command = plan
  assert {
    condition     = length(output.config.services) == 19
    error_message = "The migration must retain all 18 Railway services and the 9router tunnel."
  }
  assert {
    condition     = length(distinct([for service in output.config.services : service.id])) == length(output.config.services)
    error_message = "Service addresses must be unique."
  }
  assert {
    condition     = alltrue([for service in output.config.services : endswith(service.hostname, output.config.zone)])
    error_message = "Every hosted service must have a hostname in the managed zone."
  }
  assert {
    condition     = toset([for store in output.config.object_stores : store.bucket]) == toset(["crvouga-development", "crvouga-production"])
    error_message = "Keep the existing shared buckets and their contents."
  }
  assert {
    condition     = output.config.vault.init.key_threshold == 2 && output.config.vault.init.key_shares == 3
    error_message = "Preserve the existing Shamir seal parameters."
  }
}
