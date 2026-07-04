<script lang="ts">
  import { authClient } from '@/lib/auth-client';
  import type { User } from '@/lib/user';

  let user = $state<User | null>(null);
  let loading = $state(true);
  let menuOpen = $state(false);

  $effect(() => {
    let cancelled = false;

    authClient.getSession().then((res) => {
      if (cancelled) return;
      user = res.data?.user
        ? {
            id: res.data.user.id,
            name: res.data.user.name,
            avatarUrl: res.data.user.image ?? undefined,
          }
        : null;
      loading = false;
    });

    return () => {
      cancelled = true;
    };
  });

  async function signIn(provider: 'github' | 'google') {
    await authClient.signIn.social({ provider, callbackURL: window.location.pathname });
  }

  async function signOut() {
    await authClient.signOut();
    user = null;
    menuOpen = false;
  }

  function toggleMenu() {
    menuOpen = !menuOpen;
  }
</script>

{#if loading}
  <span class="h-8 w-16 animate-pulse rounded-md bg-surface-800" aria-hidden="true"></span>
{:else if user}
  <div class="relative">
    <button
      type="button"
      class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-300 transition-colors hover:bg-surface-900 hover:text-ink-100"
      aria-expanded={menuOpen}
      aria-haspopup="true"
      onclick={toggleMenu}
    >
      {#if user.avatarUrl}
        <img
          src={user.avatarUrl}
          alt=""
          class="h-6 w-6 rounded-full border border-surface-700"
          width="24"
          height="24"
        />
      {:else}
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-800 text-xs font-medium text-ink-300"
          aria-hidden="true"
        >
          {user.name.charAt(0).toUpperCase()}
        </span>
      {/if}
      <span class="hidden max-w-24 truncate sm:inline">{user.name}</span>
    </button>
    {#if menuOpen}
      <div
        class="absolute right-0 top-full z-50 mt-1 min-w-32 rounded-md border border-surface-800 bg-surface-900 py-1 shadow-lg"
        role="menu"
      >
        <button
          type="button"
          class="block w-full px-3 py-1.5 text-left text-sm text-ink-400 transition-colors hover:bg-surface-800 hover:text-ink-100"
          role="menuitem"
          onclick={signOut}
        >
          退出登录
        </button>
      </div>
    {/if}
  </div>
{:else}
  <div class="relative">
    <button
      type="button"
      class="rounded-md px-2 py-1.5 text-xs text-ink-400 transition-colors hover:bg-surface-900 hover:text-ink-100 sm:hidden"
      aria-expanded={menuOpen}
      aria-haspopup="true"
      onclick={toggleMenu}
    >
      登录
    </button>
    <div class="hidden items-center gap-1 sm:flex">
      <button
        type="button"
        class="rounded-md px-2.5 py-1.5 text-sm text-ink-400 transition-colors hover:bg-surface-900 hover:text-ink-100"
        onclick={() => signIn('github')}
      >
        GitHub
      </button>
      <button
        type="button"
        class="rounded-md px-2.5 py-1.5 text-sm text-ink-400 transition-colors hover:bg-surface-900 hover:text-ink-100"
        onclick={() => signIn('google')}
      >
        Google
      </button>
    </div>
    {#if menuOpen}
      <div
        class="absolute right-0 top-full z-50 mt-1 min-w-32 rounded-md border border-surface-800 bg-surface-900 py-1 shadow-lg sm:hidden"
        role="menu"
      >
        <button
          type="button"
          class="block w-full px-3 py-1.5 text-left text-sm text-ink-400 transition-colors hover:bg-surface-800 hover:text-ink-100"
          role="menuitem"
          onclick={() => signIn('github')}
        >
          GitHub 登录
        </button>
        <button
          type="button"
          class="block w-full px-3 py-1.5 text-left text-sm text-ink-400 transition-colors hover:bg-surface-800 hover:text-ink-100"
          role="menuitem"
          onclick={() => signIn('google')}
        >
          Google 登录
        </button>
      </div>
    {/if}
  </div>
{/if}
