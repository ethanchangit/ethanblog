import assert from 'node:assert/strict';
import test from 'node:test';

process.env.STUDIO_DASHBOARD_MEMORY = '1';
const { dashboardSecrets } = await import('./dev-api.mjs');

test('local dashboard secrets prefer the environment over .dev.vars', () => {
  const secrets = dashboardSecrets(
    { GITHUB_TOKEN: 'from-env' },
    '# comment\nSTUDIO_SECRET="abc"\nGITHUB_TOKEN=from-file\n\nSTUDIO_PASSWORD_HASH=hash\n',
  );
  assert.equal(secrets.GITHUB_TOKEN, 'from-env');
  assert.equal(secrets.STUDIO_SECRET, 'abc');
  assert.equal(secrets.STUDIO_PASSWORD_HASH, 'hash');
});

test('Cursor secret GITHUB_TOKEN_BLOG is the dashboard GitHub token', () => {
  assert.equal(dashboardSecrets({ GITHUB_TOKEN_BLOG: 'blog' }, 'GITHUB_TOKEN=\n').GITHUB_TOKEN, 'blog');
  assert.equal(dashboardSecrets({}, 'GITHUB_TOKEN_BLOG=from-file\n').GITHUB_TOKEN, 'from-file');
  assert.equal(dashboardSecrets({ GITHUB_TOKEN: 'primary', GITHUB_TOKEN_BLOG: 'blog' }, '').GITHUB_TOKEN, 'primary');
});

test('missing dashboard secrets stay empty', () => {
  assert.deepEqual(dashboardSecrets({}, ''), {
    GITHUB_TOKEN: '',
    STUDIO_SECRET: '',
    STUDIO_PASSWORD_HASH: '',
  });
});
