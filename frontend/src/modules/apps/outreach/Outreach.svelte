<script>
  import { onMount } from 'svelte';
  import Icon from '../../../lib/Icon.svelte';

  let loading = true;
  let activeTab = 'config';
  let message = '';

  let config = { provider: 'resend', apiKey: '', smtp: { from: '' }, whatsapp: { provider: 'twilio', accountSid: '', authToken: '', fromNumber: '' } };
  let hasConfig = false;

  let templates = [];
  let editingTemplate = null;
  let tplName = '';
  let tplSubject = '';
  let tplBody = '';
  let tplBodyText = '';
  let editingId = null;

  let leads = [];
  let selectedLeads = [];
  let sendTemplateId = '';
  let sendSubject = '';
  let sendBody = '';
  let sendBodyText = '';
  let sendChannel = 'email';
  let sending = false;
  let sendResult = null;
  let testEmail = '';

  let history = [];

  onMount(async () => {
    await Promise.all([loadConfig(), loadTemplates(), loadHistory(), loadLeads()]);
    loading = false;
  });

  async function loadConfig() {
    try {
      const res = await fetch('/api/outreach/config');
      const data = await res.json();
      hasConfig = data.hasConfig;
      if (data.config) {
        config = data.config;
        if (!config.smtp) config.smtp = { from: '' };
        if (!config.whatsapp) config.whatsapp = { provider: 'twilio', accountSid: '', authToken: '', fromNumber: '' };
      }
    } catch {}
  }

  async function saveConfig() {
    try {
      const res = await fetch('/api/outreach/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      message = data.success ? 'Configuración guardada ✓' : 'Error: ' + data.error;
      await loadConfig();
    } catch (e) { message = 'Error: ' + e.message; }
  }

  async function loadTemplates() {
    try {
      const res = await fetch('/api/outreach/templates');
      const data = await res.json();
      templates = data.templates || [];
    } catch {}
  }

  function editTemplate(tpl) {
    editingId = tpl.id;
    tplName = tpl.name;
    tplSubject = tpl.subject || '';
    tplBody = tpl.body || '';
    tplBodyText = tpl.bodyText || '';
  }

  function newTemplate() {
    editingId = null;
    tplName = ''; tplSubject = ''; tplBody = ''; tplBodyText = '';
  }

  async function saveTemplate() {
    if (!tplName) { message = 'Poné un nombre al template'; return; }
    if (!tplSubject && !tplBodyText) { message = 'Comㄌé asunto (email) o cuerpo WhatsApp'; return; }
    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/outreach/templates/${editingId}` : '/api/outreach/templates';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tplName, subject: tplSubject, body: tplBody, bodyText: tplBodyText })
      });
      const data = await res.json();
      message = data.success ? 'Template guardado ✓' : 'Error: ' + data.error;
      editingId = null; tplName = ''; tplSubject = ''; tplBody = ''; tplBodyText = '';
      await loadTemplates();
    } catch (e) { message = 'Error: ' + e.message; }
  }

  async function deleteTemplate(id) {
    try {
      const res = await fetch(`/api/outreach/templates/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { message = 'Template eliminado'; await loadTemplates(); }
    } catch {}
  }

  async function loadLeads() {
    try {
      const res = await fetch('/api/crm/leads?limit=200');
      const data = await res.json();
      leads = data.leads || data || [];
    } catch {}
  }

  function toggleLead(id) {
    if (selectedLeads.includes(id)) selectedLeads = selectedLeads.filter(l => l !== id);
    else selectedLeads.push(id);
  }

  function onTemplateChange() {
    const tpl = templates.find(t => t.id === sendTemplateId);
    if (tpl) {
      sendSubject = tpl.subject || '';
      sendBody = tpl.body || '';
      sendBodyText = tpl.bodyText || '';
    } else {
      sendSubject = ''; sendBody = ''; sendBodyText = '';
    }
  }

  async function sendMessages() {
    if (sendTemplateId) onTemplateChange();
    if (sendChannel === 'email' && !sendSubject && !sendBody) { message = 'Falta asunto o cuerpo del email'; return; }
    if (sendChannel === 'whatsapp' && !sendBodyText) { message = 'Falta el texto para WhatsApp'; return; }
    if (!testEmail && selectedLeads.length === 0) { message = 'Seleccioná leads o poné un test email'; return; }

    sending = true; sendResult = null;
    try {
      const body = {
        leadIds: testEmail ? [] : selectedLeads,
        templateId: sendTemplateId || null,
        subject: sendSubject,
        body: sendBody,
        bodyText: sendBodyText,
        testEmail: testEmail || null,
        channel: sendChannel
      };
      const res = await fetch('/api/outreach/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      sendResult = await res.json();
      message = sendResult.success ? `[${sendResult.channel}] Enviados: ${sendResult.sent}, Errores: ${sendResult.errors}` : 'Error';
      await loadHistory();
    } catch (e) { message = 'Error: ' + e.message; }
    sending = false;
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/outreach/history');
      const data = await res.json();
      history = data.history || [];
    } catch {}
  }

  function previewBody(txt) {
    return txt.replace(/{{name}}/g, 'Juan').replace(/{{email}}/g, 'cliente@email.com').replace(/{{company}}/g, 'Empresa SRL');
  }
</script>

<div class="panel">
  <div class="header">
    <Icon name="outreach" size={20} />
    <span>Outreach</span>
    <span class="badge" class:green={hasConfig}>
      {hasConfig ? '● ' + config.provider + (config.whatsapp?.accountSid ? ' + WA' : '') : '○ Sin configurar'}
    </span>
    <button class="refresh-btn" on:click={() => { Promise.all([loadConfig(), loadTemplates(), loadHistory(), loadLeads()]); }}>↻</button>
  </div>

  <div class="tabs">
    <button class="tab" class:active={activeTab === 'config'} on:click={() => activeTab = 'config'}>Config</button>
    <button class="tab" class:active={activeTab === 'templates'} on:click={() => { activeTab = 'templates'; }}>Templates</button>
    <button class="tab" class:active={activeTab === 'send'} on:click={() => activeTab = 'send'}>Enviar</button>
    <button class="tab" class:active={activeTab === 'history'} on:click={() => { activeTab = 'history'; loadHistory(); }}>Historial</button>
  </div>

  {#if message}
    <div class="msg">{message}</div>
  {/if}

  <div class="tab-content">
    {#if activeTab === 'config'}
      <div class="section">
        <div class="section-title">✉ Email</div>
        <label>Provider</label>
        <select bind:value={config.provider}>
          <option value="resend">Resend</option>
          <option value="sendgrid">SendGrid</option>
          <option value="smtp">SMTP</option>
        </select>
        <label>API Key</label>
        <input type="password" bind:value={config.apiKey} placeholder="re_..." />
        <label>Desde (email)</label>
        <input type="email" bind:value={config.smtp.from} placeholder="tudominio.com" />
        {#if config.provider === 'smtp'}
          <label>SMTP Host</label>
          <input type="text" bind:value={config.smtp.host} placeholder="smtp.tudominio.com" />
          <label>Port</label>
          <input type="number" bind:value={config.smtp.port} placeholder="587" />
          <label>User</label>
          <input type="text" bind:value={config.smtp.user} />
          <label>Pass</label>
          <input type="password" bind:value={config.smtp.pass} />
        {/if}
        {#if config.apiKey}
          <div class="hint">✓ API Key configurada</div>
        {/if}
      </div>

      <div class="section">
        <div class="section-title"> WhatsApp</div>
        <label>Provider</label>
        <select bind:value={config.whatsapp.provider}>
          <option value="twilio">Twilio (API)</option>
          <option value="manual">Manual (solo logs)</option>
        </select>
        {#if config.whatsapp.provider === 'twilio'}
          <label>Account SID</label>
          <input type="password" bind:value={config.whatsapp.accountSid} placeholder="AC..." />
          <label>Auth Token</label>
          <input type="password" bind:value={config.whatsapp.authToken} placeholder="auth token" />
          <label>WhatsApp From (con código)</label>
          <input type="text" bind:value={config.whatsapp.fromNumber} placeholder="+14155238886" />
          <div class="hint">Número de Twilio para WhatsApp. Formato: +códigopaísnúmero</div>
        {/if}
        <button class="btn" on:click={saveConfig}>Guardar Configuración</button>
      </div>
    {/if}

    {#if activeTab === 'templates'}
      <div class="section">
        <div class="section-title">
          {editingId !== undefined ? 'Editar Template' : 'Nuevo Template'}
          {#if editingId !== undefined}
            <button class="btn small" on:click={newTemplate}>+ Nuevo</button>
          {/if}
        </div>
        <label>Nombre</label>
        <input type="text" bind:value={tplName} placeholder="Ej: Primer contacto" />
        <label>Asunto (email)</label>
        <input type="text" bind:value={tplSubject} placeholder="Hola {{name}}, tenemos una propuesta" />
        <label>Cuerpo HTML (email)</label>
        <textarea bind:value={tplBody} rows="4" placeholder="<p>Hola {{name}},...</p>"></textarea>
        <label>Texto WhatsApp</label>
        <textarea bind:value={tplBodyText} rows="3" placeholder="Hola {{name}}, te escribo de {{company}}..."></textarea>
        <div class="hint">Variables: <code>{`{{name}}`}</code> <code>{`{{email}}`}</code> <code>{`{{company}}`}</code></div>
        <button class="btn" on:click={saveTemplate}>{editingId ? 'Actualizar' : 'Crear'} Template</button>
      </div>

      {#if templates.length > 0}
        <div class="tpl-list">
          {#each templates as tpl}
            <div class="tpl-card">
              <div class="tpl-name">{tpl.name}</div>
              <div class="tpl-subject">{tpl.subject || tpl.bodyText?.slice(0, 60) || '—'}</div>
              <div class="tpl-actions">
                <button class="btn-sm" on:click={() => editTemplate(tpl)}>Editar</button>
                <button class="btn-sm danger" on:click={() => deleteTemplate(tpl.id)}>Eliminar</button>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty">No hay templates todavía. Creá uno arriba.</div>
      {/if}
    {/if}

    {#if activeTab === 'send'}
      <div class="section">
        <div class="section-title">Componer Mensaje</div>
        <label>Canal</label>
        <div class="channel-select">
          <button class="chan-btn" class:active={sendChannel === 'email'} on:click={() => sendChannel = 'email'}>✉ Email</button>
          <button class="chan-btn" class:active={sendChannel === 'whatsapp'} on:click={() => sendChannel = 'whatsapp'}> WhatsApp</button>
        </div>

        <label>Template (opcional)</label>
        <select bind:value={sendTemplateId} on:change={onTemplateChange}>
          <option value="">— Sin template —</option>
          {#each templates as tpl}
            <option value={tpl.id}>{tpl.name}</option>
          {/each}
        </select>

        {#if sendChannel === 'email'}
          <label>Asunto</label>
          <input type="text" bind:value={sendSubject} placeholder="Asunto del email" />
          <label>Cuerpo (HTML)</label>
          <textarea bind:value={sendBody} rows="5" placeholder="<p>Hola {{name}},...</p>"></textarea>
          {#if sendBody}
            <div class="preview-box">
              <div class="preview-label">Vista previa:</div>
              <div class="preview-html">{@html previewBody(sendBody)}</div>
            </div>
          {/if}
        {:else}
          <label>Mensaje de WhatsApp</label>
          <textarea bind:value={sendBodyText} rows="5" placeholder="Hola {{name}}, soy de {{company}}..."></textarea>
          {#if sendBodyText}
            <div class="preview-box">
              <div class="preview-label">Vista previa:</div>
              <div class="preview-plain">{previewBody(sendBodyText)}</div>
            </div>
          {/if}
        {/if}
      </div>

      <div class="section">
        <div class="section-title">Destinatarios</div>
        <label>Test {sendChannel === 'whatsapp' ? 'teléfono' : 'email'} (opcional)</label>
        <input type="{sendChannel === 'whatsapp' ? 'tel' : 'email'}" bind:value={testEmail} placeholder={sendChannel === 'whatsapp' ? '+54123456789' : 'test@email.com'} />
        <div class="hint">Si ponés test, solo se envía a ese. Si no, a los leads seleccionados.</div>

        {#if leads.length > 0}
          <div class="leads-select">
            <div class="leads-header">
              <span>Leads ({leads.filter(l => sendChannel === 'email' ? l.email : (l.phone || l.telefono)).length} con {sendChannel === 'email' ? 'email' : 'teléfono'})</span>
              <button class="btn-sm" on:click={() => {
                const field = sendChannel === 'email' ? 'email' : 'phone';
                selectedLeads = leads.filter(l => field === 'email' ? l.email : (l.phone || l.telefono)).map(l => l.id?.toString() || l.id);
              }}>Sel. todos</button>
            </div>
            <div class="leads-list">
              {#each leads.filter(l => sendChannel === 'email' ? l.email : (l.phone || l.telefono)) as lead}
                <label class="lead-row">
                  <input type="checkbox" checked={selectedLeads.includes(lead.id?.toString() || lead.id)}
                    on:change={() => toggleLead(lead.id?.toString() || lead.id)} />
                  <span class="lead-info">{lead.name || lead.nombre || '—'}</span>
                  <span class="lead-email">{sendChannel === 'email' ? lead.email : (lead.phone || lead.telefono)}</span>
                </label>
              {/each}
            </div>
          </div>
        {:else}
          <div class="empty">No hay leads en el CRM</div>
        {/if}

        <button class="btn primary" on:click={sendMessages} disabled={sending}>
          {sending ? 'Enviando...' : `Enviar ${testEmail ? 'test' : selectedLeads.length + ' lead(s)'}`}
        </button>
      </div>

      {#if sendResult}
        <div class="section">
          <div class="section-title">Resultado ({sendResult.channel})</div>
          <p class="result-line">✓ Enviados: {sendResult.sent}</p>
          <p class="result-line error">✕ Errores: {sendResult.errors}</p>
          {#if sendResult.errorList?.length > 0}
            <div class="error-detail">
              {#each sendResult.errorList as err}
                <div class="err-row">{err.email || err.phone}: {err.error}</div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/if}

    {#if activeTab === 'history'}
      {#if history.length > 0}
        <div class="history-list">
          {#each history as h}
            <div class="hist-item">
              <span class="hist-channel">{h.channel === 'whatsapp' ? '' : '✉'}</span>
              <div class="hist-date">{new Date(h.timestamp).toLocaleString()}</div>
              <div class="hist-subject">{h.subject || (h.sent?.[0]?.name ? 'Mensaje a ' + h.sent[0].name : '')}</div>
              <div class="hist-stats">
                <span class="stat ok">✓ {h.sentCount}</span>
                {#if h.errorCount > 0}
                  <span class="stat err">✕ {h.errorCount}</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty">No hay envíos todavía</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .panel { padding: 16px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  .header { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
  .badge.green { background: rgba(16,185,129,0.1); color: #10b981; }
  .refresh-btn { margin-left: auto; background: none; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-muted); cursor: pointer; padding: 2px 8px; font-size: 14px; }
  .refresh-btn:hover { background: var(--accent-glow); color: var(--accent); }
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
  .btn:disabled { opacity: 0.4; cursor: default; }
  .btn.primary { margin-top: 12px; }
  .btn.small { padding: 4px 10px; font-size: 11px; margin-top: 0; }
  .btn-sm { padding: 3px 8px; background: rgba(255,255,255,0.08); border: none; border-radius: 4px; color: var(--text-primary); cursor: pointer; font-size: 11px; font-family: var(--font-sans); }
  .btn-sm.danger { color: #ef4444; }
  .btn-sm:hover { background: rgba(255,255,255,0.14); }
  .hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
  .hint code { background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; }
  .msg { padding: 8px 12px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-size: 13px; color: #10b981; }
  .empty { text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px; }
  .channel-select { display: flex; gap: 6px; margin-bottom: 8px; }
  .chan-btn { padding: 6px 16px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-base); color: var(--text-muted); cursor: pointer; font-size: 12px; font-weight: 600; font-family: var(--font-sans); }
  .chan-btn.active { background: var(--accent); color: #000; border-color: var(--accent); }
  .chan-btn:hover:not(.active) { background: rgba(255,255,255,0.06); }
  .tpl-list { display: flex; flex-direction: column; gap: 4px; }
  .tpl-card { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; }
  .tpl-name { font-weight: 600; font-size: 13px; color: var(--accent); min-width: 120px; }
  .tpl-subject { flex: 1; font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tpl-actions { display: flex; gap: 4px; }
  .preview-box { margin-top: 6px; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; background: var(--bg-base); }
  .preview-label { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
  .preview-html, .preview-plain { font-size: 13px; color: var(--text-secondary); white-space: pre-wrap; }
  .leads-select { margin-top: 6px; }
  .leads-header { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
  .leads-list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  .lead-row { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .lead-row:hover { background: rgba(255,255,255,0.04); }
  .lead-info { flex: 1; color: var(--text-primary); }
  .lead-email { color: var(--text-muted); font-size: 11px; }
  .result-line { font-size: 13px; margin: 2px 0; }
  .result-line.error { color: #ef4444; }
  .error-detail { font-size: 11px; color: #ef4444; margin-top: 4px; }
  .err-row { padding: 2px 0; }
  .history-list { display: flex; flex-direction: column; gap: 4px; }
  .hist-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; }
  .hist-channel { font-size: 14px; }
  .hist-date { font-size: 11px; color: var(--text-muted); min-width: 140px; }
  .hist-subject { flex: 1; font-size: 12px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hist-stats { display: flex; gap: 6px; }
  .stat { font-size: 12px; font-weight: 600; }
  .stat.ok { color: #10b981; }
  .stat.err { color: #ef4444; }
</style>
