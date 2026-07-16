<script>
  let issues = [];
  let loading = false;
  let fixing = {};
  let keyInputs = {};

  async function scan() {
    loading = true;
    issues = [];
    try {
      const res = await fetch('/api/health/check');
      const data = await res.json();
      issues = data.issues || [];
    } catch (e) {
      issues = [{ category: 'error', severity: 'high', message: 'Error de conexión: ' + e.message }];
    }
    loading = false;
  }

  async function runFix(issue) {
    const ft = issue.fix_type;
    if (ft === 'add_key') {
      const input = keyInputs[issue.fix_data.target];
      if (!input) return;
      fixing[issue.fix_data.target] = true;
      try {
        let url, body;
        if (issue.fix_data.type === 'agent') {
          url = '/api/agents/config';
          body = { name: issue.fix_data.target, keys: [input], mode: 'append' };
        } else {
          url = '/api/keys';
          body = { provider: issue.fix_data.target, key: input };
        }
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (data.success) {
          issue._fixed = true;
          keyInputs[issue.fix_data.target] = '';
        } else {
          issue._error = data.error || 'Error al guardar';
        }
      } catch (e) { issue._error = e.message; }
      fixing[issue.fix_data.target] = false;
      return;
    }

    if (ft === 'download_docker' || ft === 'download_node' || ft === 'download_git') {
      window.open(issue.fix_data?.url, '_blank');
      return;
    }

    fixing[ft] = true;
    issue._error = null;
    try {
      const res = await fetch('/api/health/fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix_type: ft, fix_data: issue.fix_data }) });
      const data = await res.json();
      if (data.success) {
        issue._fixed = true;
        issue._output = data.output || data.message;
      } else {
        issue._error = data.error || data.message || 'Error';
        issue._guide = data.guide;
      }
    } catch (e) { issue._error = e.message; }
    fixing[ft] = false;
  }

  function severityIcon(s) {
    if (s === 'high') return '🔴';
    if (s === 'medium') return '🟡';
    return '🟢';
  }

  function catIcon(c) {
    if (c === 'api_keys') return '🔑';
    if (c === 'service') return '⚙️';
    if (c === 'tool') return '🛠';
    return '❓';
  }
</script>

<div class="autoconfig">
  <div class="header">
    <h2>⚡ Auto-Configurar</h2>
    <button class="btn-scan" on:click={scan} disabled={loading}>
      {loading ? 'Escaneando...' : '↻ Escanear'}
    </button>
  </div>

  {#if issues.length === 0 && !loading}
    <div class="empty">
      <p>Presioná <strong>Escanear</strong> para diagnosticar el sistema.</p>
    </div>
  {/if}

  {#if loading}
    <div class="loading-bar">
      <div class="bar"></div>
      <span>Escaneando servicios, API keys y herramientas...</span>
    </div>
  {/if}

  <div class="issues">
    {#each issues as issue, i}
      <div class="issue-card" class:fixed={issue._fixed} class:high={issue.severity === 'high'} class:medium={issue.severity === 'medium'}>
        <div class="issue-left">
          <span class="issue-icon">{issue._fixed ? '✅' : catIcon(issue.category)}</span>
        </div>
        <div class="issue-body">
          <div class="issue-header">
            <span class="sev-badge sev-{issue.severity}">{severityIcon(issue.severity)} {issue.severity}</span>
            <span class="issue-msg">{issue.message}</span>
          </div>

          {#if issue._fixed}
            <div class="fixed-msg">✓ Resuelto</div>
            {#if issue._output}
              <pre class="output">{issue._output}</pre>
            {/if}
          {:else if issue.fix_type === 'add_key'}
            <div class="fix-row">
              <input bind:value={keyInputs[issue.fix_data.target]} placeholder="Pegá la API key..." class="key-input" />
              <button class="btn-fix" on:click={() => runFix(issue)} disabled={fixing[issue.fix_data.target] || !keyInputs[issue.fix_data.target]}>
                {fixing[issue.fix_data.target] ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          {:else}
            <div class="fix-row">
              <button class="btn-fix" on:click={() => runFix(issue)} disabled={fixing[issue.fix_type]}>
                {fixing[issue.fix_type] ? 'Ejecutando...' : 'Resolver'}
              </button>
            </div>
          {/if}

          {#if issue._error}
            <div class="error-msg">❌ {issue._error}</div>
          {/if}
          {#if issue._guide}
            <div class="guide-msg">💡 {issue._guide}</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .autoconfig { display: flex; flex-direction: column; height: 100%; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .header h2 { font-size: 16px; font-weight: 600; margin: 0; }
  .btn-scan { padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; margin-left: auto; }
  .btn-scan:hover { opacity: 0.85; }
  .btn-scan:disabled { opacity: 0.5; cursor: not-allowed; }
  .empty { text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px; }
  .loading-bar { display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: var(--text-muted); }
  .bar { width: 16px; height: 16px; border: 2px solid var(--accent); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .issues { display: flex; flex-direction: column; gap: 8px; }
  .issue-card { display: flex; gap: 12px; padding: 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; }
  .issue-card.high { border-left: 3px solid #ef4444; }
  .issue-card.medium { border-left: 3px solid #f59e0b; }
  .issue-card.fixed { border-left: 3px solid #22c55e; opacity: 0.7; }
  .issue-left { flex-shrink: 0; width: 28px; text-align: center; padding-top: 2px; }
  .issue-icon { font-size: 18px; }
  .issue-body { flex: 1; min-width: 0; }
  .issue-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .sev-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase; }
  .sev-high { background: rgba(239,68,68,0.15); color: #ef4444; }
  .sev-medium { background: rgba(245,158,11,0.15); color: #f59e0b; }
  .sev-low { background: rgba(34,197,94,0.15); color: #22c55e; }
  .issue-msg { font-size: 13px; color: var(--text-primary); }
  .fix-row { display: flex; gap: 8px; margin-top: 8px; }
  .key-input { flex: 1; padding: 6px 10px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-family: 'Geist Mono', monospace; }
  .key-input:focus { outline: none; border-color: var(--accent); }
  .btn-fix { padding: 6px 14px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11px; white-space: nowrap; }
  .btn-fix:hover { opacity: 0.85; }
  .btn-fix:disabled { opacity: 0.5; cursor: not-allowed; }
  .fixed-msg { font-size: 12px; color: #22c55e; margin-top: 4px; }
  .error-msg { font-size: 11px; color: #ef4444; margin-top: 4px; }
  .guide-msg { font-size: 11px; color: var(--accent); margin-top: 4px; word-break: break-all; }
  .output { font-size: 10px; color: var(--text-muted); background: #050608; border: 1px solid var(--border-color); border-radius: 4px; padding: 6px; margin-top: 4px; max-height: 80px; overflow: auto; font-family: 'Geist Mono', monospace; }
</style>