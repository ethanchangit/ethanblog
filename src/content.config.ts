import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 文章与项目共用同一份 MDX 形态。
 * `slot` 决定出现在哪份索引（/articles 还是 /projects），不是 topical `tags`。
 * 文件夹 `articles/`、`projects/` 只是落盘方便；路由与列表按 slot 过滤。
 * `/blogs` 是手工引用列表（`src/content/pages/blogs.mdx` 里的 `<DocRef of="…" />`），不是第三个 slot。
 * 系列子文落在 `articles/<hub>/<n>.mdx`（id 含 `/`），默认不进索引；总览是旁边那份 `<hub>.mdx`。
 * `listed: false` 可把顶层文章也藏起来；`listed: true` 可把子文强行放进索引。
 * 项目可选用 repo / demo / screenshots 等额外键；文章省略即可。
 */
const docSchema = z
  .object({
    slot: z.enum(['article', 'project']),
    title: z.string(),
    titleEn: z.string().optional(),
    description: z.string(),
    descriptionEn: z.string().optional(),
    date: z.coerce.date().optional(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    listed: z.boolean().optional(),
    status: z.enum(['active', 'shipped', 'archived', 'wip']).optional(),
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
  })
  .superRefine((value, ctx) => {
    if (value.slot === 'article' && value.date == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'slot: article 必须有 date',
        path: ['date'],
      });
    }
  });

const articles = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/articles' }),
  schema: docSchema,
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: docSchema,
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    titleEn: z.string(),
    description: z.string(),
    descriptionEn: z.string().optional(),
  }),
});

export const collections = { articles, projects, pages };
