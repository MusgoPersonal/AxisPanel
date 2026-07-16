<script>
  import { onMount } from 'svelte';
  import Icon from '../../../lib/Icon.svelte';

  let divisions = {};
  let divisionKeys = [];
  let agents = [];
  let selectedDivision = null;
  let selectedAgent = null;
  let agentContent = '';
  let chatInput = '';
  let chatReply = '';
  let loading = true;
  let chatting = false;
  let message = '';

  onMount(async () => {
    try {
      const dRes = await fetch('/api/agency/divisions');
      const dData = await dRes.json();
      divisions = dData.divisions || {};
      divisionKeys = Object.keys(divisions);
    } catch (e) { message = 'Error: ' + e.message; }
    loading = false;
  });

  async function selectDivision(key) {
    selectedDivision = key;
    selectedAgent = null;
    agentContent = '';
    chatReply = '';
    try {
      const aRes = await fetch(`/api/agency/agents?division=${key}`);
      const aData = await aRes.json();
      agents = aData.agents || [];
    } catch (e) { message = 'Error: ' + e.message; }
  }

  async function selectAgent(slug) {
    selectedAgent = slug;
    chatReply = '';
    try {
      const cRes = await fetch(`/api/agency/agent/${slug}`);
      agentContent = await cRes.text();
    } catch (e) { message = 'Error: ' + e.message; }
  }

  async function sendChat() {
    if (!chatInput.trim() || !selectedAgent) return;
    chatting = true;
    chatReply = '';
    try {
      const res = await fetch('/api/agency/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: selectedAgent, message: chatInput })
      });
      const data = await res.json();
      chatReply = data.reply || '(sin respuesta)';
    } catch (e) { chatReply = 'Error: ' + e.message; }
    chatting = false;
  }
</script>

<div class="panel">
  <div class="header">
    <Icon name="agency" size={20} />
    <span>Agency Agents</span>
    <span class="count">{divisionKeys.length} divisiones</span>
  </div>

  {#if loading}
    <div class="status-msg">Cargando...</div>
  {:else}
    <div class="layout">
      <div class="sidebar">
        <div class="section-title">
          <Icon name="search" size={13} />
          <span>Divisiones</span>
        </div>
        <div class="div-list">
          {#each divisionKeys as key}
            <button class="div-item" class:active={selectedDivision === key} on:click={() => selectDivision(key)}>
              <span class="div-label">{divisions[key].label}</span>
              <span class="div-count" style="background: {divisions[key].color}22; color: {divisions[key].color}">{divisions[key].icon}</span>
            </button>
          {/each}
        </div>

        {#if selectedDivision && agents.length > 0}
          <div class="section-title" style="margin-top: 12px;">
            <Icon name="leads" size={13} />
            <span>Agentes ({agents.length})</span>
          </div>
          <div class="agent-list">
            {#each agents as a}
              <button class="agent-item" class:active={selectedAgent === a.slug} on:click={() => selectAgent(a.slug)}>
                <span class="agent-name">{a.name}</span>
                <span class="agent-desc">{a.description}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="main">
        {#if selectedAgent && agentContent}
          <div class="agent-header">
            <span class="agent-title">{agents.find(a => a.slug === selectedAgent)?.name || selectedAgent}</span>
            <span class="badge">{selectedDivision}</span>
          </div>

          <div class="chat-area">
            <div class="chat-history">
              <div class="agent-card">
                {#each agentContent.split('\n').slice(0, 30) as line}
                  {#if line.startsWith('## ')}
                    <div class="md-h2">{line.slice(3)}</div>
                  {:else if line.startsWith('### ')}
                    <div class="md-h3">{line.slice(4)}</div>
                  {:else if line.startsWith('- **')}
                    <div class="md-li">{line}</div>
                  {:else if line.trim()}
                    <div class="md-p">{line}</div>
                  {/if}
                {/each}
                {#if agentContent.split('\n').length > 30}
                  <div class="md-more">... (contenido truncado en vista previa)</div>
                {/if}
              </div>
            </div>

            <div class="chat-input">
              <input bind:value={chatInput} placeholder="Consultá a este agente..." disabled={chatting} on:keydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }} />
              <button class="btn" on:click={sendChat} disabled={chatting || !chatInput.trim()}>
                {chatting ? 'Consultando...' : 'Consultar'}
              </button>
            </div>

            {#if chatReply}
              <div class="chat-reply">
                <div class="reply-label">Respuesta:</div>
                <div class="reply-text">{chatReply}</div>
              </div>
            {/if}
          </div>

          <div class="usage">
            <Icon name="api" size={12} />
            <span>En AxisChat: <code>/agency {selectedAgent} tu mensaje</code></span>
          </div>
        {:else}
          <div class="welcome">
            <Icon name="agency" size={32} />
            <h3>Agency Agents</h3>
            <p>Seleccioná una división a la izquierda y luego un agente para ver su perfil y consultarle.</p>
            <p class="tip">También podés usar los comandos en AxisChat:</p>
            <code>/agency</code> — listar divisiones<br>
            <code>/agency ventas</code> — ver agentes de Sales<br>
            <code>/agency sales-outbound-strategist crear campaña outreach</code> — consultar al agente
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .panel { padding: 16px; height: 100%; overflow: hidden; display: flex; flex-direction: column; gap: 12px; }
  .header { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
  .count { font-size: 12px; color: var(--text-muted); font-weight: 400; }
  .layout { display: flex; gap: 12px; flex: 1; overflow: hidden; }
  .sidebar { width: 260px; flex-shrink: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .section-title { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
  .div-list, .agent-list { display: flex; flex-direction: column; gap: 2px; }
  .div-item, .agent-item { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 7px 10px; background: none; border: none; border-radius: 6px; color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); text-align: left; cursor: pointer; }
  .div-item:hover, .agent-item:hover { background: rgba(255,255,255,0.06); }
  .div-item.active, .agent-item.active { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); }
  .div-label { font-weight: 500; }
  .div-count { font-size: 12px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
  .agent-item { flex-direction: column; align-items: flex-start; gap: 2px; }
  .agent-name { font-weight: 500; font-size: 12px; }
  .agent-desc { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .main { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  .agent-header { display: flex; align-items: center; gap: 8px; }
  .agent-title { font-size: 16px; font-weight: 700; }
  .badge { padding: 2px 8px; background: rgba(16,185,129,0.1); color: #10b981; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .chat-area { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; display: flex; flex-direction: column; }
  .chat-history { max-height: 200px; overflow-y: auto; padding: 10px; border-bottom: 1px solid var(--border-color); }
  .agent-card { font-size: 13px; line-height: 1.6; color: var(--text-secondary); }
  .md-h2 { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-top: 8px; }
  .md-h3 { font-size: 13px; font-weight: 600; color: var(--accent); margin-top: 6px; }
  .md-li { padding-left: 8px; margin: 2px 0; }
  .md-p { margin: 2px 0; opacity: 0.9; }
  .md-more { font-size: 11px; color: var(--text-muted); font-style: italic; margin-top: 6px; }
  .chat-input { display: flex; gap: 6px; padding: 8px; }
  .chat-input input { flex: 1; padding: 8px 10px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); }
  .chat-input input:focus { outline: none; border-color: var(--accent); }
  .btn { padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; font-family: var(--font-sans); white-space: nowrap; }
  .btn:hover { opacity: 0.85; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .chat-reply { background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.2); border-radius: 6px; padding: 10px; margin-top: 8px; }
  .reply-label { font-size: 11px; font-weight: 600; color: #10b981; text-transform: uppercase; margin-bottom: 4px; }
  .reply-text { font-size: 13px; line-height: 1.5; color: var(--text-primary); white-space: pre-wrap; }
  .usage { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
  .usage code { background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 3px; font-size: 11px; }
  .welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 8px; color: var(--text-muted); padding: 40px; }
  .welcome h3 { margin: 0; font-size: 20px; color: var(--text-primary); }
  .welcome p { font-size: 14px; max-width: 400px; margin: 0; }
  .welcome .tip { font-size: 12px; margin-top: 8px; }
  .welcome code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 3px; font-size: 12px; color: var(--accent); display: inline-block; margin: 2px; }
  .status-msg { text-align: center; padding: 40px; color: var(--text-muted); }
</style>
