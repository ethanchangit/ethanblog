<script lang="ts">
  interface Skill {
    name: string;
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

  function toggle(s: Skill) {
    selected = selected?.name === s.name ? null : s;
  }
</script>

<div class="grid gap-8 md:grid-cols-[1fr_240px]">
  <div class="flex flex-col gap-5">
    {#each domains as domain (domain)}
      <div>
        <h3 class="ui-section-label">{domain}</h3>
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
                {s.name}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>

  <aside class="md:sticky md:top-20 md:self-start">
    {#if selected}
      <p class="ui-meta">{selected.domain}</p>
      <h4 class="mt-1 font-semibold text-ink-100">{selected.name}</h4>
      <p class="ui-meta mt-3">熟练度 {selected.level}%</p>
      {#if selected.projects.length}
        <p class="ui-meta mt-4 mb-1.5">用在了这些项目里</p>
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
        点一个技能，看熟练度以及它被用在了哪些项目里。
      </p>
    {/if}
  </aside>
</div>
