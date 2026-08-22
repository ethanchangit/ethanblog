import type { APIRoute } from 'astro';
import { buildLlmsTxt } from '@/lib/agent';

export const GET: APIRoute = async () => {
  const body = await buildLlmsTxt();
  return new Response(body.endsWith('\n') ? body : `${body}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
