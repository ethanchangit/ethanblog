<script lang="ts">
  import { onMount } from 'svelte';
  import { reducedMotion } from '@/lib/motion';

  interface Props {
    name: string;
    roles: string[];
    bio: string;
  }

  const { name, roles, bio }: Props = $props();

  const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01·_/';
  let display = $state(roles[0]);

  /** 解码效果：乱码逐渐坍缩成目标文字 */
  function decodeTo(target: string, done: () => void) {
    let frame = 0;
    const totalFrames = 24;
    const timer = setInterval(() => {
      frame++;
      const settled = Math.floor((frame / totalFrames) * target.length);
      display =
        target.slice(0, settled) +
        Array.from({ length: target.length - settled }, () =>
          CHARS.charAt(Math.floor(Math.random() * CHARS.length))
        ).join('');
      if (frame >= totalFrames) {
        display = target;
        clearInterval(timer);
        done();
      }
    }, 40);
    return timer;
  }

  onMount(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let cycle: ReturnType<typeof setTimeout> | undefined;
    if (!reducedMotion()) {
      let i = 0;
      const next = () => {
        cycle = setTimeout(() => {
          i = (i + 1) % roles.length;
          timer = decodeTo(roles[i], next);
        }, 2600);
      };
      timer = decodeTo(roles[0], next);
    }
    return () => {
      if (timer) clearInterval(timer);
      if (cycle) clearTimeout(cycle);
    };
  });
</script>

<div class="relative">
  <div class="relative mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6 sm:pt-32">
    <p class="mb-3 text-sm text-ink-500">你好，我是</p>
    <h1 class="text-5xl font-semibold tracking-tight text-ink-100 sm:text-6xl">{name}</h1>
    <p class="mt-4 h-7 text-lg text-ink-300" aria-live="off">
      {display}
    </p>
    <p class="mt-6 max-w-xl text-lg leading-relaxed text-ink-400">{bio}</p>
    <div class="mt-10 flex flex-wrap gap-6 text-sm">
      <a href="/stories" class="text-ink-200 underline decoration-ink-500 underline-offset-4 transition-colors hover:text-ink-100 hover:decoration-ink-300">
        读故事 →
      </a>
      <a href="/projects" class="text-ink-400 underline decoration-ink-600 underline-offset-4 transition-colors hover:text-ink-200 hover:decoration-ink-400">
        看作品
      </a>
    </div>
  </div>
</div>
