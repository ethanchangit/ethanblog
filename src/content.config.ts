import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * stories — 站点的叙事单元。
 * kind 区分媒介档位：essay = 纯文字档，interactive = 超媒体档（内嵌交互组件）。
 */
const stories = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/stories' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    kind: z.enum(['interactive', 'essay']).default('essay'),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    lang: z.enum(['zh', 'en']).default('zh'),
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
