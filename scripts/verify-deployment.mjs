import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ZH_ORIGIN = 'https://cn.ethanchang.io';
const EN_ORIGIN = 'https://ethanchang.io';
// Same paths the Worker serves on both hosts (src/lib/hosts.ts SHARED).
const SHARED = /^\/(?:_astro|media|demos|api|\.well-known|_image)(?:\/|$)|^\/(?:favicon\.svg|og-default\.svg|robots\.txt|__studio-release\.json|_routes\.json)$/;
const SKIP = new Set(['/404.html', '/_headers', '/_redirects', '/en/404.html']);

/**
 * Where a built file is actually requested.
 * The blog is English and served on ethanchang.io. Old /en and /zh prefixes are not public.
 */
export function releaseAssetUrl(file, { en = EN_ORIGIN } = {}) {
  if (SHARED.test(file)) return new URL(file, en).href;
  let pathname = file;
  const origin = en;
  if (pathname === '/en' || pathname.startsWith('/en/')) pathname = pathname.slice('/en'.length) || '/';
  if (pathname === '/zh' || pathname.startsWith('/zh/')) pathname = pathname.slice('/zh'.length) || '/';
  if (pathname.endsWith('/index.html')) pathname = pathname.slice(0, -'index.html'.length) || '/';
  else if (pathname.endsWith('.html')) pathname = pathname.slice(0, -'.html'.length);
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  return new URL(pathname, origin).href;
}

async function readExpected() {
  return JSON.parse(await readFile('dist/__studio-release.json', 'utf8'));
}

async function verifyOnce(expected) {
  const origin = process.env.DEPLOYMENT_URL || EN_ORIGIN;
  const manifestUrl = releaseAssetUrl('/__studio-release.json', { en: origin, zh: process.env.ZH_DEPLOYMENT_URL || ZH_ORIGIN });
  const live = await fetch(`${manifestUrl}?check=${Date.now()}`, { signal: AbortSignal.timeout(20000), headers: { 'cache-control': 'no-cache' } });
  if (!live.ok || (await live.json()).commitSha !== expected.commitSha) throw new Error('线上版本与本次 GitHub 更新不一致');
  const zh = process.env.ZH_DEPLOYMENT_URL || ZH_ORIGIN;
  const en = origin;
  const queue = Object.entries(expected.files).filter(([href]) => !SKIP.has(href));
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const [file, digest] = queue.shift();
      const href = releaseAssetUrl(file, { zh, en });
      const response = await fetch(href, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`线上页面或素材不可访问：${href}`);
      if (!file.endsWith('.html')) {
        const actual = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
        if (actual !== digest) throw new Error(`线上素材版本不符：${href}`);
      } else await response.body.cancel();
    }
  }));
}

const attempts = Number(process.env.VERIFY_ATTEMPTS || 12);
const waitMs = Number(process.env.VERIFY_WAIT_MS || 15000);

export async function verifyDeployment() {
  const expected = await readExpected();
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await verifyOnce(expected);
      console.log(`已核验线上版本 ${expected.commitSha}`);
      return;
    } catch (error) {
      last = error;
      const message = error?.cause?.code === 'ENOTFOUND' ? `域名尚未解析：${error.cause.hostname}` : error.message;
      console.log(`核验尚未通过（${attempt}/${attempts}）：${message}`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw last;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await verifyDeployment();
