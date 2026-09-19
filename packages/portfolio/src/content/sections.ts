export type SectionId =
  'proof' | 'agentic' | 'work' | 'projects' | 'about' | 'education' | 'contact';

export type Section = {
  readonly id: SectionId;
  readonly number: string;
  readonly title: string;
  readonly navLabel: string;
  /** Primary destinations rendered in the site header. */
  readonly nav: boolean;
};

export const SECTIONS: readonly Section[] = [
  {
    id: 'proof',
    number: '01',
    title: 'Proof, not promises',
    navLabel: 'Proof',
    nav: false,
  },
  {
    id: 'agentic',
    number: '02',
    title: 'How I build',
    navLabel: 'How I build',
    nav: false,
  },
  { id: 'work', number: '03', title: 'Work', navLabel: 'Work', nav: true },
  {
    id: 'projects',
    number: '04',
    title: 'Projects',
    navLabel: 'Projects',
    nav: true,
  },
  { id: 'about', number: '05', title: 'About', navLabel: 'About', nav: true },
  {
    id: 'education',
    number: '06',
    title: 'Education',
    navLabel: 'Education',
    nav: false,
  },
  {
    id: 'contact',
    number: '07',
    title: 'Contact',
    navLabel: 'Contact',
    nav: true,
  },
];

export const getSection = (id: SectionId): Section => {
  const found = SECTIONS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`Unknown section id: ${id}`);
  }
  return found;
};
