import { test, expect } from '@playwright/test';
import { preferredType, markdownAssetPath, shouldNegotiate } from '../src/lib/accept';

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
