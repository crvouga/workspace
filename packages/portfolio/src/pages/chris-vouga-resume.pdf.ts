/**
 * The resume PDF, rendered from site content on every build.
 *
 * Static output prerenders this into `dist/chris-vouga-resume.pdf`, so the
 * deployed file is always built from the same commit as the page that links
 * to it — there is no committed PDF to forget to regenerate. Under `astro dev`
 * it renders on request; the cache only skips Chromium while content is
 * unchanged. The filename must equal `RESUME_FILENAME` (a test enforces it).
 */
import { buildResumeContent } from '../resume/content';
import { renderResume } from '../resume/pdf';

let cached: { readonly key: string; readonly bytes: Uint8Array } | null = null;

const resumeBytes = async (): Promise<Uint8Array> => {
  const content = buildResumeContent();
  const key = JSON.stringify(content);
  if (cached?.key !== key) {
    const { bytes, reductions } = await renderResume(content);
    // The page fits either way, but a silent trim means content outgrew it.
    if (reductions.length > 0) {
      console.warn(
        `[resume] trimmed to fit one page: ${reductions.join(' → ')}`
      );
    }
    cached = { key, bytes };
  }
  return cached.bytes;
};

export const GET = async (): Promise<Response> =>
  new Response(Buffer.from(await resumeBytes()), {
    headers: { 'content-type': 'application/pdf' },
  });
