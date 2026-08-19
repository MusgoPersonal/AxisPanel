<script>
  import { onMount } from 'svelte';
  import { fetchPipeline, pipelineCount } from './stores/crmStore';
  import { ToolsStore } from 'core/state/tools-store.js';
  import { TOOL_CATEGORIES, TOOLS_CONFIG } from 'core/config/tools-config.js';
  import Dock from './lib/Dock.svelte';
  import Window from './lib/Window.svelte';
  import Dashboard from './modules/dashboard/Dashboard.svelte';
  import ChatView from './modules/axischat/Chat.svelte';
  import Scraper from './modules/scraping/Scraper.svelte';
  import Crm from './modules/crm/Crm.svelte';
  import Settings from './modules/settings/Settings.svelte';
  import AddKey from './modules/settings/AddKey.svelte';
  import LogsView from './modules/settings/LogsView.svelte';
  import AutoConfig from './modules/settings/AutoConfig.svelte';
  import Codegraf from './modules/codegraf/Codegraf.svelte';
  import Shells from './modules/apps/shells/Shells.svelte';
  import Storage from './modules/apps/storage/Storage.svelte';
  import OpenPencil from './modules/apps/openpencil/OpenPencil.svelte';
  import OpenPencilChat from './modules/apps/openpencil/OpenPencilChat.svelte';
  import Content from './modules/apps/content/Content.svelte';
  import Outreach from './modules/apps/outreach/Outreach.svelte';
  import BuilderBot from './modules/apps/builderbot/BuilderBot.svelte';
  import Agency from './modules/apps/agency/Agency.svelte';
  import N8n from './modules/apps/n8n/N8n.svelte';
  import CalCom from './modules/apps/calcom/CalCom.svelte';
  import Obscura from './modules/apps/obscura/Obscura.svelte';
  import Obsidian from './modules/apps/obsidian/Obsidian.svelte';
  import Followup from './modules/apps/followup/Followup.svelte';
  import ParticlesCore from './lib/background/ParticlesCore.svelte';

  import CommandPalette from './lib/CommandPalette.svelte';
  import Icon from './lib/Icon.svelte';

  let storeState = ToolsStore.state;
  let hoverMenu = null;
  let systemStatus = { current_provider: 'none', current_key_index: 0 };
  let leadsCount = 0;
  let rotationLogs = '';
  let gatewayLogs = '';

  let scraperQuery = '';
  let scraperCategory = 'clinicas_dentales';
  let availableCategories = [];
  let scrapingStatus = '';

  let openPencilStatus = { mcpRunning: undefined, viteRunning: undefined };
  let hermesOnline = undefined;
  let openclawOnline = undefined;
  let b2Accounts = [];
  let dockerStatus = { docker_available: false, services: [] };
  let workflowRunning = false;
  let dailyRunning = false;
  let rotationTrigger = 0;
  let apiCounter = { total: 0, byRoute: [] };
  let updateInfo = null;
  let updating = false;

  let unsubPipeline;

  onMount(async () => {
    ToolsStore.subscribe(s => { storeState = s; });
    unsubPipeline = pipelineCount.subscribe(val => { leadsCount = val; });
    ToolsStore.closeAllWindows();
    await refreshAllData();
    const interval = setInterval(refreshAllData, 10000);
    return () => { clearInterval(interval); unsubPipeline?.(); };
  });

  async function refreshAllData() {
    try {
      const statusRes = await fetch('/api/status');
      systemStatus = await statusRes.json();
      await fetchPipeline();
      const catRes = await fetch('/api/scrape/categories');
      availableCategories = await catRes.json();
      const leadsRes = await fetch('/api/crm/leads?limit=100');
      await leadsRes.json();
      const opRes = await fetch('/api/mcp/openpencil/status');
      openPencilStatus = await opRes.json();
      const hStatusRes = await fetch('/api/hermes/status');
      const hData = await hStatusRes.json();
      hermesOnline = hData.status === 'online' || hData.status === 'ok';
      const ocStatusRes = await fetch('/api/openclaw/status');
      const ocData = await ocStatusRes.json();
      openclawOnline = ocData.running;
      const b2Res = await fetch('/api/b2/accounts');
      b2Accounts = (await b2Res.json()).accounts || [];
      rotationLogs = await (await fetch('/api/logs/rotation?lines=50')).text();
      gatewayLogs = await (await fetch('/api/logs/gateway?lines=50')).text();
      const dRes = await fetch('/api/docker/status');
      dockerStatus = await dRes.json();
      const cRes = await fetch('/api/counter');
      apiCounter = await cRes.json();

      // Update check
      try {
        const uRes = await fetch('/api/update/check');
        const uData = await uRes.json();
        if (uData.updateAvailable) updateInfo = uData;
        else updateInfo = null;
      } catch (e) { /* silent */ }
    } catch (e) { console.error('Error:', e); }
  }

  async function triggerRotation() {
    scrapingStatus = 'Rotando...';
    const res = await fetch('/api/rotate', { method: 'POST' });
    const data = await res.json();
    scrapingStatus = data.success ? 'Rotado ✓' : 'Error: ' + data.error;
    if (data.success) rotationTrigger++;
    await refreshAllData();
  }

  async function runScraper() {
    if (!scraperQuery || !scraperCategory) return;
    scrapingStatus = 'Scraping...';
    const res = await fetch('/api/scrape/category', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query: scraperQuery, category: scraperCategory }) });
    const data = await res.json();
    scrapingStatus = data.success ? `✓ ${data.saved || 0} leads` : 'Error: ' + data.error;
    await refreshAllData();
  }

  async function toggleOpenPencilMCP(action) {
    await fetch(`/api/mcp/openpencil/${action === 'start' ? 'start' : 'stop'}`, { method:'POST' });
    await refreshAllData();
  }

  async function toggleOpenPencilVite(action) {
    await fetch(`/api/mcp/openpencil/${action === 'start' ? 'start-vite' : 'stop-vite'}`, { method:'POST' });
    await refreshAllData();
  }

  async function toggleHermesService(action) {
    await fetch(`/api/hermes/${action}`, { method:'POST' });
    await refreshAllData();
  }

  async function toggleOpenClawService(action) {
    await fetch(`/api/openclaw/${action}`, { method:'POST' });
    await refreshAllData();
  }

  async function toggleDockerService(name, action) {
    await fetch(`/api/docker/${action}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ services: [name] }) });
    await refreshAllData();
  }

  async function runWorkflow() {
    workflowRunning = true;
    try {
      await fetch('/api/workflow/start', { method:'POST' });
    } catch (e) { console.error('Workflow error:', e); }
    await refreshAllData();
    workflowRunning = false;
  }

  async function runDaily() {
    dailyRunning = true;
    try {
      const r = await fetch('/api/workflow/daily', { method:'POST', headers:{'Content-Type':'application/json'} });
      const d = await r.json();
      alert(d.success ? `Daily generada: ${d.stats.totalLeads} leads, ${d.stats.activeRules} reglas` : 'Error: ' + (d.error || 'desconocido'));
    } catch (e) { alert('Error: ' + e.message); }
    dailyRunning = false;
  }

  async function applyUpdate() {
    if (!confirm('¿Actualizar AxisPanel desde GitHub? Se hará git pull + npm install. Luego reiniciá el servidor.')) return;
    updating = true;
    try {
      const r = await fetch('/api/update/pull', { method:'POST' });
      const d = await r.json();
      if (d.success) {
        alert(`✅ Actualizado a ${d.newCommit}\nReiniciá AxisPanel para aplicar los cambios.`);
        updateInfo = null;
      } else {
        alert(`❌ Error: ${d.error}`);
      }
    } catch (e) { alert('Error: ' + e.message); }
    updating = false;
  }

  function onWindowClose(toolId) {
    ToolsStore.closeTool(toolId);
  }

  function onWindowFocus(toolId) {
    ToolsStore.focusTool(toolId);
  }

  function onMenuEnter(menu) { hoverMenu = menu; }
  function onMenuLeave(menu) { if (hoverMenu === menu) hoverMenu = null; }

  function menuAction(fn) { fn(); hoverMenu = null; }

  $: menuToolsByCategory = buildMenuTools();
  function buildMenuTools() {
    const byCat = {};
    for (const [id, config] of Object.entries(TOOLS_CONFIG)) {
      const cat = config.category || 'main';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push({ id, title: config.title, icon: config.icon });
    }
    return Object.entries(TOOL_CATEGORIES)
      .filter(([k]) => byCat[k])
      .map(([k, v]) => ({ key: k, label: v.label, tools: byCat[k] }));
  }

  $: layoutCache = computeLayouts(openTools);
  function computeLayouts(tools) {
    const total = tools.length;
    if (total === 0) return {};
    const topBarH = 40, padding = 20, gap = 12, dockH = 100;
    const cols = total <= 1 ? 1 : Math.min(total, Math.ceil(Math.sqrt(total)));
    const rows = Math.ceil(total / cols);
    const cellW = Math.floor((window.innerWidth - padding * 2 - gap * (cols - 1)) / cols);
    const cellH = Math.floor((window.innerHeight - topBarH - dockH - padding * 2 - gap * (rows - 1)) / rows);
    const result = {};
    tools.forEach((id, idx) => {
      if (!storeState.positions[id]) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        result[id] = {
          position: { x: padding + col * (cellW + gap), y: topBarH + padding + row * (cellH + gap) },
          size: { width: cellW, height: cellH }
        };
      }
    });
    return result;
  }

  const toolTitles = {
    dashboard: 'Dashboard', chat: 'AxisChat', scraping: 'Scraping',
    crm: 'CRM',
    addkey: 'API Keys', shells: 'Cloud Shells',
    storage: 'Cloud Storage', logs: 'Logs', settings: 'Ajustes',
    openpencil: 'OpenPencil', openpencilChat: 'OpenPencil Chat',
    content: 'Content Factory', outreach: 'Outreach',
    builderbot: 'BuilderBot', agency: 'Agency Agents', n8n: 'n8n', calcom: 'Cal.com', obscura: 'Obscura', obsidian: 'Obsidian', followup: 'Follow-up'
  };
  function getTitle(id) { return toolTitles[id] || id; }
  $: openTools = Object.entries(storeState.open).filter(([, v]) => v).map(([k]) => k);
  let everOpenedEmbedded = [];
  $: if (openTools.length) {
    const emb = openTools.filter(id => TOOLS_CONFIG[id]?.embedded);
    const fresh = emb.filter(id => !everOpenedEmbedded.includes(id));
    if (fresh.length) everOpenedEmbedded = [...everOpenedEmbedded, ...fresh];
  }
  $: renderTools = [...new Set([...openTools, ...everOpenedEmbedded])];

</script>

<ParticlesCore
  {hermesOnline}
  {openclawOnline}
  openPencilRunning={openPencilStatus?.mcpRunning}
  apiKeyActive={systemStatus?.current_key_index ?? 0}
  dockerActive={dockerStatus?.services?.filter(s => s?.status === 'running')?.length ?? 0}
  {rotationTrigger}
/>
<div class="app-shell">
  <header class="menu-bar" on:mouseleave={() => { hoverMenu = null; }}>
    <div class="menu-items">
      <span class="brand">◇ AXIS</span>

    </div>
    <div class="menu-services">
      <span class="svc {hermesOnline === true ? 'on' : hermesOnline === false ? 'off' : ''}">
        <span class="svc-dot"></span> Hermes
      </span>
      <span class="svc {openclawOnline === true ? 'on' : openclawOnline === false ? 'off' : ''}">
        <span class="svc-dot"></span> OpenClaw
      </span>
      <span class="svc {openPencilStatus?.mcpRunning ? 'on' : openPencilStatus?.mcpRunning === false ? 'off' : ''}">
        <span class="svc-dot"></span> OpenPencil
      </span>
      <span class="svc {(systemStatus?.current_key_index ?? 0) > 0 ? 'on gold' : 'gold'}">
        <span class="svc-dot"></span> API Keys
      </span>
      <span class="svc {(dockerStatus?.services?.filter(s => s?.status === 'running')?.length ?? 0) > 0 ? 'on' : ''}">
        <span class="svc-dot"></span> Docker
      </span>
    </div>
    <div class="menu-right">
      <span class="status-item" title="API calls this session">
        <Icon name="api" size={13} /> {apiCounter.total}
      </span>
      <span class="status-item" title="Leads total">
        <Icon name="leads" size={13} /> {leadsCount}
      </span>
      <span class="status-item" title="Rotaciones">
        <Icon name="autoconfig" size={13} /> {systemStatus.rotation_count || 0}
      </span>
      <span class="status-item">{systemStatus.current_provider || '—'}</span>
      <button class="rotate-btn" on:click={triggerRotation} title="Rotar API Key">⟳</button>
      <button class="daily-btn" on:click={runDaily} disabled={dailyRunning} title="Daily Workflow">
        {dailyRunning ? '...' : '📋 Daily'}
      </button>
    </div>
  </header>

  {#if updateInfo}
    <div class="update-banner">
      <span>⬆️ Actualización disponible: <strong>{updateInfo.remoteCommit}</strong> — {updateInfo.remoteMessage}</span>
      <button class="update-btn" on:click={applyUpdate} disabled={updating}>
        {updating ? 'Actualizando...' : '▶ Actualizar ahora'}
      </button>
      <button class="update-dismiss" on:click={() => { updateInfo = null; }}>✕</button>
    </div>
  {/if}

  <main class="content">
    {#each renderTools as toolId, idx}
      <Window
        title={getTitle(toolId)}
        {toolId}
        active={storeState.active === toolId}
        zIndex={storeState.zIndices[toolId] || 0}
        position={storeState.positions[toolId] || (layoutCache[toolId] && layoutCache[toolId].position) || { x: 60 + idx * 28, y: 40 + idx * 28 }}
        size={storeState.sizes[toolId] || (layoutCache[toolId] && layoutCache[toolId].size) || { width: 480, height: 400 }}
        minimized={storeState.minimized[toolId]}
        fullscreen={storeState.fullscreen[toolId]}
        embedded={TOOLS_CONFIG[toolId]?.embedded}
        hidden={!storeState.open[toolId]}
        onClose={() => onWindowClose(toolId)}
        onFocus={() => onWindowFocus(toolId)}>
        {#if toolId === 'dashboard'}
          <Dashboard {rotationLogs} {gatewayLogs} />
        {:else if toolId === 'chat'}
          <ChatView {systemStatus} />
        {:else if toolId === 'scraping'}
          <Scraper bind:scraperQuery bind:scraperCategory {availableCategories} {scrapingStatus} onRun={runScraper} />
        {:else if toolId === 'crm'}
          <Crm />
        {:else if toolId === 'settings'}
          <Settings {hermesOnline} {openclawOnline} {openPencilStatus} {b2Accounts}
            {dockerStatus} {workflowRunning} {updateInfo}
            onToggleHermes={toggleHermesService}
            onToggleOpenClaw={toggleOpenClawService}
            onToggleOpenPencilVite={toggleOpenPencilVite}
            onToggleOpenPencilMCP={toggleOpenPencilMCP}
            onToggleDockerService={toggleDockerService}
            onRunWorkflow={runWorkflow}
            onApplyUpdate={applyUpdate} />
        {:else if toolId === 'addkey'}
          <AddKey />
        {:else if toolId === 'logs'}
          <LogsView />
        {:else if toolId === 'shells'}
          <Shells />
        {:else if toolId === 'storage'}
          <Storage />
        {:else if toolId === 'openpencil'}
          <OpenPencil />
        {:else if toolId === 'openpencilChat'}
          <OpenPencilChat />
        {:else if toolId === 'content'}
          <Content />
        {:else if toolId === 'outreach'}
          <Outreach />
        {:else if toolId === 'autoconfig'}
          <AutoConfig />
        {:else if toolId === 'codegraf'}
          <Codegraf />
        {:else if toolId === 'builderbot'}
          <BuilderBot />
        {:else if toolId === 'agency'}
          <Agency />
        {:else if toolId === 'n8n'}
          <N8n />
        {:else if toolId === 'calcom'}
          <CalCom />
        {:else if toolId === 'obscura'}
          <Obscura />
        {:else if toolId === 'obsidian'}
          <Obsidian />
        {:else if toolId === 'followup'}
          <Followup />
        {/if}
      </Window>
    {/each}
  </main>
</div>

<Dock />
<CommandPalette />

<style>
  .app-shell { display: flex; flex-direction: column; height: 100vh; background: rgba(26, 29, 38, 0.85); color: var(--text-primary); font-family: var(--font-sans); position: relative; }

  .menu-bar { display: flex; align-items: center; height: 40px; padding: 0 12px; background: rgba(34, 37, 47, 0.85); border-bottom: 1px solid var(--border-color); flex-shrink: 0; font-size: 13px; user-select: none; position: relative; z-index: 100000; }
  .menu-items { display: flex; align-items: center; gap: 4px; flex: 1; }
  .brand { font-weight: 700; letter-spacing: 0.05em; color: var(--accent); margin-right: 16px; }
  .menu-item { position: relative; cursor: default; }
  .menu-label { display: block; padding: 4px 10px; border-radius: 4px; color: var(--text-muted); font-size: 12px; }
  .menu-label:hover { color: var(--text-primary); background: rgba(255,255,255,0.06); }
  .menu-dropup { position: absolute; bottom: calc(100% + 4px); left: 0; min-width: 200px; background: rgba(14, 16, 21, 0.95); backdrop-filter: blur(16px); border: 1px solid var(--border-color); border-radius: 8px; padding: 6px; box-shadow: 0 -4px 24px rgba(0,0,0,0.4); z-index: 1000; }
  .menu-group-label { padding: 6px 10px 3px; font-size: 11px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; }
  .menu-item-btn { display: block; width: 100%; padding: 6px 10px; background: none; border: none; border-radius: 4px; color: var(--text-primary); font-size: 12px; font-family: var(--font-sans); text-align: left; cursor: pointer; }
  .menu-item-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
  .menu-separator { height: 1px; background: var(--border-color); margin: 4px 8px; }
  .menu-right { display: flex; align-items: center; gap: 12px; }
  .menu-services { display: flex; align-items: center; gap: 14px; margin: 0 auto; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
  .svc { display: inline-flex; align-items: center; gap: 4px; opacity: 0.55; transition: opacity var(--transition-fast); }
  .svc:hover { opacity: 1; }
  .svc-dot { width: 5px; height: 5px; border-radius: 50%; background: rgba(200, 164, 78, 0.2); transition: background var(--transition-fast), box-shadow var(--transition-fast); }
  .svc.on .svc-dot { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
  .svc.off .svc-dot { background: var(--color-danger); box-shadow: 0 0 6px var(--color-danger); }
  .svc.gold .svc-dot { background: rgba(200, 164, 78, 0.2); }
  .svc.on.gold .svc-dot { background: var(--color-gold); box-shadow: 0 0 6px var(--color-gold); }
  .status-item { font-size: 12px; color: var(--text-muted); }
  .rotate-btn { background: none; border: 1px solid var(--border-color); color: var(--color-warning); border-radius: 6px; cursor: pointer; font-size: 16px; padding: 2px 8px; line-height: 1; }
  .rotate-btn:hover { background: var(--accent-glow); }
  .daily-btn { background: none; border: 1px solid var(--border-color); color: var(--accent); border-radius: 6px; cursor: pointer; font-size: 12px; padding: 2px 10px; line-height: 1.4; font-family: var(--font-sans); margin-left: 8px; }
  .daily-btn:hover { background: var(--accent-glow); }
  .daily-btn:disabled { opacity: 0.4; cursor: default; }

  .content { flex: 1; display: flex; flex-direction: column; padding: 20px; padding-bottom: 100px; position: relative; overflow: hidden; }

  .card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
  .card label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; margin-top: 8px; }
  .card input, .card select { width: 100%; padding: 8px 12px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); }
  .card input:focus, .card select:focus { outline: none; border-color: var(--accent); }
  .btn-primary { padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; font-family: var(--font-sans); margin-top: 8px; display: inline-block; }
  .btn-primary:hover { opacity: 0.85; }
  .status { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
  .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); margin-right: 6px; }
  .status-dot.green { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
  .badge { display: inline-block; padding: 2px 6px; background: var(--bg-card); border-radius: 4px; font-size: 11px; color: var(--text-muted); }
.daily-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .update-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: linear-gradient(135deg, #1a3a2a, #0d2818);
    border-bottom: 1px solid var(--accent);
    font-size: 13px;
    color: #a8e6cf;
    flex-shrink: 0;
  }
  .update-banner span { flex: 1; }
  .update-btn {
    padding: 4px 14px;
    background: var(--accent);
    color: #000;
    border: none;
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    font-family: var(--font-sans);
  }
  .update-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .update-btn:hover:not(:disabled) { opacity: 0.85; }
  .update-dismiss {
    background: none;
    border: none;
    color: #6b8f78;
    cursor: pointer;
    font-size: 16px;
    padding: 0 4px;
  }
  .update-dismiss:hover { color: #a8e6cf; }
</style>
