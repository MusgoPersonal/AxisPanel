<script>
  let campaigns = [];

  async function loadCampaigns() {
    const res = await fetch('/api/scrape/gosom/status');
    const data = await res.json();
    campaigns = data.campaigns || data.active || [];
  }

  async function runCampaign() {
    await fetch('/api/scrape/gosom/run', { method: 'POST' });
    await loadCampaigns();
  }
</script>

<div class="toolbar">
  <button class="btn-primary" on:click={runCampaign}>▶ Ejecutar Campaña</button>
  <button class="btn-secondary" on:click={loadCampaigns}>↻</button>
</div>

{#if campaigns.length === 0}
  <p class="empty">No hay campañas de contenido activas.</p>
{:else}
  <div class="grid">
    {#each campaigns as c}
      <div class="card">
        <h3>{c.name || c.id || 'Campaña'}</h3>
        <p>Estado: {c.status || 'idle'}</p>
        <p class="date">{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</p>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
  .btn-primary { padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; }
  .btn-primary:hover { opacity: 0.85; }
  .btn-secondary { padding: 8px 16px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 6px; cursor: pointer; font-size: 12px; }
  .btn-secondary:hover { background: var(--bg-card-hover); }
  .empty { text-align: center; color: var(--text-muted); padding: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; }
  .card h3 { font-size: 14px; margin: 0 0 4px; }
  .card p { font-size: 12px; color: var(--text-secondary); margin: 2px 0; }
  .date { color: var(--text-muted); font-size: 11px; }
</style>