<script>
  import { onMount } from 'svelte';

  let loading = true;
  let error = '';
  let building = false;
  let searching = false;
  let searchQuery = '';
  let searchResults = [];
  let searchMode = 'combinado';

  let codexStatus = {};
  let cbmStatus = {};
  let buildOutput = '';

  onMount(async () => { await refresh(); });

  async function refresh() {
    loading = true; error = '';
    try {
      const [codexRes, cbmRes] = await Promise.all([
        fetch('/api/codex/status').then(r => r.json()),
        fetch('/api/cbm/status').then(r => r.json()).catch(() => ({}))
      ]);
      codexStatus = codexRes;
      cbmStatus = cbmRes;
    } catch (e) { error = e.message; }
    loading = false;
  }

  async function buildIndex() {
    building = true; buildOutput = '';
    try {
      const res = await fetch('/api/codex/build', { method: 'POST' });
      const data = await res.json();
      buildOutput = data.success
        ? `Índice construido: ${data.totalFiles} archivos en ${data.duration}`
        : 'Error: ' + (data.error || 'desconocido');
      await refresh();
    } catch (e) { buildOutput = 'Error de red: ' + e.message; }
    building = false;
  }

  async function doSearch() {
    if (!searchQuery.trim()) return;
    searching = true; searchResults = [];
    try {
      const url = searchMode === 'rg'
        ? `/api/codex/search?q=${encodeURIComponent(searchQuery)}&mode=rg`
        : `/api/codex/search?q=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.results) {
        searchResults = data.results;
      } else if (data.error) {
        searchResults = [{ path: 'Error', text: data.error }];
      }
    } catch (e) { searchResults = [{ path: 'Error de red', text: e.message }]; }
    searching = false;
  }

  function extColor(ext) {
    const colors = { '.js': '#f7df1e', '.ts': '#3178c6', '.svelte': '#ff3e00', '.py': '#3572A5', '.json': '#292929', '.md': '#083fa1', '.css': '#663399', '.html': '#e34c26', '.yml': '#cb171e' };
    return colors[ext] || 'var(--text-muted)';
  }
</script>

<div class="codegraf">
  <div class="header">
    <div class="header-left">
      <span class="title">Codex</span>
      <span class="badge green">{codexStatus.totalFiles || 0} archivos</span>
      {#if codexStatus.builtAt}
        <span class="badge">✓ Indexado</span>
      {:else}
        <span class="badge yellow">Sin índice</span>
      {/if}
      <button class="btn small" on:click={buildIndex} disabled={building}>
        {building ? 'Indexando...' : 'Indexar'}
      </button>
    </div>
    <div class="header-right">
      {#if cbmStatus.installed}
        <span class="badge dim" title="Codegraf v0.9.0 bug en Windows">◆ CBM</span>
      {/if}
      <button class="btn-icon" on:click={refresh} title="Recargar">↻</button>
    </div>
  </div>

  {#if buildOutput}
    <div class="msg">{buildOutput}</div>
  {/if}

  {#if loading}
    <div class="status-msg">Cargando...</div>
  {:else}
    <div class="search-box">
      <div class="search-row">
        <input type="text" bind:value={searchQuery} placeholder="Buscar archivos y contenido..."
          on:keydown={(e) => { if (e.key === 'Enter') doSearch(); }} />
        <button class="btn" on:click={doSearch} disabled={searching}>
          {searching ? 'Buscando...' : 'Buscar'}
        </button>
      </div>
      <div class="mode-row">
        <label><input type="radio" bind:group={searchMode} value="combinado" /> Índice</label>
        <label><input type="radio" bind:group={searchMode} value="rg" /> Ripgrep</label>
      </div>
    </div>

    {#if searchResults.length > 0}
      <div class="results">
        <div class="results-header">{searchResults.length} resultado(s)</div>
        {#each searchResults as r}
          <div class="result-item">
            <div class="result-path">
              <span class="ext-dot" style="background:{extColor(r.ext)}"></span>
              <code class="filepath">{r.path}</code>
              {#if r.matchType === 'filename'}
                <span class="tag">nombre</span>
              {/if}
              {#if r.line}
                <span class="tag">L{r.line}</span>
              {/if}
            </div>
            {#if r.text}
              <pre class="result-preview">{r.text}</pre>
            {:else if r.preview}
              <pre class="result-preview">{r.preview}</pre>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if codexStatus.builtAt}
      <div class="info-line">Último index: {new Date(codexStatus.builtAt).toLocaleString()}</div>
    {:else}
      <div class="notice">
        <strong>Sin índice todavía</strong>
        <p>Hacé clic en <strong>Indexar</strong> para escanear todos los archivos del proyecto. Después podés buscar por nombre o contenido.</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .codegraf { padding: 16px; height: 100%; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
  .header { display: flex; align-items: center; justify-content: space-between; }
  .header-left { display: flex; align-items: center; gap: 8px; }
  .header-right { display: flex; align-items: center; gap: 6px; }
  .title { font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: rgba(255,255,255,0.06); color: var(--text-muted); }
  .badge.green { background: rgba(16,185,129,0.1); color: #10b981; }
  .badge.yellow { background: rgba(245,158,11,0.1); color: #f59e0b; }
  .badge.dim { opacity: 0.4; }
  .btn { padding: 6px 14px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; font-family: var(--font-sans); }
  .btn:hover { opacity: 0.85; }
  .btn:disabled { opacity: 0.4; cursor: default; }
  .btn.small { padding: 4px 10px; font-size: 11px; }
  .btn-icon { background: none; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-muted); cursor: pointer; padding: 2px 8px; font-size: 14px; }
  .btn-icon:hover { background: var(--accent-glow); color: var(--accent); }
  .status-msg { text-align: center; padding: 40px; color: var(--text-muted); }
  .msg { padding: 8px 12px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-size: 13px; color: #10b981; }

  .search-box { display: flex; flex-direction: column; gap: 6px; }
  .search-row { display: flex; gap: 6px; }
  .search-row input { flex: 1; padding: 8px 12px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); }
  .search-row input:focus { outline: none; border-color: var(--accent); }
  .mode-row { display: flex; gap: 12px; font-size: 12px; color: var(--text-muted); }
  .mode-row label { display: flex; align-items: center; gap: 4px; cursor: pointer; }

  .results { display: flex; flex-direction: column; gap: 6px; flex: 1; overflow-y: auto; }
  .results-header { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .result-item { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; }
  .result-path { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .ext-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
  .filepath { font-size: 12px; font-weight: 600; color: var(--accent); word-break: break-all; }
  .tag { font-size: 10px; padding: 1px 5px; border-radius: 3px; background: rgba(255,255,255,0.06); color: var(--text-muted); }
  .result-preview { font-size: 11px; color: var(--text-secondary); white-space: pre-wrap; word-break: break-all; margin: 0; max-height: 60px; overflow: hidden; background: rgba(0,0,0,0.2); padding: 4px 6px; border-radius: 3px; }
  .info-line { font-size: 11px; color: var(--text-muted); text-align: right; }
  .notice { padding: 16px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; font-size: 13px; }
</style>
