/**
 * Black-box uptime tests for the cache server.
 *
 * These reproduce the outage of 2026-09: the periodic `VAULT_TOKEN` expired
 * because nothing renewed it, Vault then answered KV reads with HTTP 403, and
 * the boot manager latched that 403 as fatal — so the service stayed down even
 * after Vault was healthy again.
 *
 * Everything below drives real `Request`s through `createCacheRequestHandler`
 * and asserts only on `Response`s. Vault, the clock, and the timer are injected
 * fakes, so the suite is offline and deterministic: 40 days of uptime run in
 * milliseconds.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createLogger } from '@pkgs/logger';
import type { CacheServerEnv } from './config/env';
import type { VaultFetch } from './config/vault-fetch';
import { createCacheRequestHandler, type CacheServer } from './server';

const VAULT_ADDR = 'https://vault.test';
const RUNTIME_TOKEN = 'hvs.runtime';
const TURBO_TOKEN = 'turbo-secret';
const PERIOD_SECONDS = 768 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Matches RETRY_COOLDOWN_MS in cache/boot-manager.ts. */
const BOOT_RETRY_COOLDOWN_MS = 5_000;
/** 40 simulated days is ~160 renewals; without this the suite drowns in logs. */
const SILENT_LOG = createLogger({ name: 'turbo-cache-test', level: 'silent' });

const ENV: CacheServerEnv = {
  VAULT_TOKEN: RUNTIME_TOKEN,
  VAULT_ADDR,
  VAULT_PROJECT: 'personal',
  VAULT_CONFIG: 'prd',
  PORT: 8787,
};

/** The six keys loadCacheBootConfig requires. S3 is never contacted. */
const SECRETS: Record<string, string> = {
  TURBO_TOKEN,
  S3_ENDPOINT: 'https://s3.test',
  S3_REGION: 'auto',
  S3_ACCESS_KEY_ID: 'access-key',
  S3_SECRET_ACCESS_KEY: 'secret-key',
  S3_BUCKET: 'cache-bucket',
};

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type FakeClock = {
  now: () => number;
  setTimeoutFn: typeof setTimeout;
  /** Advances virtual time, running every timer that comes due along the way. */
  advance: (ms: number) => Promise<void>;
};

function createFakeClock(): FakeClock {
  const realSetTimeout = globalThis.setTimeout;
  let nowMs = Date.parse('2026-01-01T00:00:00.000Z');
  const queue: { at: number; fn: () => void }[] = [];

  // Lets an awaited renewal settle before virtual time moves on again.
  const flush = (): Promise<void> =>
    new Promise((resolve) => realSetTimeout(resolve, 0));

  const setTimeoutFn = ((fn: () => void, ms: number) => {
    queue.push({ at: nowMs + ms, fn });
    return { unref: () => undefined };
  }) as unknown as typeof setTimeout;

  async function advance(ms: number): Promise<void> {
    const target = nowMs + ms;
    for (;;) {
      queue.sort((a, b) => a.at - b.at);
      const next = queue[0];
      if (next === undefined || next.at > target) break;
      queue.shift();
      nowMs = next.at;
      next.fn();
      await flush();
    }
    nowMs = target;
  }

  return { now: () => nowMs, setTimeoutFn, advance };
}

type FakeVault = {
  fetchFn: VaultFetch;
  /** False once the period elapsed without a renewal — the original outage. */
  tokenValid: () => boolean;
  renewals: () => number;
  kvReads: () => number;
  /** Force KV reads to fail with an HTTP status; `null` restores normal service. */
  failKvWith: (status: number | null) => void;
  /** Make the next `count` renewal attempts fail transiently. */
  failRenewals: (count: number) => void;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createFakeVault(now: () => number): FakeVault {
  let expiresAtMs = now() + PERIOD_SECONDS * 1000;
  let kvFailStatus: number | null = null;
  let renewalFailuresLeft = 0;
  let renewals = 0;
  let kvReads = 0;

  const tokenValid = (): boolean => now() < expiresAtMs;

  const presented = (init?: RequestInit): string => {
    const headers = new Headers(init?.headers ?? {});
    return headers.get('X-Vault-Token') ?? '';
  };

  const authorized = (init?: RequestInit): boolean =>
    presented(init) === RUNTIME_TOKEN && tokenValid();

  const handleRenew = (init?: RequestInit): Response => {
    if (!authorized(init)) {
      return jsonResponse({ errors: ['permission denied'] }, 403);
    }
    if (renewalFailuresLeft > 0) {
      renewalFailuresLeft -= 1;
      return jsonResponse({ errors: ['temporarily unavailable'] }, 503);
    }
    expiresAtMs = now() + PERIOD_SECONDS * 1000;
    renewals += 1;
    return jsonResponse(
      { auth: { lease_duration: PERIOD_SECONDS, renewable: true } },
      200
    );
  };

  const handleKvRead = (init?: RequestInit): Response => {
    kvReads += 1;
    if (kvFailStatus !== null) {
      return jsonResponse({ errors: ['injected failure'] }, kvFailStatus);
    }
    if (!authorized(init)) {
      return jsonResponse({ errors: ['permission denied'] }, 403);
    }
    return jsonResponse({ data: { data: SECRETS } }, 200);
  };

  const fetchFn: VaultFetch = async (input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/v1/auth/token/renew-self') return handleRenew(init);
    if (pathname === '/v1/secret/data/personal/prd') return handleKvRead(init);
    return jsonResponse({ errors: ['no handler'] }, 404);
  };

  return {
    fetchFn,
    tokenValid,
    renewals: () => renewals,
    kvReads: () => kvReads,
    failKvWith: (status) => {
      kvFailStatus = status;
    },
    failRenewals: (count) => {
      renewalFailuresLeft = count;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const servers: CacheServer[] = [];

function startServerWith(clock: FakeClock, vault: FakeVault): CacheServer {
  const server = createCacheRequestHandler(ENV, {
    fetchFn: vault.fetchFn,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    logger: SILENT_LOG,
  });
  servers.push(server);
  return server;
}

/** Authenticated probe that exercises boot + bearer auth but no object store. */
function statusRequest(server: CacheServer): Promise<Response> {
  return server.fetch(
    new Request('https://cache.test/v8/artifacts/status', {
      headers: { Authorization: `Bearer ${TURBO_TOKEN}` },
    })
  );
}

afterEach(() => {
  while (servers.length > 0) servers.pop()?.stop();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cache server uptime', () => {
  test('the fake Vault expires an unrenewed token, as the real one did', async () => {
    const clock = createFakeClock();
    const vault = createFakeVault(clock.now);

    // No server, so nothing renews: exactly the pre-fix production situation.
    await clock.advance(40 * DAY_MS);

    expect(vault.tokenValid()).toBe(false);
    const server = startServerWith(clock, vault);
    const response = await statusRequest(server);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'cache misconfigured',
      reason: expect.stringContaining('403'),
    });
  });

  test('keeps serving past the token period because it renews itself', async () => {
    const clock = createFakeClock();
    const vault = createFakeVault(clock.now);
    const server = startServerWith(clock, vault);
    await server.start();

    expect((await statusRequest(server)).status).toBe(200);

    await clock.advance(40 * DAY_MS);

    expect(vault.tokenValid()).toBe(true);
    expect(vault.renewals()).toBeGreaterThan(1);
    expect((await statusRequest(server)).status).toBe(200);
  });

  test('a restart after the token period still boots', async () => {
    const clock = createFakeClock();
    const vault = createFakeVault(clock.now);
    const longRunning = startServerWith(clock, vault);
    await longRunning.start();
    await clock.advance(40 * DAY_MS);

    // Same env/token, fresh process — the deploy that used to come back dead.
    const restarted = startServerWith(clock, vault);
    expect((await statusRequest(restarted)).status).toBe(200);
  });

  test('recovers once Vault stops rejecting the token', async () => {
    const clock = createFakeClock();
    const vault = createFakeVault(clock.now);
    const server = startServerWith(clock, vault);

    vault.failKvWith(403);
    expect((await statusRequest(server)).status).toBe(503);

    vault.failKvWith(null);
    await clock.advance(BOOT_RETRY_COOLDOWN_MS + 1);

    expect((await statusRequest(server)).status).toBe(200);
  });

  test('retries boot at most once per cooldown while Vault is failing', async () => {
    const clock = createFakeClock();
    const vault = createFakeVault(clock.now);
    const server = startServerWith(clock, vault);
    vault.failKvWith(503);

    for (let i = 0; i < 5; i++) {
      expect((await statusRequest(server)).status).toBe(503);
    }

    expect(vault.kvReads()).toBe(1);
  });

  test('survives transient renewal failures', async () => {
    const clock = createFakeClock();
    const vault = createFakeVault(clock.now);
    const server = startServerWith(clock, vault);
    vault.failRenewals(3);
    await server.start();

    await clock.advance(40 * DAY_MS);

    expect(vault.tokenValid()).toBe(true);
    expect((await statusRequest(server)).status).toBe(200);
  });
});
