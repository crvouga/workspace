provider "railway" { token = var.railway_token }
provider "graphql" {
  url     = "https://backboard.railway.app/graphql/v2"
  headers = { Authorization = "Bearer ${var.railway_token}" }
}
provider "cloudflare" { api_token = var.cloudflare_api_token }
provider "github" {
  owner = "crvouga"
  token = var.github_token
}
provider "neon" { api_key = var.neon_api_key }

provider "atlas" {}
