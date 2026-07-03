import type { APIRoute } from 'astro';
import { getUser } from '@/lib/user';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const user = await getUser(request, locals.runtime.env);
  return Response.json({ user });
};
