/**
 * 用户态接缝（Phase 2）。
 * 现在恒为 null；账户体系上线后，这里将改为从 /api/me 读取会话，
 * 依赖它的组件（阅读进度、收藏按钮）无需改动即可点亮。
 */
export interface User {
  id: string;
  name: string;
  avatarUrl?: string;
}

export function getUser(): User | null {
  return null;
}
