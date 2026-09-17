/** Injection seam for Vault HTTP calls; production passes `globalThis.fetch`. */
export type VaultFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
