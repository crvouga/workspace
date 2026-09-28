export type Work = {
  name: string;
  infoUrl?: string;
  jobTitle: string;
  /** Scannable bullets; the site cards and the resume both render these. */
  highlights: string[];
  yearStart: number;
  yearEnd: number | 'Present';
  /**
   * Optional month (1-12) for date precision. Year-only ranges read as an
   * evasion tell to recruiters; fill these in when the exact months are known.
   */
  monthStart?: number;
  monthEnd?: number;
  /**
   * Recognition rendered as text. Award images alone are invisible to crawlers,
   * to LLM candidate research, and to anyone who does not open a gallery.
   */
  awards?: string[];
  imageSrc: string[];
  imageAlt: string;
  galleryImageSrc: string[];
};

export const WORK: Work[] = [
  {
    name: 'Geviti',
    infoUrl: 'https://www.gogeviti.com/',
    jobTitle: 'Senior Software Engineer',
    highlights: [
      'Ship features across a health and longevity platform — bloodwork panels, personalized supplement protocols, prescription therapies, and care team coordination — in TypeScript on React, React Native, Postgres, and AWS.',
      'Work on member health data and prescription workflows, where correctness and auditability matter more than raw velocity.',
      'Build the member-facing tools that turn lab results into tracked metrics and protocol changes over time.',
    ],
    yearStart: 2026,
    yearEnd: 'Present',
    imageSrc: ['/geviti-screenshot.optimized.webp'],
    imageAlt: 'Geviti website screenshot',
    galleryImageSrc: ['/geviti-screenshot.optimized.webp'],
  },
  {
    name: 'One Origin',
    infoUrl: 'https://oneorigin.us/',
    jobTitle: 'Senior Software Engineer',
    highlights: [
      'Technical lead on <strong>Triangulator</strong>, an enterprise course-transfer evaluation platform: modeled credit equivalency as a graph in Neo4j alongside Postgres, and built the Python/Flask GraphQL API and Nuxt front end that replaced manual articulation review with ranked, reviewable equivalency suggestions — including the admin assign, boost, and reject-with-reason workflow institutions run on.',
      "Architected the <strong>LTI 1.3</strong> integration for <strong>Orchard</strong>, ASU's customizable-assignment platform — OIDC single sign-on and grade passback against ASU's LMS, including key rotation and the failure paths when a grade fails to post.",
      'Refactored the <strong>ASU Earned Admissions</strong> backend, the platform learners use to earn credit toward 100+ ASU degree programs, and built the Salesforce-to-Canvas data sync plus a new program opt-in flow.',
      "Rebuilt payment processing for <strong>Study Hall</strong>, the education platform ASU runs with the Study Hall YouTube channel, cutting payment failures and making the flow maintainable. Also shipped React components for <strong>Sun Devils</strong>, ASU's athletics site.",
    ],
    yearStart: 2022,
    yearEnd: 2025,
    awards: [
      'Quarterly recognition award — 2024 Q1, 2024 Q2, 2024 Q3–Q4, and 2025 Q1',
    ],
    imageSrc: [
      '/one-origin-screenshot.optimized.webp',
      '/one-origin/2025-q1-award-1.optimized.webp',
    ],
    imageAlt: 'One Origin website screenshot and award certificates',
    galleryImageSrc: [
      '/one-origin-screenshot.optimized.webp',
      '/one-origin/2025-q1-award-1.optimized.webp',
      '/one-origin/2024-q3-&-q4-award-1.optimized.webp',
      '/one-origin/2024-q2-award-1.optimized.webp',
      '/one-origin/2024-q1-award-1.optimized.webp',
      '/one-origin/desk.optimized.webp',
    ],
  },
  {
    name: 'Freelancing',
    jobTitle: 'Software Engineer',
    highlights: [
      'Delivered custom sites and web applications for small businesses end-to-end — scoping, build, deployment, and handoff.',
      'Owned the client relationship alongside the code: requirements, timelines, and post-launch support.',
    ],
    yearStart: 2020,
    yearEnd: 2022,
    imageSrc: [],
    imageAlt: '',
    galleryImageSrc: [],
  },
];
