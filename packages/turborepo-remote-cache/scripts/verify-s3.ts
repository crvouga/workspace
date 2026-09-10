import { assert } from '@pkgs/assert';
import { CACHE_OBJECT_STORE_NAMESPACE } from '@pkgs/turborepo-remote-cache/config/object-store-namespace';
import { createS3ObjectStore } from '@pkgs/object-store/create-s3-object-store';
import type { ObjectStoreS3ConnectionConfig } from '@pkgs/object-store/impl-s3';

import { VaultSecretKey } from './vault-secrets-registry';

function readRequiredEnv(key: string): string | null {
  assert.nonEmptyString(key, 'readRequiredEnv requires key');
  const value = process.env[key]?.trim() ?? '';
  return value.length > 0 ? value : null;
}

export function readS3ConfigFromEnv(): ObjectStoreS3ConnectionConfig | null {
  assert.nonEmptyString(
    CACHE_OBJECT_STORE_NAMESPACE,
    'object store namespace must be non-empty'
  );
  const endpoint = readRequiredEnv(VaultSecretKey.s3Endpoint);
  const region = readRequiredEnv(VaultSecretKey.s3Region);
  const accessKeyId = readRequiredEnv(VaultSecretKey.s3AccessKeyId);
  const secretAccessKey = readRequiredEnv(VaultSecretKey.s3SecretAccessKey);
  const bucket = readRequiredEnv(VaultSecretKey.s3Bucket);

  if (
    endpoint === null ||
    region === null ||
    accessKeyId === null ||
    secretAccessKey === null ||
    bucket === null
  ) {
    return null;
  }

  return { endpoint, region, accessKeyId, secretAccessKey, bucket };
}

const S3_CREDENTIAL_HINT =
  'Create a Cloudflare R2 API token with Object Read & Write on the cache bucket, then set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in Vault dev and prd (bun run provision-r2).';

function formatS3ProbeError(message: string, bucket: string): string {
  assert.nonEmptyString(message, 'formatS3ProbeError requires message');
  assert.nonEmptyString(bucket, 'formatS3ProbeError requires bucket');
  if (
    message.includes('403') ||
    message.includes('401') ||
    message.includes('Signature')
  ) {
    return (
      `S3 credentials rejected for bucket "${bucket}" (${message}).\n` +
      S3_CREDENTIAL_HINT
    );
  }
  return `S3 probe failed for bucket "${bucket}": ${message}`;
}

/**
 * Writes and reads a tiny probe object via the S3-compatible API (Cloudflare R2).
 * Returns an error message when credentials or bucket access are invalid.
 */
export async function verifyS3Credentials(): Promise<string | null> {
  const config = readS3ConfigFromEnv();
  if (config === null) {
    return 'S3 env vars are missing (S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET).';
  }
  assert.nonEmptyString(config.bucket, 'S3 bucket must be non-empty');
  assert.nonEmptyString(config.endpoint, 'S3 endpoint must be non-empty');

  const store = createS3ObjectStore(config, CACHE_OBJECT_STORE_NAMESPACE);
  assert.defined(store, 'verifyS3Credentials requires object store');
  const probeKey = `credential-probe-${String(Date.now())}`;
  const probeBytes = new Uint8Array([0x53, 0x4d, 0x4b]); // "SMK"
  assert.nonEmptyString(probeKey, 'probe key must be non-empty');
  assert.instanceOf(probeBytes, Uint8Array, 'probe bytes must be bytes');

  try {
    await store.put(probeKey, probeBytes, 'application/octet-stream');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return formatS3ProbeError(message, config.bucket);
  }

  try {
    const exists = await store.head(probeKey);
    if (!exists) {
      return `S3 put succeeded but HEAD ${probeKey} returned false (bucket "${config.bucket}").`;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return formatS3ProbeError(message, config.bucket);
  }

  try {
    const stored = await store.get(probeKey);
    if (stored === null) {
      return `S3 HEAD succeeded but GET ${probeKey} returned null (bucket "${config.bucket}").`;
    }
    const reader = stored.body.getReader();
    const chunk = await reader.read();
    await reader.cancel();
    if (chunk.done || chunk.value === undefined) {
      return `S3 GET ${probeKey} returned empty body (bucket "${config.bucket}").`;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return formatS3ProbeError(message, config.bucket);
  }

  return null;
}
