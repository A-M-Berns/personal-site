// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkSidenotes from '@tufte-markdown/remark-sidenotes';

export default defineConfig({
  site: 'https://amberns.com',
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [remarkSidenotes],
  },
});
