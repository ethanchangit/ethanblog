import { test, expect, type Locator } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto('/lab');
});

async function setRange(locator: Locator, value: string) {
  await locator.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function canvasDataUrl(canvas: Locator): Promise<string> {
  return canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
}

test('ParamSlider renders canvas and slider', async ({ page }) => {
  const section = page.getByTestId('param-slider');
  await section.scrollIntoViewIfNeeded();

  await expect(section.locator('canvas')).toBeVisible();
  await expect(section.getByLabel('卡片数量')).toBeVisible();
});

test('ParamSlider updates value when slider moves', async ({ page }) => {
  const section = page.getByTestId('param-slider');
  await section.scrollIntoViewIfNeeded();

  const slider = section.getByLabel('卡片数量');
  await setRange(slider, '120');
  await expect(section.locator('.ui-meta').filter({ hasText: '120' })).toBeVisible();
});

test('ParamSlider redraws canvas when slider moves', async ({ page }) => {
  const section = page.getByTestId('param-slider');
  await section.scrollIntoViewIfNeeded();

  const canvas = section.locator('canvas');
  await expect(canvas).toBeVisible();

  const before = await canvasDataUrl(canvas);
  await setRange(section.getByLabel('卡片数量'), '180');
  await expect.poll(() => canvasDataUrl(canvas)).not.toBe(before);
});

test('ParamSlider multi mode exposes both controls', async ({ page }) => {
  const section = page.getByTestId('param-slider-multi');
  await section.scrollIntoViewIfNeeded();

  await expect(section.getByLabel('频率')).toBeVisible();
  await expect(section.getByLabel('振幅')).toBeVisible();
  await expect(section.locator('canvas')).toBeVisible();
});

test('BeforeAfterSlider responds to drag via range control', async ({ page }) => {
  const section = page.getByTestId('before-after');
  await section.scrollIntoViewIfNeeded();

  const range = section.getByLabel('文字 与 所见 对比');
  await setRange(range, '25');

  await expect(range).toHaveValue('25');
  await expect(section.locator('[style*="clip-path"]')).toHaveAttribute('style', /25%/);
});

test('ScrollScene renders scene titles', async ({ page }) => {
  const section = page.getByTestId('scroll-scene');
  await section.scrollIntoViewIfNeeded();

  await expect(section.getByText('一切从一张卡片开始')).toBeVisible();
  await expect(section.getByText('链接让知识生长')).toBeVisible();
  await expect(section.getByText('最终形成你的第二大脑')).toBeVisible();
});

test('Timeline renders milestone items', async ({ page }) => {
  const section = page.getByTestId('timeline');
  await section.scrollIntoViewIfNeeded();

  await expect(section.getByText('Robert 立项')).toBeVisible();
  await expect(section.getByText('这个网站诞生')).toBeVisible();
});

test('StatCounter shows stat labels and values', async ({ page }) => {
  const section = page.getByTestId('stat-counter');
  await section.scrollIntoViewIfNeeded();

  await expect(section.getByText('进行中的项目')).toBeVisible();
  await expect(section.getByText('知识卡片')).toBeVisible();
  await expect(section.locator('dd').first()).toContainText('7');
});

test('InteractiveDemo loads iframe after launch', async ({ page }) => {
  const section = page.getByTestId('interactive-demo');
  await section.scrollIntoViewIfNeeded();

  await section.getByRole('button', { name: /Start demo/ }).click();
  const iframe = section.locator('iframe');
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute('src', '/demos/knowledge-garden/');
});

test('AudioClip renders waveform canvas', async ({ page }) => {
  const section = page.getByTestId('audio-clip');
  await section.scrollIntoViewIfNeeded();

  await expect(section.getByText('演示音频 · 合成琶音')).toBeVisible();
  await expect(section.locator('canvas')).toBeVisible();
});

test('VideoEmbed is a YouTube facade until clicked', async ({ page }) => {
  const section = page.getByTestId('video-embed');
  await section.scrollIntoViewIfNeeded();

  const facade = section.locator('[data-video-facade]');
  await expect(facade).toBeVisible();
  await expect(facade).toHaveAttribute('href', 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  await expect(section.locator('iframe')).toHaveCount(0);
  await expect(section.getByRole('link', { name: /Watch on YouTube/ })).toBeVisible();

  await facade.click();
  const frame = section.locator('iframe');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', /youtube\.com\/embed\/jNQXAC9IVRw/);
  await expect(frame).toHaveAttribute('title', 'Me at the zoo（示例视频）');
  await expect(section.getByRole('link', { name: /Watch on YouTube/ })).toBeVisible();
});

test('TweetEmbed renders a self-drawn card with the original permalink', async ({ page }) => {
  const section = page.getByTestId('tweet-embed-gkx');
  await section.scrollIntoViewIfNeeded();

  const card = section.locator('[data-tweet-embed]');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('href');
  await expect(section.locator('[data-tweet-permalink]')).toHaveAttribute(
    'href',
    /status\/2089292652940333288/,
  );
  await expect(section.locator('[data-tweet-profile]').first()).toHaveAttribute(
    'href',
    'https://x.com/gkxspace',
  );
  await expect(section.locator('video')).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(section.locator('video')).toHaveAttribute('data-tweet-video-src', /video\.twimg\.com/);
  await expect(section.getByText('这个组合确实有点牛逼')).toBeVisible();
});

test('CodePlayground renders code block', async ({ page }) => {
  const section = page.getByTestId('code-playground');
  await section.scrollIntoViewIfNeeded();

  await expect(section.getByText('hello.js')).toBeVisible();
  await expect(section.locator('pre, code').first()).toContainText('medium');
});
