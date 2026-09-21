/**
 * Topic → skill-category mapping shared by the site Toolbox and the resume
 * generator, so both artifacts describe the same stack.
 */
import { TOPIC_TO_NAME, type Topic } from './topic';

const TOPIC_CATEGORY: Partial<
  Record<Topic, 'Languages' | 'Frontend' | 'Backend' | 'Data' | 'Cloud & Infra'>
> = {
  // Languages
  typescript: 'Languages',
  javascript: 'Languages',
  python: 'Languages',
  rust: 'Languages',
  go: 'Languages',
  php: 'Languages',
  html: 'Languages',
  css: 'Languages',
  elm: 'Languages',
  roc: 'Languages',
  // Frontend
  react: 'Frontend',
  'react-native': 'Frontend',
  nextjs: 'Frontend',
  vue: 'Frontend',
  nuxt: 'Frontend',
  tailwind: 'Frontend',
  redux: 'Frontend',
  'redux-saga': 'Frontend',
  'react-query': 'Frontend',
  'material-ui': 'Frontend',
  bootstrap: 'Frontend',
  greensock: 'Frontend',
  rxjs: 'Frontend',
  alphinejs: 'Frontend',
  htmx: 'Frontend',
  datastar: 'Frontend',
  gridsome: 'Frontend',
  // Backend
  nodejs: 'Backend',
  bun: 'Backend',
  express: 'Backend',
  flask: 'Backend',
  graphene: 'Backend',
  graphql: 'Backend',
  trpc: 'Backend',
  websocket: 'Backend',
  'socket-io': 'Backend',
  zod: 'Backend',
  // Data
  postgres: 'Data',
  mongodb: 'Data',
  mysql: 'Data',
  dynamodb: 'Data',
  sqlite: 'Data',
  firebase: 'Data',
  supabase: 'Data',
  neo4j: 'Data',
  // Cloud & infra
  aws: 'Cloud & Infra',
  s3: 'Cloud & Infra',
  vercel: 'Cloud & Infra',
  heroku: 'Cloud & Infra',
  docker: 'Cloud & Infra',
  // Skipped on purpose: shopify, sanity, drupal, salesforce, jest, puppeteer, ramda
};

const CATEGORY_ORDER: readonly string[] = [
  'Languages',
  'Frontend',
  'Backend',
  'Data',
  'Cloud & Infra',
];

export type SkillRow = {
  readonly category: string;
  readonly items: readonly string[];
};

/** Buckets topic keys into display-ready category rows, in {@link CATEGORY_ORDER}. */
export function buildSkillRows(topics: readonly string[]): SkillRow[] {
  const buckets = new Map<string, Set<string>>();
  for (const topic of topics) {
    const cat = TOPIC_CATEGORY[topic as Topic];
    if (!cat) continue;
    const display = TOPIC_TO_NAME[topic as Topic] ?? topic;
    if (!buckets.has(cat)) buckets.set(cat, new Set());
    buckets.get(cat)?.add(display);
  }
  const rows: SkillRow[] = [];
  for (const cat of CATEGORY_ORDER) {
    const set = buckets.get(cat);
    if (!set || set.size === 0) continue;
    rows.push({
      category: cat,
      items: [...set].sort((a, b) => a.localeCompare(b)),
    });
  }
  return rows;
}
