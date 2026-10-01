/**
 * Merge-gate commands for `pr-ready`: repository merge settings and the trunk
 * ruleset. One canonical definition each, read from OpenTofu for checks only.
 */
import {
  MERGE_GATE,
  ALLOWED_MERGE_METHODS,
  CommandError,
  EXIT,
  LEGACY_RULESET_NAMES,
  REQUIRED_CHECK_CONTEXTS,
  RULESET_NAME,
  TRUNK_BRANCH,
  gh,
  ok,
  parseJson,
  type Flags,
  type Json,
  type Outcome,
} from './lib';

export type Drift = { path: string; expected: unknown; actual: unknown };

export async function repoSlug(): Promise<string> {
  return gh(
    'repo',
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    'is `gh auth status` ok?'
  );
}

/**
 * Compares only the fields present in `expected` (the API returns extras).
 * Arrays must match in length; their elements are compared the same way.
 */
export function diffSubset(
  expected: unknown,
  actual: unknown,
  path = ''
): Drift[] {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return [{ path, expected, actual }];
    }
    return expected.flatMap((item, i) =>
      diffSubset(item, actual[i], `${path}[${i}]`)
    );
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object')
      return [{ path, expected, actual }];
    const actualRecord = actual as Json;
    return Object.entries(expected as Json).flatMap(([key, value]) =>
      diffSubset(value, actualRecord[key], path ? `${path}.${key}` : key)
    );
  }
  return Object.is(expected, actual) ? [] : [{ path, expected, actual }];
}

// ---------------------------------------------------------------------------
// repo
// ---------------------------------------------------------------------------

export const DESIRED_REPO_SETTINGS = MERGE_GATE.repo_settings;

async function repoDrift(slug: string): Promise<Drift[]> {
  const actual = parseJson<Json>(
    'repo',
    await gh('repo', ['api', `repos/${slug}`])
  );
  return diffSubset(DESIRED_REPO_SETTINGS, actual);
}

export async function repoCommand(flags: Flags): Promise<Outcome> {
  const slug = await repoSlug();
  const drift = await repoDrift(slug);
  const body = { repo: slug, drift, desired: DESIRED_REPO_SETTINGS };
  if (drift.length === 0) return ok(body);
  return ok(
    {
      step: 'repo',
      ...body,
      hint: 'Review and apply the OpenTofu foundation plan.',
    },
    EXIT.fail
  );
}

// ---------------------------------------------------------------------------
// ruleset
// ---------------------------------------------------------------------------

export const DESIRED_RULESET = MERGE_GATE.ruleset;

type RulesetSummary = { id: number; name: string };
type Rule = { type: string; parameters?: Json };
type Ruleset = RulesetSummary & Json & { rules?: Rule[] };

async function listRulesets(slug: string): Promise<RulesetSummary[]> {
  const out = await gh('ruleset', [
    'api',
    `repos/${slug}/rulesets?includes_parents=false`,
  ]);
  return parseJson<RulesetSummary[]>('ruleset', out);
}

async function getRuleset(slug: string, id: number): Promise<Ruleset> {
  return parseJson<Ruleset>(
    'ruleset',
    await gh('ruleset', ['api', `repos/${slug}/rulesets/${id}`])
  );
}

export async function findRuleset(slug: string): Promise<Ruleset | null> {
  const summary = (await listRulesets(slug)).find(
    (ruleset) => ruleset.name === RULESET_NAME
  );
  return summary ? getRuleset(slug, summary.id) : null;
}

/** Drift for the live ruleset; rules are matched by `type`. */
export function rulesetDrift(live: Ruleset | null): {
  drift: Drift[];
  unexpectedRules: string[];
} {
  if (!live)
    return {
      drift: [{ path: '', expected: RULESET_NAME, actual: null }],
      unexpectedRules: [],
    };
  const { rules: desiredRules, ...desiredTop } = DESIRED_RULESET;
  const liveRules = live.rules ?? [];
  const drift = diffSubset(desiredTop, live);
  for (const rule of desiredRules) {
    const match = liveRules.find((candidate) => candidate.type === rule.type);
    drift.push(...diffSubset(rule, match ?? null, `rules[${rule.type}]`));
  }
  const known = new Set(desiredRules.map((rule) => rule.type));
  const unexpectedRules = liveRules
    .map((rule) => rule.type)
    .filter((type) => !known.has(type));
  return { drift, unexpectedRules };
}

export async function rulesetCommand(flags: Flags): Promise<Outcome> {
  const slug = await repoSlug();
  const live = await findRuleset(slug);
  const legacy = (await listRulesets(slug)).filter((ruleset) =>
    LEGACY_RULESET_NAMES.includes(ruleset.name)
  );
  const { drift, unexpectedRules } = rulesetDrift(live);
  const body = {
    repo: slug,
    ruleset: live ? { id: live.id, name: live.name } : null,
    drift,
    unexpectedRules,
    legacy,
  };
  if (drift.length + unexpectedRules.length + body.legacy.length === 0)
    return ok(body);
  return ok(
    {
      step: 'ruleset',
      ...body,
      hint: 'Review and apply the OpenTofu foundation plan.',
    },
    EXIT.fail
  );
}

/** Required contexts from the live ruleset, falling back to the constant. */
export async function requiredContexts(): Promise<{
  contexts: string[];
  source: string;
}> {
  try {
    const live = await findRuleset(await repoSlug());
    const rule = live?.rules?.find(
      (candidate) => candidate.type === 'required_status_checks'
    );
    const checks = (rule?.parameters?.required_status_checks ?? []) as {
      context: string;
    }[];
    if (checks.length > 0)
      return {
        contexts: checks.map((check) => check.context),
        source: 'ruleset',
      };
  } catch {
    // Fall through: status must still work without ruleset read access.
  }
  return { contexts: [...REQUIRED_CHECK_CONTEXTS], source: 'constant' };
}
