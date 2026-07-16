<script>
  import { onMount } from 'svelte';
  import Icon from '../../../lib/Icon.svelte';

  let status = { running: false, installed: false, port: 5678 };
  let loading = true;
  let message = '';

  onMount(async () => { await refresh(); });

  async function refresh() {
    loading = true;
    try {
      const res = await fetch('/api/n8n/status');
      status = await res.json();
    } catch (e) { message = 'Error: ' + e.message; }
    loading = false;
  }

  async function startN8n() {
    message = 'Iniciando n8n...';
    try {
      const res = await fetch('/api/n8n/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        message = 'n8n iniciado — abrí http://localhost:5678';
        setTimeout(refresh, 3000);
      } else {
        message = 'Error: ' + data.error;
      }
    } catch (e) { message = 'Error de red: ' + e.message; }
  }
</script>

<div class="panel">
  <div class="header">
    <Icon name="n8n" size={20} />
    <span>n8n</span>
    <span class="badge" class:running={status.running} class:stopped={!status.running && status.installed}>
      {status.running ? '● Corriendo' : status.installed ? '○ Detenido' : '✕ No instalado'}
    </span>
    <button class="refresh-btn" on:click={refresh}>↻</button>
  </div>

  {#if loading}
    <div class="status-msg">Cargando...</div>
  {:else}
    {#if !status.installed}
      <div class="notice">
        <strong>n8n no está instalado</strong>
        <p>Instalalo globalmente con npm:</p>
        <code>npm install -g n8n</code>
        <p class="sub">Luego iniciá con <code>n8n start</code> o desde este panel.</p>
      </div>
    {:else if status.running}
      <div class="section">
        <div class="section-title">
          <Icon name="api" size={14} />
          <span>n8n está corriendo</span>
        </div>
        <p class="info-text">Accedé a la interfaz web de n8n para crear y gestionar tus flujos de trabajo.</p>
        <a href="http://localhost:5678" target="_blank" class="btn" rel="noreferrer">Abrir n8n →</a>
      </div>

      <div class="section">
        <div class="section-title">
          <Icon name="key" size={14} />
          <span>Integración con AxisPanel</span>
        </div>
        <p class="info-text">Usá n8n para automatizar flujos post-leads:</p>
        <ul class="flow-list">
          <li>Disparar workflow cuando se scrapean nuevos leads</li>
          <li>Enviar emails de seguimiento automáticos</li>
          <li>Conectar con CRM, Slack, Telegram, WhatsApp</li>
          <li>Generar propuestas y cotizaciones</li>
        </ul>
      </div>
    {:else}
      <div class="section">
        <div class="section-title">
          <Icon name="plus" size={14} />
          <span>n8n instalado pero no corriendo</span>
        </div>
        <p class="info-text">Iniciá n8n para empezar a crear flujos de automatización.</p>
        <button class="btn" on:click={startN8n}>Iniciar n8n</button>
      </div>
    {/if}

    {#if message}
      <div class="msg">{message}</div>
    {/if}
  {/if}
</div>

<style>
  .panel { padding: 16px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .header { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
  .badge.running { background: rgba(16,185,129,0.1); color: #10b981; }
  .badge.stopped { background: rgba(245,158,11,0.1); color: #f59e0b; }
  .refresh-btn { margin-left: auto; background: none; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-muted); cursor: pointer; padding: 2px 8px; font-size: 14px; }
  .refresh-btn:hover { background: var(--accent-glow); color: var(--accent); }
  .section { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; }
  .section-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 8px; }
  .info-text { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin: 0 0 10px; }
  .btn { display: inline-flex; align-items: center; padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; font-family: var(--font-sans); text-decoration: none; }
  .btn:hover { opacity: 0.85; }
  .flow-list { font-size: 13px; color: var(--text-secondary); line-height: 1.8; padding-left: 20px; margin: 0; }
  .msg { padding: 8px 12px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-size: 13px; color: #10b981; }
  .status-msg { text-align: center; padding: 40px; color: var(--text-muted); }
  .notice { padding: 16px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; font-size: 14px; }
  .notice code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  .notice .sub { font-size: 12px; margin-top: 4px; }
</style>
