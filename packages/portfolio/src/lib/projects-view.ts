import { CONTENT } from '../content/content';
import type { Project } from '../content/project';

/** Cards rendered before the "show more" disclosure. */
export const VISIBLE_PROJECT_COUNT = 6;

const YOUTUBE_EMBED = /^https?:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\//;

/** Only projects with a public destination are listed. */
export const isListed = (project: Project): boolean =>
  project.deployment.t === 'public' || project.code.t === 'public';

export const LISTED_PROJECTS: readonly Project[] =
  CONTENT.PROJECTS.filter(isListed);

export const VISIBLE_PROJECTS: readonly Project[] = LISTED_PROJECTS.slice(
  0,
  VISIBLE_PROJECT_COUNT
);

export const COLLAPSED_PROJECTS: readonly Project[] = LISTED_PROJECTS.slice(
  VISIBLE_PROJECT_COUNT
);

/** Live site if deployed, else the repository — never a dead link. */
export const projectHref = (project: Project): string | null =>
  project.deployment.t === 'public'
    ? project.deployment.url
    : project.code.t === 'public'
      ? project.code.url
      : null;

export type GalleryItem =
  | { readonly kind: 'image'; readonly src: string; readonly alt: string }
  | { readonly kind: 'video'; readonly src: string };

/** Cover first, then gallery entries; YouTube embeds become video slides. */
export const galleryFor = (project: Project): GalleryItem[] =>
  [...project.imageSrc, ...project.galleryImageSrc].map((src) =>
    YOUTUBE_EMBED.test(src)
      ? { kind: 'video' as const, src }
      : {
          kind: 'image' as const,
          src,
          alt: `${project.title} — screenshot`,
        }
  );

/** Gallery payload for the dialog, indexed by card position. */
export const VISIBLE_GALLERIES: readonly (readonly GalleryItem[])[] =
  VISIBLE_PROJECTS.map(galleryFor);
