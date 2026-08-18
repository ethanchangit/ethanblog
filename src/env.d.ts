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
 * Local dev: copy `.dev.vars.example` → `.dev.vars`.
 * Remote upload: copy → `.env.production`, then `npm run setup:cloudflare`.
 */
type Env = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
};

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
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
