/**
 * Generate a strictly-one-page, professionally-typeset PDF resume.
 *
 * The "must be one page" guarantee is enforced by THREE complementary
 * mechanisms in order of strength:
 *
 *   1. Carefully-tuned static layout (typography, margins, spacing) so the
 *      default content fits without any reductions.
 *   2. An iterative fit loop that drops content in priority order if the
 *      rendered DOM ever overflows the printable area.
 *   3. A final pdf-lib assertion that opens the generated PDF and throws if
 *      `pages.length !== 1`. This is the hard contract.
 *
 * If ALL drop strategies are exhausted and the content still overflows, the
 * generator throws with a clear diagnostic. The build never silently produces
 * a 2-page resume.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { PDFDocument } from 'pdf-lib';

import { CONTENT } from './content/content';
import { LOCATION } from './content/hero';
import { TOPIC_TO_NAME, type Topic } from './content/topic';
import { buildSkillRows } from './content/skills';
import {
  projectToLinkHref,
  type Project as PortfolioProject,
} from './content/project';
import { formatPhoneNumber } from './library/phone-number';
import { RESUME_FILENAME } from './constants/resume';
import { writeLine } from './library/cli-output';
import {
  renderHtml,
  type DropStrategy,
  type Education,
  type Experience,
  type Identity,
  type Project,
  type ResumeContent,
} from './resume/html';

// ---------------------------------------------------------------------------
// Page math
// ---------------------------------------------------------------------------

const DPI = 96;
const PAGE_WIDTH_IN = 8.5;
const PAGE_HEIGHT_IN = 11;
const MARGIN_TOP_IN = 0.5;
const MARGIN_BOTTOM_IN = 0.5;
const MARGIN_SIDE_IN = 0.6;

const CONTENT_WIDTH_PX = Math.round((PAGE_WIDTH_IN - MARGIN_SIDE_IN * 2) * DPI);
const CONTENT_HEIGHT_PX = Math.round(
  (PAGE_HEIGHT_IN - MARGIN_TOP_IN - MARGIN_BOTTOM_IN) * DPI
);

// ---------------------------------------------------------------------------
// Content assembly
// ---------------------------------------------------------------------------

const stripHtml = (s: string): string => s.replace(/<[^>]*>/g, '').trim();

const formatDateRange = (start: number, end: number | 'Present'): string =>
  end === 'Present' ? `${start} – Present` : `${start} – ${end}`;

const trimSentence = (s: string): string => s.trim().replace(/\.$/, '');

function buildResumeContent(): ResumeContent {
  const fullSummary = stripHtml(CONTENT.ABOUT_ME);
  const summarySentences = fullSummary
    .split(/[.!?]+/)
    .map(trimSentence)
    .filter((s) => s.length > 0)
    .slice(0, 3); // Cap at 3 sentences from the start.

  const experience: Experience[] = CONTENT.WORK.map((work) => ({
    company: work.name,
    jobTitle: work.jobTitle,
    dateRange: formatDateRange(work.yearStart, work.yearEnd),
    description: work.jobDescription.replace(/\s+/g, ' ').trim(),
    url: work.infoUrl ?? null,
  }));

  // Resume curation is declarative — every project carries an optional
  // `resume?: { include?, priority? }` block in `projects.ts`. We only need
  // two universal rules here:
  //   1. include === false  → never on the resume
  //   2. title matches a WORK[].name → drop (would duplicate the experience blurb)
  //   3. projectToLinkHref(p) === null → drop (no public link to render)
  // Everything else is sorted by priority desc (default 0), declaration order
  // tie-breaks. WORK_PROJECTS get a default boost so side projects without an
  // explicit pin don't displace them.
  const workCompanyNames = new Set(
    CONTENT.WORK.map((w) => w.name.toLowerCase())
  );
  const visibleOnResume = (p: PortfolioProject): boolean =>
    p.resume?.include !== false &&
    projectToLinkHref(p) !== null &&
    !workCompanyNames.has(p.title.toLowerCase());

  const resumePriority = (p: PortfolioProject): number =>
    p.resume?.priority ?? (p.setting === 'work' ? 1 : 0);

  const orderedProjects = CONTENT.PROJECTS.filter(visibleOnResume)
    .slice() // don't mutate the readonly source array
    .sort((a, b) => resumePriority(b) - resumePriority(a));

  const projects: Project[] = orderedProjects.slice(0, 5).map((project) => ({
    title: project.title,
    description: shortenDescription(stripHtml(project.description)),
    url: projectToLinkHref(project),
    topics: project.topics
      .map((t) => TOPIC_TO_NAME[t as Topic] ?? t)
      .filter(Boolean)
      .slice(0, 6), // Cap topics per project for visual rhythm.
  }));

  // Skills section: union of all topics from selected projects + work-aligned
  // tech (the work entries don't have a `topics` field, so we lean on
  // projects).
  const allTopics = new Set<string>();
  for (const p of orderedProjects) for (const t of p.topics) allTopics.add(t);
  const skills = buildSkillRows([...allTopics]);

  const education: Education[] = CONTENT.SCHOOL.map((school) => ({
    degree: school.degree,
    institution: school.institutionName,
    dateRange: formatDateRange(school.yearStart, school.yearEnd),
  }));

  const tidyHost = (url: string): string =>
    url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '');

  const identity: Identity = {
    name: CONTENT.PAGE_TITLE,
    title: CONTENT.PAGE_SUBTITLE,
    location: LOCATION,
    email: CONTENT.EMAIL_ADDRESS,
    phone: formatPhoneNumber(CONTENT.PHONE_NUMBER),
    website: tidyHost(CONTENT.SITE_URL),
    githubDisplay: tidyHost(CONTENT.GITHUB_URL),
    githubUrl: CONTENT.GITHUB_URL,
    linkedinDisplay: tidyHost(CONTENT.LINKEDIN_URL),
    linkedinUrl: CONTENT.LINKEDIN_URL,
  };

  return {
    identity,
    summary: summarySentences,
    experience,
    projects,
    skills,
    education,
  };
}

/** Trim project descriptions to one tight line at body width. */
function shortenDescription(s: string): string {
  const max = 105;
  const cleaned = s.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  const truncated = cleaned.slice(0, max - 1);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, lastSpace > 60 ? lastSpace : truncated.length)}…`;
}

// ---------------------------------------------------------------------------
// Iterative fit-to-page
// ---------------------------------------------------------------------------

/**
 * Drop strategies are applied in order until the rendered content fits on a
 * single page. Earlier = least painful loss of information.
 */
const DROP_STRATEGIES: readonly DropStrategy[] = [
  {
    name: 'drop project descriptions',
    apply: (c) => ({
      ...c,
      projects: c.projects.map((p) => ({ ...p, description: null })),
    }),
  },
  {
    name: 'drop last project',
    apply: (c) => ({ ...c, projects: c.projects.slice(0, -1) }),
  },
  {
    name: 'drop last project',
    apply: (c) => ({ ...c, projects: c.projects.slice(0, -1) }),
  },
  {
    name: 'drop last project',
    apply: (c) => ({ ...c, projects: c.projects.slice(0, -1) }),
  },
  {
    name: 'drop last summary sentence',
    apply: (c) => ({ ...c, summary: c.summary.slice(0, -1) }),
  },
  {
    name: 'drop last project',
    apply: (c) => ({ ...c, projects: c.projects.slice(0, -1) }),
  },
  {
    name: 'drop last skill row',
    apply: (c) => ({ ...c, skills: c.skills.slice(0, -1) }),
  },
  { name: 'drop all projects', apply: (c) => ({ ...c, projects: [] }) },
  { name: 'drop summary entirely', apply: (c) => ({ ...c, summary: [] }) },
];

async function measureOverflow(
  page: Page,
  html: string
): Promise<{ scrollHeight: number; fits: boolean }> {
  await page.setContent(html, { waitUntil: 'networkidle' });
  // Wait briefly for fonts to load so measurement is accurate.
  try {
    await page.evaluate(
      () =>
        (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts
          ?.ready
    );
  } catch {
    // older Chromium without document.fonts — fall through
  }
  const scrollHeight = await page.evaluate(
    () => document.documentElement.scrollHeight
  );
  return { scrollHeight, fits: scrollHeight <= CONTENT_HEIGHT_PX };
}

async function fitToOnePage(
  page: Page,
  initial: ResumeContent
): Promise<{
  content: ResumeContent;
  html: string;
  reductionsApplied: string[];
  finalHeightPx: number;
}> {
  const reductionsApplied: string[] = [];
  let content = initial;
  let html = renderHtml(content);
  let measurement = await measureOverflow(page, html);
  if (measurement.fits) {
    return {
      content,
      html,
      reductionsApplied,
      finalHeightPx: measurement.scrollHeight,
    };
  }

  for (const strategy of DROP_STRATEGIES) {
    const reduced = strategy.apply(content);
    if (JSON.stringify(reduced) === JSON.stringify(content)) continue; // no-op (e.g. nothing left to drop)
    content = reduced;
    reductionsApplied.push(strategy.name);
    html = renderHtml(content);
    measurement = await measureOverflow(page, html);
    if (measurement.fits) {
      return {
        content,
        html,
        reductionsApplied,
        finalHeightPx: measurement.scrollHeight,
      };
    }
  }

  throw new Error(
    `Resume content does not fit on a single page even after applying every drop strategy ` +
      `(content ${measurement.scrollHeight}px > available ${CONTENT_HEIGHT_PX}px). ` +
      `Reduce content in src/content/* or tighten generate-resume.ts typography.`
  );
}

// ---------------------------------------------------------------------------
// PDF generation + verification
// ---------------------------------------------------------------------------

async function assertOnePagePdf(pdfPath: string): Promise<void> {
  const bytes = await readFile(pdfPath);
  const doc = await PDFDocument.load(bytes);
  const pageCount = doc.getPageCount();
  if (pageCount !== 1) {
    throw new Error(
      `Generated resume has ${pageCount} pages, expected exactly 1. ` +
        `Hint: tighten the typography in generate-resume.ts or trim content.`
    );
  }
}

const generateResume = async (): Promise<string> => {
  const content = buildResumeContent();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: CONTENT_WIDTH_PX, height: CONTENT_HEIGHT_PX },
      deviceScaleFactor: 1,
    });

    const fitted = await fitToOnePage(page, content);
    if (fitted.reductionsApplied.length > 0) {
      console.warn(
        `[resume] applied ${fitted.reductionsApplied.length} reduction(s) to fit on 1 page: ` +
          fitted.reductionsApplied.join(' → ')
      );
    }

    const publicPath = `${import.meta.dir}/../public`;
    await mkdir(publicPath, { recursive: true });
    const pdfPath = `${publicPath}/${RESUME_FILENAME}`;

    // Render the FINAL HTML as the PDF source. We use printBackground so the
    // accent rule under the name is preserved, and explicit format/margins so
    // the printable area exactly matches what the fit-loop measured against.
    await page.setContent(fitted.html, { waitUntil: 'networkidle' });
    try {
      await page.evaluate(
        () =>
          (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts
            ?.ready
      );
    } catch {
      /* old Chromium */
    }

    await page.pdf({
      path: pdfPath,
      format: 'Letter',
      margin: {
        top: `${MARGIN_TOP_IN}in`,
        bottom: `${MARGIN_BOTTOM_IN}in`,
        left: `${MARGIN_SIDE_IN}in`,
        right: `${MARGIN_SIDE_IN}in`,
      },
      printBackground: true,
      preferCSSPageSize: false,
    });

    // Defense-in-depth: even if DOM measurement said it fits, verify the
    // actual PDF page count. This is the hard contract.
    await assertOnePagePdf(pdfPath);

    return pdfPath;
  } finally {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
  }
};

export { generateResume };

if (import.meta.main) {
  generateResume()
    .then((pdfPath) =>
      writeLine(`Resume generated successfully at: ${pdfPath}`)
    )
    .catch((err: unknown) => {
      console.error('Error generating resume:', err);
      process.exit(1);
    });
}
