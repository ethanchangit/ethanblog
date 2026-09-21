<script lang="ts">
  interface Props {
    zh: string;
    en?: string;
  }

  const { zh, en }: Props = $props();
</script>

{#if en}
  <span class="i18n-zh">{zh}</span>
{:else}
  {zh}
{/if}
