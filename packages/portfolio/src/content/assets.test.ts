import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { CONTENT } from './content';
import { TOPIC_TO_IMAGE_SRC } from './topic';

const PACKAGE_ROOT = join(import.meta.dir, '..', '..');
const PUBLIC_DIR = join(PACKAGE_ROOT, 'public');

const isRemote = (src: string): boolean => /^https?:/i.test(src);

const contentPaths = (): string[] => [
  ...CONTENT.PROJECTS.flatMap((p) => [...p.imageSrc, ...p.galleryImageSrc]),
  ...CONTENT.WORK.flatMap((w) => [...w.imageSrc, ...w.galleryImageSrc]),
  ...CONTENT.SCHOOL.flatMap((s) => [s.imageSrc, ...s.galleryImageSrc]),
  ...Object.values(TOPIC_TO_IMAGE_SRC).filter(
    (value): value is string => typeof value === 'string'
  ),
];

describe('content asset references', () => {
  test('every entry with images declares alt text', () => {
    const missingProjects = CONTENT.PROJECTS.filter(
      (p) => p.imageSrc.length > 0 && p.imageAlt.trim() === ''
    ).map((p) => p.title);
    const missingWork = CONTENT.WORK.filter(
      (w) => w.imageSrc.length > 0 && w.imageAlt.trim() === ''
    ).map((w) => w.name);
    expect([...missingProjects, ...missingWork]).toEqual([]);
  });

  test('every local asset path is root-relative and exists in public/', () => {
    const local = [...new Set(contentPaths())].filter((src) => !isRemote(src));
    const notRootRelative = local.filter((src) => !src.startsWith('/'));
    expect(notRootRelative).toEqual([]);

    const missing = local.filter(
      (src) => !existsSync(join(PUBLIC_DIR, src.slice(1)))
    );
    expect(missing).toEqual([]);
  });
});
