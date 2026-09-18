# @pkgs/portfolio

Source for [www.chrisvouga.dev](https://www.chrisvouga.dev): an Astro static site, the
content registry, and the site's container image.

It is a Bun workspace package inside the `crvouga/workspace` monorepo. The image
(`ghcr.io/crvouga/chrisvouga-portfolio`) is built and pushed by the root
[`ci.yml`](../../.github/workflows/ci.yml) publish job from the **repo-root build context**
(`docker build -f packages/portfolio/Dockerfile .`), then deployed by the fleet deploy jobs in
the same workflow. Runtime hosting config lives in
[`packages/infra/services.yaml`](../infra/services.yaml) (`id: portfolio`).

## Architecture

Astro 7, `output: 'static'`, no integrations: the build emits **one** HTML document
(`dist/index.html`) with all CSS inlined, self-hosted variable fonts, and two tiny inline
scripts (click-to-copy email, native `<dialog>` image gallery). No client framework, no
analytics, no external requests at runtime except the lazy YouTube embed.

GitHub proof data (contribution heatmap, streaks, repo/follower counts) is fetched from the
GitHub API **at build time** (`src/lib/github.ts`, Node `fetch`, 10s timeouts, 24h cache at
`node_modules/.cache/portfolio-github.json`) and rendered as an inline SVG. Failure policy:
GitHub is never allowed to fail the build — no token → REST counts only; GitHub unreachable →
the proof section is omitted with a build warning. Note: GitHub returns an empty contribution
calendar while the profile's activity visibility is set to private; making activity public on
the GitHub account restores the heatmap.

Requires Node ≥ 22 on PATH for `build`/`dev`/`tc` (Astro runs via Node; Bun installs deps).

## Layout

| Path                           | Purpose                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `astro.config.mjs`             | Astro config (static output, always-inlined stylesheets).                        |
| `src/pages/index.astro`        | The single page.                                                                 |
| `src/components/`              | Page sections (Nav, Hero, ProofOfWork, ContributionHeatmap, Agentic, …) + icons. |
| `src/lib/github.ts`            | Build-time GitHub GraphQL/REST fetch, level bucketing, streaks, cache.           |
| `src/layouts/Base.astro`       | `<head>`: meta/OG/JSON-LD, font preloads, global stylesheet.                     |
| `src/styles/global.css`        | Design tokens (palette ported from the retired `src/ui/theme.ts`) + base styles. |
| `src/content/`                 | Content registry (`projects.ts` at package root is the entry point).             |
| `scripts/health-check-urls.ts` | Validates every public URL referenced by content (also run by CI).               |
| `Dockerfile`, `nginx.conf`     | Site container, built from the repo root.                                        |
| `test/server.test.ts`          | Docker E2E smoke test (built from the repo root).                                |

## Scripts

Run from the repo root with `bun run --filter @pkgs/portfolio <script>`, or from this directory
with `bun run <script>`.

| Script                                                        | Purpose                                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `build`                                                       | `astro build` → single `dist/index.html` + `public/` assets.                      |
| `dev`, `start`, `local`                                       | `astro dev` (watch + serve).                                                      |
| `gen` / `generate-all`                                        | Content pipeline: screenshots (Playwright) + resume PDF.                          |
| `generate-resume`                                             | Regenerate `public/chris-vouga-resume.pdf`.                                       |
| `screenshot-work` / `screenshot-projects` / `screenshot-main` | Per-collection screenshot capture.                                                |
| `health-check-urls`                                           | GET every public URL in content; exits non-zero on failure.                       |
| `preview`                                                     | Build the image and run the container on port 80.                                 |
| `test:docker`                                                 | Build the image from the repo root, run it, assert it serves HTML (needs Docker). |
| `tc`                                                          | `astro check` (TS + `.astro`, strict).                                            |
| `lint`                                                        | ESLint with the shared workspace rules (TS files; generated `.astro/` ignored).   |

`test` intentionally runs only tests under `src/` so the Docker E2E never runs in the CI `check`
job; run `test:docker` locally instead.

## Content

`projects.ts` is the entry point for project listings (titles, descriptions, images, public URLs,
topics). Entries are split across `src/content/projects/entries-part-1.ts` and
`entries-part-2.ts` to stay under the repo's file-size limit: `PROJECTS` is the concatenation of
part 1 then part 2, and the rendered order follows it — **append new projects to
`entries-part-2.ts`**. Descriptions may contain HTML (`<a class="inline-link" …>`); the page
renders them with `set:html`.

Hosting for a side project is declared in [`packages/infra/services.yaml`](../infra/services.yaml);
the portfolio only needs the public `deployment.url`.

## Local development

The workspace install happens at the repo root (`bun install`).

```bash
bun run --filter @pkgs/portfolio build
bun run --filter @pkgs/portfolio dev
```

Build with the full contribution heatmap locally (needs a GitHub token; without one the page
still builds with REST-only stats):

```bash
GITHUB_TOKEN=$(gh auth token) bun run --filter @pkgs/portfolio build
```
