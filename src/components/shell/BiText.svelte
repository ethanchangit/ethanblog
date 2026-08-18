<script lang="ts">
  interface Props {
    zh: string;
    en?: string;
  }

  const { zh, en }: Props = $props();
</script>

{#if en}
  <span class="i18n-zh">{zh}</span><span class="i18n-en" aria-hidden="true">{en}</span>
{:else}
  {zh}
{/if}
