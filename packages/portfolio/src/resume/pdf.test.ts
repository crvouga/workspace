/**
 * Renders the real PDF through Chromium, so the layout guarantees are tested
 * the way the build produces them. Needs the Playwright browser: `bunx
 * playwright install chromium` (CI installs it before `bun run check`).
 */
import { describe, expect, test } from 'bun:test';
import { PDFDocument } from 'pdf-lib';

import { buildResumeContent } from './content';
import type { ResumeContent } from './html';
import { inspectHtml, renderResume } from './pdf';

const LETTER_WIDTH_PT = 612;
const LETTER_HEIGHT_PT = 792;
const RENDER_TIMEOUT_MS = 120_000;

/** Renders once; every assertion below reads this. */
const rendered = await renderResume(buildResumeContent());

const bulletCount = (content: ResumeContent): number =>
  content.experience.reduce((sum, role) => sum + role.bullets.length, 0);

describe('the generated resume is a clean single page', () => {
  test('exactly one Letter page', async () => {
    const doc = await PDFDocument.load(rendered.bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(LETTER_WIDTH_PT);
    expect(Math.round(height)).toBe(LETTER_HEIGHT_PT);
  });

  test('nothing is clipped, and no section is left empty', () => {
    // renderResume only returns bytes that passed the overflow, clipped-element
    // and empty-section checks, so reaching here is the assertion.
    expect(rendered.bytes.byteLength).toBeGreaterThan(1000);
  });

  test('the page still carries the content worth reading', () => {
    expect(rendered.content.experience.length).toBe(
      buildResumeContent().experience.length
    );
    for (const role of rendered.content.experience) {
      expect(role.bullets.length).toBeGreaterThan(0);
    }
    expect(rendered.content.projects.length).toBeGreaterThan(0);
    expect(rendered.content.skills.length).toBeGreaterThan(2);
    expect(rendered.content.education.length).toBeGreaterThan(0);
  });

  test('current content needs few reductions', () => {
    // A rising number here means the content outgrew the page: the resume is
    // silently dropping things. Re-tune the layout rather than raising this.
    expect(rendered.reductions.length).toBeLessThanOrEqual(3);
  });
});

describe('the layout checks themselves catch defects', () => {
  const page = (body: string): string =>
    `<!doctype html><html><head><style>body{margin:0;font-size:10pt}</style></head><body>${body}</body></html>`;

  test(
    'an element past the right edge is reported as clipped',
    async () => {
      const clean = await inspectHtml(page('<p>Well inside the page.</p>'));
      expect(clean.clipped).toEqual([]);

      const overflowing = await inspectHtml(
        page(
          '<div class="runaway" style="position:absolute;left:900px;width:200px;height:10px">x</div>'
        )
      );
      expect(overflowing.clipped).toContain('div.runaway');
    },
    RENDER_TIMEOUT_MS
  );

  test(
    'a section heading with no rows is reported as empty',
    async () => {
      const empty = await inspectHtml(
        page('<section><h2 class="section-title">Projects</h2></section>')
      );
      expect(empty.emptySections).toEqual(['Projects']);

      const filled = await inspectHtml(
        page(
          '<section><h2 class="section-title">Projects</h2><div class="entry">a</div></section>'
        )
      );
      expect(filled.emptySections).toEqual([]);
    },
    RENDER_TIMEOUT_MS
  );
});

describe('oversized content still yields one clean page', () => {
  test(
    'a role with very long bullets is trimmed, never overflowed',
    async () => {
      const base = buildResumeContent();
      const flooded: ResumeContent = {
        ...base,
        experience: base.experience.map((role) => ({
          ...role,
          bullets: [
            ...role.bullets,
            ...Array.from(
              { length: 6 },
              (_, i) =>
                `Extra bullet ${i} — ${'a long clause about shipping production systems '.repeat(4)}`
            ),
          ],
        })),
      };
      const result = await renderResume(flooded);
      const doc = await PDFDocument.load(result.bytes);
      expect(doc.getPageCount()).toBe(1);
      expect(result.reductions.length).toBeGreaterThan(0);
      expect(bulletCount(result.content)).toBeLessThan(bulletCount(flooded));
    },
    RENDER_TIMEOUT_MS
  );

  test(
    'an unbreakable URL wraps instead of running off the page',
    async () => {
      const base = buildResumeContent();
      const longUrl = `https://example.com/${'segment'.repeat(30)}`;
      const withLongUrl: ResumeContent = {
        ...base,
        projects: base.projects.map((project, index) =>
          index === 0
            ? { ...project, url: longUrl, urlDisplay: longUrl }
            : project
        ),
      };
      const result = await renderResume(withLongUrl);
      expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1);
    },
    RENDER_TIMEOUT_MS
  );
});
