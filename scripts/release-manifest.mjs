import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const files = {};
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '_worker.js' || entry.name === '__studio-release.json' || entry.name.startsWith('_routes')) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else {
      const href = '/' + path.relative('dist', file).replaceAll(path.sep, '/');
      files[href] = createHash('sha256').update(await readFile(file)).digest('hex');
    }
  }
}
await walk('dist');
await writeFile('dist/__studio-release.json', JSON.stringify({ version: 2, commitSha, files }));
