import type { APIRoute } from 'astro';
import { buildLlmsFull } from '@/lib/agent';

export const GET: APIRoute = async () => {
  const body = await buildLlmsFull();
  return new Response(body.endsWith('\n') ? body : `${body}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
