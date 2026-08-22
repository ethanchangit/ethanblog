#!/usr/bin/env node
/**
 * Static preview with Accept: text/markdown negotiation.
 * Keep parser rules aligned with src/lib/accept.ts.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from 'serve-handler';
import {
  markdownAssetPath,
  preferredType,
  shouldNegotiate,
} from '../src/lib/accept.ts';

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

function send(res, status, contentType, body, extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Vary', extra.vary ?? 'Accept');
  res.end(body);
}

const port = portFromArgs(process.argv.slice(2));

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (shouldNegotiate(url.pathname) && req.method !== 'OPTIONS') {
    const chosen = preferredType(req.headers.accept ?? null);
    if (chosen === null) {
      send(res, 406, 'text/plain; charset=utf-8', 'Not Acceptable. Available representations: text/html, text/markdown.');
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
      if (!current.toLowerCase().split(',').map((s) => s.trim()).includes('accept')) {
        return originalSetHeader(name, `${current}, Accept`);
      }
      return originalSetHeader(name, value);
    }
    return originalSetHeader(name, value);
  };

  await handler(req, res, {
    public: dist,
    redirects: serveConfig.redirects,
    cleanUrls: false,
    trailingSlash: false,
  });

  if (!res.headersSent && !res.hasHeader('vary')) {
    res.setHeader('Vary', 'Accept');
  }
});

server.listen(port, () => {
  console.log(`Preview http://localhost:${port}`);
});
