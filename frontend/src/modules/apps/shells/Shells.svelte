<script>
  import { onMount } from 'svelte';

  let shells = [];
  let loading = true;

  onMount(async () => {
    const res = await fetch('/api/setup/docker');
    const data = await res.json();
    shells = data.shells || data.containers || [];
    loading = false;
  });
</script>

{#if loading}
  <p class="loading">Cargando shells...</p>
{:else if shells.length === 0}
  <p class="empty">No hay shells disponibles.</p>
{:else}
  <div class="grid">
    {#each shells as shell}
      <div class="card">
        <h3>{shell.name || shell.id || 'Shell'}</h3>
        <p>Estado: {shell.status || 'unknown'}</p>
      </div>
    {/each}
  </div>
{/if}

<style>
  .loading { text-align: center; color: var(--text-muted); padding: 24px; }
  .empty { text-align: center; color: var(--text-muted); padding: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; }
  .card h3 { font-size: 14px; font-weight: 600; margin: 0 0 4px; }
  .card p { font-size: 12px; color: var(--text-secondary); }
</style>