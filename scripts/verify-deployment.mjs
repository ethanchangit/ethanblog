import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const expected = JSON.parse(await readFile('dist/__studio-release.json', 'utf8'));
const origin = process.env.DEPLOYMENT_URL || 'https://ethanchang.io';
const live = await fetch(`${origin}/__studio-release.json?check=${Date.now()}`, { signal: AbortSignal.timeout(20000), headers: { 'cache-control': 'no-cache' } });
if (!live.ok || (await live.json()).commitSha !== expected.commitSha) throw new Error('线上版本与本次 GitHub 更新不一致');
// Verify public HTML at its normal URL and unchanged binary/static assets. Cloudflare
// can rewrite email links inside HTML, so only static assets are byte-compared.
const queue = Object.entries(expected.files).filter(([href]) => !['/404.html', '/_headers', '/_redirects'].includes(href));
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const [file, digest] = queue.shift();
    const href = file.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    const response = await fetch(new URL(href, origin), { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`线上页面或素材不可访问：${href}`);
    if (!file.endsWith('.html')) {
      const actual = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
      if (actual !== digest) throw new Error(`线上素材版本不符：${href}`);
    } else await response.body.cancel();
  }
}));
console.log(`已核验线上版本 ${expected.commitSha}`);
