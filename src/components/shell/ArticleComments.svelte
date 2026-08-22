<script lang="ts">
  import { onMount } from 'svelte';
  import { readLang, subscribeLang, t, type CopyKey, type Lang } from '@/lib/i18n';
  import { fetchUser } from '@/lib/user';
  import { COMMENT_BODY_MAX, COMMENT_EMAIL_MAX, COMMENT_NAME_MAX } from '@/lib/comments';

  interface Props {
    slug: string;
  }

  let { slug }: Props = $props();

  let name = $state('');
  let email = $state('');
  let body = $state('');
  let website = $state('');
  let busy = $state(false);
  let error = $state(false);
  let sent = $state(false);
  let lang = $state<Lang>('en');

  onMount(() => {
    lang = readLang();
    const unsub = subscribeLang((next) => {
      lang = next;
    });

    const params = new URLSearchParams(window.location.search);
    const flag = params.get('sent');
    if (flag === '1') sent = true;
    if (flag === '0') error = true;
    if (flag === '1' || flag === '0') {
      params.delete('sent');
      const query = params.toString();
      const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || '#comments'}`;
      history.replaceState(null, '', next);
    }

    let cancelled = false;
    fetchUser().then((user) => {
      if (cancelled || !user?.name || name) return;
      name = user.name;
    });

    return () => {
      cancelled = true;
      unsub();
    };
  });

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = false;
    sent = false;
    busy = true;
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name, email, body, website }),
      });
      if (!res.ok) {
        error = true;
        return;
      }
      body = '';
      sent = true;
    } catch {
      error = true;
    } finally {
      busy = false;
    }
  }

  function label(current: Lang, key: CopyKey) {
    return t(current, key);
  }

  function autogrow(node: HTMLTextAreaElement) {
    const fit = () => {
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    };
    fit();
    node.addEventListener('input', fit);
    return {
      update: fit,
      destroy() {
        node.removeEventListener('input', fit);
      },
    };
  }
</script>

<section id="comments" class="not-prose" aria-labelledby="comments-heading">
  <h2 id="comments-heading" class="ui-section-label">
    <span class="i18n-zh" aria-hidden="true">{label('zh-CN', 'commentsHeading')}</span><span class="i18n-en">{label('en', 'commentsHeading')}</span>
  </h2>
  <p class="ui-meta mt-2">
    <span class="i18n-zh" aria-hidden="true">{label('zh-CN', 'commentsHint')}</span><span class="i18n-en">{label('en', 'commentsHint')}</span>
  </p>

  <form class="comment-form" method="POST" action="/api/comments" onsubmit={onSubmit}>
    <input type="hidden" name="slug" value={slug} />
    <div class="comment-honeypot" aria-hidden="true">
      <label>
        Website
        <input type="text" name="website" tabindex="-1" autocomplete="off" bind:value={website} />
      </label>
    </div>

    <div class="comment-compose-foot">
      <label class="comment-compose-name">
        <span class="sr-only">
          <span class="i18n-zh" aria-hidden="true">{label('zh-CN', 'commentsName')}</span><span class="i18n-en">{label('en', 'commentsName')}</span>
        </span>
        <input
          class="comment-field comment-field--name"
          type="text"
          name="name"
          maxlength={COMMENT_NAME_MAX}
          autocomplete="nickname"
          placeholder={t(lang, 'commentsName')}
          data-i18n-placeholder="commentsName"
          bind:value={name}
        />
      </label>
      <label class="comment-compose-email">
        <span class="sr-only">
          <span class="i18n-zh" aria-hidden="true">{label('zh-CN', 'commentsEmail')}</span><span class="i18n-en">{label('en', 'commentsEmail')}</span>
        </span>
        <input
          class="comment-field comment-field--email"
          type="email"
          name="email"
          maxlength={COMMENT_EMAIL_MAX}
          autocomplete="email"
          placeholder={t(lang, 'commentsEmail')}
          data-i18n-placeholder="commentsEmail"
          bind:value={email}
        />
      </label>
      <button type="submit" class="comment-send" disabled={busy}>
        <span class="i18n-zh" aria-hidden="true">{label('zh-CN', 'commentsSubmit')}</span><span class="i18n-en">{label('en', 'commentsSubmit')}</span>
      </button>
    </div>

    <label class="comment-compose-body">
      <span class="sr-only">
        <span class="i18n-zh" aria-hidden="true">{label('zh-CN', 'commentsBody')}</span><span class="i18n-en">{label('en', 'commentsBody')}</span>
      </span>
      <textarea
        class="comment-field comment-field--body"
        name="body"
        required
        maxlength={COMMENT_BODY_MAX}
        rows="1"
        placeholder={t(lang, 'commentsBody')}
        data-i18n-placeholder="commentsBody"
        use:autogrow={body}
        bind:value={body}
      ></textarea>
    </label>

    {#if error}
      <p class="ui-meta" role="alert">
        <span class="i18n-zh" aria-hidden="true">{label('zh-CN', 'commentsError')}</span><span class="i18n-en">{label('en', 'commentsError')}</span>
      </p>
    {:else if sent}
      <p class="ui-meta" role="status">
        <span class="i18n-zh" aria-hidden="true">{label('zh-CN', 'commentsSent')}</span><span class="i18n-en">{label('en', 'commentsSent')}</span>
      </p>
    {/if}
  </form>
</section>
