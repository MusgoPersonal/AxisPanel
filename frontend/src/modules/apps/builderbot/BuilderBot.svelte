<script>
  import { onMount } from 'svelte';
  import Icon from '../../../lib/Icon.svelte';

  let status = { installed: false, version: null };
  let bots = [];
  let loading = true;
  let newBotName = '';
  let newBotProvider = 'baileys';
  let creating = false;
  let message = '';

  const PROVIDERS = [
    { id: 'baileys', label: 'WhatsApp (Baileys)' },
    { id: 'meta', label: 'WhatsApp (Meta API)' },
    { id: 'telegram', label: 'Telegram' },
    { id: 'twilio', label: 'Twilio WhatsApp' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'web-whatsapp', label: 'Web WhatsApp' },
    { id: 'evolution-api', label: 'Evolution API' },
    { id: 'wppconnect', label: 'WPPConnect' },
    { id: 'gupshup', label: 'Gupshup' },
    { id: 'gohighlevel', label: 'GoHighLevel' },
    { id: 'email', label: 'Email' },
  ];

  onMount(async () => {
    try {
      const sRes = await fetch('/api/builderbot/status');
      status = await sRes.json();
      if (status.installed) {
        const bRes = await fetch('/api/builderbot/bots');
        bots = (await bRes.json()).bots || [];
      }
    } catch (e) { message = 'Error: ' + e.message; }
    loading = false;
  });

  async function createBot() {
    if (!newBotName.trim()) return;
    creating = true;
    message = '';
    try {
      const res = await fetch('/api/builderbot/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBotName.trim(), provider: newBotProvider })
      });
      const data = await res.json();
      if (data.success) {
        message = `Bot "${newBotName}" creado exitosamente`;
        newBotName = '';
        const bRes = await fetch('/api/builderbot/bots');
        bots = (await bRes.json()).bots || [];
      } else {
        message = 'Error: ' + data.error;
      }
    } catch (e) { message = 'Error de red: ' + e.message; }
    creating = false;
  }

  async function refresh() {
    loading = true;
    try {
      const sRes = await fetch('/api/builderbot/status');
      status = await sRes.json();
      if (status.installed) {
        const bRes = await fetch('/api/builderbot/bots');
        bots = (await bRes.json()).bots || [];
      }
    } catch (e) { message = 'Error: ' + e.message; }
    loading = false;
  }
</script>

<div class="panel">
  <div class="header">
    <Icon name="builderbot" size={20} />
    <span>BuilderBot</span>
    <span class="version" title="Repositorio clonado">{status.version ? 'v' + status.version : status.installed ? 'instalado' : 'no instalado'}</span>
    <button class="refresh-btn" on:click={refresh}>↻</button>
  </div>

  {#if loading}
    <div class="status-msg">Cargando...</div>
  {:else}
    {#if !status.installed}
      <div class="notice">
        <strong>BuilderBot no está clonado</strong>
        <p>Ejecutá en terminal: <code>git clone https://github.com/codigoencasa/builderbot.git</code> en C:\AxisPanel</p>
      </div>
    {:else}
      <div class="section">
        <div class="section-title">
          <Icon name="plus" size={14} />
          <span>Crear nuevo chatbot</span>
        </div>
        <div class="create-row">
          <input bind:value={newBotName} placeholder="Nombre del bot" disabled={creating} />
          <select bind:value={newBotProvider} disabled={creating}>
            {#each PROVIDERS as p}
              <option value={p.id}>{p.label}</option>
            {/each}
          </select>
          <button class="btn" on:click={createBot} disabled={creating || !newBotName.trim()}>
            {creating ? 'Creando...' : 'Crear Bot'}
          </button>
        </div>
      </div>

      {#if message}
        <div class="msg">{message}</div>
      {/if}

      <div class="section">
        <div class="section-title">
          <Icon name="search" size={14} />
          <span>Bots creados ({bots.length})</span>
        </div>
        {#if bots.length === 0}
          <div class="empty">No hay bots aún. Creá uno arriba o en AxisChat con <code>/builderbot create nombre</code></div>
        {:else}
          <div class="bot-list">
            {#each bots as bot}
              <div class="bot-card">
                <div class="bot-name">{bot.name}</div>
                <div class="bot-meta">v{bot.version}</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="section">
        <div class="section-title">
          <Icon name="api" size={14} />
          <span>Comandos rápidos en AxisChat</span>
        </div>
        <div class="cmd-list">
          <code>/builderbot</code> — listar bots
          <code>/builderbot create nombre</code> — crear bot (provider por defecto: baileys)
          <code>/builderbot create nombre telegram</code> — crear bot con provider específico
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .panel { padding: 16px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .header { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
  .version { font-size: 11px; color: var(--text-muted); font-weight: 400; }
  .refresh-btn { margin-left: auto; background: none; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-muted); cursor: pointer; padding: 2px 8px; font-size: 14px; }
  .refresh-btn:hover { background: var(--accent-glow); color: var(--accent); }
  .section { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; }
  .section-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 10px; }
  .create-row { display: flex; gap: 8px; align-items: center; }
  .create-row input, .create-row select { flex: 1; padding: 8px 10px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); }
  .create-row input:focus, .create-row select:focus { outline: none; border-color: var(--accent); }
  .btn { padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; font-family: var(--font-sans); white-space: nowrap; }
  .btn:hover { opacity: 0.85; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .msg { padding: 8px 12px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-size: 13px; color: #10b981; }
  .empty { font-size: 13px; color: var(--text-muted); padding: 8px 0; }
  .empty code { background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  .bot-list { display: flex; flex-direction: column; gap: 4px; }
  .bot-card { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; }
  .bot-name { font-weight: 600; font-size: 14px; }
  .bot-meta { font-size: 11px; color: var(--text-muted); }
  .cmd-list { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-secondary); }
  .cmd-list code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 3px; font-size: 12px; color: var(--accent); }
  .status-msg { text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px; }
  .notice { padding: 16px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; font-size: 14px; }
  .notice code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 3px; }
</style>
