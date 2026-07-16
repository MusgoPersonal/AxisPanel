<script>
  import { onMount } from 'svelte';
  import Icon from '../../../lib/Icon.svelte';

  let cloned = false;
  let loading = true;
  let message = '';

  onMount(async () => { await refresh(); });

  async function refresh() {
    loading = true;
    try {
      const res = await fetch('/api/calcom/status');
      const data = await res.json();
      cloned = data.cloned;
    } catch { cloned = false; }
    loading = false;
  }
</script>

<div class="panel">
  <div class="header">
    <Icon name="calcom" size={20} />
    <span>Cal.com</span>
    <span class="badge" class:green={cloned}>
      {cloned ? '✓ Clonado' : '✕ No clonado'}
    </span>
    <button class="refresh-btn" on:click={refresh}>↻</button>
  </div>

  {#if loading}
    <div class="status-msg">Cargando...</div>
  {:else if cloned}
    <div class="section">
      <div class="section-title">
        <Icon name="calcom" size={14} />
        <span>Repositorio listo</span>
      </div>
      <p class="info-text">
        cal.diy clonado en <code>C:\AxisPanel\cal.diy</code> (monorepo con apps/web, apps/api, packages/*).
      </p>
    </div>

    <div class="section">
      <div class="section-title">
        <Icon name="autoconfig" size={14} />
        <span>Próximos pasos</span>
      </div>
      <ol class="steps">
        <li>Instalar dependencias: <code>yarn install</code></li>
        <li>Configurar <code>.env</code> (copiar de <code>.env.example</code>)</li>
        <li>Agregar PostgreSQL, Redis</li>
        <li><code>yarn dev</code> para desarrollo</li>
      </ol>
    </div>

    <div class="section">
      <div class="section-title">
        <Icon name="api" size={14} />
        <span>Recursos</span>
      </div>
      <p class="info-text">cal.diy es la versión auto-hosteable de Cal.com — calendario de citas y reservas.</p>
      <a href="https://cal.com/docs" target="_blank" class="btn" rel="noreferrer">Documentación →</a>
    </div>
  {:else}
    <div class="notice">
      <strong>cal.diy no está clonado</strong>
      <p>Cloná el repositorio para empezar:</p>
      <code>git clone --depth 1 https://github.com/calcom/cal.diy.git</code>
    </div>
  {/if}

  {#if message}
    <div class="msg">{message}</div>
  {/if}
</div>

<style>
  .panel { padding: 16px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .header { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
  .badge.green { background: rgba(16,185,129,0.1); color: #10b981; }
  .refresh-btn { margin-left: auto; background: none; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-muted); cursor: pointer; padding: 2px 8px; font-size: 14px; }
  .refresh-btn:hover { background: var(--accent-glow); color: var(--accent); }
  .section { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; }
  .section-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 8px; }
  .info-text { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin: 0 0 10px; }
  .info-text code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 3px; font-size: 12px; }
  .btn { display: inline-flex; align-items: center; padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; font-family: var(--font-sans); text-decoration: none; }
  .btn:hover { opacity: 0.85; }
  .steps { font-size: 13px; color: var(--text-secondary); line-height: 2; padding-left: 20px; margin: 0; }
  .steps code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 3px; font-size: 12px; }
  .msg { padding: 8px 12px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-size: 13px; color: #10b981; }
  .status-msg { text-align: center; padding: 40px; color: var(--text-muted); }
  .notice { padding: 16px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; font-size: 14px; }
  .notice code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 3px; font-size: 13px; }
</style>
