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
  eyebrow: '// software engineer · phoenix, az',
  statement:
    'I build and ship production software end-to-end — APIs, infrastructure, and interfaces — with an AI-native, agentic workflow.',
  availability: 'Open to work · full-time or contract',
  ctaPrimary: {
    label: 'Email',
  },
  /**
   * The Email button copies rather than opening a mail client (see
   * layouts/Base.astro). Saying so up front stops the copy from reading as a
   * dead button.
   */
  ctaNote: 'or use the Email button to copy it',
};
