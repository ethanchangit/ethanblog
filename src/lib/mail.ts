import {
  FEEDBACK_SUBJECT_TAG,
  FEEDBACK_TO,
} from '@/lib/comments';

/** Site-owned From. Visitor address is Reply-To only, never SMTP From. */
export const FEEDBACK_FROM_DEFAULT = 'ethanchang.io <noreply@ethanchang.io>';

export function feedbackSubject(articleTitle: string): string {
  const title = articleTitle.replace(/\s+/g, ' ').trim() || 'untitled';
  return `${FEEDBACK_SUBJECT_TAG} 留言 · ${title}`;
}

export function feedbackText(input: {
  title: string;
  url: string;
  name: string;
  email: string;
  body: string;
}): string {
  return [
    `文章：${input.title}`,
    `链接：${input.url}`,
    '',
    `来自：${input.name}`,
    `邮箱：${input.email || '（未填）'}`,
    '',
    input.body,
  ].join('\n');
}

export async function sendFeedbackEmail(
  env: { RESEND_API_KEY?: string; RESEND_FROM?: string },
  payload: {
    title: string;
    url: string;
    name: string;
    email: string;
    body: string;
  },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: 'Email is not configured', status: 503 };
  }

  const from = env.RESEND_FROM?.trim() || FEEDBACK_FROM_DEFAULT;
  const replyTo = payload.email || undefined;

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [FEEDBACK_TO],
        subject: feedbackSubject(payload.title),
        text: feedbackText(payload),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
  } catch {
    return { ok: false, error: 'Send failed', status: 502 };
  }

  if (!res.ok) {
    return { ok: false, error: 'Send failed', status: 502 };
  }
  return { ok: true };
}
