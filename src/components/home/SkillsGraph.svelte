<script lang="ts">
  import { onMount } from 'svelte';
  import { domainKey, readLang, subscribeLang, t, type Lang } from '@/lib/i18n';

  interface Skill {
    name: string;
    nameEn?: string;
    domain: string;
    level: number;
    projects: string[];
  }

  interface Props {
    skills: Skill[];
  }

  const { skills }: Props = $props();

  const domains = [...new Set(skills.map((s) => s.domain))];
  let selected = $state<Skill | null>(null);
  let lang = $state<Lang>('zh-CN');

  onMount(() => {
    lang = readLang();
    return subscribeLang((next) => {
      lang = next;
    });
  });

  function labelDomain(domain: string) {
    const key = domainKey(domain);
    return key ? t(lang, key) : domain;
  }

  function toggle(s: Skill) {
    selected = selected?.name === s.name ? null : s;
  }
</script>

<div class="grid gap-8 md:grid-cols-[1fr_240px]">
  <div class="flex flex-col gap-5">
    {#each domains as domain (domain)}
      <div>
        <h3 class="ui-section-label">{labelDomain(domain)}</h3>
        <ul class="flex flex-wrap gap-x-4 gap-y-2">
          {#each skills.filter((s) => s.domain === domain) as s (s.name)}
            <li>
              <button
                onclick={() => toggle(s)}
                aria-pressed={selected?.name === s.name}
                class:text-ink-100={selected?.name === s.name}
                class:underline={selected?.name === s.name}
                class="text-sm text-ink-400 underline-offset-4 transition-colors hover:text-ink-100"
              >
                {#if s.nameEn}
                  <span class="i18n-zh">{s.name}</span>
                  <span class="i18n-en" aria-hidden="true">{s.nameEn}</span>
                {:else}
                  {s.name}
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>

  <aside class="md:sticky md:top-20 md:self-start">
    {#if selected}
      <p class="ui-meta">{labelDomain(selected.domain)}</p>
      <h4 class="mt-1 font-semibold text-ink-100">
        {#if selected.nameEn}
          <span class="i18n-zh">{selected.name}</span>
          <span class="i18n-en" aria-hidden="true">{selected.nameEn}</span>
        {:else}
          {selected.name}
        {/if}
      </h4>
      <p class="ui-meta mt-3">
        {lang === 'en' ? `${selected.level}% ${t(lang, 'proficiency')}` : `${t(lang, 'proficiency')} ${selected.level}%`}
      </p>
      {#if selected.projects.length}
        <p class="ui-meta mt-4 mb-1.5">{t(lang, 'usedIn')}</p>
        <ul class="flex flex-col gap-1">
          {#each selected.projects as slug (slug)}
            <li>
              <a
                href={`/projects/${slug}`}
                class="ui-link text-sm"
              >
                {slug} →
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <p class="text-sm leading-relaxed text-ink-500">
        {t(lang, 'pickSkill')}
      </p>
    {/if}
  </aside>
</div>
