/// <reference types="@astrojs/cloudflare" />
/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare bindings + auth secrets.
 *
 * Set in Cloudflare Pages → Settings → Environment variables:
 * - BETTER_AUTH_SECRET       — openssl rand -base64 32
 * - BETTER_AUTH_URL          — https://ethanchang.io (optional; defaults to site URL)
 * - GITHUB_CLIENT_ID         — GitHub OAuth App client ID
 * - GITHUB_CLIENT_SECRET     — GitHub OAuth App client secret
 * - GOOGLE_CLIENT_ID         — Google OAuth client ID
 * - GOOGLE_CLIENT_SECRET     — Google OAuth client secret
 *
 * Guestbook mail: Pages `[[services]]` binding GUESTBOOK → workers/guestbook.
 * That Worker holds `[[send_email]]` named EMAIL (classic Email Routing
 * `EmailMessage`, destination locked to hey@ethanchang.io). Pages config
 * cannot contain send_email. No Resend / Mailchannels HTTP / third-party API key.
 * Dashboard: enable Email Routing on ethanchang.io and verify hey@ethanchang.io.
 *
 * Local `astro dev` has no GUESTBOOK binding — POST /api/comments returns 503.
 * Local dev: copy `.dev.vars.example` → `.dev.vars`.
 * Remote upload: copy → `.env.production`, then `npm run setup:cloudflare`.
 */
type Env = {
  DB: D1Database;
  GUESTBOOK?: Fetcher;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
};

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    locale: 'en' | 'zh';
    lang: 'zh-CN' | 'en';
    localePath: (href: string) => string;
  }
}

/** <video>/<source> 运行时需要这个属性；Astro 的 VideoHTMLAttributes 尚未收录。 */
declare namespace astroHTML.JSX {
  interface VideoHTMLAttributes {
    referrerpolicy?: string | null;
  }
  interface SourceHTMLAttributes {
    referrerpolicy?: string | null;
  }
}
