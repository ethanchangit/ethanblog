import type { APIRoute } from 'astro';
import { apiCatalogDocument } from '@/lib/agent';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(apiCatalogDocument(), null, 2), {
    headers: {
      'Content-Type': 'application/linkset+json; charset=utf-8',
    },
  });
