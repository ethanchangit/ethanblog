<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { SandpackClient } from '@codesandbox/sandpack-client';
  import { reducedMotion } from '@/lib/motion';
  import {
    buildSandboxSetup,
    type PlaygroundFile,
    type PlaygroundTemplate,
  } from '@/lib/sandpack/setup';

  interface Props {
    code: string;
    lang?: string;
    title?: string;
    caption?: string;
    files?: Record<string, PlaygroundFile>;
    template?: PlaygroundTemplate;
  }

  const {
    code,
    lang = 'javascript',
    title = 'playground.js',
    caption,
    files,
    template = 'vanilla',
  }: Props = $props();

  let hydrated = $state(false);
  let running = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let previewFrame = $state<HTMLIFrameElement | null>(null);
  let client = $state<SandpackClient | null>(null);

  const setup = buildSandboxSetup(code, title, files, template);

  async function run() {
    if (loading) return;
    running = true;
    loading = true;
    error = null;
    await tick();

    if (!previewFrame) {
      error = '预览 iframe 未就绪';
      loading = false;
      return;
    }

    try {
      const { loadSandpackClient } = await import('@codesandbox/sandpack-client');
      client?.destroy();
      client = await loadSandpackClient(previewFrame, setup, {
        showLoadingScreen: !reducedMotion(),
        showErrorScreen: true,
        height: '100%',
        width: '100%',
      });
    } catch (e) {
      error = e instanceof Error ? e.message : '无法启动沙箱';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    hydrated = true;
    return () => client?.destroy();
  });
</script>

<figure class="media-frame not-prose">
  <div class="flex items-center justify-between py-2">
    <p class="font-mono text-xs text-ink-400">{title}</p>
    {#if hydrated}
      <button
        type="button"
        onclick={run}
        disabled={loading}
        class="font-mono text-xs text-ink-200 underline decoration-ink-500 underline-offset-4 transition-colors hover:decoration-ink-300 disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? '▶ 启动中…' : running ? '▶ 重新运行' : '▶ Run'}
      </button>
    {:else}
      <button
        type="button"
        disabled
        class="cursor-not-allowed font-mono text-xs text-ink-600"
      >
        ▶ Run
      </button>
    {/if}
  </div>

  <div class="overflow-x-auto py-2 text-sm">
    <pre class="font-mono leading-relaxed text-ink-300"><code class="language-{lang}">{code}</code></pre>
  </div>

  {#if running}
    <div class="relative" style="height: 280px">
      <iframe
        bind:this={previewFrame}
        title="{title} preview"
        class="absolute inset-0 h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
      ></iframe>
      {#if loading}
        <div class="absolute inset-0 flex items-center justify-center font-mono text-xs text-ink-500">
          正在加载 Sandpack 沙箱…
        </div>
      {/if}
    </div>
  {:else if !hydrated}
    <div class="flex items-center justify-center py-8 font-mono text-xs text-ink-600">
      启用 JavaScript 后点击 Run 在线运行
    </div>
  {/if}

  {#if error}
    <p class="py-2 font-mono text-xs text-ink-400">{error}</p>
  {/if}

  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>

<style>
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
