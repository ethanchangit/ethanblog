#!/usr/bin/env node
/**
 * Astro's Cloudflare adapter excludes every prerendered page from the
 * Worker. Exclude wins over include, so Accept negotiation in middleware
 * would never run on `/` or `/articles/*`. Rewrite _routes.json so document
 * requests go through the Worker while hashed assets stay on the asset server.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/_routes.json');
const routes = {
  version: 1,
  include: ['/*'],
  exclude: ['/_astro/*', '/media/*', '/demos/*', '/favicon.svg', '/og-default.svg'],
};

await writeFile(dist, `${JSON.stringify(routes, null, 2)}\n`);
const written = JSON.parse(await readFile(dist, 'utf8'));
if (!written.include.includes('/*') || written.exclude.includes('/')) {
  throw new Error('patch-routes: homepage would still bypass the Worker');
}
console.log('patched dist/_routes.json so document routes hit the Worker');
