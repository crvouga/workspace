# @pkgs/portfolio

Source for [www.chrisvouga.dev](https://www.chrisvouga.dev): an Astro 7 static site, its content registry, generated assets, resume PDF, and container image.

The package is a Bun workspace inside `crvouga/workspace`. The production image (`ghcr.io/crvouga/chrisvouga-portfolio`) is built from the repository root by CI using `packages/portfolio/Dockerfile`, then served by nginx. Hosting is declared in [`packages/infra/services.yaml`](../infra/services.yaml) (`id: portfolio`).

## Architecture

Astro static output emits one `dist/index.html` with inlined CSS and no client framework. Runtime JavaScript is limited to copy-to-clipboard feedback, the native project gallery dialog, and the lazy YouTube embed. There is no analytics or runtime API dependency except the embedded video.

GitHub proof data is fetched at build time by [`src/lib/github.ts`](src/lib/github.ts). Production builds require `PORTFOLIO_GITHUB_TOKEN` with `read:user` access and fail with an actionable error when GitHub data is unavailable. Development mode renders a notice card without a token. The preferred local entry point is `bun portfolio`, which wraps the dev server in `vault run --config dev` and always starts `astro dev --force`.

## Layout

| Path                             | Purpose                                                                     |
| -------------------------------- | --------------------------------------------------------------------------- |
| `astro.config.mjs`               | Static Astro config and canonical site URL.                                 |
| `src/pages/index.astro`          | Page composition, recruiter-first section order, gallery dialog.            |
| `src/components/`                | Nav, Hero, Work, Projects, Proof, About, Toolbox, Contact, and icons.       |
| `src/lib/github.ts`              | Build-time GitHub GraphQL/REST fetch, validation, streaks, and errors.      |
| `src/lib/projects-view.ts`       | Shared visible-project ordering and typed gallery payload.                  |
| `src/layouts/Base.astro`         | Document head, OG/JSON-LD metadata, global copy feedback script.            |
| `src/styles/global.css`          | Dark design tokens, typography, layout primitives, focus styles.            |
| `src/content/`                   | Typed content registry, skills, work, education, and project data.          |
| `assets/`                        | Source screenshots/photos. Not served and excluded from the Docker context. |
| `public/`                        | Served derivatives, fonts, icons, sitemap, robots.txt, resume PDF.          |
| `scripts/optimize-images.ts`     | Converts raster sources in `assets/` to 1400px WebP derivatives.            |
| `scripts/prune-unused-assets.ts` | Dry-run/apply asset reference hygiene.                                      |
| `scripts/health-check-urls.ts`   | Checks every public URL referenced by content.                              |
| `Dockerfile`, `nginx.conf`       | Container build and static server.                                          |
| `test/server.test.ts`            | Local Docker E2E smoke test.                                                |

## Scripts

Run from the repository root with `bun run --filter @pkgs/portfolio <script>`, or from this directory with `bun run <script>`.

| Script                                                        | Purpose                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `dev`                                                         | `astro dev --force`; direct package development server.                                           |
| `build`                                                       | Static Astro build into `dist/`. Requires GitHub proof credentials in production.                 |
| `assets:optimize`                                             | Rebuild every `public/**/*.optimized.webp` from `assets/` using ImageMagick.                      |
| `assets:prune`                                                | Report unused files; add `-- --apply` to move/delete them.                                        |
| `gen` / `generate-all`                                        | Capture hosted screenshots into `assets/`, optimize derivatives, and regenerate the resume PDF.   |
| `generate-resume`                                             | Regenerate `public/chris-vouga-resume.pdf`.                                                       |
| `screenshot-work` / `screenshot-projects` / `screenshot-main` | Capture one screenshot collection into `assets/`.                                                 |
| `health-check-urls`                                           | GET every public URL in content; exits non-zero on failure.                                       |
| `preview`                                                     | Build the Docker image with `PORTFOLIO_GITHUB_TOKEN` as a BuildKit secret and serve on port 8080. |
| `tc`                                                          | `astro check` for TypeScript and Astro files.                                                     |
| `lint`                                                        | ESLint with the shared workspace rules.                                                           |
| `test`                                                        | Bun tests under `src/`; Docker E2E is intentionally excluded.                                     |
| `test:docker`                                                 | Local Docker E2E; requires Docker and `PORTFOLIO_GITHUB_TOKEN`.                                   |

## Local development

Install the workspace once from the repository root:

```bash
bun install
```

Preferred development command (Vault injects the dev secrets and `--force` clears Astro's content-layer cache):

```bash
bun portfolio
```

Equivalent package command with a local token:

```bash
cp packages/portfolio/.env.example packages/portfolio/.env
# edit packages/portfolio/.env and set PORTFOLIO_GITHUB_TOKEN
bun run --filter @pkgs/portfolio dev
```

Build through Vault:

```bash
bun portfolio:build
```

Run the full local generation pipeline (hosted screenshots + optimized derivatives + resume):

```bash
bun run --filter @pkgs/portfolio gen
```

Image sources are committed under `assets/`; only optimized WebP derivatives are served from `public/`. After adding or changing a source, run:

```bash
bun run --filter @pkgs/portfolio assets:optimize
bun run --filter @pkgs/portfolio assets:prune
```

The Docker E2E is intentionally local-only:

```bash
vault run --config dev -- bun run --filter @pkgs/portfolio test:docker
```

## Content

`projects.ts` is the source of truth for project listings. Entries are split across `src/content/projects/entries-part-1.ts` and `entries-part-2.ts` to stay under the repository file-size limit; append new projects to `entries-part-2.ts`. Descriptions may contain trusted HTML (`<a class="inline-link" …>`); the Projects section renders them with `set:html`.

Work highlights are authored in `src/content/work.ts`; the original `jobDescription` remains the resume source while `highlights` powers the scannable site cards. `src/content/skills.ts` is shared by the About Toolbox and resume generator.
