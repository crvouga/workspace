/**
 * CLI stdout sink for the portfolio generator.
 *
 * This package is a static-site generator whose stdout *is* its interface, and
 * the workspace ESLint config bans bare `console.*` outside @pkgs/logger — so
 * every human-readable line goes through here instead.
 */
export const writeLine = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
