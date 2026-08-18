<script lang="ts">
  import { onMount } from 'svelte';
  import { readLang, subscribeLang, t, type Lang } from '@/lib/i18n';
  import { reducedMotion } from '@/lib/motion';

  interface Props {
    url: string;
  }

  let { url }: Props = $props();
  let lang = $state<Lang>('zh-CN');
  let copied = $state(false);
  let revertTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    lang = readLang();
    const unsub = subscribeLang((next) => {
      lang = next;
    });
    return () => {
      unsub();
      if (revertTimer) clearTimeout(revertTimer);
    };
  });

  function copyWithExecCommand(text: string): boolean {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(el);
    return ok;
  }

  function copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(
        () => true,
        () => copyWithExecCommand(text),
      );
    }
    return Promise.resolve(copyWithExecCommand(text));
  }

  async function handleCopy() {
    const ok = await copyToClipboard(url);
    if (!ok) return;
    copied = true;
    if (revertTimer) clearTimeout(revertTimer);
    revertTimer = setTimeout(
      () => {
        copied = false;
      },
      reducedMotion() ? 1200 : 2000,
    );
  }

  const aria = $derived(t(lang, copied ? 'copyUrlCopied' : 'copyUrlAria'));
</script>

<button
  type="button"
  class="mt-4 inline-flex items-center gap-1.5 py-1 text-xs font-medium tracking-wide text-ink-400 transition-colors hover:text-ink-100 motion-reduce:transition-none"
  aria-label={aria}
  aria-live="polite"
  data-i18n-aria={copied ? 'copyUrlCopied' : 'copyUrlAria'}
  onclick={handleCopy}
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-4 w-4"
    aria-hidden="true"
  >
    <path
      d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
    />
  </svg>
  {#if copied}
    <span class="i18n-zh" aria-hidden="true">{t('zh-CN', 'copyUrlCopied')}</span><span class="i18n-en" aria-hidden="true">{t('en', 'copyUrlCopied')}</span>
  {:else}
    <span class="i18n-zh" aria-hidden="true">{t('zh-CN', 'copyUrl')}</span><span class="i18n-en" aria-hidden="true">{t('en', 'copyUrl')}</span>
  {/if}
</button>
