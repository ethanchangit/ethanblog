// Local `astro dev` only. Production never imports this file.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHandler } from './server.mjs';
import { isLocalHost } from '../lib.mjs';

// node:sqlite on some Node 22 builds rejects D1's ?1 placeholders and cannot reuse a number.
function positional(sql) {
  const order = [];
  const text = sql.replace(/\?(\d+)/g, (_, number) => {
    order.push(Number(number) - 1);
    return '?';
  });
  return { text, order };
}

class LocalD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(new URL('../../migrations/0004_studio.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const { text, order } = positional(sql);
    const statement = this.sqlite.prepare(text);
    let args = [];
    const wrapper = {
      bind(...values) { args = order.map((index) => values[index]); return wrapper; },
      async first() { return statement.get(...args) || null; },
      async all() { return { results: statement.all(...args) }; },
      async run() {
        const result = statement.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return wrapper;
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

const env = {
  DB: new LocalD1(),
  STUDIO_DEV_OPEN: true,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  STUDIO_SECRET: process.env.STUDIO_SECRET || '',
  STUDIO_PASSWORD_HASH: process.env.STUDIO_PASSWORD_HASH || '',
};
const handler = createHandler();

export async function handleDashboardApi(req, res) {
  if (!isLocalHost(req.headers.host)) {
    res.statusCode = 403;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'dashboard API 只接受本机请求' }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const host = req.headers.host || 'localhost';
  const request = new Request(`http://${host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    ...(body.length && req.method !== 'GET' && req.method !== 'HEAD' ? { body, duplex: 'half' } : {}),
  });
  const response = await handler(request, env);
  const headers = Object.fromEntries(response.headers);
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}
