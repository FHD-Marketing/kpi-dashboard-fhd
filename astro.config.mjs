// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://kpi.00224466.xyz',
  output: 'server',
  adapter: vercel(),
  server: { host: 'localhost', port: 4321 },
});
