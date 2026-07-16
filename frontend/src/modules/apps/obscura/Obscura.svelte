<script>
  import { onMount } from 'svelte';
  import Icon from '../../../lib/Icon.svelte';

  let status = { running: false, installed: false, binary: '', port: 9222 };
  let loading = true;
  let message = '';
  let fetchUrl = '';
  let fetchResult = '';
  let fetching = false;
  let startStealth = true;

  onMount(async () => { await refresh(); });

  async function refresh() {
    loading = true;
    try {
      const res = await fetch('/api/obscura/status');
      status = await res.json();
    } catch (e) { message = 'Error: ' + e.message; }
    loading = false;
  }

  async function startObscura() {
    message = 'Iniciando Obscura...';
    try {
      const res = await fetch('/api/obscura/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stealth: startStealth }) });
      const data = await res.json();
      if (data.success) {
        message = 'Obscura iniciado — puerto ' + (data.port || 9222);
        setTimeout(refresh, 2000);
      } else {
        message = 'Error: ' + data.error;
      }
    } catch (e) { message = 'Error de red: ' + e.message; }
  }

  async function stopObscura() {
    message = 'Deteniendo...';
    try {
      const res = await fetch('/api/obscura/stop', { method: 'POST' });
      const data = await res.json();
      message = data.success ? 'Detenido' : 'Error: ' + data.error;
      setTimeout(refresh, 1000);
    } catch (e) { message = 'Error de red: ' + e.message; }
  }

  async function doFetch() {
    if (!fetchUrl) return;
    fetching = true; fetchResult = '';
    try {
      const res = await fetch('/api/obscura/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: fetchUrl, stealth: startStealth }) });
      const data = await res.json();
      fetchResult = data.html ? data.html.slice(0, 3000) : (data.error || 'Sin respuesta');
    } catch (e) { fetchResult = 'Error: ' + e.message; }
    fetching = false;
  }
</script>

<div class="panel">
  <div class="header">
    <Icon name="obscura" size={20} />
    <span>Obscura</span>
    <span class="badge" class:green={status.running} class:yellow={!status.running && status.installed}>
      {status.running ? '● Corriendo' : status.installed ? '○ Detenido' : '✕ No instalado'}
    </span>
    <button class="refresh-btn" on:click={refresh}>↻</button>
  </div>

  {#if loading}
    <div class="status-msg">Cargando...</div>
  {:else if !status.installed}
    <div class="notice">
      <strong>Obscura no encontrado</strong>
      <p>El binario no está en <code>{status.binary || '—'}</code></p>
    </div>
  {:else}
    <div class="section">
      <div class="section-title">
        <Icon name="autoconfig" size={14} />
        <span>Control del servidor</span>
      </div>
      <label>
        <input type="checkbox" bind:checked={startStealth} /> Stealth mode (anti-detección)
      </label>
      <div class="btn-row">
        {#if !status.running}
          <button class="btn" on:click={startObscura}>Iniciar Obscura</button>
        {:else}
          <button class="btn danger" on:click={stopObscura}>Detener</button>
          <a href="http://localhost:9222" target="_blank" class="btn" rel="noreferrer">Abrir CDP ↗</a>
        {/if}
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        <Icon name="globe" size={14} />
        <span>Fetch una URL</span>
      </div>
      <div class="input-row">
        <input type="text" bind:value={fetchUrl} placeholder="https://ejemplo.com" />
        <button class="btn" on:click={doFetch} disabled={fetching}>
          {fetching ? 'Obteniendo...' : 'Fetch'}
        </button>
      </div>
      {#if fetchResult}
        <pre class="fetch-output">{fetchResult}</pre>
      {/if}
    </div>

    <div class="section">
      <div class="section-title">
        <Icon name="search" size={14} />
        <span>Comandos útiles</span>
      </div>
      <ul class="cmd-list">
        <li><code>obscura serve --stealth --port 9222</code></li>
        <li><code>obscura fetch https://ejemplo.com --stealth</code></li>
        <li><code>obscura scrape --url https://ejemplo.com --stealth</code></li>
        <li><code>obscura mcp --stealth</code> (servidor MCP para agentes AI)</li>
      </ul>
    </div>

    {#if message}
      <div class="msg">{message}</div>
    {/if}
  {/if}
</div>

<style>
  .panel { padding: 16px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .header { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
  .badge.green { background: rgba(16,185,129,0.1); color: #10b981; }
  .badge.yellow { background: rgba(245,158,11,0.1); color: #f59e0b; }
  .refresh-btn { margin-left: auto; background: none; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-muted); cursor: pointer; padding: 2px 8px; font-size: 14px; }
  .refresh-btn:hover { background: var(--accent-glow); color: var(--accent); }
  .section { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; }
  .section-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 8px; }
  .btn-row { display: flex; gap: 8px; margin-top: 8px; }
  .btn { display: inline-flex; align-items: center; padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; font-family: var(--font-sans); text-decoration: none; }
  .btn:hover { opacity: 0.85; }
  .btn.danger { background: var(--color-danger, #ef4444); color: #fff; }
  .input-row { display: flex; gap: 8px; }
  .input-row input { flex: 1; padding: 8px 12px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); }
  .input-row input:focus { outline: none; border-color: var(--accent); }
  .fetch-output { margin-top: 8px; padding: 8px; background: var(--bg-base); border-radius: 6px; font-size: 11px; max-height: 200px; overflow: auto; white-space: pre-wrap; word-break: break-all; color: var(--text-secondary); }
  label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
  .cmd-list { font-size: 12px; color: var(--text-secondary); line-height: 2; padding-left: 20px; margin: 0; }
  .cmd-list code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 3px; font-size: 11px; }
  .msg { padding: 8px 12px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-size: 13px; color: #10b981; }
  .status-msg { text-align: center; padding: 40px; color: var(--text-muted); }
  .notice { padding: 16px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; font-size: 14px; }
  .notice code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 3px; font-size: 13px; }
</style>
