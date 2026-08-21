import { FEEDBACK_SUBJECT_TAG } from './comments';

export type FeedbackPayload = {
  slug: string;
  title: string;
  url: string;
  name: string;
  email: string;
  body: string;
};

export function feedbackSubject(name: string, slug: string): string {
  return `${FEEDBACK_SUBJECT_TAG} ${oneLine(name)} · ${oneLine(slug)}`;
}

export function feedbackText(input: FeedbackPayload): string {
  return [
    `文章：${input.title}`,
    `slug：${input.slug}`,
    `链接：${input.url}`,
    '',
    `来自：${input.name}`,
    `邮箱：${input.email || '（未填）'}`,
    '',
    input.body,
  ].join('\n');
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
}): string {
  const headers = [
    `From: ${oneLine(input.from)}`,
    `To: ${oneLine(input.to)}`,
    input.replyTo ? `Reply-To: ${oneLine(input.replyTo)}` : null,
    `Subject: ${encodeUtf8Header(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ].filter((line): line is string => line != null);

  const body = input.text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
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
