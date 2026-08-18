<script lang="ts">
  import { t } from '@/lib/i18n';

  interface Props {
    name: string;
  }

  const { name }: Props = $props();
</script>

<div class="relative">
  <div class="relative mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6 sm:pt-32">
    <p class="mb-3 text-sm text-ink-500">
      <span class="i18n-zh">{t('zh-CN', 'hello')}</span><span class="i18n-en" aria-hidden="true">{t('en', 'hello')}</span>
    </p>
    <h1 class="text-5xl font-semibold tracking-tight text-ink-100 sm:text-6xl">{name}</h1>
    <p class="mt-6 max-w-xl text-lg leading-relaxed text-ink-400">
      <span class="i18n-zh">{t('zh-CN', 'heroBio')}</span><span class="i18n-en" aria-hidden="true">{t('en', 'heroBio')}</span>
    </p>
    <div class="mt-10 flex flex-wrap gap-6 text-sm">
      <a href="/projects" class="text-ink-200 underline decoration-ink-500 underline-offset-4 transition-colors hover:text-ink-100 hover:decoration-ink-300">
        <span class="i18n-zh">{t('zh-CN', 'viewWork')}</span><span class="i18n-en" aria-hidden="true">{t('en', 'viewWork')}</span>
      </a>
    </div>
  </div>
</div>
