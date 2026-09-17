import { describe, expect, test } from 'bun:test';
import { renewIntervalMs, VaultTokenRenewer } from './token-renewer';

describe('renewIntervalMs', () => {
  test('renews at half the ttl', () => {
    expect(renewIntervalMs(4 * 3600)).toBe(2 * 3600 * 1000);
  });

  test('clamps short ttls to the minimum interval', () => {
    expect(renewIntervalMs(10)).toBe(60_000);
  });

  test('clamps long ttls to the maximum interval', () => {
    expect(renewIntervalMs(768 * 3600)).toBe(6 * 3600 * 1000);
  });

  test('treats a zero ttl as the fallback', () => {
    expect(renewIntervalMs(0)).toBe(1800 * 1000);
  });
});

describe('VaultTokenRenewer', () => {
  test('renews once on start and schedules the next renewal', async () => {
    const calls: string[] = [];
    const scheduled: number[] = [];
    const renewer = new VaultTokenRenewer({
      token: 'hvs.test',
      addr: 'https://vault.example.com/',
      fetchFn: async (input) => {
        calls.push(String(input));
        return new Response(
          JSON.stringify({ auth: { lease_duration: 7200, renewable: true } }),
          { status: 200 }
        );
      },
      setTimeoutFn: ((_fn: () => void, ms: number) => {
        scheduled.push(ms);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout,
    });

    await renewer.start();

    expect(calls).toEqual([
      'https://vault.example.com/v1/auth/token/renew-self',
    ]);
    expect(scheduled).toEqual([3600 * 1000]);
  });

  test('retries after a failed renewal instead of giving up', async () => {
    const scheduled: number[] = [];
    const renewer = new VaultTokenRenewer({
      token: 'hvs.test',
      fetchFn: async () => new Response('permission denied', { status: 403 }),
      setTimeoutFn: ((_fn: () => void, ms: number) => {
        scheduled.push(ms);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout,
    });

    await renewer.start();

    expect(scheduled).toEqual([5 * 60 * 1000]);
  });

  test('stops looping for a non-renewable token', async () => {
    const scheduled: number[] = [];
    const renewer = new VaultTokenRenewer({
      token: 'hvs.root',
      fetchFn: async () =>
        new Response(
          JSON.stringify({ auth: { lease_duration: 0, renewable: false } }),
          { status: 200 }
        ),
      setTimeoutFn: ((_fn: () => void, ms: number) => {
        scheduled.push(ms);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout,
    });

    await renewer.start();

    expect(scheduled).toEqual([]);
  });
});
