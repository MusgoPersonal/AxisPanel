<script>
  import { onMount, tick } from 'svelte';
  import Icon from '../../../lib/Icon.svelte';

  let loading = true;
  let status = {};
  let error = '';
  let activeTab = 'search';
  let searchQuery = '';
  let searchResults = [];
  let searching = false;
  let noteContent = '';
  let notePath = '';
  let loadingNote = false;
  let cmdInput = '';
  let cmdOutput = '';
  let cmdRunning = false;
  let dailyContent = '';
  let dailyInput = '';
  let dailyLoading = false;
  let taskResults = [];
  let taskFilter = 'todo';

  // Graph state
  let graphCanvas = null;
  let graphNodes = [];
  let graphEdges = [];
  let graphLoading = false;
  let graphAnimId = null;
  let graphHovered = null;

  onMount(async () => { await refresh(); });

  async function refresh() {
    loading = true; error = '';
    try {
      const res = await fetch('/api/obsidian/status');
      status = await res.json();
      if (!status.installed) error = 'Obsidian CLI no disponible';
    } catch (e) { error = e.message; }
    loading = false;
  }

  async function doSearch() {
    if (!searchQuery.trim()) return;
    searching = true;
    try {
      const res = await fetch('/api/obsidian/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 30 })
      });
      const data = await res.json();
      searchResults = data.results || [];
    } catch { searchResults = []; }
    searching = false;
  }

  async function readNote(file) {
    loadingNote = true; notePath = file;
    try {
      const res = await fetch('/api/obsidian/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file })
      });
      const data = await res.json();
      noteContent = data.content || '(vacío)';
      if (data.error) noteContent = 'Error: ' + data.error;
    } catch (e) { noteContent = 'Error: ' + e.message; }
    loadingNote = false;
  }

  async function loadDaily() {
    dailyLoading = true;
    try {
      const res = await fetch('/api/obsidian/daily', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read' })
      });
      const data = await res.json();
      dailyContent = data.content || '(sin daily note)';
    } catch (e) { dailyContent = 'Error: ' + e.message; }
    dailyLoading = false;
  }

  async function appendDaily() {
    if (!dailyInput.trim()) return;
    try {
      await fetch('/api/obsidian/daily', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'append', content: dailyInput })
      });
      dailyInput = '';
      await loadDaily();
    } catch {}
  }

  async function loadTasks() {
    try {
      const body = { todo: taskFilter === 'todo', done: taskFilter === 'done' };
      const res = await fetch('/api/obsidian/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      taskResults = data.results || [];
    } catch { taskResults = []; }
  }

  async function runCommand() {
    if (!cmdInput.trim()) return;
    cmdRunning = true; cmdOutput = '';
    try {
      const res = await fetch('/api/obsidian/command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: cmdInput })
      });
      const data = await res.json();
      cmdOutput = data.stdout || data.stderr || '(sin salida)';
    } catch (e) { cmdOutput = 'Error: ' + e.message; }
    cmdRunning = false;
  }

  // ─── Graph ───
  async function loadGraph() {
    graphLoading = true;
    try {
      const res = await fetch('/api/obsidian/graph');
      const data = await res.json();
      const nodes = data.nodes || [];
      graphEdges = data.edges || [];
      const W = 750; const H = 500;
      graphNodes = nodes.map((n, i) => ({
        ...n,
        x: 50 + (i % 5) * 150 + Math.random() * 40,
        y: 50 + Math.floor(i / 5) * 120 + Math.random() * 40,
        vx: 0, vy: 0, radius: Math.max(12, 24 - nodes.length)
      }));
      await tick();
      startGraph();
    } catch { graphNodes = []; graphEdges = []; }
    graphLoading = false;
  }

  function startGraph() {
    stopGraph();
    if (!graphCanvas) return;
    const ctx = graphCanvas.getContext('2d');
    const W = graphCanvas.width;
    const H = graphCanvas.height;

    function tick() {
      if (!graphCanvas) return;
      simulate(graphNodes, graphEdges, W, H);
      render(ctx, graphNodes, graphEdges, W, H, graphHovered);
      graphAnimId = requestAnimationFrame(tick);
    }
    tick();
  }

  function stopGraph() {
    if (graphAnimId) { cancelAnimationFrame(graphAnimId); graphAnimId = null; }
  }

  function simulate(nodes, edges, W, H) {
    const REP = 5000;
    const ATTR = 0.005;
    const DAMP = 0.9;
    const CENTER = 0.01;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let force = REP / (dist * dist);
        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }

    for (const e of edges) {
      const s = nodes.find(n => n.id === e.source);
      const t = nodes.find(n => n.id === e.target);
      if (!s || !t) continue;
      let dx = t.x - s.x;
      let dy = t.y - s.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let force = (dist - 100) * ATTR;
      let fx = (dx / dist) * force;
      let fy = (dy / dist) * force;
      s.vx += fx; s.vy += fy;
      t.vx -= fx; t.vy -= fy;
    }

    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * CENTER;
      n.vy += (H / 2 - n.y) * CENTER;
      n.vx *= DAMP; n.vy *= DAMP;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(10, Math.min(W - 10, n.x));
      n.y = Math.max(10, Math.min(H - 10, n.y));
    }
  }

  function render(ctx, nodes, edges, W, H, hovered) {
    ctx.clearRect(0, 0, W, H);

    for (const e of edges) {
      const s = nodes.find(n => n.id === e.source);
      const t = nodes.find(n => n.id === e.target);
      if (!s || !t) continue;
      ctx.strokeStyle = (hovered === e.source || hovered === e.target) ? 'rgba(100,200,255,0.6)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = (hovered === e.source || hovered === e.target) ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }

    for (const n of nodes) {
      const isHovered = n.id === hovered;
      const opacity = hovered && !isHovered && !edges.some(e => (e.source === hovered && e.target === n.id) || (e.target === hovered && e.source === n.id)) ? 0.15 : 1;
      ctx.globalAlpha = opacity;
      const radius = isHovered ? n.radius + 4 : n.radius;
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, radius);
      grad.addColorStop(0, isHovered ? '#60a5fa' : '#3b82f6');
      grad.addColorStop(1, isHovered ? '#2563eb' : '#1d4ed8');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isHovered || !hovered) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(n.name, n.x, n.y + radius + 14);
      }
    }
  }

  function onGraphMouse(e) {
    if (!graphCanvas || graphNodes.length === 0) return;
    const rect = graphCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scaleX = graphCanvas.width / rect.width;
    const scaleY = graphCanvas.height / rect.height;
    const found = graphNodes.find(n => Math.hypot((n.x - mx * scaleX), (n.y - my * scaleY)) < n.radius + 4);
    graphHovered = found ? found.id : null;
  }
</script>

<div class="panel">
  <div class="header">
    <Icon name="obsidian" size={20} />
    <span>Obsidian</span>
    {#if status.installed}
      <span class="badge green">● {status.activeVault || '—'}</span>
      <span class="badge dim">{status.fileCount || 0} archivos</span>
    {:else}
      <span class="badge yellow">✕ No disponible</span>
    {/if}
    <button class="refresh-btn" on:click={refresh}>↻</button>
  </div>

  {#if loading}
    <div class="status-msg">Cargando...</div>
  {:else if error}
    <div class="notice">{error}</div>
  {:else}
    <div class="tabs">
      <button class="tab" class:active={activeTab === 'search'} on:click={() => activeTab = 'search'}>Buscar</button>
      <button class="tab" class:active={activeTab === 'daily'} on:click={() => { activeTab = 'daily'; loadDaily(); }}>Daily</button>
      <button class="tab" class:active={activeTab === 'tasks'} on:click={() => { activeTab = 'tasks'; loadTasks(); }}>Tareas</button>
      <button class="tab" class:active={activeTab === 'note'} on:click={() => activeTab = 'note'}>Nota</button>
      <button class="tab" class:active={activeTab === 'cmd'} on:click={() => activeTab = 'cmd'}>CLI</button>
      <button class="tab" class:active={activeTab === 'graph'} on:click={() => { activeTab = 'graph'; loadGraph(); }}>Grafo</button>
    </div>

    {#if activeTab === 'search'}
      <div class="tab-content">
        <div class="search-row">
          <input type="text" bind:value={searchQuery} placeholder="Buscar en el vault..."
            on:keydown={(e) => { if (e.key === 'Enter') doSearch(); }} />
          <button class="btn" on:click={doSearch} disabled={searching}>
            {searching ? '...' : 'Buscar'}
          </button>
        </div>
        {#if searchResults.length > 0}
          <div class="results">
            {#each searchResults as r}
              <button class="result-item" on:click={() => readNote(r.filename || r.path)}>
                <span class="result-name">{r.filename || r.path}</span>
              </button>
            {/each}
          </div>
        {:else if !searching}
          <div class="empty">Sin resultados</div>
        {/if}
      </div>
    {/if}

    {#if activeTab === 'daily'}
      <div class="tab-content">
        {#if dailyLoading}
          <div class="status-msg">Cargando daily...</div>
        {:else}
          <pre class="daily-content">{dailyContent}</pre>
          <div class="input-row">
            <input type="text" bind:value={dailyInput} placeholder="Agregar a la daily..."
              on:keydown={(e) => { if (e.key === 'Enter') appendDaily(); }} />
            <button class="btn" on:click={appendDaily}>+</button>
      </div>
    {/if}

    {#if activeTab === 'graph'}
      <div class="tab-content graph-tab">
        {#if graphLoading}
          <div class="status-msg">Cargando grafo...</div>
        {:else if graphNodes.length === 0}
          <div class="empty">No hay notas en el vault</div>
        {:else}
          <div class="graph-controls">
            <span class="graph-stat">{graphNodes.length} nodos · {graphEdges.length} conexiones</span>
            <button class="btn small" on:click={loadGraph}>↻ Recalcular</button>
          </div>
          <div class="graph-container">
            <canvas bind:this={graphCanvas} width="750" height="500"
              on:mousemove={onGraphMouse} on:mouseleave={() => graphHovered = null}></canvas>
          </div>
        {/if}
      </div>
    {/if}
      </div>
    {/if}

    {#if activeTab === 'tasks'}
      <div class="tab-content">
        <div class="filter-row">
          <button class="btn small" class:active={taskFilter === 'todo'} on:click={() => { taskFilter = 'todo'; loadTasks(); }}>Pendientes</button>
          <button class="btn small" class:active={taskFilter === 'done'} on:click={() => { taskFilter = 'done'; loadTasks(); }}>Completadas</button>
        </div>
        {#if taskResults.length > 0}
          <div class="results">
            {#each taskResults as t}
              <div class="task-item">
                <span class="task-check">{t.status === 'x' ? '✓' : '○'}</span>
                <span class="task-text">{t.text || t.content || ''}</span>
                <span class="task-file">{t.filename || t.path || ''}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty">Sin tareas</div>
        {/if}
      </div>
    {/if}

    {#if activeTab === 'note'}
      <div class="tab-content">
        {#if notePath}
          <div class="note-path">{notePath}</div>
        {/if}
        {#if loadingNote}
          <div class="status-msg">Cargando nota...</div>
        {:else if noteContent}
          <pre class="note-content">{noteContent}</pre>
        {:else}
          <div class="empty">Buscá una nota en la pestaña Buscar y clickeala para leerla</div>
        {/if}
      </div>
    {/if}

    {#if activeTab === 'cmd'}
      <div class="tab-content">
        <div class="search-row">
          <input type="text" bind:value={cmdInput} placeholder="Ej: search query=ideas --limit=5"
            on:keydown={(e) => { if (e.key === 'Enter') runCommand(); }} />
          <button class="btn" on:click={runCommand} disabled={cmdRunning}>
            {cmdRunning ? '...' : 'Ejecutar'}
          </button>
        </div>
        {#if cmdOutput}
          <pre class="cmd-output">{cmdOutput}</pre>
        {/if}
        <div class="cmd-hints">
          <span class="hint" on:click={() => { cmdInput = 'help'; runCommand(); }}>help</span>
          <span class="hint" on:click={() => { cmdInput = 'files total'; runCommand(); }}>files</span>
          <span class="hint" on:click={() => { cmdInput = 'tags counts'; runCommand(); }}>tags</span>
          <span class="hint" on:click={() => { cmdInput = 'plugins'; runCommand(); }}>plugins</span>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .panel { padding: 16px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  .header { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
  .badge.green { background: rgba(16,185,129,0.1); color: #10b981; }
  .badge.yellow { background: rgba(245,158,11,0.1); color: #f59e0b; }
  .badge.dim { background: rgba(255,255,255,0.06); color: var(--text-muted); }
  .refresh-btn { margin-left: auto; background: none; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-muted); cursor: pointer; padding: 2px 8px; font-size: 14px; }
  .refresh-btn:hover { background: var(--accent-glow); color: var(--accent); }
  .notice { padding: 16px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; font-size: 13px; }
  .status-msg { text-align: center; padding: 20px; color: var(--text-muted); }
  .empty { text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px; }

  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
  .tab { padding: 6px 12px; background: none; border: none; border-radius: 6px; color: var(--text-muted); cursor: pointer; font-size: 12px; font-weight: 600; font-family: var(--font-sans); }
  .tab:hover { color: var(--text-primary); background: rgba(255,255,255,0.04); }
  .tab.active { color: var(--accent); background: rgba(255,255,255,0.06); }
  .tab-content { flex: 1; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }

  .search-row { display: flex; gap: 6px; }
  .search-row input { flex: 1; padding: 8px 12px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); }
  .search-row input:focus { outline: none; border-color: var(--accent); }
  .btn { padding: 6px 14px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; font-family: var(--font-sans); }
  .btn:hover { opacity: 0.85; }
  .btn:disabled { opacity: 0.4; cursor: default; }
  .btn.small { padding: 4px 10px; font-size: 11px; }
  .btn.small.active { background: var(--accent); color: #000; }
  .filter-row { display: flex; gap: 6px; }

  .results { display: flex; flex-direction: column; gap: 4px; }
  .result-item { display: block; width: 100%; padding: 6px 10px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px; text-align: left; font-family: var(--font-sans); }
  .result-item:hover { border-color: var(--accent); }
  .result-name { color: var(--accent); font-weight: 600; }

  .note-path { font-size: 11px; color: var(--text-muted); padding: 4px 0; }
  .note-content { font-size: 12px; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; background: var(--bg-base); padding: 8px; border-radius: 6px; max-height: 400px; overflow-y: auto; margin: 0; }

  .daily-content { font-size: 12px; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; background: var(--bg-base); padding: 8px; border-radius: 6px; max-height: 300px; overflow-y: auto; margin: 0; }
  .input-row { display: flex; gap: 6px; }
  .input-row input { flex: 1; padding: 8px 12px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); }
  .input-row input:focus { outline: none; border-color: var(--accent); }

  .task-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; }
  .task-check { flex-shrink: 0; font-size: 14px; }
  .task-text { flex: 1; color: var(--text-primary); }
  .task-file { font-size: 11px; color: var(--text-muted); }

  .cmd-output { font-size: 12px; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; background: #0a0a0a; padding: 8px; border-radius: 6px; max-height: 300px; overflow-y: auto; margin: 0; font-family: monospace; }
  .cmd-hints { display: flex; flex-wrap: wrap; gap: 4px; }
  .hint { padding: 2px 8px; background: rgba(255,255,255,0.06); border-radius: 4px; font-size: 11px; color: var(--text-muted); cursor: pointer; }
  .hint:hover { color: var(--accent); background: rgba(255,255,255,0.1); }

  .graph-tab { flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .graph-controls { display: flex; align-items: center; gap: 8px; }
  .graph-stat { font-size: 11px; color: var(--text-muted); }
  .graph-container { flex: 1; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; min-height: 300px; }
  .graph-container canvas { width: 100%; height: 100%; display: block; }
</style>
