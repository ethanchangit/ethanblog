// Local `astro dev` only. Production never imports this file.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './server.mjs';
import { isLocalHost } from '../lib.mjs';

export function parseDevVars(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

function pickSecret(environment, file, keys) {
  for (const key of keys) if (environment?.[key]) return environment[key];
  for (const key of keys) if (file[key]) return file[key];
  return '';
}

export function dashboardSecrets(environment, fileText) {
  const file = parseDevVars(fileText);
  return {
    GITHUB_TOKEN: pickSecret(environment, file, ['GITHUB_TOKEN', 'GITHUB_TOKEN_BLOG']),
    STUDIO_SECRET: pickSecret(environment, file, ['STUDIO_SECRET']),
    STUDIO_PASSWORD_HASH: pickSecret(environment, file, ['STUDIO_PASSWORD_HASH']),
  };
}

function databasePath() {
  if (process.env.STUDIO_DASHBOARD_MEMORY === '1') return ':memory:';
  const file = fileURLToPath(new URL('../../.studio/dashboard.sqlite', import.meta.url));
  mkdirSync(dirname(file), { recursive: true });
  return file;
}

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
    this.sqlite = new DatabaseSync(databasePath());
    this.sqlite.exec(readFileSync(new URL('../../migrations/0004_studio.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0005_card_pulls.sql', import.meta.url), 'utf8'));
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
  GITHUB_TOKEN: '',
  STUDIO_SECRET: '',
  STUDIO_PASSWORD_HASH: '',
};
const handler = createHandler();

function refreshSecrets() {
  let text = '';
  try { text = readFileSync(new URL('../../.dev.vars', import.meta.url), 'utf8'); } catch { /* local file is optional */ }
  Object.assign(env, dashboardSecrets(process.env, text));
}

export async function handleDashboardApi(req, res) {
  if (!isLocalHost(req.headers.host)) {
    res.statusCode = 403;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'dashboard API 只接受本机请求' }));
    return;
  }
  refreshSecrets();
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
