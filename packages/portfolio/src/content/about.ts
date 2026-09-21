import { a } from './a';

const BAND_HREF = 'https://www.instagram.com/tripolartheband/';
const BAND_A_TAG = a(BAND_HREF, 'band');

/**
 * One entry per paragraph, each trusted HTML. They are separate strings rather
 * than one newline-delimited block because the section renders a real `<p>` per
 * paragraph \u2014 a single block would need `white-space: pre-line`, which forces
 * any inline `<a>` onto its own line.
 */
export const ABOUT_ME_PARAGRAPHS: readonly string[] = [
  `I'm a full-stack software engineer in the Phoenix Valley who owns features end-to-end: data model, API, infrastructure, and the interface on top.`,
  `Most of my career has been education technology \u2014 six years across ASU platforms for course articulation, earned admission, LMS integration, and assignment authoring \u2014 plus health software now at Geviti. Both are domains where being wrong is expensive and quiet, which shapes how I build.`,
  `I work AI-natively, but the claim I'd defend is narrower than the phrase: I build the review gates, typed contracts, and infrastructure-as-code that make coding agents safe to run, and I stay accountable for what gets through them.`,
  `I write TypeScript across the stack, reach for Go or Rust when a service earns it, and a mathematics and statistics background from ASU keeps me honest on the data-heavy parts.`,
  `Away from the keyboard I play drums in a ${BAND_A_TAG}.`,
];

export const ABOUT_ME = ABOUT_ME_PARAGRAPHS.join('\n');

export const ABOUT_ME_ATTR_SAFE = ABOUT_ME.replace(BAND_A_TAG, 'band');

export const ABOUT_YOUTUBE_VIDEO_ID = '7rHHSdnvX94';
export const ABOUT_YOUTUBE_EMBED_URL = `https://www.youtube.com/embed/${ABOUT_YOUTUBE_VIDEO_ID}?modestbranding=1&rel=0&playsinline=1&iv_load_policy=3`;
export const ABOUT_YOUTUBE_VIDEO_TITLE = 'Cursor AI gift video';
export const ABOUT_GITHUB_HEATMAP_TEXT =
  'GitHub contribution heatmap showing consistent shipping activity over the past year. Each square is a day; darker is more.';
