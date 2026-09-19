import {
  ABOUT_ME,
  ABOUT_ME_ATTR_SAFE,
  ABOUT_YOUTUBE_EMBED_URL,
  ABOUT_YOUTUBE_VIDEO_TITLE,
  ABOUT_GITHUB_HEATMAP_TEXT,
} from './about';
import { CONTACT_COPY } from './contact';
import { FOOTER_COPY } from './footer';
import { CORE_STACK, HERO, LOCATION, MONOGRAM_INITIALS } from './hero';
import { PROJECTS } from './project';
import { SCHOOL } from './school';
import { SECTIONS, getSection } from './sections';
import { buildSkillRows } from './skills';
import { WORK } from './work';
import {
  AGENTIC_CURSOR_BADGE,
  AGENTIC_CURSOR_TEXT,
  AGENTIC_WORKFLOW_POINTS,
  AGENTIC_WORKFLOW_TITLE,
} from './agentic';

const PAGE_TITLE = 'Chris Vouga';

const PAGE_SUBTITLE = 'Software Engineer';

/** Every technology named by at least one project, bucketed for the Toolbox. */
const SKILL_ROWS = buildSkillRows([
  ...new Set(PROJECTS.flatMap((project) => project.topics)),
]);

export const CONTENT = {
  SITE_URL: 'https://www.chrisvouga.dev',
  SITE_SOURCE_CODE_URL:
    'https://github.com/crvouga/workspace/tree/main/packages/portfolio',
  PAGE_TITLE,
  PAGE_SUBTITLE,
  ABOUT_ME_ATTR_SAFE,
  EMAIL_ADDRESS: 'crvouga@gmail.com',
  GITHUB_URL: 'https://github.com/crvouga',
  LINKEDIN_URL: 'https://www.linkedin.com/in/chris-vouga',
  PHONE_NUMBER: '4802098698',
  LOCATION,
  SECTIONS,
  GET_SECTION: getSection,
  //
  HERO,
  CORE_STACK,
  MONOGRAM_INITIALS,
  CONTACT_COPY,
  FOOTER_COPY,
  //
  PROJECT_SECTION_TITLE: getSection('projects').title,
  PROJECTS,
  AGENTIC_CURSOR_BADGE,
  AGENTIC_CURSOR_TEXT,
  AGENTIC_WORKFLOW_TITLE,
  AGENTIC_WORKFLOW_POINTS,
  //
  WORK_SECTION_TITLE: getSection('work').title,
  WORK,
  //
  ABOUT_ME_SECTION_TITLE: getSection('about').title,
  ABOUT_ME,
  SKILL_ROWS,
  ABOUT_YOUTUBE_EMBED_URL,
  ABOUT_YOUTUBE_VIDEO_TITLE,
  ABOUT_GITHUB_HEATMAP_TEXT,
  //
  SCHOOL_SECTION_TITLE: getSection('education').title,
  SCHOOL,
  //
  CONTACT_SECTION_TITLE: getSection('contact').title,
};
