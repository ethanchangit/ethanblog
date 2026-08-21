<script lang="ts">
  interface Props {
    zh: string;
    en?: string;
  }

  const { zh, en }: Props = $props();
</script>

{#if en}
  <span class="i18n-zh" aria-hidden="true">{zh}</span><span class="i18n-en">{en}</span>
{:else}
  {zh}
{/if}
