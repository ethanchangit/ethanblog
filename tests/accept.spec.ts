import { test, expect } from '@playwright/test';
import { preferredType, markdownAssetPath, shouldNegotiate } from '../src/lib/accept';
import { createNegotiateFetch } from '../src/lib/cf-negotiate';

test('Accept parser prefers markdown when it is listed first', () => {
  expect(preferredType('text/markdown, text/html')).toBe('text/markdown');
  expect(preferredType('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')).toBe(
    'text/html',
  );
  expect(preferredType('text/markdown')).toBe('text/markdown');
  expect(preferredType('application/json')).toBeNull();
  expect(preferredType(null)).toBe('text/html');
});

test('markdown asset paths and negotiation skip list', () => {
  expect(markdownAssetPath('/')).toBe('/index.md');
  expect(markdownAssetPath('/zh/now/')).toBe('/zh/now.md');
  expect(shouldNegotiate('/')).toBe(true);
  expect(shouldNegotiate('/api/me')).toBe(false);
  expect(shouldNegotiate('/llms.txt')).toBe(false);
  expect(shouldNegotiate('/articles/pkm-method.md')).toBe(false);
});

test('Cloudflare wrapper serves markdown before Astro can short-circuit to HTML', async () => {
  const inner = {
    fetch: async () =>
      new Response('<!DOCTYPE html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
  };
  const handler = createNegotiateFetch(inner);
  const env = {
    ASSETS: {
      fetch: async (input: RequestInfo) => {
        const url = new URL(typeof input === 'string' ? input : input.url);
        if (url.pathname === '/index.md') {
          return new Response('# Ethan Chang\n\nHow to read this site\n', { status: 200 });
        }
        return new Response('missing', { status: 404 });
      },
    },
  };

  const markdown = await handler.fetch(
    new Request('https://ethanchang.io/', { headers: { Accept: 'text/markdown' } }),
    env,
    {},
  );
  expect(markdown.status).toBe(200);
  expect(markdown.headers.get('content-type')).toMatch(/text\/markdown;\s*charset=utf-8/i);
  expect(markdown.headers.get('vary')?.toLowerCase()).toContain('accept');
  expect(await markdown.text()).toContain('# Ethan Chang');

  const missing = await handler.fetch(
    new Request('https://ethanchang.io/no-such-page', { headers: { Accept: 'text/markdown' } }),
    env,
    {},
  );
  expect(missing.status).toBe(404);
  expect(missing.headers.get('content-type')).toMatch(/text\/markdown/);
  expect(await missing.text()).toMatch(/^# 404/);

  const rejected = await handler.fetch(
    new Request('https://ethanchang.io/', { headers: { Accept: 'application/json' } }),
    env,
    {},
  );
  expect(rejected.status).toBe(406);

  const html = await handler.fetch(
    new Request('https://ethanchang.io/', {
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    }),
    env,
    {},
  );
  expect(html.status).toBe(200);
  expect(html.headers.get('content-type')).toMatch(/text\/html/);
  expect(await html.text()).toBe('<!DOCTYPE html>');
});
