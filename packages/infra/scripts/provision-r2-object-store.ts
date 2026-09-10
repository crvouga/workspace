#!/usr/bin/env bun
/**
 * Provision shared Cloudflare R2 buckets and seed Vault S3_* secrets.
 *
 * Steps:
 *   1. Create R2 buckets `crvouga-development` + `crvouga-production` (idempotent)
 *   2. Patch Vault secret/personal/{dev,prd} with S3_* (+ polymorphic aliases);
 *      S3_BUCKET is config-specific (development vs production)
 *   3. Delete legacy object-store keys if still present
 *
 * Prerequisites:
 *   - vault CLI authenticated with **write** access (admin userpass login —
 *     do not wrap this script in `vault run`, which injects a read-only VAULT_TOKEN)
 *   - CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (Account R2: Edit) in env
 *   - S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY in env (R2 API token)
 *
 * Usage:
 *   bun run provision-r2
 *   bun run provision-r2 -- --dry-run
 *   bun run provision-r2 -- --skip-bucket
 */
import { assert } from "@pkgs/assert";
import {
	loadServicesConfig,
	vaultAddr as vaultAddrFromConfig,
} from "../lib/services.js";
import {
	resolveVaultAddr,
	vaultKvCliPath,
	vaultKvDeleteKeysCli,
	vaultKvPatchCli,
} from "../lib/vault-kv.js";

/** Shared R2 buckets — one per Vault config. Apps namespace keys inside the bucket. */
export const SHARED_R2_BUCKETS = {
	dev: "crvouga-development",
	prd: "crvouga-production",
} as const;

const CONFIGS = ["dev", "prd"] as const;

/** Pre-R2 / bespoke-bucket Vault key names to remove after cutover. */
const LEGACY_OBJECT_STORE_KEYS_TO_DELETE = [
	"B2_S3_ENDPOINT",
	"B2_S3_REGION",
	"B2_S3_ACCESS_KEY_ID",
	"B2_S3_SECRET_ACCESS_KEY",
	"B2_BUCKET",
	"B2_MASTER_KEY_ID",
	"B2_MASTER_KEY",
	"B2_MASTER_KEY_NAME",
	"B2_APP_KEY",
	"B2_APP_KEY_ID",
	"B2_APP_KEY_NAME",
] as const;

type Args = {
	dryRun: boolean;
	skipBucket: boolean;
	vaultAddr: string;
};

function readRequiredEnv(key: string): string {
	assert.nonEmptyString(key, "env key must be non-empty");
	const value = process.env[key]?.trim() ?? "";
	if (value.length === 0) {
		throw new Error(`${key} is required in the environment`);
	}
	return value;
}

function readOptionalEnv(key: string): string | null {
	assert.nonEmptyString(key, "env key must be non-empty");
	const value = process.env[key]?.trim() ?? "";
	return value.length > 0 ? value : null;
}

function parseArgs(argv: readonly string[]): Args {
	assert.ok(Array.isArray(argv), "argv must be an array");
	let dryRun = false;
	let skipBucket = false;
	let vaultAddrArg = resolveVaultAddr(vaultAddrFromConfig(loadServicesConfig()));
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--dry-run") dryRun = true;
		else if (arg === "--skip-bucket") skipBucket = true;
		else if (arg === "--vault-addr") {
			const next = argv[++i];
			assert.nonEmptyString(next, "--vault-addr requires a value");
			vaultAddrArg = resolveVaultAddr(next);
		} else if (arg === "--help" || arg === "-h") {
			console.log(`Usage: bun run provision-r2 [--dry-run] [--skip-bucket]

Creates shared R2 buckets and seeds S3_* Vault secrets (dev + prd).

Buckets:
  dev → ${SHARED_R2_BUCKETS.dev}
  prd → ${SHARED_R2_BUCKETS.prd}

Required env:
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN   (Account R2: Edit)
  S3_ACCESS_KEY_ID       (R2 API token access key)
  S3_SECRET_ACCESS_KEY   (R2 API token secret)

Optional env:
  S3_ENDPOINT            (default: https://<ACCOUNT_ID>.r2.cloudflarestorage.com)
  S3_REGION              (default: auto)
`);
			process.exit(0);
		} else {
			console.error(`Unknown argument: ${arg}`);
			process.exit(2);
		}
	}
	return { dryRun, skipBucket, vaultAddr: vaultAddrArg };
}

async function ensureR2Bucket(
	accountId: string,
	apiToken: string,
	bucket: string,
	dryRun: boolean,
): Promise<void> {
	assert.nonEmptyString(accountId, "accountId required");
	assert.nonEmptyString(apiToken, "apiToken required");
	assert.nonEmptyString(bucket, "bucket required");

	const listUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucket)}`;
	const getRes = await fetch(listUrl, {
		headers: { Authorization: `Bearer ${apiToken}` },
	});
	if (getRes.ok) {
		console.log(`R2 bucket already exists: ${bucket}`);
		return;
	}
	if (getRes.status !== 404) {
		const text = await getRes.text();
		throw new Error(
			`Cloudflare GET bucket failed (${String(getRes.status)}): ${text}`,
		);
	}

	if (dryRun) {
		console.log(`[dry-run] would create R2 bucket: ${bucket}`);
		return;
	}

	const createRes = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name: bucket }),
		},
	);
	if (!createRes.ok) {
		const text = await createRes.text();
		throw new Error(
			`Cloudflare create bucket failed (${String(createRes.status)}): ${text}`,
		);
	}
	console.log(`Created R2 bucket: ${bucket}`);
}

function buildS3Fields(input: {
	accountId: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
}): Record<string, string> {
	const endpoint =
		readOptionalEnv("S3_ENDPOINT") ??
		`https://${input.accountId}.r2.cloudflarestorage.com`;
	const region = readOptionalEnv("S3_REGION") ?? "auto";
	return {
		S3_ENDPOINT: endpoint,
		S3_REGION: region,
		S3_ACCESS_KEY_ID: input.accessKeyId,
		S3_SECRET_ACCESS_KEY: input.secretAccessKey,
		S3_BUCKET: input.bucket,
		S3_ACCESS_KEY: input.accessKeyId,
		S3_SECRET_KEY: input.secretAccessKey,
	};
}

async function seedConfig(
	config: (typeof CONFIGS)[number],
	fields: Record<string, string>,
	vaultAddr: string,
	dryRun: boolean,
): Promise<void> {
	const cliPath = vaultKvCliPath(config);
	console.log(`==> Vault ${cliPath} (S3_BUCKET=${fields.S3_BUCKET})`);

	if (dryRun) {
		console.log(`[dry-run] would patch keys: ${Object.keys(fields).join(", ")}`);
		console.log(`[dry-run] would delete legacy object-store keys if present`);
		return;
	}

	await vaultKvPatchCli(fields, cliPath, vaultAddr);

	const existing = await vaultKvGetCliForConfig(config, vaultAddr);
	const toDelete = LEGACY_OBJECT_STORE_KEYS_TO_DELETE.filter((k) => k in existing);
	if (toDelete.length > 0) {
		await vaultKvDeleteKeysCli(toDelete, cliPath, vaultAddr);
		console.log(`  deleted legacy keys: ${toDelete.join(", ")}`);
	} else {
		console.log("  no legacy object-store keys to delete");
	}
	console.log(`  seeded S3_* (+ aliases)`);
}

async function vaultKvGetCliForConfig(
	config: string,
	vaultAddr: string,
): Promise<Record<string, string>> {
	const { $ } = await import("bun");
	const cliPath = vaultKvCliPath(config);
	const result = await $`vault kv get -format=json ${cliPath}`
		.env({ ...process.env, VAULT_ADDR: vaultAddr })
		.quiet()
		.nothrow();
	if (result.exitCode !== 0) {
		const detail =
			result.stderr.toString().trim() || result.stdout.toString().trim();
		throw new Error(`vault kv get ${cliPath} failed: ${detail}`);
	}
	const body = JSON.parse(result.stdout.toString()) as {
		data?: { data?: Record<string, string> };
	};
	return body.data?.data ?? {};
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const accountId = readRequiredEnv("CLOUDFLARE_ACCOUNT_ID");
	const apiToken = readRequiredEnv("CLOUDFLARE_API_TOKEN");
	const accessKeyId = readRequiredEnv("S3_ACCESS_KEY_ID");
	const secretAccessKey = readRequiredEnv("S3_SECRET_ACCESS_KEY");

	const buckets = Object.values(SHARED_R2_BUCKETS);
	console.log(
		`Provision shared R2 buckets (${buckets.join(", ")}, dryRun=${String(args.dryRun)})`,
	);

	if (!args.skipBucket) {
		for (const bucket of buckets) {
			await ensureR2Bucket(accountId, apiToken, bucket, args.dryRun);
		}
	} else {
		console.log("Skipping R2 bucket create (--skip-bucket)");
	}

	for (const config of CONFIGS) {
		const bucket = SHARED_R2_BUCKETS[config];
		const fields = buildS3Fields({
			accountId,
			bucket,
			accessKeyId,
			secretAccessKey,
		});
		await seedConfig(config, fields, args.vaultAddr, args.dryRun);
	}

	console.log("");
	console.log("Done. Next: vault run --config dev -- bun run check:vault-secrets");
}

await main();
