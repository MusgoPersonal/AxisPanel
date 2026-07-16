<script>
  import { onMount } from 'svelte';

  let accounts = [];
  let files = [];
  let scanned = [];
  let activeTab = 'b2';
  let loading = true;

  onMount(async () => {
    await loadAll();
  });

  async function loadAll() {
    loading = true;
    try {
      const [aRes, fRes, sRes] = await Promise.all([
        fetch('/api/b2/accounts').catch(() => null),
        fetch('/api/drive/files').catch(() => null),
        fetch('/api/b2/scan').catch(() => null)
      ]);
      if (aRes) accounts = (await aRes.json()).accounts || [];
      if (fRes) files = (await fRes.json()).files || [];
      if (sRes) scanned = (await sRes.json()).files || [];
    } catch (e) { console.error(e); }
    loading = false;
  }
</script>

<div class="toolbar">
  <span class="tabs">
    <button class="tab" class:active={activeTab === 'b2'} on:click={() => activeTab = 'b2'}>☁ B2</button>
    <button class="tab" class:active={activeTab === 'drive'} on:click={() => activeTab = 'drive'}>◈ Drive</button>
  </span>
  <button class="btn-refresh" on:click={loadAll}>↻</button>
</div>

{#if loading}
  <p class="loading">Cargando...</p>
{:else if activeTab === 'b2'}
  <h3>Cuentas B2 ({accounts.length})</h3>
  <div class="grid">
    {#each accounts as acct}
      <div class="card">
        <h4>{acct.bucket || acct.name || 'B2'}</h4>
        <p>{acct.files || acct.fileCount || 0} archivos</p>
      </div>
    {/each}
  </div>

  {#if scanned.length > 0}
    <h3>Último Scan</h3>
    <div class="file-list">
      {#each scanned.slice(0, 50) as f}
        <div class="file-row"><span>{f.name || f.fileName}</span><span class="size">{f.size ? (f.size / 1024 / 1024).toFixed(1) + ' MB' : ''}</span></div>
      {/each}
    </div>
  {/if}
{:else}
  <h3>Google Drive ({files.length} archivos)</h3>
  <div class="file-list">
    {#each files.slice(0, 50) as f}
      <div class="file-row"><span>{f.name}</span><span class="size">{f.mimeType || ''}</span></div>
    {/each}
  </div>
{/if}

<style>
  .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .tabs { display: flex; gap: 4px; }
  .tab { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 12px; }
  .tab.active { background: var(--accent-glow); border-color: var(--accent); color: var(--accent); }
  .btn-refresh { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; }
  .btn-refresh:hover { background: var(--bg-card); }
  .loading { text-align: center; color: var(--text-muted); padding: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; }
  .card h4 { font-size: 13px; font-weight: 600; margin: 0 0 4px; }
  .card p { font-size: 11px; color: var(--text-muted); }
  h3 { font-size: 14px; font-weight: 600; margin: 16px 0 8px; }
  .file-list { display: flex; flex-direction: column; gap: 2px; }
  .file-row { display: flex; justify-content: space-between; padding: 6px 8px; border-radius: 4px; font-size: 12px; }
  .file-row:hover { background: var(--bg-card); }
  .size { color: var(--text-muted); }
</style>