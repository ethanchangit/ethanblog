export const COMMENT_NAME_MAX = 40;
export const COMMENT_BODY_MAX = 1000;
export const COMMENT_LIST_LIMIT = 100;
export const COMMENT_ANON_NAME = '匿名';

export type CommentVisibility = 'public' | 'private';

export interface ArticleComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: number;
  visibility: CommentVisibility;
}

const SLUG_RE = /^[a-z0-9][a-z0-9._/-]{0,178}[a-z0-9]$/i;

export function isCommentSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes('..') && !slug.includes('//');
}

export function isCommentNameTooLong(raw: string): boolean {
  return raw.replace(/\s+/g, ' ').trim().length > COMMENT_NAME_MAX;
}

/** Empty name is allowed; fall back to the session name, then 匿名. */
export function resolveCommentName(raw: string, sessionName?: string | null): string {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length > 0 && name.length <= COMMENT_NAME_MAX) return name;
  const fromSession = (sessionName ?? '').replace(/\s+/g, ' ').trim();
  if (fromSession.length > 0 && fromSession.length <= COMMENT_NAME_MAX) return fromSession;
  return COMMENT_ANON_NAME;
}

export function normalizeCommentBody(raw: string): string | null {
  const body = raw.replace(/\r\n/g, '\n').trim();
  if (body.length < 1 || body.length > COMMENT_BODY_MAX) return null;
  return body;
}

export function normalizeVisibility(raw: unknown): CommentVisibility {
  return raw === 'private' ? 'private' : 'public';
}
