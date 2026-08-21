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
 * - RESEND_API_KEY           — article feedback mail (without it the form still renders; POST returns 503)
 * - RESEND_FROM              — optional From, must be a verified Resend domain
 *                              (default: ethanchang.io <noreply@ethanchang.io>)
 *
 * Local dev: copy `.dev.vars.example` → `.dev.vars`.
 * Remote upload: copy → `.env.production`, then `npm run setup:cloudflare`.
 * Feedback mail is not in the setup:cloudflare required list — upload RESEND_API_KEY
 * with `wrangler pages secret bulk` or the Pages dashboard when ready.
 */
type Env = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
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
