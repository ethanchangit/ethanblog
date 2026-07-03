<script lang="ts">
  import { fetchUser } from '@/lib/user';

  interface Props {
    storySlug: string;
  }

  let { storySlug }: Props = $props();

  let bookmarked = $state(false);
  let loggedIn = $state(false);
  let loading = $state(true);
  let busy = $state(false);

  $effect(() => {
    let cancelled = false;

    async function load() {
      const user = await fetchUser();
      if (cancelled) return;
      loggedIn = user != null;
      if (!user) {
        loading = false;
        return;
      }

      try {
        const res = await fetch(`/api/bookmarks?slug=${encodeURIComponent(storySlug)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = (await res.json()) as { bookmarked: boolean };
          bookmarked = data.bookmarked;
        }
      } finally {
        if (!cancelled) loading = false;
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  });

  async function toggle() {
    if (!loggedIn || busy) return;
    busy = true;
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storySlug }),
      });
      if (res.ok) {
        const data = (await res.json()) as { bookmarked: boolean };
        bookmarked = data.bookmarked;
      }
    } finally {
      busy = false;
    }
  }
</script>

{#if !loading && loggedIn}
  <button
    type="button"
    class="inline-flex items-center gap-1.5 rounded-md border border-surface-800 px-2.5 py-1 text-xs text-ink-400 transition-colors hover:border-surface-700 hover:text-ink-100 disabled:opacity-50 sm:text-sm"
    aria-pressed={bookmarked}
    aria-label={bookmarked ? '取消收藏' : '收藏此故事'}
    disabled={busy}
    onclick={toggle}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      class="h-4 w-4"
      aria-hidden="true"
    >
      {#if bookmarked}
        <path
          fill-rule="evenodd"
          d="M10 2a1 1 0 0 1 .832.445l2.46 3.704 4.12.535a1 1 0 0 1 .554 1.706l-2.98 2.875.704 4.096a1 1 0 0 1-1.452 1.054L10 14.347l-3.238 1.708a1 1 0 0 1-1.452-1.054l.704-4.096-2.98-2.875a1 1 0 0 1 .554-1.706l4.12-.535L9.168 2.445A1 1 0 0 1 10 2Z"
          clip-rule="evenodd"
        />
      {:else}
        <path
          fill-rule="evenodd"
          d="M10 1.5a.75.75 0 0 1 .713.516l1.882 2.836 3.36.436a.75.75 0 0 1 .416 1.279l-2.43 2.346.574 3.336a.75.75 0 0 1-1.088.79L10 11.347l-2.827 1.486a.75.75 0 0 1-1.088-.79l.574-3.336-2.43-2.346a.75.75 0 0 1 .416-1.279l3.36-.436 1.882-2.836A.75.75 0 0 1 10 1.5Z"
          clip-rule="evenodd"
        />
      {/if}
    </svg>
    {bookmarked ? '已收藏' : '收藏'}
  </button>
{/if}
