import { EmailMessage } from 'cloudflare:email';
import { FEEDBACK_FROM, FEEDBACK_SUBJECT_TAG, FEEDBACK_TO } from '@/lib/comments';

export function feedbackSubject(name: string, slug: string): string {
  return `${FEEDBACK_SUBJECT_TAG} ${oneLine(name)} · ${oneLine(slug)}`;
}

export function feedbackText(input: {
  slug: string;
  title: string;
  url: string;
  name: string;
  email: string;
  body: string;
}): string {
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

/** Classic Email Routing send: `env.EMAIL.send(new EmailMessage(from, to, rawMime))`. */
export async function sendFeedbackEmail(
  env: { EMAIL?: SendEmail },
  payload: {
    slug: string;
    title: string;
    url: string;
    name: string;
    email: string;
    body: string;
  },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!env.EMAIL) {
    return { ok: false, error: 'Email is not configured', status: 503 };
  }

  const from = FEEDBACK_FROM;
  const to = FEEDBACK_TO;
  const replyTo = payload.email || undefined;
  const raw = buildRawEmail({
    from,
    to,
    replyTo,
    subject: feedbackSubject(payload.name, payload.slug),
    text: feedbackText(payload),
  });

  try {
    await env.EMAIL.send(new EmailMessage(from, to, raw));
  } catch {
    return { ok: false, error: 'Send failed', status: 502 };
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
