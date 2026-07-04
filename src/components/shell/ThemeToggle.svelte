<script lang="ts">
  import { onMount } from 'svelte';
  import { initTheme, toggleTheme } from '@/lib/theme';

  onMount(() => {
    initTheme();
  });

  function handleToggle() {
    toggleTheme();
  }
</script>

<button
  type="button"
  class="theme-toggle rounded-md p-1.5 text-ink-400 transition-colors hover:bg-surface-800 hover:text-ink-100"
  aria-label="切换浅色/深色模式"
  title="切换主题"
  onclick={handleToggle}
>
  <span class="theme-icon theme-icon--light" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  </span>
  <span class="theme-icon theme-icon--dark" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  </span>
</button>

<style>
  .theme-icon--dark {
    display: none;
  }

  :global([data-theme='dark']) .theme-icon--light {
    display: none;
  }

  :global([data-theme='dark']) .theme-icon--dark {
    display: inline-flex;
  }

  .theme-icon {
    display: inline-flex;
  }
</style>
