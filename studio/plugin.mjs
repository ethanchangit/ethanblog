/**
 * Dev-only writing studio.
 * `astro dev` / `npm run studio` → http://localhost:4321/studio
 * Production builds never inject the route or the filesystem API.
 */
import { fileURLToPath } from 'node:url';
import {
  addDocRefToDoc,
  createDoc,
  gitCommit,
  gitPush,
  gitStatus,
  isLocalHost,
  listDocs,
  readDoc,
  saveDoc,
  setBlogsRef,
} from './lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = fileURLToPath(new URL('./page.astro', import.meta.url));
const MAX_BODY = 2_000_000;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('正文太大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

export async function handleStudioApi(root, req, url) {
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  const method = req.method ?? 'GET';

  if (pathname === '/__studio/api/docs' && method === 'GET') {
    return { status: 200, body: await listDocs(root) };
  }

  if (pathname === '/__studio/api/doc' && method === 'GET') {
    const collection = url.searchParams.get('collection') ?? '';
    const id = url.searchParams.get('id') ?? '';
    return { status: 200, body: await readDoc(root, collection, id) };
  }

  if (pathname === '/__studio/api/doc' && method === 'PUT') {
    const payload = await readJson(req);
    return { status: 200, body: await saveDoc(root, payload) };
  }

  if (pathname === '/__studio/api/create' && method === 'POST') {
    const payload = await readJson(req);
    const created = await createDoc(root, payload);
    return { status: 201, body: created };
  }

  if (pathname === '/__studio/api/blogs' && method === 'POST') {
    const payload = await readJson(req);
    const refs = await setBlogsRef(root, payload.of, payload.present !== false);
    return { status: 200, body: { refs } };
  }

  if (pathname === '/__studio/api/link' && method === 'POST') {
    const payload = await readJson(req);
    const doc = await addDocRefToDoc(root, payload.collection, payload.id, payload.of, {
      pane: payload.pane,
    });
    return { status: 200, body: doc };
  }

  if (pathname === '/__studio/api/git' && method === 'GET') {
    return { status: 200, body: await gitStatus(root) };
  }

  if (pathname === '/__studio/api/git/commit' && method === 'POST') {
    const payload = await readJson(req);
    return { status: 200, body: await gitCommit(root, payload.message) };
  }

  if (pathname === '/__studio/api/git/push' && method === 'POST') {
    return { status: 200, body: await gitPush(root) };
  }

  return { status: 404, body: { error: 'not found' } };
}

function studioApiPlugin(root = ROOT) {
  return {
    name: 'ethan-studio-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '/';
        if (!rawUrl.startsWith('/__studio/api')) return next();
        if (!isLocalHost(req.headers.host)) {
          json(res, 403, { error: 'studio API 只接受本机请求' });
          return;
        }
        try {
          const url = new URL(rawUrl, 'http://127.0.0.1');
          const result = await handleStudioApi(root, req, url);
          json(res, result.status, result.body);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const status = /不合法|请填写|没有可提交|已存在|未知的/.test(message) ? 400 : 500;
          json(res, status, { error: message });
        }
      });
    },
  };
}

export function studioIntegration() {
  return {
    name: 'ethan-studio',
    hooks: {
      'astro:config:setup': ({ command, injectRoute, updateConfig, logger }) => {
        if (command !== 'dev') return;
        injectRoute({
          pattern: '/studio',
          entrypoint: PAGE,
        });
        updateConfig({
          vite: {
            plugins: [studioApiPlugin()],
          },
        });
        logger.info('本地编辑器：http://localhost:4321/studio');
      },
    },
  };
}
