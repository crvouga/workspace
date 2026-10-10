# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hiring evaluators come first: a hiring manager, staff engineer, or recruiter deciding whether to contact Chris Vouga for a senior or staff full-stack or platform role, in Phoenix or remote. Peers are the second audience; they browse the project archive, the contribution proof, and the notes on how he builds. Confirmed in the product interview.

## Product Purpose

chrisvouga.dev is Chris Vouga's public record of work. It shows the systems he has shipped, the school record, how to reach him, and a one-page resume. Success for the primary visitor is seeing real work and then emailing or copying `crvouga@gmail.com`. Success for a peer is finding a specific project, a screenshot, or the building notes without a hiring pitch in the way.

## Positioning

The site is the engineer's own registry, not a studio brochure. Every project, role, and image is a fact already in `packages/portfolio/src/content`, and the contribution numbers come from the committed GitHub snapshot when the live API is absent. A neighboring portfolio could not truthfully claim this registry, these employers, or this snapshot.

## Operating Context

Visitors arrive on the public static site, scan the homepage, open project screenshots in a gallery, copy the email address, and download the resume. Peers also open `/projects/` for the full registry. The site is built and served as static files; the resume PDF is generated at build time.

## Capabilities and Constraints

Confirmed preserve list: Chris Vouga, Phoenix AZ, `crvouga@gmail.com`, the ASU education work, Geviti, the project registry, the GitHub contribution snapshot and its committed fallback, the one-page resume PDF, image alt text, the gallery open and close behavior, copy-to-clipboard, and the lazy YouTube embed.

Routes that must keep working: `/`, `/projects/`, a real `/404`, and `/chris-vouga-resume.pdf`.

Presentation may change. Do not add employers, metrics, customers, or testimonials. Do not drop facts already in the content files. The homepage's featured project order is `gamezilla`, `geviti-app`, `triangulator`, `study-hall`, `mockingbird`, `headless-combobox`.

The site stays an Astro static build. Do not replace it with a client app framework or a SPA. Infrastructure, hosting, and CI outside this package stay as they are.

Repository facts the preserve answer did not name one by one, kept because this overhaul may not invent or drop existing content: One Origin, senior software engineer, 2022–2025, including Triangulator, Orchard, ASU Earned Admission, Study Hall, and Sun Devils; freelancing, 2020–2022; Geviti, senior software engineer, 2026–present; B.S. in Mathematics and Statistics, Arizona State University, 2015–2020; drums in a band; the Cursor recognition note. Marked inferred only in the sense that the interview confirmed the shorter preserve list, and the overhaul brief requires the rest of `src/content` to remain the fact source.

## Brand Commitments

The public name is Chris Vouga. The public email is `crvouga@gmail.com`. The public location is Phoenix, AZ. The site origin in content is `https://www.chrisvouga.dev`.

The user pinned the existing chromatic identity in the direction round: near-black ground, steel-blue accent, monogram CV, and the current section order. That pin beats the dealt shop-traveler costume. Inter and JetBrains Mono are not part of the pin; the overhaul brief forbids them as the primary face pair.

## Evidence on Hand

- Identity, roles, school, about, contact, and section copy: `packages/portfolio/src/content/`.
- Project registry, including the archive: `packages/portfolio/projects.ts` and `packages/portfolio/src/content/projects/`.
- Homepage feature order: `packages/portfolio/src/lib/projects-view.ts`.
- Screenshots and diploma, already in `packages/portfolio/public/`.
- GitHub snapshot fallback: `packages/portfolio/src/data/github-insights.json`.
- Resume facts, synced from the same content: `packages/portfolio/src/resume/`.
- YouTube embed id `7rHHSdnvX94`, title "Cursor AI gift video".

Absences future work must not fill: no customer quotes, no invented usage metrics, no employers beyond the content file, no testimonials.

## Product Principles

- Hiring evidence leads. A visitor deciding whether to write should meet a real project before a manifesto.
- The registry is the product. Titles, dates, alt text, and links come from the content files.
- Proof stays checkable. Contribution numbers are the snapshot or the API behind it, with the existing honesty note.
- Reach stays easy. Email, copy, and the resume remain available from the page.
- Peers still have the long archive. The fold of early work stays findable on `/projects/`.
