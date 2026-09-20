export type SectionId =
  'work' | 'projects' | 'proof' | 'agentic' | 'about' | 'education' | 'contact';

export type Section = {
  readonly id: SectionId;
  readonly number: string;
  readonly title: string;
  readonly navLabel: string;
  /** Primary destinations rendered in the site header. */
  readonly nav: boolean;
};

/**
 * Declaration order is the page order (see pages/index.astro) and the header
 * order; `number` is derived from it so the two can never drift apart.
 */
const ORDERED: readonly Omit<Section, 'number'>[] = [
  { id: 'work', title: 'Work', navLabel: 'Work', nav: true },
  { id: 'projects', title: 'Projects', navLabel: 'Projects', nav: true },
  {
    id: 'proof',
    title: 'Proof, not promises',
    navLabel: 'Proof',
    nav: true,
  },
  { id: 'agentic', title: 'How I build', navLabel: 'How I build', nav: false },
  { id: 'about', title: 'About', navLabel: 'About', nav: true },
  {
    id: 'education',
    title: 'Education',
    navLabel: 'Education',
    nav: false,
  },
  { id: 'contact', title: 'Contact', navLabel: 'Contact', nav: true },
];

export const SECTIONS: readonly Section[] = ORDERED.map((section, index) => ({
  ...section,
  number: String(index + 1).padStart(2, '0'),
}));

export const getSection = (id: SectionId): Section => {
  const found = SECTIONS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`Unknown section id: ${id}`);
  }
  return found;
};
