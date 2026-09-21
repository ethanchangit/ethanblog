// Grandfather existing articles without inventing links; every changed/new article
// must satisfy the same contract as a dashboard submission, including drafts.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseMdx, serializeMdx, validateContentFile } from '../studio/core.mjs';

const base = process.env.STUDIO_BASE_SHA || 'HEAD^';
if (!/^[0-9a-f]{40}$|^HEAD\^$/.test(base)) throw new Error('Invalid content comparison revision');
const paths = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', '-z', base, 'HEAD', '--', 'src/content/articles', 'src/content/projects'], { encoding: 'utf8' }).split('\0').filter((p) => p.endsWith('.mdx'));
for (const file of paths) {
  const raw = readFileSync(file, 'utf8');
  let prior = '';
  try { prior = execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch {}
  // Removing a retired translation does not invent a new Heptabase identity.
  if (prior && serializeMdx(parseMdx(prior)) === serializeMdx(parseMdx(raw))) continue;
  validateContentFile(file, raw);
}
const all = execFileSync('git', ['ls-files', '-z', 'src/content/articles', 'src/content/projects'], { encoding: 'utf8' }).split('\0').filter((p) => p.endsWith('.mdx'));
const links = new Map();
for (const file of all) {
  const link = parseMdx(readFileSync(file, 'utf8')).frontmatter.heptabaseCardLink?.toLowerCase();
  if (!link) continue;
  if (links.has(link)) throw new Error(`Duplicate Heptabase card link: ${links.get(link)} and ${file}`);
  links.set(link, file);
}
console.log(`Verified Heptabase links for ${paths.length} changed content files.`);
