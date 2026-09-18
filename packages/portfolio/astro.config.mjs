import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.chrisvouga.dev',
  output: 'static',
  build: { inlineStylesheets: 'always' },
});
