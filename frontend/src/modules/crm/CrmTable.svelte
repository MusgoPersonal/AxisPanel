<script>
  import { onMount } from 'svelte';

  let leads = [];
  let search = '';
  let loading = true;

  const stageOrder = ['new','contacted','responded','qualified','proposal','client','closed','lost','ignored'];
  const stageDisplay = { new:'Nuevo', contacted:'Contactado', responded:'Respondió', qualified:'Calificado', proposal:'Propuesta', client:'Cliente', closed:'Cerrado', lost:'Perdido', ignored:'Ignorado' };

  onMount(async () => {
    await loadLeads();
  });

  async function loadLeads() {
    loading = true;
    try {
      const res = await fetch('/api/crm/leads?limit=200');
      const data = await res.json();
      leads = data.leads || [];
    } catch (e) { console.error('Error loading leads:', e); }
    loading = false;
  }

  async function moveLead(leadId, newStage) {
    await fetch(`/api/crm/leads/${leadId}/move`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ stage: newStage }) });
    await loadLeads();
  }

  $: filtered = leads.filter(l =>
    !search || (l.name||'').toLowerCase().includes(search.toLowerCase()) ||
    (l.category||'').toLowerCase().includes(search.toLowerCase()) ||
    (l.phone||'').includes(search)
  );
</script>

<div class="top-actions">
  <input bind:value={search} placeholder="Buscar leads..." class="search" />
  <span class="count">{filtered.length} leads</span>
  <button class="btn-primary" on:click={loadLeads}>↻</button>
</div>

<div class="table-wrap">
  <table>
    <thead><tr><th>Nombre</th><th>Teléfono</th><th>Categoría</th><th>Score</th><th>Etapa</th><th>Web</th></tr></thead>
    <tbody>
      {#if loading}
        <tr><td colspan="6" class="loading">Cargando...</td></tr>
      {:else if filtered.length === 0}
        <tr><td colspan="6" class="loading">Sin leads</td></tr>
      {:else}
        {#each filtered as lead}
          <tr>
            <td><strong>{lead.name || '—'}</strong></td>
            <td>{lead.phone || '—'}</td>
            <td><span class="badge">{lead.category || '—'}</span></td>
            <td>{lead.score || 0}</td>
            <td>
              <select on:change={(e) => moveLead(lead.id, e.target.value)} value={lead.stage}>
                {#each stageOrder as opt}<option value={opt}>{stageDisplay[opt]}</option>{/each}
              </select>
            </td>
            <td>{#if lead.website}<a href={lead.website} target="_blank" rel="noopener">🌐</a>{/if}</td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>

<style>
  .top-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .search { flex: 1; padding: 8px 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; }
  .count { font-size: 12px; color: var(--text-muted); }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-weight: 500; }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border-color); }
  td select { padding: 4px; font-size: 11px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; }
  .loading { text-align: center; color: var(--text-muted); padding: 24px; }
  .badge { display: inline-block; padding: 2px 6px; background: var(--bg-card); border-radius: 4px; font-size: 11px; color: var(--text-muted); }
  a { color: var(--accent); text-decoration: none; }
</style>