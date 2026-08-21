<script lang="ts">
  import { onMount } from 'svelte';
  import { readLang, subscribeLang, t, type Lang } from '@/lib/i18n';
  import { initTheme, toggleTheme } from '@/lib/theme';

  let lang = $state<Lang>('en');

  onMount(() => {
    initTheme();
    lang = readLang();
    return subscribeLang((next) => {
      lang = next;
    });
  });

  function handleToggle() {
    toggleTheme();
  }
</script>

<button
  type="button"
  class="theme-toggle footer-hit inline-flex items-center justify-center transition-colors hover:text-ink-100"
  aria-label={t(lang, 'themeAria')}
  title={t(lang, 'themeTitle')}
  onclick={handleToggle}
>
  <span class="theme-icon theme-icon--light" aria-hidden="true">
    <svg class="block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  </span>
  <span class="theme-icon theme-icon--dark" aria-hidden="true">
    <svg class="block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  </span>
</button>

<style>
  .theme-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .theme-icon--dark {
    display: none;
  }

  :global([data-theme='dark']) .theme-icon--light {
    display: none;
  }

  :global([data-theme='dark']) .theme-icon--dark {
    display: flex;
  }
</style>
