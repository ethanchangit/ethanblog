#!/usr/bin/env node
/**
 * Astro's Cloudflare handler serves prerendered HTML from ASSETS before
 * middleware runs. Keep _routes.json sending documents to the Worker, then
 * wrap the generated entry so Accept: text/markdown is handled first.
 */
import { access, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = path.join(root, 'dist/_worker.js');
const indexJs = path.join(workerDir, 'index.js');
const astroEntry = path.join(workerDir, 'astro-entry.js');

try {
  await access(indexJs);
} catch {
  throw new Error('wrap-worker: dist/_worker.js/index.js is missing');
}

await rename(indexJs, astroEntry);

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'scripts/cf-worker-entry.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: indexJs,
  plugins: [
    {
      name: 'astro-entry-external',
      setup(build) {
        build.onResolve({ filter: /^astro-entry$/ }, () => ({
          path: './astro-entry.js',
          external: true,
        }));
      },
    },
  ],
});

const written = await readFile(indexJs, 'utf8');
if (!written.includes('text/markdown') || !written.includes('./astro-entry.js')) {
  throw new Error('wrap-worker: negotiation entry was not written');
}
console.log('wrapped dist/_worker.js so Accept negotiation runs before Astro assets');
