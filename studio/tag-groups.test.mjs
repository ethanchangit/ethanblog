import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyTagGroupsSource,
  normalizeTagGroups,
  parseTagGroupsSource,
  readTagTaxonomy,
  saveTagGroups,
} from './tag-groups.mjs';

const REAL_FILE = fileURLToPath(new URL('../src/data/tag-groups.ts', import.meta.url));

const FIXTURE = `/**
 * fixture
 */
export const ALL_GROUP = 'all';

export const FALLBACK_GROUP = {
  slug: 'other',
  title: '其他',
  titleEn: 'Other',
} as const;

export const tagGroups: TagGroup[] = [
  {
    slug: 'writing',
    title: '写作与知识',
    titleEn: 'Writing & knowledge',
    tags: ['PKM', '知识管理'],
  },
];

export function groupedTags(allTags: string[]): TagGroup[] {
  return tagGroups;
}
`;

describe('studio tag groups', () => {
  it('parses the live tag-groups.ts catalog', async () => {
    const source = await readFile(REAL_FILE, 'utf8');
    const groups = parseTagGroupsSource(source);
    assert.ok(groups.some((group) => group.slug === 'writing'));
    const writing = groups.find((group) => group.slug === 'writing');
    assert.ok(writing.tags.includes('PKM'));
    const roundtrip = parseTagGroupsSource(applyTagGroupsSource(source, groups));
    assert.deepEqual(roundtrip, groups);
    assert.match(applyTagGroupsSource(source, groups), /export function groupedTags/);
  });

  it('rejects reserved slugs and duplicate tags', () => {
    assert.throws(
      () => normalizeTagGroups([{ slug: 'all', title: '全部', titleEn: 'All', tags: [] }]),
      /不合法/,
    );
    assert.throws(
      () => normalizeTagGroups([
        { slug: 'a', title: '甲', titleEn: 'A', tags: ['PKM'] },
        { slug: 'b', title: '乙', titleEn: 'B', tags: ['PKM'] },
      ]),
      /重复/,
    );
  });

  it('saves groups without rewriting article frontmatter', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'studio-tags-'));
    try {
      await mkdir(path.join(root, 'src/data'), { recursive: true });
      await mkdir(path.join(root, 'src/content/articles'), { recursive: true });
      await writeFile(path.join(root, 'src/data/tag-groups.ts'), FIXTURE);
      const article = `---
title: "Hello"
tags:
  - PKM
  - LooseTag
---

body
`;
      await writeFile(path.join(root, 'src/content/articles/hello.mdx'), article);
      const before = await readTagTaxonomy(root);
      assert.deepEqual(before.ungrouped, ['LooseTag']);
      const saved = await saveTagGroups(root, [
        {
          slug: 'writing',
          title: '写作与知识',
          titleEn: 'Writing & knowledge',
          tags: ['PKM', '笔记'],
        },
        {
          slug: 'lab',
          title: '实验室',
          titleEn: 'Lab',
          tags: [],
        },
      ]);
      assert.equal(saved.groups.length, 2);
      assert.ok(saved.groups[0].tags.includes('笔记'));
      assert.deepEqual(saved.ungrouped, ['LooseTag']);
      const articleAfter = await readFile(path.join(root, 'src/content/articles/hello.mdx'), 'utf8');
      assert.equal(articleAfter, article);
      const source = await readFile(path.join(root, 'src/data/tag-groups.ts'), 'utf8');
      assert.match(source, /slug: "lab"/);
      assert.match(source, /export function groupedTags/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
