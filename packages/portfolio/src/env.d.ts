/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PORTFOLIO_GITHUB_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
