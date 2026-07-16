<script>
  import { onMount, onDestroy } from 'svelte';
  import { ToolsStore } from 'core/state/tools-store.js';
  import { TOOLS_CONFIG, TOOL_CATEGORIES } from 'core/config/tools-config.js';
  import { pipelineCount } from '../stores/crmStore.js';

  let visible = false;
  let query = '';
  let selectedIdx = 0;
  let inputEl;

  const globalActions = [
    { id: 'rotate', label: '⟳ Rotar API Key', icon: '⟳' },
    { id: 'tile', label: '⬡ Organizar ventanas', icon: '⬡' },
    { id: 'cascade', label: '⊞ Cascada ventanas', icon: '⊞' },
    { id: 'closeAll', label: '✕ Cerrar todas las ventanas', icon: '✕' },
  ];

  $: items = buildItems(query);

  function buildItems(q) {
    const lower = q.toLowerCase();
    const results = [];

    for (const [id, config] of Object.entries(TOOLS_CONFIG)) {
      const label = config.title;
      if (!lower || label.toLowerCase().includes(lower) || id.toLowerCase().includes(lower)) {
        results.push({ type: 'tool', id, label: `${config.icon} ${label}`, icon: config.icon, category: TOOL_CATEGORIES[config.category]?.label || config.category });
      }
    }

    for (const a of globalActions) {
      if (!lower || a.label.toLowerCase().includes(lower)) {
        results.push({ type: 'action', id: a.id, label: a.label, icon: a.icon });
      }
    }

    if (lower) {
      results.push({ type: 'search_leads', id: 'search_leads', label: `🔍 Buscar leads: "${q}"`, icon: '🔍' });
    }

    return results.slice(0, 20);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, items.length - 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); return; }
    if (e.key === 'Enter' && items[selectedIdx]) { execute(items[selectedIdx]); return; }
    selectedIdx = 0;
  }

  function execute(item) {
    if (item.type === 'tool') {
      ToolsStore.openTool(item.id);
    } else if (item.id === 'rotate') {
      fetch('/api/rotate', { method: 'POST' }).catch(() => {});
    } else if (item.id === 'tile') {
      ToolsStore.tileWindows();
    } else if (item.id === 'cascade') {
      ToolsStore.cascadeWindows();
    } else if (item.id === 'closeAll') {
      ToolsStore.closeAllWindows();
    } else if (item.id === 'search_leads') {
      window.open(`/crm?search=${encodeURIComponent(query)}`, '_self');
    }
    close();
  }

  function close() {
    visible = false;
    query = '';
    selectedIdx = 0;
  }

  function open() {
    visible = true;
    query = '';
    selectedIdx = 0;
    setTimeout(() => { if (inputEl) inputEl.focus(); }, 50);
  }

  function globalKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      visible ? close() : open();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', globalKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', globalKeydown);
  });
</script>

{#if visible}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" on:click={close}>
    <div class="palette" on:click|stopPropagation>
      <input
        bind:this={inputEl}
        bind:value={query}
        on:keydown={onKeydown}
        placeholder="Buscar herramientas, comandos..."
        class="palette-input"
        type="text"
      />
      <div class="palette-results">
        {#if items.length === 0 && query}
          <div class="palette-empty">Sin resultados</div>
        {:else}
          {#each items as item, i}
            <button
              class="palette-item"
              class:selected={i === selectedIdx}
              on:mouseenter={() => selectedIdx = i}
              on:click={() => execute(item)}
            >
              <span class="palette-icon">{item.icon || '⬡'}</span>
              <span class="palette-label">{item.label}</span>
              {#if item.category}
                <span class="palette-category">{item.category}</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
      <div class="palette-footer">
        <span>↑↓ Navegar</span>
        <span>↵ Abrir</span>
        <span>Esc Cerrar</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    padding-top: 15vh;
  }

  .palette {
    width: 520px;
    max-height: 400px;
    background: rgba(14, 16, 21, 0.96);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .palette-input {
    width: 100%;
    padding: 16px 20px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border-color);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 16px;
    outline: none;
  }
  .palette-input::placeholder { color: var(--text-muted); }

  .palette-results {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .palette-empty {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }

  .palette-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 14px;
    background: none;
    border: none;
    border-radius: 8px;
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .palette-item.selected { background: rgba(74, 222, 128, 0.12); }
  .palette-item:hover { background: rgba(255, 255, 255, 0.06); }

  .palette-icon { font-size: 16px; width: 24px; text-align: center; flex-shrink: 0; }
  .palette-label { flex: 1; }
  .palette-category { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }

  .palette-footer {
    display: flex;
    gap: 16px;
    padding: 8px 16px;
    border-top: 1px solid var(--border-color);
    font-size: 11px;
    color: var(--text-muted);
  }
</style>
