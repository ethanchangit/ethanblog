/**
 * Cloudflare Pages entry: Accept negotiation, then Astro's generated worker.
 * Bundled into dist/_worker.js/index.js by scripts/wrap-worker.mjs.
 */
import astro from 'astro-entry';
import { createNegotiateFetch } from '../src/lib/cf-negotiate.ts';

export default createNegotiateFetch(astro);
export { pageMap } from 'astro-entry';
