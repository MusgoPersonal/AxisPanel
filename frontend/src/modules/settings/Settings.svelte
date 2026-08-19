<script>
  export let hermesOnline = false;
  export let openclawOnline = false;
  export let openPencilStatus = { mcpRunning: false, viteRunning: false };
  export let b2Accounts = [];
  export let dockerStatus = { docker_available: false, services: [] };
  export let workflowRunning = false;
  export let updateInfo = null;

  export let onToggleHermes = (action) => {};
  export let onToggleOpenClaw = (action) => {};
  export let onToggleOpenPencilVite = (action) => {};
  export let onToggleOpenPencilMCP = (action) => {};
  export let onToggleDockerService = (name, action) => {};
  export let onRunWorkflow = () => {};
  export let onApplyUpdate = () => {};
</script>

<h2>⚙️ Ajustes</h2>

<div class="card">
  <h3>🧠 Hermes Agent (Gateway)</h3>
  <span class="status-dot" class:green={hermesOnline}></span>{hermesOnline ? 'Online (Puerto 8642)' : 'Offline'}
  <button class="btn-primary" on:click={() => onToggleHermes(hermesOnline ? 'stop' : 'start')}>{hermesOnline ? 'Detener' : 'Iniciar'}</button>
</div>

<div class="card">
  <h3>🐳 Docker</h3>
  {#if dockerStatus.docker_available}
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Docker disponible — servicios en docker-compose:</p>
    {#each dockerStatus.services as svc}
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);">
        <span><span class="status-dot" class:green={svc.running}></span>{svc.name}</span>
        <button class="btn-sm" class:btn-stop={svc.running} on:click={() => onToggleDockerService(svc.name, svc.running ? 'down' : 'up')}>
          {svc.running ? 'Detener' : 'Iniciar'}
        </button>
      </div>
    {/each}
  {:else}
    <p style="font-size:12px;color:var(--text-muted);">Docker no disponible</p>
  {/if}
</div>

<div class="card">
  <h3>🔁 Workflow — Inicio Secuencial</h3>
  <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">1️⃣ Hermes → 2️⃣ Docker (chromadb, searxng) → 3️⃣ OpenPencil MCP</p>
  <button class="btn-primary" on:click={onRunWorkflow} disabled={workflowRunning}>
    {workflowRunning ? '▶ Ejecutando...' : '▶ Iniciar todo'}
  </button>
</div>

<div class="card">
  <h3>🌀 OpenClaw Gateway</h3>
  <span class="status-dot" class:green={openclawOnline}></span>{openclawOnline ? 'Online (Puerto 18789)' : 'Offline'}
  <button class="btn-primary" on:click={() => onToggleOpenClaw(openclawOnline ? 'stop' : 'start')}>{openclawOnline ? 'Detener' : 'Iniciar'}</button>
</div>

<div class="card">
  <h3>🎨 OpenPencil Vite</h3>
  <span class="status-dot" class:green={openPencilStatus.viteRunning}></span>{openPencilStatus.viteRunning ? 'Online' : 'Offline'}
  <button class="btn-primary" on:click={() => onToggleOpenPencilVite(openPencilStatus.viteRunning ? 'stop' : 'start')}>{openPencilStatus.viteRunning ? 'Detener' : 'Iniciar'}</button>
</div>

<div class="card">
  <h3>🔌 OpenPencil MCP</h3>
  <span class="status-dot" class:green={openPencilStatus.mcpRunning}></span>{openPencilStatus.mcpRunning ? 'Online' : 'Offline'}
  <button class="btn-primary" on:click={() => onToggleOpenPencilMCP(openPencilStatus.mcpRunning ? 'stop' : 'start')}>{openPencilStatus.mcpRunning ? 'Detener' : 'Iniciar'}</button>
</div>

<div class="card">
  <h3>☁️ Backblaze B2</h3>
  {#each b2Accounts as acc}
    <p><code>{acc.key_id}</code> — {acc.bucket} <span class="badge">{acc.status}</span></p>
  {/each}
</div>

<div class="card">
  <h3>⬆️ Actualización</h3>
  {#if updateInfo}
    <p style="font-size:12px;color:#a8e6cf;margin-bottom:8px;">
      Versión <strong>{updateInfo.remoteCommit}</strong> disponible<br>
      <span style="color:var(--text-muted);">{updateInfo.remoteMessage}</span>
    </p>
    <button class="btn-primary" on:click={onApplyUpdate}>▶ Actualizar desde GitHub</button>
  {:else}
    <p style="font-size:12px;color:var(--text-muted);">AxisPanel está actualizado ✓</p>
  {/if}
</div>

<style>
  .btn-sm {
    padding: 4px 10px;
    background: var(--accent);
    color: #000;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 11px;
    font-family: var(--font-sans);
  }
  .btn-sm.btn-stop {
    background: #e74c3c;
    color: #fff;
  }
  .btn-sm:hover { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>