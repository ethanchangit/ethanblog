import type { APIRoute } from 'astro';
import { agentMarkdownPages, markdownResponse } from '@/lib/agent';

export async function getStaticPaths() {
  const pages = await agentMarkdownPages();
  return pages.map((page) => ({
    params: { slug: page.slug },
    props: { body: page.body },
  }));
}

export const GET: APIRoute = ({ props }) => markdownResponse(props.body);
