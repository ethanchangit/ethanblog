/**
 * Dev-only routes.
 * `astro dev` / `npm run dev` → http://localhost:4321/dashboard（免密码，仅本机）。
 * 写作在 Heptabase。本机不再提供 /studio 编辑器。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocalHost } from './local-host.mjs';

const DASHBOARD_INDEX = fileURLToPath(new URL('./online/index.html', import.meta.url));

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function studioDevPlugin() {
  return {
    name: 'ethan-studio',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '/';
        const pathname = rawUrl.split('?')[0];
        if (pathname === '/sample-blog' || pathname.startsWith('/sample-blog/')) {
          if (!isLocalHost(req.headers.host)) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          const { sampleBlogResponse } = await import('./online/sample-blog.mjs');
          const host = req.headers.host || 'localhost';
          const response = await sampleBlogResponse(`http://${host}${rawUrl}`);
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
          return;
        }
        if (pathname === '/dashboard/preview.html') {
          req.url = '/dashboard/preview/';
          return next();
        }
        if (pathname === '/dashboard' || pathname === '/dashboard/') {
          if (!isLocalHost(req.headers.host)) {
            res.statusCode = 403;
            res.end('dashboard 只接受本机请求');
            return;
          }
          const raw = (await readFile(DASHBOARD_INDEX, 'utf8')).replace(
            'src="./dashboard.js"',
            'src="/studio/online/dashboard.js"',
          );
          const html = await server.transformIndexHtml('/dashboard/', raw);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(html);
          return;
        }
        if (pathname.startsWith('/dashboard/api')) {
          const { handleDashboardApi } = await import('./online/dev-api.mjs');
          try { await handleDashboardApi(req, res); }
          catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            json(res, 500, { error: message });
          }
          return;
        }
        return next();
      });
    },
    handleHotUpdate(ctx) {
      if (ctx.file.includes(`${path.sep}src${path.sep}content${path.sep}`)) {
        return [];
      }
    },
  };
}

export function studioIntegration() {
  return {
    name: 'ethan-studio',
    hooks: {
      'astro:config:setup': ({ command, updateConfig, logger }) => {
        if (command !== 'dev') return;
        updateConfig({
          vite: {
            plugins: [studioDevPlugin()],
          },
        });
        logger.info('本地后台：http://localhost:4321/dashboard（免密码，仅本机 dev）');
      },
    },
  };
}
