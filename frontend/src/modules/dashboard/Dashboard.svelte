<script>
  import { onMount } from 'svelte';

  export let rotationLogs = '';
  export let gatewayLogs = '';

  let agents = [];
  let selectedAgent = '';
  let agentLogs = '';
  let logSource = 'rotation';
  let autoRefresh = null;

  onMount(() => {
    fetchAgents();
    autoRefresh = setInterval(() => {
      if (logSource === 'agent' && selectedAgent) fetchAgentLogs();
    }, 5000);
    return () => { if (autoRefresh) clearInterval(autoRefresh); };
  });

  async function fetchAgents() {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      agents = data.agents || [];
    } catch (e) { console.error('Error fetching agents:', e); }
  }

  async function fetchAgentLogs() {
    if (!selectedAgent) { agentLogs = ''; return; }
    try {
      const res = await fetch(`/api/logs/agent/${selectedAgent}?lines=80`);
      agentLogs = await res.text();
    } catch (e) { agentLogs = 'Error: ' + e.message; }
  }

  function changeSource(source) {
    logSource = source;
    if (source === 'agent' && selectedAgent) fetchAgentLogs();
  }

  function changeAgent() {
    if (selectedAgent) fetchAgentLogs();
    else agentLogs = '';
  }
</script>

<div class="dashboard">
  <div class="dashboard-header">
    <h2>⊞ Dashboard</h2>
    <div class="source-filter">
      <button class="pill-btn" class:active={logSource === 'rotation'} on:click={() => changeSource('rotation')}>API Rotation</button>
      <button class="pill-btn" class:active={logSource === 'gateway'} on:click={() => changeSource('gateway')}>Gateway</button>
      <button class="pill-btn" class:active={logSource === 'agent'} on:click={() => changeSource('agent')}>Agentes</button>
      {#if logSource === 'agent'}
        <select bind:value={selectedAgent} on:change={changeAgent} class="agent-sel">
          <option value="">Seleccionar agente...</option>
          {#each agents as a}
            <option value={a.name}>{a.name} ({a.provider})</option>
          {/each}
        </select>
      {/if}
    </div>
  </div>

  <div class="log-viewer">
    {#if logSource === 'rotation'}
      <pre>{rotationLogs || 'Cargando...'}</pre>
    {:else if logSource === 'gateway'}
      <pre>{gatewayLogs || 'Cargando...'}</pre>
    {:else if logSource === 'agent'}
      {#if selectedAgent}
        <div class="agent-log-header">
          <span class="agent-dot" style="background: {(agents.find(a => a.name === selectedAgent)?.color) || '#94a3b8'}"></span>
          <strong>{selectedAgent}</strong>
          <span class="agent-meta">{agents.find(a => a.name === selectedAgent)?.provider} / {agents.find(a => a.name === selectedAgent)?.model}</span>
          <button class="refresh-btn" on:click={fetchAgentLogs}>↻</button>
        </div>
        <pre>{agentLogs || 'Cargando...'}</pre>
      {:else}
        <div class="placeholder">Seleccioná un agente para ver sus logs</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .dashboard { display: flex; flex-direction: column; height: 100%; }
  .dashboard-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; flex-shrink: 0; }
  .dashboard-header h2 { font-size: 16px; font-weight: 600; margin: 0; }
  .source-filter { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .pill-btn { padding: 4px 12px; border-radius: 16px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 11px; }
  .pill-btn.active { background: var(--accent-glow); border-color: var(--accent); color: var(--accent); }
  .pill-btn:hover { border-color: var(--accent); }
  .agent-sel { padding: 4px 8px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 11px; }
  .log-viewer { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
  .log-viewer pre { flex: 1; background: #050608; border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; font-size: 11px; font-family: 'Geist Mono', monospace; color: var(--text-secondary); overflow: auto; white-space: pre-wrap; word-break: break-all; margin: 0; }
  .agent-log-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
  .agent-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .agent-meta { color: var(--text-muted); font-size: 11px; }
  .refresh-btn { background: none; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-muted); cursor: pointer; font-size: 12px; padding: 2px 6px; margin-left: auto; }
  .refresh-btn:hover { border-color: var(--accent); color: var(--accent); }
  .placeholder { text-align: center; color: var(--text-muted); padding: 40px; font-size: 13px; }
</style>