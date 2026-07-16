<script>
  import { onMount } from 'svelte';

  let leads = [];
  let loading = true;

  const stageDisplay = { new:'Nuevo', contacted:'Contactado', responded:'Respondió', qualified:'Calificado', proposal:'Propuesta', client:'Cliente', closed:'Cerrado', lost:'Perdido', ignored:'Ignorado' };
  const stageColors = { new:'#6b7a74', contacted:'#2dd4bf', responded:'#fbbf24', qualified:'#4ade80', proposal:'#fb7185', client:'#4ade80', closed:'#6b7a74', lost:'#fb7185', ignored:'#6b7a74' };

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const leadsRes = await fetch('/api/crm/leads?limit=999').catch(() => null);
      if (leadsRes) leads = (await leadsRes.json()).leads || [];
    } catch (e) { console.error('Error:', e); }
    loading = false;
  }

  $: stageCounts = leads.reduce((acc, l) => { acc[l.stage] = (acc[l.stage] || 0) + 1; return acc; }, {});
  $: totalLeads = leads.length;
  $: avgScore = leads.length ? Math.round(leads.reduce((s, l) => s + (l.score || 0), 0) / leads.length) : 0;
  $: topCategories = Object.entries(leads.reduce((acc, l) => { if (l.category) acc[l.category] = (acc[l.category] || 0) + 1; return acc; }, {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
</script>

{#if loading}
  <p class="loading">Cargando estadísticas...</p>
{:else}
  <div class="summary">
    <div class="metric"><span class="value">{totalLeads}</span><span class="label">Total Leads</span></div>
    <div class="metric"><span class="value">{avgScore}</span><span class="label">Score Promedio</span></div>
    <div class="metric"><span class="value">{Object.keys(stageCounts).length}</span><span class="label">Etapas Activas</span></div>
  </div>

  <h3>Leads por Etapa</h3>
  <div class="stage-bars">
    {#each Object.entries(stageDisplay) as [stage, label]}
      {#if stageCounts[stage]}
        <div class="bar-row">
          <span class="bar-label">{label}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width: {(stageCounts[stage] / totalLeads) * 100}%; background: {stageColors[stage]}"></div>
          </div>
          <span class="bar-count">{stageCounts[stage]}</span>
        </div>
      {/if}
    {/each}
  </div>

  {#if topCategories.length > 0}
    <h3>Top Categorías</h3>
    <div class="cat-list">
      {#each topCategories as [cat, count]}
        <div class="cat-item"><span class="badge">{cat}</span><span>{count} leads</span></div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .loading { text-align: center; color: var(--text-muted); padding: 24px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .metric { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; text-align: center; }
  .value { display: block; font-size: 28px; font-weight: 700; color: var(--accent); }
  .label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
  h3 { font-size: 14px; font-weight: 600; margin: 16px 0 12px; }
  .stage-bars { display: flex; flex-direction: column; gap: 8px; }
  .bar-row { display: flex; align-items: center; gap: 12px; }
  .bar-label { width: 100px; font-size: 12px; color: var(--text-secondary); }
  .bar-track { flex: 1; height: 20px; background: var(--bg-card); border-radius: 10px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 10px; transition: width 0.5s; min-width: 4px; }
  .bar-count { font-size: 12px; color: var(--text-muted); width: 30px; text-align: right; }
  .cat-list { display: flex; flex-direction: column; gap: 6px; }
  .cat-item { display: flex; align-items: center; gap: 12px; font-size: 13px; }
  .badge { display: inline-block; padding: 2px 8px; background: var(--bg-card); border-radius: 4px; font-size: 11px; color: var(--text-muted); }
</style>