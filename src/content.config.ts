import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * stories — 站点的叙事单元。
 * kind 区分发布档位：notebook = 编号过程笔记，essay = 定稿文章，
 * interactive = 定稿互动故事。notebook 也可以嵌交互组件。
 */
const stories = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/stories' }),
  schema: z
    .object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      kind: z.enum(['interactive', 'essay', 'notebook']).default('essay'),
      thread: z.string().optional(), // 所属研究线 slug（见 src/data/threads.ts）
      seq: z.number().int().positive().optional(), // 研究线内的编号，从 1 开始
      tags: z.array(z.string()).default([]),
      cover: z.string().optional(),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
      lang: z.enum(['zh', 'en']).default('zh'),
    })
    .superRefine((data, ctx) => {
      // notebook 是研究线上的编号笔记，必须挂在某条线上并有编号
      if (data.kind === 'notebook') {
        if (!data.thread) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['thread'],
            message: 'kind 为 notebook 的笔记必须指定 thread（所属研究线 slug）',
          });
        }
        if (data.seq === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['seq'],
            message: 'kind 为 notebook 的笔记必须指定 seq（研究线内编号，正整数）',
          });
        }
      }
    }),
});

/**
 * projects — 软件与开源项目展示。
 * demo 字段指向 public/demos/ 下的自包含演示包，喂给 InteractiveDemo 组件。
 */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    status: z.enum(['active', 'shipped', 'archived', 'wip']),
    order: z.number().default(99),
    stack: z.array(z.string()).default([]),
    platforms: z.array(z.string()).default([]),
    repo: z.string().url().optional(),
    homepage: z.string().url().optional(),
    downloads: z
      .array(z.object({ label: z.string(), url: z.string(), platform: z.string().optional() }))
      .default([]),
    screenshots: z.array(z.object({ src: z.string(), alt: z.string() })).default([]),
    demo: z.object({ src: z.string(), height: z.string().optional() }).optional(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { stories, projects };
