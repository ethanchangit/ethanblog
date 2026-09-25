// Local integration preview only: all GitHub and Heptabase writes stay in memory.
// The dashboard shell is the current studio/online source, so a refresh shows
// design edits together with the sample review. Production still serves the built assets.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { assets } from './assets.generated.mjs';
import { fixture } from './test-fixtures.mjs';
import { seedSampleReview } from './sample-review.mjs';

const onlineRoot = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(onlineRoot, '../..');
const vite = await createViteServer({
  root: onlineRoot,
  base: '/dashboard/',
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  plugins: [
    tailwindcss(),
    {
      name: 'preview-without-vite-client',
      enforce: 'post',
      transformIndexHtml(html) {
        return html.replace(/<script type="module" src="[^"]*@vite\/client"><\/script>\s*/, '');
      },
    },
  ],
  resolve: { alias: { '@': path.join(repo, 'src') } },
  server: { middlewareMode: true, hmr: false, allowedHosts: ['dashboard.test'], fs: { allow: [repo] } },
});

const local = await fixture(assets);
local.env.STUDIO_LOCAL_PREVIEW = true;
globalThis.fetch = local.fetcher;
await local.login(); await local.connect();
seedSampleReview(local);

function handsToVite(url) {
  const pathname = url.split('?')[0];
  if (pathname === '/dashboard/preview.html' || pathname.startsWith('/dashboard/preview')) return false;
  if (pathname.startsWith('/dashboard/api')) return false;
  return pathname === '/dashboard' || pathname === '/dashboard/' || pathname.startsWith('/dashboard/');
}

const viteClientStub = `const sheets = new Map();
export function createHotContext() {
  return { accept() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, off() {}, send() {} };
}
export function updateStyle(id, content) {
  let style = sheets.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('data-vite-dev-id', id);
    document.head.append(style);
    sheets.set(id, style);
  }
  style.textContent = content;
}
export function removeStyle(id) {
  const style = sheets.get(id);
  if (!style) return;
  style.remove();
  sheets.delete(id);
}
`;

const server = createServer(async (req, res) => {
  try {
    const url = req.url || '/';
    if (req.method === 'GET' && url.split('?')[0] === '/dashboard/@vite/client') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(viteClientStub);
      return;
    }
    if (req.method === 'GET' && url.split('?')[0].startsWith('/sample-blog')) {
      const { sampleBlogResponse } = await import('./sample-blog.mjs');
      const host = req.headers.host || `localhost:${server.address().port}`;
      const response = await sampleBlogResponse(`http://${host}${url}`, local);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (/^\/_astro\/[A-Za-z0-9_.-]+$/.test(url)) {
      const bytes = await readFile(new URL(`../../dist${url}`, import.meta.url));
      res.writeHead(200, { 'content-type': url.endsWith('.css') ? 'text/css' : url.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); res.end(bytes); return;
    }
    // Only this loopback-only simulator has test controls, never the deployed handler.
    if (url === '/__test/deploy' && req.method === 'POST') { local.deploy(); res.end('ok'); return; }
    if (req.method === 'GET' && url.split('?')[0] === '/dashboard') {
      res.writeHead(302, { location: '/dashboard/' });
      res.end();
      return;
    }
    if (req.method === 'GET' && url.split('?')[0] === '/dashboard/') {
      let html = await readFile(path.join(onlineRoot, 'index.html'), 'utf8');
      html = await vite.transformIndexHtml('/dashboard/index.html', html);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
      });
      res.end(html);
      return;
    }
    if (req.method === 'GET' && handsToVite(url)) {
      const outcome = await new Promise((resolve, reject) => {
        vite.middlewares(req, res, (err) => { if (err) reject(err); else resolve('next'); });
        res.on('finish', () => resolve('done'));
      });
      if (outcome === 'done' || res.writableEnded || res.headersSent) return;
    }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const host = req.headers.host || `localhost:${server.address().port}`;
    const request = new Request(`http://${host}${url}`, { method: req.method, headers: req.headers, ...(body.length ? { body, duplex: 'half' } : {}) });
    const response = await local.handler(request, local.env);
    if (res.writableEnded) return;
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { if (!res.headersSent) res.writeHead(500); res.end(error instanceof Error ? error.message : String(error)); }
}).listen(Number(process.env.STUDIO_PREVIEW_PORT ?? 4350), '127.0.0.1', () => console.log(`Local simulated dashboard: http://localhost:${server.address().port}/dashboard`));
