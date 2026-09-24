#!/usr/bin/env node
/**
 * Static preview with Accept: text/markdown negotiation.
 * Keep parser rules aligned with src/lib/accept.ts.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from 'serve-handler';
import {
  markdownAssetPath,
  preferredType,
  shouldNegotiate,
} from '../src/lib/accept.ts';
import { fallbackFor, routeRequest } from '../src/lib/hosts.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const serveConfig = JSON.parse(await readFile(path.resolve(here, '../serve.json'), 'utf8'));

const NOT_FOUND_MD = `# 404 — page not found

This URL is not a page on ethanchang.io. It may have moved, or it never existed.

Try one of these next:

- [Home](/)
- [Articles](/articles)
- [ethanchang.io developer resources](/for-agents)
- [llms.txt](/llms.txt)
- [Sitemap](/sitemap.xml)
- [Contact](/contact)
- [Privacy](/privacy)
`;

function portFromArgs(argv) {
  const envPort = Number(process.env.PORT);
  if (Number.isInteger(envPort) && envPort > 0) return envPort;
  const flag = argv.findIndex((arg) => arg === '--port' || arg === '-l');
  if (flag >= 0) {
    const value = Number(argv[flag + 1]);
    if (Number.isInteger(value) && value > 0) return value;
  }
  const eq = argv.find((arg) => arg.startsWith('--port='));
  if (eq) {
    const value = Number(eq.slice('--port='.length));
    if (Number.isInteger(value) && value > 0) return value;
  }
  return 3000;
}

function send(res, status, contentType, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Vary', 'Accept');
  res.end(body);
}

const port = portFromArgs(process.argv.slice(2));

async function builtPage(pathname) {
  const base = path.join(dist, decodeURIComponent(pathname).replace(/^\/+/, ''));
  for (const candidate of [base, `${base}.html`, path.join(base, 'index.html')]) {
    try { if ((await stat(candidate)).isFile()) return true; } catch { /* try the next form */ }
  }
  return false;
}

const server = createServer(async (req, res) => {
  let url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  // Same host routing as scripts/cf-worker-entry.mjs: en.localhost is the English site.
  const decision = routeRequest(url);
  if (decision.type === 'redirect') { res.writeHead(decision.status, { location: decision.location }); res.end(); return; }
  if (decision.type === 'rewrite') {
    // serve-handler strips trailing slashes by redirecting; do it here so /en never leaks.
    const built = decision.path.replace(/\/+$/, '') || '/';
    if (!(await builtPage(built))) { res.writeHead(302, { location: fallbackFor(url) }); res.end(); return; }
    req.url = built + url.search;
    url = new URL(req.url, url);
  }
  if ((url.pathname === '/zh' || url.pathname.startsWith('/zh/')) && !url.pathname.endsWith('.md') && preferredType(req.headers.accept ?? null) !== 'text/markdown') {
    res.writeHead(301, { location: (url.pathname.slice(3) || '/') + url.search }); res.end(); return;
  }

  if (shouldNegotiate(url.pathname) && req.method !== 'OPTIONS') {
    const chosen = preferredType(req.headers.accept ?? null);
    if (chosen === null) {
      send(
        res,
        406,
        'text/plain; charset=utf-8',
        'Not Acceptable. Available representations: text/html, text/markdown.',
      );
      return;
    }
    if (chosen === 'text/markdown') {
      const mdPath = markdownAssetPath(url.pathname);
      try {
        const body = await readFile(path.join(dist, mdPath.replace(/^\/+/, '')), 'utf8');
        send(res, 200, 'text/markdown; charset=utf-8', body);
        return;
      } catch {
        send(res, 404, 'text/markdown; charset=utf-8', NOT_FOUND_MD);
        return;
      }
    }
  }

  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    if (String(name).toLowerCase() === 'vary') {
      const current = Array.isArray(value) ? value.join(', ') : String(value);
      if (
        !current
          .toLowerCase()
          .split(',')
          .map((s) => s.trim())
          .includes('accept')
      ) {
        return originalSetHeader(name, `${current}, Accept`);
      }
      return originalSetHeader(name, value);
    }
    return originalSetHeader(name, value);
  };
  res.setHeader('Vary', 'Accept');

  await handler(req, res, {
    public: dist,
    redirects: serveConfig.redirects,
    cleanUrls: true,
    directoryListing: false,
    trailingSlash: false,
    headers: [
      {
        source: '**/*.md',
        headers: [{ key: 'Content-Type', value: 'text/markdown; charset=utf-8' }],
      },
      {
        source: '.well-known/api-catalog',
        headers: [{ key: 'Content-Type', value: 'application/linkset+json; charset=utf-8' }],
      },
    ],
  });
});

server.listen(port, () => {
  console.log(`Preview http://localhost:${port}`);
});
