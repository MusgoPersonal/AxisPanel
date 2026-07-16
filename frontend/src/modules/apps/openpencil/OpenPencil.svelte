<script>
  import { onMount } from 'svelte';

  let status = null;
  let loading = true;

  onMount(async () => {
    const res = await fetch('/api/mcp/openpencil/status');
    status = await res.json();
    loading = false;
  });

  async function start() {
    const res = await fetch('/api/mcp/openpencil/start', { method: 'POST' });
    const data = await res.json();
    status = data;
  }

  async function stop() {
    const res = await fetch('/api/mcp/openpencil/stop', { method: 'POST' });
    const data = await res.json();
    status = data;
  }

  async function resetStatus() {
    loading = true;
    const res = await fetch('/api/mcp/openpencil/status');
    status = await res.json();
    loading = false;
  }
</script>

{#if loading}
  <p class="loading">Cargando...</p>
{:else}
  <div class="status-bar">
    <span class="dot" class:on={status?.running}></span>
    <span>{status?.running ? 'OpenPencil activo' : 'OpenPencil detenido'}</span>
  </div>

  <div class="actions">
    {#if status?.running}
      <button class="btn-danger" on:click={stop}>Detener Servidor</button>
    {:else}
      <button class="btn-primary" on:click={start}>Iniciar Servidor</button>
    {/if}
    <button class="btn-secondary" on:click={resetStatus}>↻</button>
  </div>

  <div class="canvas-placeholder">
    <p>🧠 Lienzo interactivo</p>
    <p class="hint">Arrastrá elementos al canvas para comenzar.</p>
  </div>
{/if}

<style>
  .loading { text-align: center; color: var(--text-muted); padding: 24px; }
  .status-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-danger); }
  .dot.on { background: var(--color-success); }
  .actions { display: flex; gap: 8px; margin-bottom: 16px; }
  .btn-primary { padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; }
  .btn-primary:hover { opacity: 0.85; }
  .btn-danger { padding: 8px 16px; background: var(--color-danger); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; }
  .btn-secondary { padding: 8px 16px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; }
  .btn-secondary:hover { background: var(--bg-card-hover); }
  .canvas-placeholder { background: var(--bg-card); border: 2px dashed var(--border-color); border-radius: 12px; padding: 48px; text-align: center; }
  .canvas-placeholder p { margin: 0; font-size: 16px; }
  .hint { font-size: 12px; color: var(--text-muted); margin-top: 8px !important; }
</style>