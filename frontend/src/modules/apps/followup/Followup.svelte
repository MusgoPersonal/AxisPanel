<script>
  import { onMount } from 'svelte';
  import Icon from '../../../lib/Icon.svelte';

  let loading = true;
  let activeTab = 'rules';
  let message = '';

  let rules = [];
  let editingId = null;
  let ruleName = '';
  let ruleTrigger = 'delay';
  let ruleDays = 3;
  let ruleChannel = 'email';
  let ruleTemplateId = '';
  let ruleSubject = '';
  let ruleBody = '';
  let ruleBodyText = '';
  let ruleMaxFU = 3;
  let ruleOnlyNoResponse = true;

  let history = [];
  let statusInfo = { activeRules: 0, totalRules: 0, totalFollowUps: 0, schedulerRunning: false };

  let templates = [];

  onMount(async () => {
    await Promise.all([loadRules(), loadHistory(), loadStatus(), loadTemplates()]);
    loading = false;
  });

  async function loadRules() {
    try { const r = await fetch('/api/followup/rules'); const d = await r.json(); rules = d.rules || []; } catch {}
  }
  async function loadHistory() {
    try { const r = await fetch('/api/followup/history'); const d = await r.json(); history = d.history || []; } catch {}
  }
  async function loadStatus() {
    try { const r = await fetch('/api/followup/status'); const d = await r.json(); statusInfo = d; } catch {}
  }
  async function loadTemplates() {
    try { const r = await fetch('/api/outreach/templates'); const d = await r.json(); templates = d.templates || []; } catch {}
  }

  function newRule() {
    editingId = null; ruleName = ''; ruleTrigger = 'delay'; ruleDays = 3;
    ruleChannel = 'email'; ruleTemplateId = ''; ruleSubject = '';
    ruleBody = ''; ruleBodyText = ''; ruleMaxFU = 3; ruleOnlyNoResponse = true;
  }

  function editRule(r) {
    editingId = r.id; ruleName = r.name; ruleTrigger = r.trigger || 'delay';
    ruleDays = r.daysAfterLastContact || 3; ruleChannel = r.channel || 'email';
    ruleTemplateId = r.templateId || ''; ruleSubject = r.subject || '';
    ruleBody = r.body || ''; ruleBodyText = r.bodyText || '';
    ruleMaxFU = r.maxFollowUps || 3; ruleOnlyNoResponse = r.onlyIfNoResponse !== false;
  }

  async function saveRule() {
    if (!ruleName) { message = 'Nombre requerido'; return; }
    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/followup/rules/${editingId}` : '/api/followup/rules';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleName, trigger: ruleTrigger, daysAfterLastContact: ruleDays,
          channel: ruleChannel, templateId: ruleTemplateId || null,
          subject: ruleSubject, body: ruleBody, bodyText: ruleBodyText,
          maxFollowUps: ruleMaxFU, onlyIfNoResponse: ruleOnlyNoResponse
        })
      });
      const data = await res.json();
      message = data.success ? 'Regla guardada ✓' : 'Error: ' + data.error;
      newRule(); await loadRules(); await loadStatus();
    } catch (e) { message = 'Error: ' + e.message; }
  }

  async function toggleRule(r) {
    try {
      const res = await fetch(`/api/followup/rules/${r.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !r.enabled })
      });
      if (res.ok) { await loadRules(); message = r.enabled ? 'Regla pausada' : 'Regla activada'; }
    } catch {}
  }

  async function deleteRule(id) {
    try {
      const res = await fetch(`/api/followup/rules/${id}`, { method: 'DELETE' });
      if (res.ok) { message = 'Regla eliminada'; await loadRules(); await loadStatus(); }
    } catch {}
  }

  async function triggerCheck() {
    message = 'Ejecutando check...';
    try {
      const res = await fetch('/api/followup/trigger', { method: 'POST' });
      const d = await res.json();
      message = d.success ? `Check ejecutado: ${d.message}` : 'Error';
      await loadHistory(); await loadStatus();
    } catch (e) { message = 'Error: ' + e.message; }
  }

  function daysAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'hoy';
    if (days === 1) return 'ayer';
    return `${days} días`;
  }
</script>

<div class="panel">
  <div class="header">
    <Icon name="followup" size={20} />
    <span>Follow-up Automator</span>
    <span class="badge" class:green={statusInfo.activeRules > 0}>
      {statusInfo.activeRules > 0 ? `● ${statusInfo.activeRules} activa(s)` : '○ Sin reglas'}
    </span>
    {#if !statusInfo.schedulerRunning}
      <span class="badge warn">Scheduler detenido</span>
    {/if}
    <button class="refresh-btn" on:click={() => { Promise.all([loadRules(), loadHistory(), loadStatus()]); }}>↻</button>
    <button class="refresh-btn run-btn" on:click={triggerCheck} title="Ejecutar check ahora">▶</button>
  </div>

  <div class="tabs">
    <button class="tab" class:active={activeTab === 'rules'} on:click={() => activeTab = 'rules'}>Reglas</button>
    <button class="tab" class:active={activeTab === 'history'} on:click={() => { activeTab = 'history'; loadHistory(); }}>Historial</button>
  </div>

  {#if message}
    <div class="msg">{message}</div>
  {/if}

  <div class="tab-content">
    {#if activeTab === 'rules'}
      <div class="section">
        <div class="section-title">
          {editingId !== null ? 'Editar Regla' : 'Nueva Regla'}
          {#if editingId !== null}
            <button class="btn small" on:click={newRule}>+ Nueva</button>
          {/if}
        </div>

        <label>Nombre</label>
        <input type="text" bind:value={ruleName} placeholder="Ej: Follow-up 3 días" />

        <label>Disparador</label>
        <select bind:value={ruleTrigger}>
          <option value="delay">Retraso desde último contacto</option>
          <option value="schedule" disabled>Programado (próximamente)</option>
        </select>

        {#if ruleTrigger === 'delay'}
          <label>Días después del último contacto</label>
          <input type="number" bind:value={ruleDays} min="1" max="90" />
        {/if}

        <label>Canal</label>
        <select bind:value={ruleChannel}>
          <option value="email">✉ Email</option>
          <option value="whatsapp"> WhatsApp</option>
        </select>

        <label>Template (opcional)</label>
        <select bind:value={ruleTemplateId}>
          <option value="">— Sin template —</option>
          {#each templates as tpl}
            <option value={tpl.id}>{tpl.name}</option>
          {/each}
        </select>

        {#if ruleChannel === 'email'}
          <label>Asunto (opcional, sobreescribe template)</label>
          <input type="text" bind:value={ruleSubject} placeholder="Hola {{name}}, recordatorio..." />
          <label>Cuerpo HTML (opcional)</label>
          <textarea bind:value={ruleBody} rows="3" placeholder="<p>Hola {{name}},...</p>"></textarea>
        {:else}
          <label>Texto WhatsApp (opcional, sobreescribe template)</label>
          <textarea bind:value={ruleBodyText} rows="3" placeholder="Hola {{name}}, te escribo de nuevo..."></textarea>
        {/if}

        <label class="checkbox-row">
          <input type="checkbox" bind:checked={ruleOnlyNoResponse} />
          Solo si no respondió
        </label>

        <label>Máximo de follow-ups por lead</label>
        <input type="number" bind:value={ruleMaxFU} min="1" max="20" />

        <button class="btn" on:click={saveRule}>{editingId !== null ? 'Actualizar' : 'Crear'} Regla</button>
      </div>

      {#if rules.length > 0}
        <div class="rule-list">
          {#each rules as r}
            <div class="rule-card" class:paused={!r.enabled}>
              <div class="rule-header">
                <div class="rule-name">{r.name}</div>
                <button class="btn-sm" on:click={() => toggleRule(r)} title={r.enabled ? 'Pausar' : 'Activar'}>
                  {r.enabled ? '⏸' : '▶'}
                </button>
              </div>
              <div class="rule-detail">
                {r.trigger === 'delay' ? `Cada ${r.daysAfterLastContact} días` : ''} · {r.channel}
                {#if r.onlyIfNoResponse} · solo sin respuesta{/if} · máx {r.maxFollowUps}
              </div>
              <div class="rule-actions">
                <button class="btn-sm" on:click={() => editRule(r)}>Editar</button>
                <button class="btn-sm danger" on:click={() => deleteRule(r.id)}>Eliminar</button>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty">No hay reglas de follow-up. Creá una arriba.</div>
      {/if}
    {/if}

    {#if activeTab === 'history'}
      <div class="section">
        <div class="section-title">Resumen</div>
        <div class="stats-row">
          <div class="stat-card"><strong>{statusInfo.totalRules}</strong> reglas</div>
          <div class="stat-card"><strong>{statusInfo.activeRules}</strong> activas</div>
          <div class="stat-card"><strong>{statusInfo.totalFollowUps}</strong> envíos automáticos</div>
        </div>
      </div>

      {#if history.length > 0}
        <div class="hist-list">
          {#each history as h}
            <div class="hist-item">
              <span class="hist-channel">{h.channel === 'whatsapp' ? '' : '✉'}</span>
              <div class="hist-date">{new Date(h.sentAt).toLocaleString()}</div>
              <div class="hist-info">
                <span class="hist-rule">{h.ruleName}</span>
                <span class="hist-lead">{h.leadName}</span>
              </div>
              <div class="hist-result" class:ok={h.success} class:fail={!h.success}>
                {h.success ? '✓' : '✕'}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty">No hay follow-ups automáticos todavía</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .panel { padding: 16px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  .header { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
  .badge.green { background: rgba(16,185,129,0.1); color: #10b981; }
  .badge.warn { background: rgba(245,158,11,0.1); color: #f59e0b; }
  .refresh-btn { margin-left: auto; background: none; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-muted); cursor: pointer; padding: 2px 8px; font-size: 14px; }
  .refresh-btn:hover { background: var(--accent-glow); color: var(--accent); }
  .refresh-btn.run-btn { margin-left: 4px; }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
  .tab { padding: 6px 12px; background: none; border: none; border-radius: 6px; color: var(--text-muted); cursor: pointer; font-size: 12px; font-weight: 600; font-family: var(--font-sans); }
  .tab:hover { color: var(--text-primary); background: rgba(255,255,255,0.04); }
  .tab.active { color: var(--accent); background: rgba(255,255,255,0.06); }
  .tab-content { flex: 1; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
  .section { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; }
  .section-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 8px; }
  label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 3px; margin-top: 6px; }
  input, select, textarea { width: 100%; padding: 8px 12px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); box-sizing: border-box; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }
  textarea { resize: vertical; min-height: 60px; }
  .btn { padding: 6px 14px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; font-family: var(--font-sans); margin-top: 8px; }
  .btn:hover { opacity: 0.85; }
  .btn.small { padding: 4px 10px; font-size: 11px; margin-top: 0; }
  .btn-sm { padding: 3px 8px; background: rgba(255,255,255,0.08); border: none; border-radius: 4px; color: var(--text-primary); cursor: pointer; font-size: 11px; font-family: var(--font-sans); }
  .btn-sm.danger { color: #ef4444; }
  .btn-sm:hover { background: rgba(255,255,255,0.14); }
  .hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
  .msg { padding: 8px 12px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-size: 13px; color: #10b981; }
  .empty { text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px; }
  .checkbox-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; padding: 4px 0; }
  .checkbox-row input { width: auto; }
  .stats-row { display: flex; gap: 8px; }
  .stat-card { background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 16px; font-size: 13px; color: var(--text-muted); flex: 1; text-align: center; }
  .stat-card strong { display: block; font-size: 18px; color: var(--text-primary); margin-bottom: 2px; }
  .rule-list { display: flex; flex-direction: column; gap: 4px; }
  .rule-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; }
  .rule-card.paused { opacity: 0.5; }
  .rule-header { display: flex; justify-content: space-between; align-items: center; }
  .rule-name { font-weight: 600; font-size: 13px; color: var(--accent); }
  .rule-detail { font-size: 11px; color: var(--text-muted); margin: 2px 0 6px; }
  .rule-actions { display: flex; gap: 4px; }
  .hist-list { display: flex; flex-direction: column; gap: 4px; }
  .hist-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; }
  .hist-channel { font-size: 14px; }
  .hist-date { color: var(--text-muted); min-width: 130px; font-size: 11px; }
  .hist-info { flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .hist-rule { color: var(--accent); font-weight: 500; font-size: 12px; }
  .hist-lead { color: var(--text-secondary); font-size: 11px; }
  .hist-result { font-weight: 700; font-size: 14px; }
  .hist-result.ok { color: #10b981; }
  .hist-result.fail { color: #ef4444; }
</style>
