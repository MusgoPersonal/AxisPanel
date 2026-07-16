<script>
  export let hermesOnline = undefined;
  export let openclawOnline = undefined;
  export let openPencilRunning = undefined;
  export let apiKeyActive = 0;
  export let dockerActive = 0;

  $: services = [
    { label: 'Hermes', online: hermesOnline },
    { label: 'OpenClaw', online: openclawOnline },
    { label: 'OpenPencil', online: openPencilRunning },
    { label: 'API Keys', online: apiKeyActive > 0 ? true : undefined, isGold: true },
    { label: 'Docker', online: dockerActive > 0 ? true : undefined },
  ];

  function dotClass(s) {
    if (s.isGold) return s.online === true ? 'dot gold on' : 'dot gold';
    if (s.online === true) return 'dot on';
    if (s.online === false) return 'dot off';
    return 'dot';
  }
</script>

<div class="hud-top">
  {#each services as s}
    <span class="hud-item">
      <span class={dotClass(s)}></span>
      {s.label}
    </span>
  {/each}
</div>

<style>
  .hud-top {
    position: fixed;
    top: 6px;
    left: 0;
    right: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 0 24px;
    pointer-events: none;
    font-family: var(--font-sans);
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .hud-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    opacity: 0.55;
    transition: opacity var(--transition-fast);
  }

  .hud-item:hover {
    opacity: 1;
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(200, 164, 78, 0.2);
    transition: background var(--transition-fast), box-shadow var(--transition-fast);
  }

  .dot.on {
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
  }

  .dot.off {
    background: var(--color-danger);
    box-shadow: 0 0 6px var(--color-danger);
  }

  .dot.gold {
    background: rgba(200, 164, 78, 0.2);
  }

  .dot.gold.on {
    background: var(--color-gold);
    box-shadow: 0 0 6px var(--color-gold);
  }
</style>
