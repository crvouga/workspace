import { CONTENT } from '../content/content';
import { RESUME_HREF } from '../constants/resume';
import { LISTED_PROJECTS } from '../lib/projects-view';
import { projectHref } from '../lib/projects-view';
import { SITE_DESCRIPTION, SITE_URL, absoluteUrl } from '../lib/seo';

type Link = {
  readonly title: string;
  readonly url: string;
  readonly note: string;
};

const section = (heading: string, links: readonly Link[]): string =>
  links.length === 0
    ? ''
    : `## ${heading}\n\n${links
        .map((l) => `- [${l.title}](${l.url}): ${l.note}`)
        .join('\n')}\n`;

const projectLinks = (): Link[] =>
  LISTED_PROJECTS.map((project) => ({
    title: project.title,
    url: projectHref(project) ?? absoluteUrl('/projects/'),
    note: project.description
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  }));

const PAGES: readonly Link[] = [
  { title: 'Home', url: absoluteUrl('/'), note: SITE_DESCRIPTION },
  {
    title: 'All projects',
    url: absoluteUrl('/projects/'),
    note: 'The full project registry.',
  },
  {
    title: 'Résumé (PDF)',
    url: `${SITE_URL}${RESUME_HREF}`,
    note: 'One-page resume.',
  },
];

export const GET = (): Response => {
  // `section()` returns '' for an empty list; drop those so no run of
  // blank lines is left where a heading would have been.
  const blocks = [
    section('Pages', PAGES),
    section('Projects', projectLinks()),
  ].filter((block) => block !== '');

  const body = [
    '# Chris Vouga — Software Engineer',
    '',
    `> ${CONTENT.HERO.statement}`,
    '',
    `${CONTENT.HERO.statementSecondary} Based in ${CONTENT.LOCATION}. ${CONTENT.HERO.availability}.`,
    '',
    ...blocks,
  ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
