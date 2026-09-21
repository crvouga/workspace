import { CONTENT } from '../content/content';
import type { Work } from '../content/work';
import {
  VISIBLE_GALLERIES,
  toGalleryItems,
  type GalleryItem,
} from './projects-view';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `Mar 2022` when the month is known, else `2022`. */
const endpoint = (
  year: number | 'Present',
  month: number | undefined
): string => {
  if (year === 'Present') return 'Present';
  const name = month === undefined ? undefined : MONTHS[month - 1];
  return name === undefined ? String(year) : `${name} ${year}`;
};

/**
 * Month precision when `work.ts` declares it. Year-only ranges read as an
 * evasion tell, so the fields exist even while most entries omit them.
 */
export const workDateRange = (job: Work): string =>
  `${endpoint(job.yearStart, job.monthStart)}–${endpoint(job.yearEnd, job.monthEnd)}`;

/** Award images alone are invisible; the text line is the crawlable claim. */
export const workGalleryFor = (job: Work): GalleryItem[] =>
  toGalleryItems([...job.imageSrc, ...job.galleryImageSrc], job.name);

export const WORK_GALLERIES: readonly (readonly GalleryItem[])[] =
  CONTENT.WORK.map(workGalleryFor);

/**
 * The gallery dialog indexes one flat array, so work galleries sit after the
 * project ones and carry this offset.
 */
export const WORK_GALLERY_OFFSET = VISIBLE_GALLERIES.length;

/** Every gallery reachable from the homepage, in `data-gallery` index order. */
export const PAGE_GALLERIES: readonly (readonly GalleryItem[])[] = [
  ...VISIBLE_GALLERIES,
  ...WORK_GALLERIES,
];
