<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initLang, readLang, setLang, subscribeLang, t, type Lang } from '@/lib/i18n';

  const OPTIONS = [
    { value: 'zh-CN' as const, label: '简体中文' },
    { value: 'en' as const, label: 'English' },
  ];

  let lang = $state<Lang>('zh-CN');
  let open = $state(false);
  let active = $state<Lang>('zh-CN');
  let root = $state<HTMLDivElement | undefined>();
  let buttonEl = $state<HTMLButtonElement | undefined>();
  let listEl = $state<HTMLUListElement | undefined>();

  const aria = $derived(t(lang, 'langAria'));
  const listAria = $derived(t(lang, 'langListAria'));
  const activeId = $derived(`lang-picker-${active}`);

  onMount(() => {
    initLang();
    lang = readLang();
    return subscribeLang((next) => {
      lang = next;
    });
  });

  $effect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (root && !root.contains(event.target as Node)) {
        closeMenu({ restoreFocus: false });
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  });

  async function openMenu() {
    open = true;
    active = lang;
    await tick();
    listEl?.focus();
  }

  function closeMenu({ restoreFocus = true } = {}) {
    open = false;
    if (restoreFocus) buttonEl?.focus();
  }

  function select(next: Lang) {
    setLang(next);
    closeMenu();
  }

  function cycle(delta: 1 | -1) {
    const index = OPTIONS.findIndex((opt) => opt.value === active);
    const next = (index + delta + OPTIONS.length) % OPTIONS.length;
    active = OPTIONS[next].value;
  }

  async function onButtonClick() {
    if (open) closeMenu();
    else await openMenu();
  }

  async function onButtonKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) await openMenu();
    }
  }

  function onListKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      cycle(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      cycle(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      active = OPTIONS[0].value;
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      active = OPTIONS[OPTIONS.length - 1].value;
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(active);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu({ restoreFocus: false });
    }
  }
</script>

<div class="relative inline-flex items-center" bind:this={root}>
  <button
    bind:this={buttonEl}
    type="button"
    class="inline-flex h-4 w-4 items-center justify-center transition-colors hover:text-ink-100"
    aria-label={aria}
    title={aria}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={open ? 'lang-picker-list' : undefined}
    onclick={onButtonClick}
    onkeydown={onButtonKeydown}
  >
    <svg
      class="block"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  </button>

  {#if open}
    <ul
      bind:this={listEl}
      id="lang-picker-list"
      class="absolute bottom-full left-0 z-10 mb-3 flex flex-col gap-1 whitespace-nowrap text-left outline-none"
      role="listbox"
      tabindex="0"
      aria-label={listAria}
      aria-activedescendant={activeId}
      onkeydown={onListKeydown}
    >
      {#each OPTIONS as opt (opt.value)}
        <li
          id={`lang-picker-${opt.value}`}
          role="option"
          aria-selected={opt.value === lang}
          class="cursor-pointer transition-colors hover:text-ink-100"
          class:text-ink-100={opt.value === lang}
          class:underline={opt.value === active}
          onclick={() => select(opt.value)}
        >
          {opt.label}
        </li>
      {/each}
    </ul>
  {/if}
</div>
