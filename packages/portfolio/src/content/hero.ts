import type { Topic } from './topic';

export const MONOGRAM_INITIALS = 'CV';

export const LOCATION = 'Phoenix, AZ';

/** Hero panel stack line; every entry appears in at least one PROJECTS entry. */
export const CORE_STACK: readonly Topic[] = [
  'typescript',
  'react',
  'nodejs',
  'postgres',
  'aws',
  'docker',
];

export const HERO = {
  name: 'Chris Vouga',
  eyebrow: '// senior software engineer · phoenix, az',
  /**
   * Ownership, domain and scale first. "I use coding agents" is table stakes in
   * 2026, so it cannot be the lead claim — and stated as tooling it reads as a
   * volume claim. The second line makes it an engineering claim instead.
   */
  statement:
    'I own production systems end-to-end — data model, API, infrastructure, and the interface on top. Six years building enterprise education platforms at ASU scale, now shipping health software at Geviti.',
  statementSecondary:
    'I build the review gates, typed contracts, and infrastructure-as-code that make coding agents safe to run — the harness, not just the tooling.',
  /** A level and a shape screen better than a bare availability signal. */
  availability:
    'Available now · senior/staff full-stack or platform · Phoenix or remote',
  ctaPrimary: {
    label: 'Email',
  },
  /** Label for the secondary copy-to-clipboard control beside the address. */
  ctaCopyLabel: 'Copy',
};
