import { betterAuth } from 'better-auth';

/**
 * Create a request-scoped better-auth instance.
 * D1 bindings are only available inside Cloudflare runtime context.
 *
 * Required env vars (see src/env.d.ts):
 * BETTER_AUTH_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
 * GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */
export function createAuth(env: Env, request?: Request) {
  const baseURL =
    env.BETTER_AUTH_URL ??
    (request ? new URL(request.url).origin : 'https://ethanchang.io');

  return betterAuth({
    appName: 'ethanchang.io',
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
  });
}

export async function getSession(request: Request, env: Env) {
  const auth = createAuth(env, request);
  return auth.api.getSession({ headers: request.headers });
}
