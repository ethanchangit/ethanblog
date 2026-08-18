import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * articles — 站点的文章单元（对外路由 /articles）。
 * kind 区分发布档位：notebook = 编号过程笔记，essay = 定稿文章，
 * interactive = 定稿互动文章。notebook 也可以嵌交互组件。
 */
const articles = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/articles' }),
  schema: z
    .object({
      title: z.string(),
      titleEn: z.string().optional(),
      description: z.string(),
      descriptionEn: z.string().optional(),
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
      // 溯源：这篇内容由什么原始素材转化而来（对话 / 笔记 / 博客草稿）。
      // 定稿档建议必填（validate:content 会提醒），页眉自动渲染溯源行。
      source: z
        .object({
          type: z.enum(['chat', 'notes', 'blog', 'mixed']),
          origin: z.string().optional(), // 原始素材的自由文本描述
          date: z.coerce.date().optional(),
        })
        .optional(),
      // 版本历史即媒介：true 时文末自动渲染「这一页如何长成」（git 提交史）。
      // opt-in——提交信息按 publish:/revise: 约定书写后再打开。
      history: z.boolean().default(false),
    })
    .superRefine((data, ctx) => {
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
 * projects — 软件与开源项目展示（对外路由 /projects）。
 * demo 字段指向 public/demos/ 下的自包含演示包，喂给 InteractiveDemo 组件。
 */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: z.object({
    name: z.string(),
    nameEn: z.string().optional(),
    tagline: z.string(),
    taglineEn: z.string().optional(),
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
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles, projects };
