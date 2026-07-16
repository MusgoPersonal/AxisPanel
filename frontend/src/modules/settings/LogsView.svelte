<script>
  import { onMount } from 'svelte';

  let rotationLogs = '';
  let gatewayLogs = '';
  let activeTab = 'rotation';

  onMount(async () => {
    await loadLogs();
  });

  async function loadLogs() {
    try {
      const [r, g] = await Promise.all([
        fetch('/api/logs/rotation?lines=100').then(r => r.text()),
        fetch('/api/logs/gateway?lines=100').then(r => r.text())
      ]);
      rotationLogs = r;
      gatewayLogs = g;
    } catch (e) { console.error('Error loading logs:', e); }
  }
</script>

<div class="toolbar">
  <span class="tabs">
    <button class="tab" class:active={activeTab === 'rotation'} on:click={() => activeTab = 'rotation'}>🔄 Rotación</button>
    <button class="tab" class:active={activeTab === 'gateway'} on:click={() => activeTab = 'gateway'}>◈ Gateway</button>
  </span>
  <button class="btn-refresh" on:click={loadLogs}>↻</button>
</div>

{#if activeTab === 'rotation'}
  <pre class="log-view">{rotationLogs || 'Cargando...'}</pre>
{:else}
  <pre class="log-view">{gatewayLogs || 'Cargando...'}</pre>
{/if}

<style>
  .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .tabs { display: flex; gap: 4px; }
  .tab { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 12px; }
  .tab.active { background: var(--accent-glow); border-color: var(--accent); color: var(--accent); }
  .btn-refresh { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 14px; }
  .btn-refresh:hover { background: var(--bg-card); }
  .log-view { background: #050608; border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; font-size: 11px; font-family: 'Geist Mono', monospace; color: var(--text-secondary); overflow: auto; max-height: 600px; white-space: pre-wrap; word-break: break-all; }
</style>