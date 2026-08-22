import { test, expect } from '@playwright/test';
import { FEEDBACK_FROM, FEEDBACK_SUBJECT_TAG, FEEDBACK_TO } from '../src/lib/comments';
import {
  FEEDBACK_KIND,
  buildRawEmail,
  feedbackHeaders,
  feedbackSubject,
  feedbackText,
} from '../src/lib/mail';

const payload = {
  slug: 'pkm-method',
  title: '我的 PKM 实践：从笔记到知识网络',
  url: 'https://ethanchang.io/articles/pkm-method',
  tags: ['PKM', 'Obsidian', '知识管理', '笔记方法论'],
  name: 'Ada',
  email: 'ada@example.com',
  body: '写得很好。',
};

test.describe('留言邮件 payload', () => {
  test('主题带分类标签、slug、文章标签和标题', () => {
    const subject = feedbackSubject(payload);
    expect(subject.startsWith(FEEDBACK_SUBJECT_TAG)).toBe(true);
    expect(subject).toContain('[pkm-method]');
    expect(subject).toContain('[PKM]');
    expect(subject).toContain('[Obsidian]');
    expect(subject).toContain('[知识管理]');
    expect(subject).toContain('[笔记方法论]');
    expect(subject).toContain('我的 PKM 实践：从笔记到知识网络');
    expect(subject).toContain('Ada');
  });

  test('正文带标题、canonical URL、slug 和文章标签', () => {
    const text = feedbackText(payload);
    expect(text).toContain('文章：我的 PKM 实践：从笔记到知识网络');
    expect(text).toContain('slug：pkm-method');
    expect(text).toContain('链接：https://ethanchang.io/articles/pkm-method');
    expect(text).toContain('标签：PKM、Obsidian、知识管理、笔记方法论');
    expect(text).toContain('来自：Ada');
    expect(text).toContain('邮箱：ada@example.com');
    expect(text).toContain('写得很好。');
  });

  test('EmailMessage raw 含可过滤的自定义头', () => {
    const headers = feedbackHeaders(payload);
    expect(headers['X-Ethanblog-Kind']).toBe(FEEDBACK_KIND);
    expect(headers['X-Ethanblog-Slug']).toBe('pkm-method');
    expect(headers['X-Ethanblog-Tags']).toBe(
      'blog-comment, pkm-method, PKM, Obsidian, 知识管理, 笔记方法论',
    );

    const raw = buildRawEmail({
      from: FEEDBACK_FROM,
      to: FEEDBACK_TO,
      replyTo: payload.email,
      subject: feedbackSubject(payload),
      text: feedbackText(payload),
      extraHeaders: headers,
    });

    expect(raw).toContain('X-Ethanblog-Kind: blog-comment');
    expect(raw).toContain('X-Ethanblog-Slug: pkm-method');
    expect(raw).toContain('X-Ethanblog-Tags:');
    expect(raw).toContain('Reply-To: ada@example.com');
    expect(raw).toContain('文章：我的 PKM 实践：从笔记到知识网络');
    expect(raw).toContain('链接：https://ethanchang.io/articles/pkm-method');
  });

  test('没有 frontmatter 标签时主题仍带文章身份', () => {
    const subject = feedbackSubject({ ...payload, tags: [] });
    expect(subject).toContain(FEEDBACK_SUBJECT_TAG);
    expect(subject).toContain('[pkm-method]');
    expect(subject).not.toContain('[]');
    expect(feedbackText({ ...payload, tags: [] })).toContain('标签：（无）');
  });
});
