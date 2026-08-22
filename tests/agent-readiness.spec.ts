import { test, expect } from '@playwright/test';

function header(headers: { [key: string]: string }, name: string) {
  const needle = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === needle);
  return entry?.[1] ?? '';
}

test.describe('Agent readiness', () => {
  test('unknown paths return HTTP 404 with recovery links', async ({ request }) => {
    const response = await request.get('/this-route-does-not-exist');
    expect(response.status()).toBe(404);
    const body = await response.text();
    expect(body).toContain('This page does not exist');
    expect(body).toContain('href="/llms.txt"');
    expect(body).toContain('href="/sitemap.xml"');
    expect(body).toContain('href="/for-agents"');
    expect(body).toContain('href="/contact"');
  });

  test('markdown Accept on a missing path is 404 text/markdown', async ({ request }) => {
    const response = await request.get('/this-route-does-not-exist', {
      headers: { Accept: 'text/markdown' },
    });
    expect(response.status()).toBe(404);
    expect(header(response.headers(), 'content-type')).toMatch(/text\/markdown/);
    expect(header(response.headers(), 'vary').toLowerCase()).toContain('accept');
    const body = await response.text();
    expect(body).toMatch(/^# 404/);
    expect(body).toContain('/llms.txt');
    expect(body).toContain('/for-agents');
  });

  test('homepage serves Markdown when Accept prefers it', async ({ request }) => {
    const response = await request.get('/', { headers: { Accept: 'text/markdown' } });
    expect(response.status()).toBe(200);
    expect(header(response.headers(), 'content-type')).toMatch(/text\/markdown;\s*charset=utf-8/i);
    expect(header(response.headers(), 'vary').toLowerCase()).toContain('accept');
    const body = await response.text();
    expect(body).toContain('# Ethan Chang');
    expect(body).toContain('How to read this site');
  });

  test('browser Accept still gets HTML', async ({ request }) => {
    const response = await request.get('/', {
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    expect(response.status()).toBe(200);
    expect(header(response.headers(), 'content-type')).toMatch(/text\/html/);
    expect(header(response.headers(), 'vary').toLowerCase()).toContain('accept');
    const body = await response.text();
    expect(body).toContain('<!DOCTYPE html>');
  });

  test('unsupported Accept is 406', async ({ request }) => {
    const response = await request.get('/', { headers: { Accept: 'application/json' } });
    expect(response.status()).toBe(406);
    expect(header(response.headers(), 'vary').toLowerCase()).toContain('accept');
  });

  test('llms.txt names when to use and when not to', async ({ request }) => {
    const response = await request.get('/llms.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('When to use ethanchang.io');
    expect(body).toContain('Do not use this site');
    expect(body).toContain('MCP server');
    expect(body).toContain('/for-agents');
  });

  test('robots.txt allows crawlers and points at the sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toMatch(/User-agent:\s*\*/i);
    expect(body).toMatch(/Sitemap:\s+https:\/\/ethanchang\.io\/sitemap\.xml/);
  });

  test('sitemap lists home, contact, and developer resources', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('https://ethanchang.io/');
    expect(body).toContain('https://ethanchang.io/contact');
    expect(body).toContain('https://ethanchang.io/for-agents');
    expect(body).toContain('https://ethanchang.io/privacy');
  });

  test('trust pages are real documents', async ({ page }) => {
    for (const route of ['/contact', '/privacy', '/for-agents'] as const) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      const text = await page.locator('article').innerText();
      expect(text.length, route).toBeGreaterThan(500);
    }
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('developer resources page uses that name in the H1', async ({ page }) => {
    await page.goto('/for-agents');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'ethanchang.io developer resources',
      { useInnerText: true },
    );
  });

  test('homepage JSON-LD names the person and a contact point', async ({ request }) => {
    const response = await request.get('/');
    const body = await response.text();
    expect(body).toContain('"@type":"Person"');
    expect(body).toContain('"contactPoint"');
    expect(body).toContain('hey@ethanchang.io');
  });

  test('OpenAPI and RFC 9727 catalog exist', async ({ request }) => {
    const openapi = await request.get('/openapi.json');
    expect(openapi.status()).toBe(200);
    const spec = await openapi.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('ethanchang.io');

    const catalog = await request.get('/.well-known/api-catalog');
    expect(catalog.status()).toBe(200);
    expect(header(catalog.headers(), 'content-type')).toMatch(/linkset\+json/);
    const body = await catalog.json();
    expect(body.linkset[0].item.some((item: { href: string }) => item.href.endsWith('/openapi.json'))).toBe(
      true,
    );
  });
});
