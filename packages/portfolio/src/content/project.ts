import type { Topic } from './topic';
import type {
  Code as _Code,
  Deployment as _Deployment,
  Project as _Project,
} from '../../projects';
import {
  ARCHIVE_PROJECTS as _ARCHIVE_PROJECTS,
  PROJECTS as _PROJECTS,
} from '../../projects';

export type Code = _Code;
export type Deployment = _Deployment;
export type Project = Omit<_Project, 'topics'> & { readonly topics: Topic[] };

export { projectToLinkHref } from '../../projects';

export const PROJECTS = _PROJECTS as readonly Project[];

export const ARCHIVE_PROJECTS = _ARCHIVE_PROJECTS as readonly Project[];
