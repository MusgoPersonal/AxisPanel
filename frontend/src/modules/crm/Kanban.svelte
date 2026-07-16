<script>
  let draggedId = null;
  let draggedStage = null;
  let dropTarget = null;
  let dragSource = null;

  export let crmStageOrder = [];
  export let crmStageDisplay = {};
  export let stageGroups = {};
  export let onMoveLead = (leadId, newStage) => {};

  function handleDragStart(e, lead) {
    draggedId = lead.id;
    draggedStage = lead.stage;
    dragSource = lead.stage;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lead.id);
    e.target.classList.add('dragging');
  }

  function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedId = null;
    draggedStage = null;
    dragSource = null;
    dropTarget = null;
  }

  function handleDragOver(e, stage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dropTarget = stage;
  }

  function handleDragEnter(e, stage) {
    e.preventDefault();
    if (stage !== dragSource) {
      e.currentTarget.classList.add('drop-active');
    }
  }

  function handleDragLeave(e) {
    e.currentTarget.classList.remove('drop-active');
  }

  function handleDrop(e, stage) {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-active');
    if (draggedId && stage !== draggedStage) {
      onMoveLead(draggedId, stage);
    }
    draggedId = null;
    draggedStage = null;
    dragSource = null;
    dropTarget = null;
  }
</script>

<h2>📋 CRM Kanban</h2>
<div class="kanban">
  {#each crmStageOrder as stage}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="kanban-col"
      class:drop-active={dropTarget === stage && stage !== dragSource}
      on:dragover={(e) => handleDragOver(e, stage)}
      on:dragenter={(e) => handleDragEnter(e, stage)}
      on:dragleave={handleDragLeave}
      on:drop={(e) => handleDrop(e, stage)}
    >
      <div class="kanban-header">{crmStageDisplay[stage]} <span class="badge">{stageGroups[stage]?.length || 0}</span></div>
      {#each stageGroups[stage] || [] as lead}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="kanban-card"
          draggable="true"
          on:dragstart={(e) => handleDragStart(e, lead)}
          on:dragend={handleDragEnd}
        >
          <strong>{lead.name}</strong>
          <small>{lead.category}</small>
          <select on:change={(e) => onMoveLead(lead.id, e.target.value)} value={lead.stage}>
            {#each crmStageOrder as opt}<option value={opt}>{crmStageDisplay[opt]}</option>{/each}
          </select>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .kanban { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 12px; }
  .kanban-col { min-width: 200px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
  .kanban-col.drop-active { border-color: var(--accent); box-shadow: 0 0 20px rgba(74, 222, 128, 0.15); }
  .kanban-header { font-weight: 600; font-size: 13px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
  .kanban-card { background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; margin-bottom: 8px; cursor: grab; transition: opacity var(--transition-fast), box-shadow var(--transition-fast); }
  .kanban-card:hover { border-color: var(--border-hover); box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
  .kanban-card:active { cursor: grabbing; }
  .kanban-card.dragging { opacity: 0.35; }
  .kanban-card strong { display: block; font-size: 13px; }
  .kanban-card small { display: block; font-size: 11px; color: var(--text-muted); margin: 4px 0; }
  .kanban-card select { width: 100%; padding: 4px; font-size: 11px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; cursor: pointer; }
  @media (max-width: 768px) { .kanban { flex-direction: column; } }
</style>
