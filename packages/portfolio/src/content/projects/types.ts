import type { Topic } from '../topic';

export type Code = { t: 'private' } | { t: 'public'; url: string };

export type Deployment =
  | { t: 'public'; url: string }
  | { t: 'not-deployed-anymore' }
  | { t: 'not-deployed-yet' }
  | { t: 'private' };

/** Resume curation overrides. Default: include if `projectToLinkHref` is non-null. */
export type ResumePolicy = {
  readonly include?: boolean;
  readonly priority?: number;
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
