import { a } from './a';

const BAND_HREF = 'https://www.instagram.com/tripolartheband/';
const BAND_A_TAG = a(BAND_HREF, 'band');

export const ABOUT_ME = `
I'm a full-stack software engineer in the Phoenix Valley who owns features end-to-end: API design, backend systems, infrastructure, and the interface on top.
I work AI-natively — coding agents handle the mechanical work under review gates and test suites while I stay accountable for architecture, correctness, and shipping.
Automation is my default: CI pipelines, infrastructure as code, and agentic harnesses that remove repeatable work.
I write TypeScript across the stack, and a mathematics and statistics background from ASU keeps me honest on the data-heavy parts.
Away from the keyboard I play drums in a ${BAND_A_TAG}.`;

export const ABOUT_ME_ATTR_SAFE = ABOUT_ME.replace(BAND_A_TAG, 'band');

export const ABOUT_YOUTUBE_VIDEO_ID = '7rHHSdnvX94';
export const ABOUT_YOUTUBE_EMBED_URL = `https://www.youtube.com/embed/${ABOUT_YOUTUBE_VIDEO_ID}?modestbranding=1&rel=0&playsinline=1&iv_load_policy=3`;
export const ABOUT_YOUTUBE_VIDEO_TITLE = 'Cursor AI gift video';
export const ABOUT_CURSOR_GIFT_TEXT =
  'Recognized by Cursor as one of their top tab users, with a custom tab button shipped as a gift.';
export const ABOUT_GITHUB_HEATMAP_TEXT =
  'GitHub contribution heatmap showing consistent shipping activity over the past year. Each square is a day; darker is more.';