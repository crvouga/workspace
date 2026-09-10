.PHONY: gh sync-dns sync-dev-keys-to-prd seed-vault-token \
	cleanup-legacy-secret-path \
	check-object-storage \
	check-database-url clone-prod-db-to-dev \
	provision deploy destroy railway-sync-dns

gh:
	open "https://github.com/crvouga/workspace/actions/workflows/ci.yml"

provision:
	chmod +x scripts/railway-provision.sh
	./scripts/railway-provision.sh

deploy:
	chmod +x scripts/railway-provision.sh scripts/railway-deploy.sh
	./scripts/railway-provision.sh
	./scripts/railway-deploy.sh

destroy:
	chmod +x scripts/railway-destroy.sh
	./scripts/railway-destroy.sh

sync-dns: railway-sync-dns

railway-sync-dns:
	chmod +x scripts/railway-sync-dns.sh
	./scripts/railway-sync-dns.sh

sync-dev-keys-to-prd:
	./scripts/sync-dev-keys-to-prd.sh

cleanup-legacy-secret-path:
	./scripts/vault-run.sh -- ./scripts/cleanup-legacy-secret-path.sh

seed-vault-token:
	./scripts/seed-vault-token.sh

check-object-storage:
	./scripts/vault-run.sh -- ./scripts/check-object-storage-creds.sh

check-database-url:
	./scripts/vault-run.sh -- ./scripts/check-database-url-health.sh

clone-prod-db-to-dev:
	./scripts/vault-run.sh -- ./scripts/clone-prod-database-to-dev.sh
