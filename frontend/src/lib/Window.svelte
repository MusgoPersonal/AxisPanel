<script>
  import { onMount } from 'svelte';
  import { createTrafficLights, TrafficLightsStyles } from 'core/window/TrafficLights.js';
  import { ToolsStore } from 'core/state/tools-store.js';

  export let title = "Axis Command Center";
  export let active = true;
  export let toolId = 'window';
  export let zIndex = 100;
  export let position = null;
  export let size = null;
  export let minimized = false;
  export let fullscreen = false;
  export let onClose = () => {};
  export let onFocus = () => {};

  let trafficContainer;
  let windowEl;
  let dragState = null;
  let resizeState = null;

  const MIN_W = 320;
  const MIN_H = 240;

  onMount(() => {
    const styleId = 'traffic-lights-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.textContent = TrafficLightsStyles;
      style.id = styleId;
      document.head.appendChild(style);
    }

    const tl = createTrafficLights(toolId, {
      onClose: handleClose,
      onMinimize: handleMinimize,
      onMaximize: handleMaximize,
      isActive: active
    });
    trafficContainer.appendChild(tl.element);
    return () => tl.destroy();
  });

  $: if (trafficContainer) {
    const tl = trafficContainer.querySelector('.traffic-lights');
    if (tl) tl.classList.toggle('unfocused', !active);
  }

  function handleHeaderClick(e) {
    if (ToolsStore.state.minimized[toolId]) {
      ToolsStore.setMinimized(toolId, false);
      return;
    }
    if (!active) onFocus();
  }

  function handleClose() {
    onClose();
  }

  function handleMinimize() {
    const current = ToolsStore.state.minimized[toolId];
    ToolsStore.setMinimized(toolId, !current);
  }

  function handleMaximize() {
    ToolsStore.toggleFullscreen(toolId);
  }

  function handleHeaderDown(e) {
    if (e.target.closest('.traffic-lights-container') || e.target.closest('.traffic-lights')) return;
    if (ToolsStore.state.fullscreen[toolId]) return;
    e.preventDefault();
    const rect = windowEl.getBoundingClientRect();
    dragState = {
      startX: e.clientX, startY: e.clientY,
      origX: rect.left, origY: rect.top
    };
    ToolsStore.setDragging(true);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  }

  function onDragMove(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const x = Math.max(0, dragState.origX + dx);
    const y = Math.max(0, dragState.origY + dy);
    windowEl.style.left = x + 'px';
    windowEl.style.top = y + 'px';
  }

  function onDragEnd(e) {
    if (!dragState) return;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    const x = parseInt(windowEl.style.left) || 0;
    const y = parseInt(windowEl.style.top) || 0;
    ToolsStore.setPosition(toolId, { x, y });
    dragState = null;
    ToolsStore.setDragging(false);
  }

  function startResize(e, edge) {
    e.preventDefault();
    e.stopPropagation();
    const rect = windowEl.getBoundingClientRect();
    resizeState = { edge, startX: e.clientX, startY: e.clientY, origW: rect.width, origH: rect.height, origX: rect.left, origY: rect.top };
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  }

  function onResizeMove(e) {
    if (!resizeState) return;
    const { edge, startX, startY, origW, origH, origX, origY } = resizeState;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let w = origW, h = origH, x = origX, y = origY;
    if (edge.includes('e')) w = Math.max(MIN_W, origW + dx);
    if (edge.includes('w')) { w = Math.max(MIN_W, origW - dx); x = origX + (origW - w); }
    if (edge.includes('s')) h = Math.max(MIN_H, origH + dy);
    if (edge.includes('n')) { h = Math.max(MIN_H, origH - dy); y = origY + (origH - h); }
    windowEl.style.width = w + 'px';
    windowEl.style.height = h + 'px';
    windowEl.style.left = x + 'px';
    windowEl.style.top = y + 'px';
  }

  function onResizeEnd() {
    if (!resizeState) return;
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
    const w = parseInt(windowEl.style.width);
    const h = parseInt(windowEl.style.height);
    const x = parseInt(windowEl.style.left);
    const y = parseInt(windowEl.style.top);
    ToolsStore.setSize(toolId, { width: w, height: h });
    ToolsStore.setPosition(toolId, { x, y });
    resizeState = null;
  }

  $: style = computeStyle(position, zIndex, size);
  function computeStyle(pos, z, sz) {
    let s = `z-index: ${z};`;
    if (pos) {
      const w = sz?.width || 480;
      const h = sz?.height || 400;
      s += ` left: ${pos.x}px; top: ${pos.y}px; position: absolute; width: ${w}px; height: ${h}px;`;
    }
    return s;
  }


</script>

<div
  class="window-container"
  class:active
  class:fullscreen
  class:minimized
  style={style}
  bind:this={windowEl}
>
  <div
    class="window-header"
    on:click={handleHeaderClick}
    on:mousedown={handleHeaderDown}
  >
    <div class="traffic-lights-container" bind:this={trafficContainer}></div>
    <span class="window-title">{title}</span>
  </div>

  <div class="window-content" class:hidden={minimized}>
    <slot />
  </div>

  {#if !fullscreen}
    <div class="resize-handle n" on:mousedown={(e) => startResize(e, 'n')}></div>
    <div class="resize-handle s" on:mousedown={(e) => startResize(e, 's')}></div>
    <div class="resize-handle e" on:mousedown={(e) => startResize(e, 'e')}></div>
    <div class="resize-handle w" on:mousedown={(e) => startResize(e, 'w')}></div>
    <div class="resize-handle ne" on:mousedown={(e) => startResize(e, 'ne')}></div>
    <div class="resize-handle nw" on:mousedown={(e) => startResize(e, 'nw')}></div>
    <div class="resize-handle se" on:mousedown={(e) => startResize(e, 'se')}></div>
    <div class="resize-handle sw" on:mousedown={(e) => startResize(e, 'sw')}></div>
  {/if}
</div>

<style>
  .window-container {
    display: flex;
    flex-direction: column;
    background: rgba(42, 46, 58, 0.7);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    transition: opacity var(--transition-normal), box-shadow var(--transition-normal);
  }

  .window-container.active {
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
  }

  .window-container:not([style*="position"]) {
    height: 100%;
  }

  .window-container.fullscreen {
    position: fixed !important;
    inset: 40px 0 0 0 !important;
    width: 100vw !important;
    height: calc(100vh - 40px) !important;
    z-index: 99999 !important;
    border-radius: 0;
  }

  .window-container.minimized {
    height: 44px !important;
    min-height: 44px !important;
    overflow: hidden;
    cursor: pointer;
    transition: height 0.2s ease;
  }
  .window-container.minimized:hover {
    border-color: var(--accent);
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.15);
  }

  .window-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 44px;
    display: flex;
    align-items: center;
    padding: 0 20px;
    background: rgba(34, 37, 47, 0.75);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border-color);
    border-top-left-radius: var(--radius-lg);
    border-top-right-radius: var(--radius-lg);
    user-select: none;
    z-index: 10;
  }

  .window-container.fullscreen .window-header {
    border-radius: 0;
  }

  .traffic-lights-container {
    display: flex;
    align-items: center;
  }

  .window-title {
    flex-grow: 1;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    letter-spacing: 0.02em;
    margin-right: 52px;
  }

  .window-content {
    height: 100%;
    padding-top: 60px;
    padding-bottom: 24px;
    padding-left: 24px;
    padding-right: 24px;
    overflow-y: auto;
  }

  .window-content.hidden {
    display: none;
  }

  .resize-handle {
    position: absolute;
    z-index: 20;
  }
  .resize-handle.n { top: -3px; left: 8px; right: 8px; height: 6px; cursor: n-resize; }
  .resize-handle.s { bottom: -3px; left: 8px; right: 8px; height: 6px; cursor: s-resize; }
  .resize-handle.e { right: -3px; top: 8px; bottom: 8px; width: 6px; cursor: e-resize; }
  .resize-handle.w { left: -3px; top: 8px; bottom: 8px; width: 6px; cursor: w-resize; }
  .resize-handle.ne { top: -4px; right: -4px; width: 10px; height: 10px; cursor: ne-resize; }
  .resize-handle.nw { top: -4px; left: -4px; width: 10px; height: 10px; cursor: nw-resize; }
  .resize-handle.se { bottom: -4px; right: -4px; width: 10px; height: 10px; cursor: se-resize; }
  .resize-handle.sw { bottom: -4px; left: -4px; width: 10px; height: 10px; cursor: sw-resize; }
</style>