// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://kpi.nwdl.org',
  output: 'server',
  adapter: vercel(),
  server: { host: 'localhost', port: 4321 },
});
