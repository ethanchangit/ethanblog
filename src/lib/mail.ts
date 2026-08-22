import { FEEDBACK_SUBJECT_TAG } from './comments';

export type FeedbackPayload = {
  slug: string;
  title: string;
  url: string;
  tags: string[];
  name: string;
  email: string;
  body: string;
};

/** Stable token for X-headers / Gmail header filters. Subject still uses `[blog comment]`. */
export const FEEDBACK_KIND = 'blog-comment';

export function feedbackSubject(input: Pick<FeedbackPayload, 'name' | 'slug' | 'title' | 'tags'>): string {
  const tags = [
    FEEDBACK_SUBJECT_TAG,
    bracket(input.slug),
    ...sanitizeTags(input.tags).map(bracket),
  ].join(' ');
  return `${tags} ${oneLine(input.title)} · ${oneLine(input.name)}`;
}

export function feedbackText(input: FeedbackPayload): string {
  const tags = sanitizeTags(input.tags);
  return [
    `文章：${input.title}`,
    `slug：${input.slug}`,
    `链接：${input.url}`,
    `标签：${tags.length ? tags.join('、') : '（无）'}`,
    '',
    `来自：${input.name}`,
    `邮箱：${input.email || '（未填）'}`,
    '',
    input.body,
  ].join('\n');
}

/** Inbox filters: HEY uses the subject; Gmail can also match these headers. */
export function feedbackHeaders(input: Pick<FeedbackPayload, 'slug' | 'tags'>): Record<string, string> {
  const tags = [FEEDBACK_KIND, oneLine(input.slug), ...sanitizeTags(input.tags)].filter(Boolean);
  return {
    'X-Ethanblog-Kind': FEEDBACK_KIND,
    'X-Ethanblog-Slug': oneLine(input.slug),
    'X-Ethanblog-Tags': tags.join(', '),
  };
}

/**
 * Pages → guestbook Worker over the GUESTBOOK service binding.
 * The Worker owns Email Routing (`EmailMessage`); this side only POSTs JSON.
 */
export async function sendFeedbackEmail(
  env: { GUESTBOOK?: Fetcher },
  payload: FeedbackPayload,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!env.GUESTBOOK) {
    return { ok: false, error: 'Email is not configured', status: 503 };
  }

  let res: Response;
  try {
    res = await env.GUESTBOOK.fetch(
      new Request('https://ethanblog-guestbook/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
  } catch {
    return { ok: false, error: 'Send failed', status: 502 };
  }

  if (res.status === 503) {
    return { ok: false, error: 'Email is not configured', status: 503 };
  }
  if (!res.ok) {
    const status = res.status >= 400 && res.status < 600 ? res.status : 502;
    return { ok: false, error: 'Send failed', status };
  }
  return { ok: true };
}

export function buildRawEmail(input: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  extraHeaders?: Record<string, string>;
}): string {
  const extras = Object.entries(input.extraHeaders ?? {}).map(
    ([name, value]) => `${oneLine(name)}: ${encodeUtf8Header(value)}`,
  );
  const headers = [
    `From: ${oneLine(input.from)}`,
    `To: ${oneLine(input.to)}`,
    input.replyTo ? `Reply-To: ${oneLine(input.replyTo)}` : null,
    `Subject: ${encodeUtf8Header(input.subject)}`,
    ...extras,
    `Message-ID: <${crypto.randomUUID()}@ethanchang.io>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ].filter((line): line is string => line != null);

  const body = input.text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

export function sanitizeTags(tags: readonly string[] | undefined): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = oneLine(raw).replace(/[\[\]]/g, '');
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

function bracket(value: string): string {
  return `[${oneLine(value).replace(/[\[\]]/g, '')}]`;
}

function oneLine(value: string): string {
  return value.replace(/[\r\n\u0000]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function encodeUtf8Header(value: string): string {
  const safe = oneLine(value);
  if (/^[\x20-\x7E]*$/.test(safe)) return safe;
  const bytes = new TextEncoder().encode(safe);
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}
