// Order-preserving split of PROJECTS (max-lines); append new projects here.
// Part 2 is the archive tail: real work and real tools, but not the entries a
// reviewer should hit first.
import type { Project } from './types';
import { IMAGE_ALT, externalLink, toYouTubeVideoUrl } from './shared';

const MOVIEFINDER_GO_HREF = 'https://github.com/crvouga/moviefinder.app-go';
const MOVIEFINDER_REACT_HREF =
  'https://github.com/crvouga/moviefinder.app-react';
const MOVIEFINDER_CLJS_HREF =
  'https://github.com/crvouga/moviefinder.app-clojurescript';

export const PROJECT_ENTRIES_PART_2: readonly Project[] = [
  {
    id: 'normalizer-app',
    title: 'normalizer.app',
    setting: 'side',
    deployment: { t: 'not-deployed-anymore' },
    code: { t: 'public', url: 'https://github.com/crvouga/normalizer.app.git' },
    description:
      'Automates data normalization workflows, mapping tabular data (Excel, CSV) between schemas without manual spreadsheet surgery or one-off Python scripts.',
    imageAlt: IMAGE_ALT,
    imageSrc: ['/normalizer-app-screenshot.optimized.webp'],
    galleryImageSrc: [
      '/normalizer-app-screenshot.optimized.webp',
      toYouTubeVideoUrl({
        youTubeVideoId: 'xUtdHEUeUzs',
        autoplay: true,
        mute: true,
      }),
    ],
    topics: [
      'typescript',
      'react',
      'tailwind',
      'bun',
      'postgres',
      's3',
      'trpc',
      'zod',
    ],
  },
  {
    id: 'image-service',
    title: 'Image service',
    setting: 'side',
    deployment: { t: 'public', url: 'https://imageservice.chrisvouga.dev' },
    code: {
      t: 'public',
      url: 'https://github.com/crvouga/imageresizerservice.com',
    },
    description:
      'Image optimization service written in Go for zero-configuration self-hosting, so an application can serve optimized images without taking on a vendor.',
    imageAlt: IMAGE_ALT,
    imageSrc: ['/image-service-screenshot.optimized.webp'],
    galleryImageSrc: ['/image-service-screenshot.optimized.webp'],
    topics: ['go'],
  },
  {
    id: 'screenshot-service',
    title: 'Screenshots as a Service',
    setting: 'side',
    deployment: { t: 'not-deployed-anymore' },
    code: { t: 'public', url: 'https://github.com/crvouga/screenshot-service' },
    description:
      'SaaS for generating web page screenshots programmatically, with retries and queueing around a headless browser pool. Its successor still generates every screenshot on this site.',
    imageAlt: IMAGE_ALT,
    imageSrc: [
      '/screenshots-as-a-service-screenshot.optimized.webp',
      '/screenshot-service.optimized.webp',
    ],
    galleryImageSrc: [
      '/screenshots-as-a-service-screenshot.optimized.webp',
      toYouTubeVideoUrl({
        youTubeVideoId: 'lCEzYGJ0rN8',
        autoplay: true,
        mute: true,
      }),
      '/screenshot-service.optimized.webp',
    ],
    topics: [
      'css',
      'heroku',
      'material-ui',
      'nodejs',
      'postgres',
      'puppeteer',
      'react',
      'react-query',
      'typescript',
      'supabase',
    ],
  },
  {
    id: 'moviefinder-app',
    title: 'moviefinder.app — one app, four runtimes',
    setting: 'side',
    deployment: {
      t: 'public',
      url: 'https://moviefinder-app-rust.chrisvouga.dev',
    },
    code: {
      t: 'public',
      url: 'https://github.com/crvouga/moviefinder.app-rust',
    },
    description: `The same movie-discovery app, built four times, to find out where each runtime actually charges you. Rust for the strictest version, ${externalLink(MOVIEFINDER_GO_HREF, 'Go')} for the plainest, ${externalLink(MOVIEFINDER_REACT_HREF, 'React')} for the familiar baseline, and ${externalLink(MOVIEFINDER_CLJS_HREF, 'ClojureScript')} for the one that reshaped the data model. Holding the product constant is what makes the comparison mean anything.`,
    imageAlt: IMAGE_ALT,
    imageSrc: ['/moviefinder-app-rust-screenshot.optimized.webp'],
    galleryImageSrc: [
      '/moviefinder-app-rust-screenshot.optimized.webp',
      '/moviefinder-app-go-screenshot.optimized.webp',
      '/moviefinder-app-react-screenshot.optimized.webp',
      '/moviefinder-app-clojurescript-screenshot.optimized.webp',
    ],
    topics: ['rust', 'go', 'typescript', 'react', 'clojurescript'],
  },
  {
    id: 'asu-earned-admissions',
    title: 'ASU Earned Admissions',
    setting: 'work',
    deployment: { t: 'public', url: 'https://ea.asu.edu/' },
    code: { t: 'private' },
    description:
      "Platform where learners earn college credit toward admission to over 100 ASU degree programs. I refactored the main backend, built the Salesforce automation that syncs with ASU's Canvas LMS, and shipped a new program opt-in flow.",
    imageAlt: IMAGE_ALT,
    imageSrc: ['/asu-earned-admission-screenshot.optimized.webp'],
    galleryImageSrc: ['/asu-earned-admission-screenshot.optimized.webp'],
    topics: [
      'salesforce',
      'nodejs',
      'typescript',
      'express',
      'dynamodb',
      'aws',
    ],
    resume: { include: false },
  },
  {
    id: 'airr',
    title: 'Airr Product Demo',
    setting: 'work',
    deployment: { t: 'not-deployed-anymore' },
    code: { t: 'private' },
    description:
      'Interactive product demo for Airr, an enterprise tool that automates transcript consumption and analysis — the data processing pipeline and the workflow UI over it.',
    imageAlt: IMAGE_ALT,
    imageSrc: [
      '/airr-product-demo-screenshot.optimized.webp',
      '/airr/1.optimized.webp',
      '/airr/2.optimized.webp',
      '/airr/3.optimized.webp',
      '/airr/4.optimized.webp',
      '/airr/5.optimized.webp',
      '/airr/6.optimized.webp',
    ],
    galleryImageSrc: [
      '/airr-product-demo-screenshot.optimized.webp',
      '/airr/1.optimized.webp',
      '/airr/2.optimized.webp',
      '/airr/3.optimized.webp',
      '/airr/4.optimized.webp',
      '/airr/5.optimized.webp',
      '/airr/6.optimized.webp',
      '/airr/7.optimized.webp',
    ],
    topics: [
      'typescript',
      'nodejs',
      'postgres',
      'react',
      'tailwind',
      'trpc',
      'vercel',
    ],
    resume: { include: false },
  },
  {
    id: 'sun-devils',
    title: 'Sun Devils',
    setting: 'work',
    deployment: { t: 'public', url: 'https://sundevils.com/' },
    code: { t: 'private' },
    description:
      "Official site for ASU's Sun Devils athletics program. I built the interactive React components — live game schedules and dynamic news feeds.",
    imageAlt: IMAGE_ALT,
    imageSrc: ['/sun-devils-screenshot.optimized.webp'],
    galleryImageSrc: [
      '/sun-devils-screenshot.optimized.webp',
      '/sun-devils/2.optimized.webp',
      '/sun-devils/3.optimized.webp',
      '/sun-devils/4.optimized.webp',
      '/sun-devils/5.optimized.webp',
    ],
    topics: ['bootstrap', 'drupal', 'javascript', 'react', 'css', 'php'],
  },
];
