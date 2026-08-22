import { EmailMessage } from 'cloudflare:email';
import {
  COMMENT_BODY_MAX,
  COMMENT_EMAIL_MAX,
  COMMENT_NAME_MAX,
  FEEDBACK_FROM,
  FEEDBACK_TO,
} from '../../../src/lib/comments';
import {
  buildRawEmail,
  feedbackHeaders,
  feedbackSubject,
  feedbackText,
  sanitizeTags,
  type FeedbackPayload,
} from '../../../src/lib/mail';

interface GuestbookEnv {
  EMAIL: SendEmail;
}

/**
 * Internal mail sender for the ethanblog Pages project.
 * Reachable via the GUESTBOOK service binding only (`workers_dev = false`).
 * Honeypot / article lookup / rate limit stay in `/api/comments`.
 */
export default {
  async fetch(request: Request, env: GuestbookEnv): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    let payload: Partial<FeedbackPayload>;
    try {
      payload = (await request.json()) as Partial<FeedbackPayload>;
    } catch {
      return Response.json({ error: 'Invalid body' }, { status: 400 });
    }

    const parsed = parsePayload(payload);
    if (!parsed) {
      return Response.json({ error: 'Invalid body' }, { status: 400 });
    }
    if (!env.EMAIL) {
      return Response.json({ error: 'Email is not configured' }, { status: 503 });
    }

    const raw = buildRawEmail({
      from: FEEDBACK_FROM,
      to: FEEDBACK_TO,
      replyTo: parsed.email || undefined,
      subject: feedbackSubject(parsed),
      text: feedbackText(parsed),
      extraHeaders: feedbackHeaders(parsed),
    });

    try {
      await env.EMAIL.send(new EmailMessage(FEEDBACK_FROM, FEEDBACK_TO, raw));
    } catch {
      return Response.json({ error: 'Send failed' }, { status: 502 });
    }
    return Response.json({ ok: true });
  },
} satisfies ExportedHandler<GuestbookEnv>;

function parsePayload(input: Partial<FeedbackPayload>): FeedbackPayload | null {
  if (!isNonEmptyString(input.slug) || input.slug.length > 180) return null;
  if (!isNonEmptyString(input.title) || input.title.length > 200) return null;
  if (!isNonEmptyString(input.url) || input.url.length > 500) return null;
  const tags = parseTags(input.tags);
  if (!tags) return null;
  if (!isString(input.name) || input.name.length < 1 || input.name.length > COMMENT_NAME_MAX) {
    return null;
  }
  if (!isString(input.email) || input.email.length > COMMENT_EMAIL_MAX) return null;
  if (!isNonEmptyString(input.body) || input.body.length > COMMENT_BODY_MAX) return null;
  return {
    slug: input.slug,
    title: input.title,
    url: input.url,
    tags,
    name: input.name,
    email: input.email,
    body: input.body,
  };
}

function parseTags(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > 12) return null;
  for (const item of value) {
    if (typeof item !== 'string' || item.length > 40) return null;
  }
  return sanitizeTags(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
