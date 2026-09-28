/**
 * "How I build" — stated as an engineering claim, not a tooling one.
 *
 * Timelessness rules: no years, no tool-count bragging, nothing that reads as
 * hype. The claims must still be true if a specific tool disappears — which is
 * also why the section is about the gates rather than the agent. "I use coding
 * agents" is table stakes and says nothing; "I built what makes them safe to
 * run" is a claim about judgment, and it is checkable.
 */

export const AGENTIC_CURSOR_BADGE = 'Recognized by Cursor';
export const AGENTIC_CURSOR_TEXT =
  'Cursor recognized me as one of their top tab users and shipped a custom tab button as a gift. Fun, and a volume stat — the gates below are the part that matters.';

export const AGENTIC_WORKFLOW_TITLE = 'Agents draft. The gates decide.';

export const AGENTIC_WORKFLOW_POINTS: readonly string[] = [
  'Types that actually constrain: <code>strict</code>, plus <code>noUncheckedIndexedAccess</code> and <code>exactOptionalPropertyTypes</code> — the two that catch what generated code gets wrong most.',
  'Structural limits enforced as errors, not warnings: caps on file length, function length, parameters, and cyclomatic complexity, with a standing rule that they may never be disabled to make a change fit.',
  'Invariant tests over unit tests: assertions that the content model is coherent — every asset path resolves, every cross-reference points at something real — because that is the class of error a fast contributor actually introduces.',
  'Infrastructure, CI, and deploys are code: a reconcile loop plans and converges environments on push, and is forbidden from deleting anything stateful.',
  'I own the outcome end-to-end — data model, API, infrastructure, interface. Agents remove the repeatable parts. When something wrong ships, it is mine.',
];
