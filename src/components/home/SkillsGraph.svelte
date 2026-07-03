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

<div class="grid gap-4 md:grid-cols-[1fr_280px]">
  <div class="flex flex-col gap-5">
    {#each domains as domain (domain)}
      <div>
        <h3 class="mb-2 font-mono text-xs uppercase tracking-widest text-ink-500">{domain}</h3>
        <ul class="flex flex-wrap gap-2">
          {#each skills.filter((s) => s.domain === domain) as s (s.name)}
            <li>
              <button
                onclick={() => toggle(s)}
                aria-pressed={selected?.name === s.name}
                class:border-accent-500={selected?.name === s.name}
                class:text-accent-300={selected?.name === s.name}
                class="rounded-lg border border-surface-700 bg-surface-900 px-3 py-1.5 text-sm text-ink-300 transition-all hover:-translate-y-0.5 hover:border-surface-600"
              >
                {s.name}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>

  <aside class="rounded-xl border border-surface-800 bg-surface-900 p-5 md:sticky md:top-20 md:self-start">
    {#if selected}
      <p class="font-mono text-xs text-accent-400">{selected.domain}</p>
      <h4 class="mt-1 font-semibold text-ink-100">{selected.name}</h4>
      <div class="mt-3">
        <div class="mb-1 flex justify-between font-mono text-xs text-ink-500">
          <span>熟练度</span><span>{selected.level}%</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-surface-800">
          <div
            class="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-400 transition-all duration-500"
            style="width: {selected.level}%"
          ></div>
        </div>
      </div>
      {#if selected.projects.length}
        <p class="mt-4 mb-1.5 font-mono text-xs text-ink-500">用在了这些项目里</p>
        <ul class="flex flex-wrap gap-1.5">
          {#each selected.projects as slug (slug)}
            <li>
              <a
                href={`/projects/${slug}`}
                class="rounded bg-surface-800 px-2 py-0.5 font-mono text-xs text-primary-300 transition-colors hover:bg-surface-700"
              >
                {slug} →
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <p class="text-sm leading-relaxed text-ink-500">
        点一个技能芯片，看它的熟练度，以及它被用在了哪些项目里。
      </p>
    {/if}
  </aside>
</div>
