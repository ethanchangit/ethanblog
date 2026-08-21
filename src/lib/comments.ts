export const COMMENT_NAME_MAX = 40;
export const COMMENT_BODY_MAX = 1000;
export const COMMENT_EMAIL_MAX = 120;
export const COMMENT_ANON_NAME = '匿名';

/** Locked destination for the EMAIL send_email binding. */
export const FEEDBACK_TO = 'hey@ethanchang.io';
/** Site-owned From. Visitor address is Reply-To only, never SMTP From. */
export const FEEDBACK_FROM = 'guestbook@ethanchang.io';
/** Gmail filter: subject contains this tag → label `blog comment`. */
export const FEEDBACK_SUBJECT_TAG = '[blog comment]';

const SLUG_RE = /^[a-z0-9][a-z0-9._/-]{0,178}[a-z0-9]$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const rateHits = new Map<string, number[]>();

export function isCommentSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes('..') && !slug.includes('//');
}

export function isCommentNameTooLong(raw: string): boolean {
  return raw.replace(/\s+/g, ' ').trim().length > COMMENT_NAME_MAX;
}

/** Empty name is allowed; fall back to 匿名 (mail body / subject only). */
export function resolveCommentName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length > 0 && name.length <= COMMENT_NAME_MAX) return name;
  return COMMENT_ANON_NAME;
}

export function normalizeCommentBody(raw: string): string | null {
  const body = raw.replace(/\r\n/g, '\n').trim();
  if (body.length < 1 || body.length > COMMENT_BODY_MAX) return null;
  return body;
}

/** Empty is allowed (`''`). Invalid shape returns `null`. */
export function normalizeCommentEmail(raw: string): string | null {
  const email = raw.replace(/\s+/g, '').trim();
  if (!email) return '';
  if (email.length > COMMENT_EMAIL_MAX) return null;
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/** Per-isolate cap: 5 notes / 10 minutes / IP. Not a global limiter. */
export function isFeedbackRateLimited(ip: string): boolean {
  const now = Date.now();
  const key = ip || 'unknown';
  const recent = (rateHits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    rateHits.set(key, recent);
    return true;
  }
  recent.push(now);
  rateHits.set(key, recent);
  return false;
}
