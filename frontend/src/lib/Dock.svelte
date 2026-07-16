<script>
  import { onMount } from 'svelte';
  import { getDockItemsByCategory, TOOL_CATEGORIES } from 'core/config/tools-config.js';
  import { ToolsStore } from 'core/state/tools-store.js';
  import Icon from './Icon.svelte';

  let storeState = ToolsStore.state;
  let expanded = {};

  onMount(() => {
    return ToolsStore.subscribe(s => { storeState = s; });
  });

  const grouped = getDockItemsByCategory();
  const categories = Object.entries(TOOL_CATEGORIES)
    .filter(([key]) => grouped[key]?.length)
    .sort((a, b) => a[1].order - b[1].order);

  function toggleCategory(key) {
    expanded[key] = !expanded[key];
    expanded = expanded;
  }

  function toggleTool(id) {
    ToolsStore.toggleTool(id);
  }

  function isOpen(id) {
    return storeState.open[id];
  }
</script>

<div class="dock">
  {#each categories as [catKey, cat]}
    {@const items = grouped[catKey]}
    <div class="folder">
      <button
        class="folder-btn"
        class:expanded={expanded[catKey]}
        on:click={() => toggleCategory(catKey)}
      >
        <span class="folder-label">{cat.label}</span>
        <span class="folder-count">{items.length}</span>
        <span class="folder-arrow">{expanded[catKey] ? '▾' : '▸'}</span>
      </button>

      {#if expanded[catKey]}
        <div class="items">
          {#each items as item}
            <button
              class="item"
              class:active={storeState.active === item.id}
              class:open={isOpen(item.id)}
              on:click={() => toggleTool(item.id)}
              title={item.title}
            >
               <span class="icon"><Icon name={item.icon} size={16} /></span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .dock {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(14, 16, 21, 0.45);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 18px;
    box-shadow: 0 10px 30px -10px rgba(0,0,0,0.7), 0 1px 0 0 rgba(255,255,255,0.1) inset;
    pointer-events: auto;
  }

  .folder {
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 2px;
  }
  .folder + .folder {
    padding-left: 8px;
    border-left: 1px solid rgba(255,255,255,0.06);
  }

  .folder-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    padding: 4px 8px;
    color: var(--text-muted);
    transition: all 0.2s;
    white-space: nowrap;
  }
  .folder-btn:hover {
    background: rgba(255,255,255,0.06);
    color: var(--text-primary);
  }
  .folder-btn.expanded {
    color: var(--accent-light);
  }

  .folder-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .folder-count {
    font-size: 9px;
    background: rgba(255,255,255,0.08);
    border-radius: 99px;
    padding: 0 5px;
    line-height: 14px;
    min-width: 14px;
    text-align: center;
    color: rgba(255,255,255,0.35);
  }

  .folder-arrow {
    font-size: 8px;
    opacity: 0.5;
  }

  .items {
    display: flex;
    gap: 1px;
    padding: 2px 0 4px;
  }

  .item {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s;
    font-size: 14px;
    padding: 0;
    line-height: 1;
    transform-origin: bottom center;
  }
  .item:hover {
    background: rgba(255,255,255,0.08);
    color: var(--text-primary);
    transform: scale(1.35);
  }
  .item:active {
    transform: scale(0.92);
  }
  .item.open {
    color: var(--accent-light);
  }
  .item.active {
    background: rgba(99, 102, 241, 0.12);
    color: var(--accent-light);
  }
  .icon {
    line-height: 1;
  }
</style>
