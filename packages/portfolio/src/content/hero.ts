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
  availability: 'Open to work',
  ctaPrimary: {
    label: 'Email',
  },
};
