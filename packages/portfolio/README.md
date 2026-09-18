# @pkgs/portfolio

Source for [www.chrisvouga.dev](https://www.chrisvouga.dev): the static-site generator, the
content registry, and the site's container image.

It is a Bun workspace package inside the `crvouga/workspace` monorepo. The image
(`ghcr.io/crvouga/chrisvouga-portfolio`) is built and pushed by the root
[`ci.yml`](../../.github/workflows/ci.yml) publish job from the **repo-root build context**
(`docker build -f packages/portfolio/Dockerfile .`), then deployed by the fleet deploy jobs in
the same workflow. Runtime hosting config lives in
[`packages/infra/services.yaml`](../infra/services.yaml) (`id: portfolio`).

## Layout

| Path                           | Purpose                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `src/`                         | Static-site generator (renders `index.html` into `dist/`).                         |
| `projects.ts`                  | Content registry entry point (types, helpers, `PROJECTS`).                         |
| `src/content/projects/`        | Project entries (`entries-part-1.ts`, `entries-part-2.ts`), types, shared helpers. |
| `scripts/health-check-urls.ts` | Validates every public URL referenced by content (also run by CI).                 |
| `Dockerfile`, `nginx.conf`     | Site container, built from the repo root.                                          |
| `test/server.test.ts`          | Docker E2E smoke test (built from the repo root).                                  |

## Scripts

Run from the repo root with `bun run --filter @pkgs/portfolio <script>`, or from this directory
with `bun run <script>`.

| Script                                                        | Purpose                                                                            |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `build`                                                       | Render the site into `dist/` and copy `public/` + fonts.                           |
| `dev`, `start`, `local`                                       | Watch-rebuild and serve `dist/`.                                                   |
| `gen` / `generate-all`                                        | Full content pipeline: screenshots (Playwright) + resume PDF + image optimization. |
| `generate-resume`                                             | Regenerate `public/chris-vouga-resume.pdf`.                                        |
| `optimize-images`                                             | Rebuild `*.optimized.webp` derivatives with `sharp`.                               |
| `screenshot-work` / `screenshot-projects` / `screenshot-main` | Per-collection screenshot capture.                                                 |
| `health-check-urls`                                           | GET every public URL in content; exits non-zero on failure.                        |
| `preview`                                                     | Build the image and run the container on port 80.                                  |
| `test:docker`                                                 | Build the image from the repo root, run it, assert it serves HTML (needs Docker).  |
| `tc`                                                          | `tsc --noEmit` against the shared strict config.                                   |
| `lint`                                                        | ESLint with the shared workspace rules.                                            |

`test` intentionally runs only tests under `src/` so the Docker E2E never runs in the CI `check`
job; run `test:docker` locally instead.

## Content

`projects.ts` is the entry point for project listings (titles, descriptions, images, public URLs,
topics). Entries are split across `src/content/projects/entries-part-1.ts` and
`entries-part-2.ts` to stay under the repo's file-size limit: `PROJECTS` is the concatenation of
part 1 then part 2, and the rendered order follows it — **append new projects to
`entries-part-2.ts`**.

Hosting for a side project is declared in [`packages/infra/services.yaml`](../infra/services.yaml);
the portfolio only needs the public `deployment.url`.

## Local development

The workspace install happens at the repo root (`bun install`).

```bash
bun run --filter @pkgs/portfolio build
bun run --filter @pkgs/portfolio dev
```
