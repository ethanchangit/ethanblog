import { profile } from '@/data/profile';
import { getSession } from '@/lib/auth';

/**
 * 用户态接缝（Phase 2）。
 * 服务端：从 better-auth 会话读取；客户端：经 /api/me 拉取。
 */
export interface User {
  id: string;
  name: string;
  avatarUrl?: string;
}

/**
 * 站长：better-auth 会话 email 对上 profile.email，或姓名对上
 * profile.name / chineseName。
 */
export function isSiteOwner(user: { email?: string | null; name?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const email = user.email?.trim().toLowerCase();
  if (email && email === profile.email.toLowerCase()) return true;
  const name = user.name?.trim();
  return Boolean(name && (name === profile.name || name === profile.chineseName));
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

/** 客户端 — Svelte islands / 浏览器脚本 */
export async function fetchUser(): Promise<User | null> {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: User | null };
    return data.user;
  } catch {
    return null;
  }
}

/** @deprecated 保留旧签名，服务端请用 getUser(request, env) */
export function getUserSync(): User | null {
  return null;
}
