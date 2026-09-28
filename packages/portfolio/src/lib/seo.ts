import { CONTENT } from '../content/content';
import type { Seo, SeoImage } from './seo-types';

export const SITE_URL = CONTENT.SITE_URL;

export const SITE_TITLE = 'Chris Vouga — Software Engineer';

export const SITE_DESCRIPTION = CONTENT.ABOUT_ME_ATTR_SAFE.replace(/\s+/g, ' ')
  .trim()
  .slice(0, 160);

/**
 * `@astrojs/sitemap` emits trailing-slash URLs under `build.format: 'directory'`,
 * so canonicals have to agree with it.
 */
export const withTrailingSlash = (path: string): string =>
  path.endsWith('/') ? path : `${path}/`;

export const absoluteUrl = (path: string): string =>
  `${SITE_URL}${withTrailingSlash(path)}`;

/**
 * Root-relative so the prune script can see it. It used to be an inline
 * literal in Base.astro, which the markup scanner matched; `.ts` files are
 * deliberately not scanned, so this has to reach the keep set via the typed
 * reference list instead.
 */
export const DEFAULT_OG_IMAGE_PATH = '/main-site-screenshot.optimized.webp';

/** Site-wide card, used by any page that has not generated its own. */
export const DEFAULT_OG_IMAGE: SeoImage = {
  url: `${SITE_URL}${DEFAULT_OG_IMAGE_PATH}`,
  alt: 'The chrisvouga.dev homepage',
  width: 1400,
  height: 788,
};

export const HOME_SEO: Seo = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  path: '/',
  image: DEFAULT_OG_IMAGE,
  schema: { t: 'home' },
};

export type IndexSeoInput = {
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly image?: SeoImage | undefined;
};

/** A listing page: /projects/. */
export const seoForIndex = (input: IndexSeoInput): Seo => ({
  title: input.title,
  description: input.description,
  path: input.path,
  image: input.image ?? DEFAULT_OG_IMAGE,
  schema: { t: 'collection' },
});

export const seoForNotFound = (): Seo => ({
  title: `Page not found — ${SITE_TITLE}`,
  description: 'That page does not exist.',
  path: '/404/',
  image: DEFAULT_OG_IMAGE,
  schema: { t: 'none' },
  noindex: true,
});
