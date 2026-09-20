/** Failure taxonomy for the GitHub proof fetch; every code names its fix. */

export type GitHubInsightsErrorCode =
  | 'missing-token'
  | 'request-failed'
  | 'api-error'
  | 'invalid-response'
  | 'empty-calendar';

export class GitHubInsightsError extends Error {
  readonly code: GitHubInsightsErrorCode;

  constructor(code: GitHubInsightsErrorCode, message: string) {
    super(message);
    this.name = 'GitHubInsightsError';
    this.code = code;
  }
}

export const ENV_TOKEN_KEY = 'PORTFOLIO_GITHUB_TOKEN';

export const VAULT_PATH = 'secret/data/personal/{dev|prd}';

export const MISSING_TOKEN_MESSAGE = `${ENV_TOKEN_KEY} is required. Expected ${VAULT_PATH} → ${ENV_TOKEN_KEY}. Locally run: vault run --config dev -- bun run --filter @pkgs/portfolio build. GitHub contribution access also requires read:user.`;

export const REMEDIATION = `Verify ${ENV_TOKEN_KEY} in ${VAULT_PATH}.`;

export const SCOPE_REMEDIATION = `${ENV_TOKEN_KEY} must be a user token with read:user access; verify the account's contribution visibility and the ${VAULT_PATH} secret.`;

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
