import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { RESUME_FILENAME } from '../constants/resume';
import { CONTENT } from '../content/content';
import { VISIBLE_PROJECTS } from '../lib/projects-view';
import {
  buildResumeContent,
  leadSentences,
  resumeProjects,
  toPlainText,
} from './content';
import type { ResumeContent } from './html';
import { reduceOnce } from './reductions';

const PAGES_DIR = join(import.meta.dir, '..', 'pages');

/** Every string a reader will see, bullets included. */
const printedText = (content: ResumeContent): string[] => [
  ...content.summary,
  ...content.experience.flatMap((role) => [...role.bullets, ...role.awards]),
  ...content.projects.flatMap((project) => [project.description ?? '']),
];

describe('resume content stays in sync with the site', () => {
  const content = buildResumeContent();

  test('the endpoint that serves the PDF matches RESUME_FILENAME', () => {
    expect(existsSync(join(PAGES_DIR, `${RESUME_FILENAME}.ts`))).toBe(true);
  });

  test('every role is listed with every one of its highlights', () => {
    expect(content.experience.map((role) => role.company)).toEqual(
      CONTENT.WORK.map((work) => work.name)
    );
    content.experience.forEach((role, index) => {
      expect(role.bullets.length).toBe(
        CONTENT.WORK[index]?.highlights.length ?? -1
      );
    });
  });

  test('projects are the featured side projects, in homepage order', () => {
    const featuredSide = VISIBLE_PROJECTS.filter((p) => p.setting === 'side');
    expect(resumeProjects().map((p) => p.id)).toEqual(
      featuredSide.map((p) => p.id)
    );
  });

  test('the summary is the hero pitch', () => {
    expect(content.summary.join(' ')).toContain(
      toPlainText(CONTENT.HERO.statement)
    );
  });
});

describe('resume text is print-clean', () => {
  const content = buildResumeContent();

  test('no web-only glyphs, ellipses, or links leak into printed text', () => {
    const leaks = printedText(content).filter((text) =>
      /↗|…|<a\b|&amp;|&nbsp;/.test(text)
    );
    expect(leaks).toEqual([]);
  });

  test('project descriptions are whole sentences', () => {
    for (const project of content.projects) {
      expect(project.description ?? '.').toMatch(/[.!?]$/);
    }
  });

  test('sentence splitting keeps dotted names intact', () => {
    expect(
      leadSentences('gamezilla.app is a game platform. It is fast too.', 40)
    ).toBe('gamezilla.app is a game platform.');
  });

  test('skills name React Native and skip table-stakes entries', () => {
    const items = content.skills.flatMap((row) => row.items);
    expect(items).toContain('React Native');
    expect(items).not.toContain('CSS');
  });
});

describe('fit reductions', () => {
  test('keep every role, and terminate', () => {
    let current: ResumeContent | null = buildResumeContent();
    const roles = current.experience.length;
    let steps = 0;
    while (current !== null && steps < 200) {
      expect(current.experience.length).toBe(roles);
      current = reduceOnce(current)?.content ?? null;
      steps += 1;
    }
    expect(current).toBeNull();
  });
});
