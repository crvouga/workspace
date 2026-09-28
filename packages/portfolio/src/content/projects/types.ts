import type { Topic } from '../topic';

export type Code = { t: 'private' } | { t: 'public'; url: string };

export type Deployment =
  | { t: 'public'; url: string }
  | { t: 'not-deployed-anymore' }
  | { t: 'not-deployed-yet' }
  | { t: 'private' };

/**
 * Resume curation. The resume lists the homepage's featured side projects in
 * homepage order; `include: false` keeps one off it.
 */
export type ResumePolicy = {
  readonly include?: boolean;
};

export type Project = {
  readonly id: string;
  readonly title: string;
  readonly setting: 'work' | 'side';
  readonly deployment: Deployment;
  readonly code: Code;
  readonly description: string;
  readonly imageSrc: string[];
  readonly imageAlt: string;
  readonly galleryImageSrc: string[];
  readonly youTubeVideoId?: string;
  readonly topics: Topic[];
  /** Optional overrides for resume rendering. */
  readonly resume?: ResumePolicy;
};
