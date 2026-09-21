import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.chrisvouga.dev',
  output: 'static',
  build: { inlineStylesheets: 'always' },
  // Emits sitemap-index.xml + sitemap-0.xml. /404 and non-page endpoints
  // (llms.txt) are excluded automatically.
  integrations: [sitemap()],
});
