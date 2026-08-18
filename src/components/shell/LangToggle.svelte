<script lang="ts">
  import { onMount } from 'svelte';
  import { initLang, readLang, subscribeLang, t, toggleLang, type Lang } from '@/lib/i18n';

  let lang = $state<Lang>('zh-CN');

  onMount(() => {
    initLang();
    lang = readLang();
    return subscribeLang((next) => {
      lang = next;
    });
  });

  function handleToggle() {
    toggleLang();
  }

  const label = $derived(lang === 'en' ? 'EN' : '中');
  const aria = $derived(t(lang, 'langAria'));
</script>

<button
  type="button"
  class="px-1.5 py-1.5 text-xs text-ink-400 transition-colors hover:text-ink-100 sm:px-2 sm:text-sm"
  aria-label={aria}
  title={aria}
  onclick={handleToggle}
>
  <span aria-hidden="true">{label}</span>
</button>
