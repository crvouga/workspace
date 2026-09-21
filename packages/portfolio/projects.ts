/**
 * Single source of truth for portfolio content.
 *
 *   PROJECTS[] feeds the website, resume, and screenshots.
 *   Runtime hosting for side projects lives in packages/infra/services.yaml.
 *
 * Adding a hosted side project:
 *   - Add the service in packages/infra/services.yaml and its project repo.
 *   - Append a Project to src/content/projects/entries-part-2.ts with display
 *     fields and `deployment.url`.
 */
import type { Project } from './src/content/projects/types';
import { PROJECT_ENTRIES_PART_1 } from './src/content/projects/entries-part-1';
import { PROJECT_ENTRIES_PART_2 } from './src/content/projects/entries-part-2';
import { PROJECT_ENTRIES_ARCHIVE } from './src/content/projects/entries-archive';

export type {
  Code,
  Deployment,
  Project,
  ResumePolicy,
} from './src/content/projects/types';

export const projectToLinkHref = (project: Project): string | null => {
  if (project.deployment.t === 'public') return project.deployment.url;
  if (project.code.t === 'public') return project.code.url;
  return null;
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const PROJECTS: readonly Project[] = [
  ...PROJECT_ENTRIES_PART_1,
  ...PROJECT_ENTRIES_PART_2,
];

/**
 * Early and small work, kept out of `PROJECTS` so it never dilutes the curated
 * listing, the Toolbox, the screenshot jobs or the resume. `/projects/` renders
 * it behind a fold so nothing built is ever actually lost.
 */
export const ARCHIVE_PROJECTS: readonly Project[] = PROJECT_ENTRIES_ARCHIVE;
