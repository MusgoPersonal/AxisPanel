<script>
  import { onMount } from 'svelte';

  let providers = [];
  let keysData = null;
  let showAddForm = false;
  let newKeyProvider = 'google';
  let newKey = '';
  let newEmail = '';
  let newModel = '';
  let status = '';

  const PROVIDER_LIST = ['google','openrouter','nvidia','deepseek','xai','opencode','mistral','groq','cerebras','openai','anthropic'];

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    try {
      const kRes = await fetch('/api/keys');
      keysData = await kRes.json();
      const pRes = await fetch('/api/providers');
      providers = await pRes.json();
    } catch (e) { console.error('Error:', e); }
  }

  $: providerInfo = providers[newKeyProvider] || {};
  $: availableModels = providerInfo.models || [];
  $: providerUrl = providerInfo.url || '';

  function selectProvider(p) {
    newKeyProvider = p;
    newModel = '';
  }

  async function addKey() {
    if (!newKey) return;
    status = 'Guardando...';
    try {
      const body = { provider: newKeyProvider, key: newKey, email: newEmail };
      if (newModel) body.model = newModel;
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      status = data.success ? '✓ Key agregada' : 'Error: ' + (data.error || '');
      if (data.success) { newKey = ''; newEmail = ''; newModel = ''; showAddForm = false; }
      await loadData();
    } catch (e) { status = 'Error: ' + e.message; }
  }

  async function deleteKey(provider, index) {
    try {
      await fetch(`/api/keys/${provider}/${index}`, { method: 'DELETE' });
      await loadData();
    } catch (e) { console.error(e); }
  }

  // ─── Agent config ───
  let agentsList = [];
  let showAddAgent = false;
  let newAgentName = '';
  let newAgentProvider = 'opencode';
  let newAgentModel = '';
  let newAgentKey = '';
  let newAgentColor = '#4ade80';
  let agentStatus = '';

  async function loadAgents() {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      agentsList = data.agents || [];
    } catch (e) { console.error('Error loading agents:', e); }
  }

  async function addAgent() {
    if (!newAgentName || !newAgentProvider) return;
    agentStatus = 'Guardando...';
    try {
      const body = { name: newAgentName, provider: newAgentProvider, color: newAgentColor };
      if (newAgentModel) body.model = newAgentModel;
      if (newAgentKey) body.keys = [newAgentKey];
      const res = await fetch('/api/agents/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      agentStatus = data.success ? '✓ Agente agregado' : 'Error: ' + (data.error || '');
      if (data.success) {
        newAgentName = ''; newAgentKey = ''; newAgentModel = ''; newAgentColor = '#4ade80'; showAddAgent = false;
      }
      await loadAgents();
    } catch (e) { agentStatus = 'Error: ' + e.message; }
  }

  async function deleteAgent(name) {
    try {
      await fetch(`/api/agents/${name}`, { method: 'DELETE' });
      await loadAgents();
    } catch (e) { console.error(e); }
  }

  $: activeProvider = keysData?.current_provider;
</script>

<div class="toolbar">
  <button class="btn-primary" on:click={loadData}>↻ Actualizar</button>
  <button class="btn-secondary" on:click={() => showAddForm = !showAddForm}>
    {showAddForm ? '✕ Cancelar' : '+ Agregar Key'}
  </button>
  {#if status}<span class="status">{status}</span>{/if}
</div>

{#if showAddForm}
  <div class="add-form">
    <div class="provider-grid">
      {#each PROVIDER_LIST as p}
        <button class="provider-pick" class:selected={newKeyProvider === p} on:click={() => selectProvider(p)}>
          {p}
        </button>
      {/each}
    </div>
    <input bind:value={newKey} placeholder="Pegá la API key acá" />
    <input bind:value={newEmail} placeholder="Email (opcional)" />
    {#if availableModels.length}
      <select bind:value={newModel} class="model-sel">
        <option value="">Modelo por defecto</option>
        {#each availableModels as m}
          <option value={m}>{m}</option>
        {/each}
      </select>
    {:else}
      <input bind:value={newModel} placeholder="Modelo (ej: gpt-4o)" />
    {/if}
    {#if providerUrl}
      <a href={providerUrl} target="_blank" class="provider-link" rel="noopener noreferrer">↗ Obtener key en {providerInfo.name || newKeyProvider}</a>
    {/if}
    <button class="btn-primary" on:click={addKey}>Guardar</button>
  </div>
{/if}

<div class="grid">
  {#if keysData?.providers}
    {#each Object.entries(keysData.providers) as [id, cfg]}
      {@const keys = (cfg.keys || []).filter(k => k)}
      <div class="card" class:active={activeProvider === id}>
        <h3>
          <span class="dot" class:on={activeProvider === id}></span>
          {id}
        </h3>
        <div class="count">{keys.length} key(s) {activeProvider === id ? '(activo)' : ''}</div>
        {#each keys as key, i}
          <div class="key-row">
            <code class="key-tag" class:active={activeProvider === id}>{key.slice(0, 12)}...</code>
            <button class="btn-del" on:click={() => deleteKey(id, i)} title="Eliminar">✕</button>
          </div>
        {/each}
      </div>
    {/each}
  {:else}
    <p class="loading">Cargando keys...</p>
  {/if}
</div>

<h3 class="section-title">◆ Agentes</h3>
<div class="toolbar">
  <button class="btn-secondary" on:click={() => { showAddAgent = !showAddAgent; if (showAddAgent) loadAgents(); }}>
    {showAddAgent ? '✕ Cancelar' : '+ Agregar Agente'}
  </button>
  {#if agentStatus}<span class="status">{agentStatus}</span>{/if}
</div>

{#if showAddAgent}
  <div class="add-form">
    <input bind:value={newAgentName} placeholder="Nombre del agente (ej: mimo)" />
    <select bind:value={newAgentProvider} class="model-sel">
      <option value="opencode">OpenCode</option>
      <option value="openrouter">OpenRouter</option>
      <option value="google">Google AI</option>
      <option value="groq">Groq</option>
      <option value="nvidia">NVIDIA</option>
      <option value="mistral">Mistral</option>
      <option value="openai">OpenAI</option>
      <option value="anthropic">Anthropic</option>
      <option value="deepseek">DeepSeek</option>
      <option value="xai">xAI</option>
      <option value="cerebras">Cerebras</option>
    </select>
    <input bind:value={newAgentModel} placeholder="Modelo (opcional, ej: gemini-2.5-flash)" />
    <input bind:value={newAgentKey} placeholder="API Key (opcional)" />
    <div class="color-row">
      <label>Color:</label>
      <input bind:value={newAgentColor} type="color" class="color-picker" />
      <span class="color-val">{newAgentColor}</span>
    </div>
    <button class="btn-primary" on:click={addAgent}>Guardar Agente</button>
  </div>
{/if}

<div class="grid">
  {#each agentsList as a}
    <div class="card">
      <h3>
        <span class="dot" style="background: {a.color}; box-shadow: 0 0 6px {a.color};"></span>
        {a.name}
      </h3>
      <div class="count">{a.provider} / {a.model} · {a.key_count} key(s)</div>
      <button class="btn-del" on:click={() => deleteAgent(a.name)} title="Eliminar">✕</button>
    </div>
  {:else}
    <p class="loading">No hay agentes configurados</p>
  {/each}
</div>

<style>
  .toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .btn-primary { padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; }
  .btn-primary:hover { opacity: 0.85; }
  .btn-secondary { padding: 8px 16px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; }
  .btn-secondary:hover { background: var(--bg-card-hover); }
  .btn-del { background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 11px; padding: 2px; opacity: 0.5; }
  .btn-del:hover { opacity: 1; }
  .status { font-size: 12px; color: var(--text-muted); }
  .loading { text-align: center; color: var(--text-muted); padding: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; }
  .card.active { border-color: var(--accent); }
  .card h3 { font-size: 14px; font-weight: 600; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); display: inline-block; }
  .dot.on { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
  .count { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }
  .key-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
  .key-tag { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-family: 'Geist Mono', monospace; background: var(--bg-base); color: var(--text-secondary); }
  .key-tag.active { background: var(--accent-glow); color: var(--accent); }
  .add-form { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .add-form input { width: 100%; padding: 8px 12px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; margin-bottom: 8px; box-sizing: border-box; }
  .add-form input:focus { outline: none; border-color: var(--accent); }
  .provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 6px; margin-bottom: 12px; }
  .provider-pick { padding: 8px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; text-align: center; cursor: pointer; font-size: 11px; color: var(--text-secondary); }
  .provider-pick:hover { border-color: var(--accent); }
  .provider-pick.selected { border-color: var(--accent); background: var(--accent-glow); color: var(--accent); }
  .section-title { font-size: 15px; font-weight: 600; margin: 24px 0 12px; padding-top: 16px; border-top: 1px solid var(--border-color); }
  .color-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .color-row label { font-size: 12px; color: var(--text-muted); }
  .color-picker { width: 36px; height: 30px; padding: 2px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-base); cursor: pointer; }
  .color-val { font-size: 11px; color: var(--text-muted); font-family: 'Geist Mono', monospace; }
</style>