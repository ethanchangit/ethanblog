import type { APIRoute } from 'astro';
import { openApiDocument } from '@/lib/agent';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(openApiDocument(), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
