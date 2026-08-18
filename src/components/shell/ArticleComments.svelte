<script lang="ts">
  import { onMount } from 'svelte';
  import { formatDate } from '@/lib/format';
  import { readLang, subscribeLang, t, type CopyKey, type Lang } from '@/lib/i18n';
  import { fetchUser } from '@/lib/user';
  import {
    COMMENT_BODY_MAX,
    COMMENT_NAME_MAX,
    type ArticleComment,
    type CommentVisibility,
  } from '@/lib/comments';

  interface Props {
    slug: string;
    comments?: ArticleComment[];
  }

  let { slug, comments: initial = [] }: Props = $props();

  let items = $state<ArticleComment[]>(initial);
  let name = $state('');
  let body = $state('');
  let website = $state('');
  let privateOn = $state(false);
  const visibility = $derived<CommentVisibility>(privateOn ? 'private' : 'public');
  let signedIn = $state(false);
  let busy = $state(false);
  let error = $state(false);
  let privateSaved = $state(false);
  let lang = $state<Lang>('zh-CN');

  onMount(() => {
    let cancelled = false;
    lang = readLang();
    const unsub = subscribeLang((next) => {
      lang = next;
    });

    async function load() {
      const [user, live] = await Promise.all([fetchUser(), fetchComments(slug)]);
      if (cancelled) return;
      if (user?.name) {
        signedIn = true;
        if (!name) name = user.name;
      }
      if (live) items = live;
    }

    load();
    return () => {
      cancelled = true;
      unsub();
    };
  });

  async function fetchComments(storySlug: string): Promise<ArticleComment[] | null> {
    try {
      const res = await fetch(`/api/comments?slug=${encodeURIComponent(storySlug)}`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { comments?: ArticleComment[] };
      return data.comments ?? null;
    } catch {
      return null;
    }
  }

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = false;
    privateSaved = false;
    busy = true;
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name, body, website, visibility }),
      });
      if (!res.ok) {
        error = true;
        return;
      }
      const data = (await res.json()) as { comment?: ArticleComment };
      body = '';
      const live = await fetchComments(slug);
      if (live) {
        items = live;
      } else if (data.comment?.visibility === 'public') {
        items = [...items, data.comment];
      }
      if (visibility === 'private' && !(live ?? items).some((item) => item.visibility === 'private')) {
        privateSaved = true;
      }
    } catch {
      error = true;
    } finally {
      busy = false;
    }
  }

  function onComposerKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
  }

  function label(current: Lang, key: CopyKey) {
    return t(current, key);
  }
</script>

<section id="comments" class="not-prose" aria-labelledby="comments-heading">
  <p id="comments-heading" class="ui-section-label">
    <span class="i18n-zh">{label('zh-CN', 'commentsHeading')}</span><span class="i18n-en" aria-hidden="true">{label('en', 'commentsHeading')}</span>
  </p>

  {#if items.length > 0}
    <ol class="comment-list">
      {#each items as item (item.id)}
        <li>
          <p class="ui-meta">
            <span class="text-ink-300">{item.authorName}</span>
            {#if item.visibility === 'private'}
              <span class="comment-private-mark">
                <span class="i18n-zh">{label('zh-CN', 'commentsPrivateMark')}</span><span class="i18n-en" aria-hidden="true">{label('en', 'commentsPrivateMark')}</span>
              </span>
            {/if}
            <time datetime={new Date(item.createdAt).toISOString()}>
              <span class="i18n-zh">{formatDate(new Date(item.createdAt), 'zh-CN')}</span><span
                class="i18n-en"
                aria-hidden="true">{formatDate(new Date(item.createdAt), 'en')}</span
              >
            </time>
          </p>
          <p class="mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed text-ink-300">{item.body}</p>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="ui-meta">
      <span class="i18n-zh">{label('zh-CN', 'commentsEmpty')}</span><span class="i18n-en" aria-hidden="true">{label('en', 'commentsEmpty')}</span>
    </p>
  {/if}

  <form class="comment-form" method="POST" action="/api/comments" onsubmit={onSubmit}>
    <input type="hidden" name="slug" value={slug} />
    <div class="comment-honeypot" aria-hidden="true">
      <label>
        Website
        <input type="text" name="website" tabindex="-1" autocomplete="off" bind:value={website} />
      </label>
    </div>

    <div class="comment-capsule">
      <label class="comment-vis">
        <input
          class="comment-vis-input"
          type="checkbox"
          name="visibility"
          value="private"
          bind:checked={privateOn}
          aria-label={t(lang, 'commentsVisAria')}
          data-i18n-aria="commentsVisAria"
        />
        <span class="comment-vis-on-public" hidden={privateOn}>
          <span class="i18n-zh">{label('zh-CN', 'commentsPublic')}</span><span class="i18n-en" aria-hidden="true">{label('en', 'commentsPublic')}</span>
        </span>
        <span class="comment-vis-on-private" hidden={!privateOn}>
          <span class="i18n-zh">{label('zh-CN', 'commentsPrivate')}</span><span class="i18n-en" aria-hidden="true">{label('en', 'commentsPrivate')}</span>
        </span>
      </label>

      <label class="comment-compose-body">
        <span class="sr-only">
          <span class="i18n-zh">{label('zh-CN', 'commentsBody')}</span><span class="i18n-en" aria-hidden="true">{label('en', 'commentsBody')}</span>
        </span>
        <textarea
          class="comment-field comment-field--body"
          name="body"
          required
          maxlength={COMMENT_BODY_MAX}
          rows="3"
          placeholder={t(lang, 'commentsBody')}
          data-i18n-placeholder="commentsBody"
          bind:value={body}
          onkeydown={onComposerKeydown}
        ></textarea>
      </label>

      <div class="comment-compose-foot">
        {#if signedIn}
          <input type="hidden" name="name" value={name} />
        {:else}
          <label class="comment-compose-name">
            <span class="sr-only">
              <span class="i18n-zh">{label('zh-CN', 'commentsName')}</span><span class="i18n-en" aria-hidden="true">{label('en', 'commentsName')}</span>
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
        {/if}
        <button type="submit" class="comment-send" disabled={busy}>
          <span class="i18n-zh">{label('zh-CN', 'commentsSubmit')}</span><span class="i18n-en" aria-hidden="true">{label('en', 'commentsSubmit')}</span>
        </button>
      </div>
    </div>

    {#if error}
      <p class="ui-meta mt-2" role="alert">
        <span class="i18n-zh">{label('zh-CN', 'commentsError')}</span><span class="i18n-en" aria-hidden="true">{label('en', 'commentsError')}</span>
      </p>
    {:else if privateSaved}
      <p class="ui-meta mt-2" role="status">
        <span class="i18n-zh">{label('zh-CN', 'commentsPrivateSaved')}</span><span class="i18n-en" aria-hidden="true">{label('en', 'commentsPrivateSaved')}</span>
      </p>
    {/if}
  </form>
</section>
