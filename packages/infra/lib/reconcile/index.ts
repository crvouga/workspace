import { assert } from "@pkgs/assert";
import { $ } from "bun";
import { join } from "node:path";
import { resolveProjectContext } from "../railway-api.js";
import { ensureRailwayToken } from "../railway-token.js";
import {
    cloudflareConfigOrDefault,
    fleetServices,
    type InfraConfig,
    loadServicesConfig,
    railwayEnvironmentName,
    railwayProjectName,
    railwayServiceName,
    railwayServices,
    resolveRedirectTarget,
} from "../services.js";
import {
    makeAction,
    type PlanAction,
    type ReconcileOptions,
    runPlan,
    statefulDestroyCommand,
} from "./plan.js";

async function runScript(
	script: string,
	args: readonly string[],
): Promise<void> {
	assert.nonEmptyString(script, "script must be non-empty");
	const cwd = join(import.meta.dirname, "..", "..");
	const result = await $`bun run ${script} ${[...args]}`.cwd(cwd).nothrow();
	if (result.exitCode !== 0) {
		throw new Error(
			`${script} failed (exit ${result.exitCode}): ${result.stderr.toString().trim()}`,
		);
	}
}

function phaseEnabled(options: ReconcileOptions, phase: string): boolean {
	if (options.phases.includes("all")) return true;
	return options.phases.some(
		(p) =>
			p === phase ||
			p
				.split(",")
				.map((s) => s.trim())
				.includes(phase),
	);
}

async function planRailwayStatefulDrift(
	config: InfraConfig,
	options: ReconcileOptions,
): Promise<PlanAction[]> {
	const actions: PlanAction[] = [];
	try {
		await ensureRailwayToken();
		const projectName = railwayProjectName(config);
		const environmentName = railwayEnvironmentName(config);
		const ctx = await resolveProjectContext(projectName, environmentName);
		const desired = new Set(
			(options.fleetOnly ? fleetServices(config) : railwayServices(config))
				.filter((s) => !options.idFilter || s.id === options.idFilter)
				.map((s) => railwayServiceName(config, s.id)),
		);
		for (const svc of ctx.project.services?.edges ?? []) {
			const name = svc.node.name;
			if (!name || desired.has(name)) continue;
			if (options.fleetOnly && name === "vault") continue;
			actions.push(
				makeAction({
					phase: "railway",
					kind: "railway_service",
					op: "warn",
					id: name,
					summary: `Railway service "${name}" exists but is not in services.yaml`,
					destroyHint: statefulDestroyCommand("railway", name),
					apply: async () => {},
				}),
			);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(
			`[warn] [railway] could not list services for drift check: ${msg}`,
		);
	}
	return actions;
}

async function planLegacyWarnings(config: InfraConfig): Promise<PlanAction[]> {
	const actions: PlanAction[] = [];
	for (const app of config.legacy?.fly_destroy ?? []) {
		actions.push(
			makeAction({
				phase: "legacy",
				kind: "legacy_fly_app",
				op: "warn",
				id: app,
				summary: `Legacy Fly app "${app}" is declared for manual destroy`,
				destroyHint: statefulDestroyCommand("legacy-fly", app),
				apply: async () => {},
			}),
		);
	}
	for (const droplet of config.legacy?.digitalocean_destroy ?? []) {
		actions.push(
			makeAction({
				phase: "legacy",
				kind: "legacy_digitalocean_droplet",
				op: "warn",
				id: droplet.droplet,
				summary: `Legacy DigitalOcean droplet "${droplet.droplet}" is declared for manual destroy`,
				destroyHint: statefulDestroyCommand(
					"legacy-digitalocean",
					droplet.droplet,
				),
				apply: async () => {},
			}),
		);
	}
	for (const tunnel of config.tunnels ?? []) {
		actions.push(
			makeAction({
				phase: "tunnels",
				kind: "cloudflare_tunnel",
				op: "noop",
				id: tunnel.id,
				summary: `Tunnel "${tunnel.name}" → ${tunnel.hostname} (ensure via packages/9router; destroy is manual)`,
				apply: async () => {},
			}),
		);
	}
	return actions;
}

async function planKvKeyValidation(config: InfraConfig): Promise<PlanAction[]> {
	const keys = config.vault?.kv_keys ?? [];
	if (keys.length === 0) return [];
	return [
		makeAction({
			phase: "kv_keys",
			kind: "vault_kv_data",
			op: "noop",
			id: "inventory",
			summary: `Declared ${keys.length} vault.kv_keys (never auto-deleted)`,
			apply: async () => {},
		}),
	];
}

async function planNeonAndObjectStores(
	config: InfraConfig,
): Promise<PlanAction[]> {
	const actions: PlanAction[] = [];
	for (const project of config.neon?.projects ?? []) {
		actions.push(
			makeAction({
				phase: "neon",
				kind: "neon_database",
				op: "noop",
				id: project.id,
				summary: `Neon project "${project.id}" → secret ${project.secret_name} (never auto-drop)`,
				apply: async () => {},
			}),
		);
	}
	for (const store of config.object_stores ?? []) {
		actions.push(
			makeAction({
				phase: "object_stores",
				kind: "object_store_bucket",
				op: "noop",
				id: store.id,
				summary: `Object store "${store.id}" (${store.provider}${store.bucket ? `, bucket ${store.bucket}` : ""}${store.key_prefix ? `, prefix ${store.key_prefix}` : ", app-owned prefixes"}) — never auto-delete bucket`,
				apply: async () => {},
			}),
		);
	}
	return actions;
}

async function planGithub(config: InfraConfig): Promise<PlanAction[]> {
	const actions: PlanAction[] = [];
	const gh = config.github;
	if (!gh) return actions;
	for (const secret of gh.repo_secrets ?? []) {
		actions.push(
			makeAction({
				phase: "github",
				kind: "github_oidc_binding",
				op: "noop",
				id: secret.name,
				summary: `GitHub repo secret "${secret.name}" (source=${secret.source})`,
				apply: async () => {},
			}),
		);
	}
	for (const secret of gh.org_secrets ?? []) {
		actions.push(
			makeAction({
				phase: "github",
				kind: "github_oidc_binding",
				op: "noop",
				id: `org:${secret.name}`,
				summary: `GitHub org secret "${secret.name}" on ${gh.org}`,
				apply: async () => {},
			}),
		);
	}
	for (const role of config.vault?.auth?.jwt?.roles ?? []) {
		actions.push(
			makeAction({
				phase: "vault",
				kind: "vault_auth_config",
				op: "noop",
				id: role.name,
				summary: `Vault JWT role "${role.name}" (policy=${role.policy})`,
				apply: async () => {},
			}),
		);
	}
	for (const policy of config.vault?.policies ?? []) {
		actions.push(
			makeAction({
				phase: "vault",
				kind: "vault_policy",
				op: "noop",
				id: policy.name,
				summary: `Vault policy "${policy.name}" ← ${policy.file}`,
				apply: async () => {},
			}),
		);
	}
	return actions;
}

export async function reconcile(options: ReconcileOptions): Promise<void> {
	assert.record(options, "reconcile options must be a record");
	const config = loadServicesConfig();
	const mode = options.apply ? "APPLY" : "DRY-RUN";
	console.log(`Reconcile (${mode}) phases=${options.phases.join(",")}`);

	const plan: PlanAction[] = [];

	if (phaseEnabled(options, "github") || phaseEnabled(options, "vault")) {
		plan.push(...(await planGithub(config)));
	}
	if (phaseEnabled(options, "neon") || phaseEnabled(options, "object_stores")) {
		plan.push(...(await planNeonAndObjectStores(config)));
	}
	if (phaseEnabled(options, "railway")) {
		plan.push(...(await planRailwayStatefulDrift(config, options)));
	}
	if (phaseEnabled(options, "legacy") || phaseEnabled(options, "tunnels")) {
		plan.push(...(await planLegacyWarnings(config)));
	}
	if (phaseEnabled(options, "kv_keys")) {
		plan.push(...(await planKvKeyValidation(config)));
	}

	const cf = cloudflareConfigOrDefault(config);
	if (phaseEnabled(options, "dns")) {
		for (const redirect of cf.redirects ?? []) {
			const to = resolveRedirectTarget(config, redirect);
			plan.push(
				makeAction({
					phase: "dns",
					kind: "cloudflare_redirect_rule",
					op: "noop",
					id: redirect.from,
					summary: `Redirect ${redirect.from} → ${to}`,
					apply: async () => {},
				}),
			);
		}
	}

	const { applied, warned } = await runPlan(plan, { apply: options.apply });

	const scriptArgs: string[] = [];
	if (options.apply) scriptArgs.push("--apply");
	if (options.fleetOnly) scriptArgs.push("--fleet-only");
	if (options.idFilter) {
		scriptArgs.push("--id", options.idFilter);
	}

	if (phaseEnabled(options, "railway")) {
		console.log("\n=== phase railway (provision) ===");
		await runScript("scripts/provision-railway.ts", scriptArgs);
		if (options.apply) {
			console.log("\n=== phase railway (secrets) ===");
			const secretArgs = options.idFilter ? ["--id", options.idFilter] : [];
			await runScript("scripts/sync-railway-secrets.ts", secretArgs);
		}
	}

	if (phaseEnabled(options, "ghcr") || phaseEnabled(options, "railway")) {
		console.log("\n=== phase ghcr ===");
		const ghcrArgs = options.apply ? [] : ["--dry-run"];
		await runScript("scripts/make-ghcr-public.ts", ghcrArgs);
	}

	if (phaseEnabled(options, "dns")) {
		console.log("\n=== phase dns ===");
		await runScript("scripts/sync-dns.ts", options.apply ? ["--apply"] : []);
		await runScript(
			"scripts/sync-redirects.ts",
			options.apply ? ["--apply"] : [],
		);
		await runScript(
			"scripts/sync-aliases.ts",
			options.apply ? ["--apply"] : [],
		);
	}

	console.log(
		`\nReconcile finished: plan_applied=${applied} stateful_warnings=${warned}`,
	);
}

export async function destroyStateful(input: {
	readonly kind: string;
	readonly id: string;
	readonly acknowledged: boolean;
}): Promise<void> {
	assert.nonEmptyString(input.kind, "destroy kind must be non-empty");
	assert.nonEmptyString(input.id, "destroy id must be non-empty");
	if (!input.acknowledged) {
		throw new Error(
			`Refusing stateful destroy of ${input.kind}/${input.id}. Re-run with --i-understand-stateful`,
		);
	}
	console.warn(
		`STATEFUL DESTROY: ${input.kind} "${input.id}" — irreversible for data-bearing resources.`,
	);

	if (input.kind === "railway") {
		await runScript("scripts/destroy-railway.ts", [
			"--id",
			input.id,
			"--apply",
		]);
		return;
	}
	if (input.kind === "legacy-fly") {
		await runScript("scripts/destroy-fly.ts", ["--apply"]);
		return;
	}
	if (input.kind === "legacy-digitalocean") {
		await runScript("scripts/destroy-digitalocean.ts", ["--apply"]);
		return;
	}
	throw new Error(
		`Unknown destroy kind "${input.kind}". Supported: railway, legacy-fly, legacy-digitalocean`,
	);
}

export type { ReconcileOptions } from "./plan.js";
