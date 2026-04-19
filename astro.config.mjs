// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkSidenotes from './plugins/remark-sidenotes.mjs';

export default defineConfig({
  site: 'https://amberns.com',
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [remarkSidenotes],
  },
});
