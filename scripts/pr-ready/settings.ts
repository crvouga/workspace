/**
 * Merge-gate commands for `pr-ready`: repository merge settings and the trunk
 * ruleset. One canonical definition each, used for both check and `--apply`.
 */
import {
  ACTIONS_INTEGRATION_ID,
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
  run,
  type Flags,
  type Json,
  type Outcome,
} from './lib';

const ADMIN_HINT = 'repo settings writes require admin';

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

export const DESIRED_REPO_SETTINGS = {
  default_branch: TRUNK_BRANCH,
  allow_merge_commit: ALLOWED_MERGE_METHODS.includes('merge'),
  allow_squash_merge: ALLOWED_MERGE_METHODS.includes('squash'),
  allow_rebase_merge: ALLOWED_MERGE_METHODS.includes('rebase'),
  allow_auto_merge: true,
  allow_update_branch: true,
  delete_branch_on_merge: true,
} as const;

async function repoDrift(slug: string): Promise<Drift[]> {
  const actual = parseJson<Json>(
    'repo',
    await gh('repo', ['api', `repos/${slug}`])
  );
  return diffSubset(DESIRED_REPO_SETTINGS, actual);
}

export async function repoCommand(flags: Flags): Promise<Outcome> {
  const slug = await repoSlug();
  const apply = flags.booleans.has('apply');
  let applied = false;
  if (apply && (await repoDrift(slug)).length > 0) {
    await patchJson(
      'repo-apply',
      `repos/${slug}`,
      'PATCH',
      DESIRED_REPO_SETTINGS
    );
    applied = true;
  }
  const drift = await repoDrift(slug);
  const body = { repo: slug, applied, drift, desired: DESIRED_REPO_SETTINGS };
  if (drift.length === 0) return ok(body);
  return ok(
    { step: 'repo', ...body, hint: apply ? ADMIN_HINT : 'run `repo --apply`' },
    EXIT.fail
  );
}

async function patchJson(
  step: string,
  path: string,
  method: string,
  payload: unknown
): Promise<Json> {
  const result = await run(['gh', 'api', '-X', method, path, '--input', '-'], {
    stdin: JSON.stringify(payload),
  });
  if (result.code !== 0) {
    throw new CommandError({ step, output: result.output, hint: ADMIN_HINT });
  }
  return result.stdout.trim() ? parseJson<Json>(step, result.stdout) : {};
}

// ---------------------------------------------------------------------------
// ruleset
// ---------------------------------------------------------------------------

export const DESIRED_RULESET = {
  name: RULESET_NAME,
  target: 'branch',
  enforcement: 'active',
  bypass_actors: [],
  conditions: {
    ref_name: { include: [`refs/heads/${TRUNK_BRANCH}`], exclude: [] },
  },
  rules: [
    {
      type: 'pull_request',
      parameters: {
        allowed_merge_methods: [...ALLOWED_MERGE_METHODS],
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_approving_review_count: 0,
        required_review_thread_resolution: true,
      },
    },
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: REQUIRED_CHECK_CONTEXTS.map((context) => ({
          context,
          integration_id: ACTIONS_INTEGRATION_ID,
        })),
      },
    },
    { type: 'deletion' },
    { type: 'non_fast_forward' },
  ],
};

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

async function applyRuleset(slug: string, live: Ruleset | null): Promise<void> {
  if (live)
    await patchJson(
      'ruleset-apply',
      `repos/${slug}/rulesets/${live.id}`,
      'PUT',
      DESIRED_RULESET
    );
  else
    await patchJson(
      'ruleset-apply',
      `repos/${slug}/rulesets`,
      'POST',
      DESIRED_RULESET
    );
  const legacy = (await listRulesets(slug)).filter((ruleset) =>
    LEGACY_RULESET_NAMES.includes(ruleset.name)
  );
  for (const ruleset of legacy) {
    await patchJson(
      'ruleset-delete-legacy',
      `repos/${slug}/rulesets/${ruleset.id}`,
      'DELETE',
      {}
    );
  }
}

export async function rulesetCommand(flags: Flags): Promise<Outcome> {
  const slug = await repoSlug();
  const apply = flags.booleans.has('apply');
  let live = await findRuleset(slug);
  const before = rulesetDrift(live);
  const legacy = (await listRulesets(slug)).filter((ruleset) =>
    LEGACY_RULESET_NAMES.includes(ruleset.name)
  );
  const needsApply =
    before.drift.length + before.unexpectedRules.length + legacy.length > 0;
  if (apply && needsApply) {
    await applyRuleset(slug, live);
    live = await findRuleset(slug);
  }
  const { drift, unexpectedRules } = rulesetDrift(live);
  const body = {
    repo: slug,
    ruleset: live ? { id: live.id, name: live.name } : null,
    applied: apply && needsApply,
    drift,
    unexpectedRules,
    legacy: apply ? [] : legacy,
  };
  if (drift.length + unexpectedRules.length + body.legacy.length === 0)
    return ok(body);
  return ok(
    {
      step: 'ruleset',
      ...body,
      hint: apply ? ADMIN_HINT : 'run `ruleset --apply`',
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
