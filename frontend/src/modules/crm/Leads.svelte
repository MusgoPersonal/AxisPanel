<script>
  export let searchFilter = '';
  export let filteredLeads = [];
  export let crmStageOrder = [];
  export let crmStageDisplay = {};
  export let onMoveLead = (leadId, newStage) => {};
</script>

<h2>🎯 Leads</h2>
<input bind:value={searchFilter} placeholder="Filtrar..." class="search" />
<div class="table-wrap">
  <table>
    <thead><tr><th>Nombre</th><th>Categoría</th><th>Score</th><th>Etapa</th><th></th></tr></thead>
    <tbody>
      {#each filteredLeads as lead}
        <tr>
          <td><strong>{lead.name}</strong></td>
          <td><span class="badge">{lead.category}</span></td>
          <td>{lead.score || 0}</td>
          <td><span class="stage-{lead.stage}">{crmStageDisplay[lead.stage]}</span></td>
          <td>
            <select on:change={(e) => onMoveLead(lead.id, e.target.value)} value={lead.stage}>
              {#each crmStageOrder as opt}<option value={opt}>{crmStageDisplay[opt]}</option>{/each}
            </select>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .search { width: 100%; padding: 8px 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; margin-bottom: 12px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-weight: 500; }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border-color); }
  td select { padding: 4px; font-size: 11px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; }
</style>