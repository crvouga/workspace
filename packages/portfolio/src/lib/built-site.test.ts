import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTENT } from '../content/content';
import { ARCHIVE_PROJECTS, PROJECTS } from '../content/project';
import { LISTED_PROJECTS, VISIBLE_PROJECTS } from './projects-view';

const dist = join(import.meta.dir, '..', '..', 'dist');

const page = (relative: string): string => {
  const path = join(dist, relative);
  if (!existsSync(path)) {
    throw new Error(`missing built page: ${path}`);
  }
  return readFileSync(path, 'utf8');
};

const CONTRACT = [
  'THESIS:',
  'OWN-WORLD:',
  'STORY:',
  'FIRST VIEWPORT:',
  'FORM:',
  'FINISH:',
  'unreviewed and undocumented is unfinished',
] as const;

describe('built portfolio pages', () => {
  test('the astro build output exists', () => {
    expect(existsSync(dist)).toBe(true);
    expect(existsSync(join(dist, 'index.html'))).toBe(true);
    expect(existsSync(join(dist, 'projects/index.html'))).toBe(true);
    expect(existsSync(join(dist, '404.html'))).toBe(true);
  });

  test('home, archive, and 404 carry the registry and drop the direction contract', () => {
    const home = page('index.html');
    const archive = page('projects/index.html');
    const missing = page('404.html');
    const lead = VISIBLE_PROJECTS[0];
    if (lead === undefined) {
      throw new Error('The homepage registry has no lead project.');
    }

    expect(home).toContain(lead.title);
    expect(home).toContain(CONTENT.HERO.name);
    expect(home).toContain(CONTENT.EMAIL_ADDRESS);
    expect(home).toContain(CONTENT.LOCATION);

    for (const project of [...PROJECTS, ...ARCHIVE_PROJECTS]) {
      expect(archive).toContain(project.title);
    }
    expect(archive).toContain(String(LISTED_PROJECTS.length + ARCHIVE_PROJECTS.length));
    expect(archive).toContain(String(ARCHIVE_PROJECTS.length));

    for (const html of [home, archive, missing]) {
      for (const phrase of CONTRACT) {
        expect(html).not.toContain(phrase);
      }
      expect(html).not.toContain('inter-variable');
      expect(html).not.toContain('jetbrains-mono');
      expect(html).not.toContain('Inter Variable');
      expect(html).not.toContain('JetBrains Mono');
      expect(html).toContain('Bricolage Grotesque');
      expect(html).toContain('Atkinson Hyperlegible');
    }
  });
});
