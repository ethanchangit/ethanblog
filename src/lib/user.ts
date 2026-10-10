import { getSession } from '@/lib/auth';

/**
 * 用户态接缝。只在服务端用：从 better-auth 会话读取。
 * 站点没有读者登录入口，页面不再调用 /api/me；API 保留以便以后重新启用。
 */
export interface User {
  id: string;
  name: string;
  avatarUrl?: string;
}

function toUser(record: { id: string; name: string; image?: string | null }): User {
  return {
    id: record.id,
    name: record.name,
    avatarUrl: record.image ?? undefined,
  };
}

/** 服务端 — Astro pages / API routes */
export async function getUser(request: Request, env: Env): Promise<User | null> {
  const session = await getSession(request, env);
  if (!session?.user) return null;
  return toUser(session.user);
}
