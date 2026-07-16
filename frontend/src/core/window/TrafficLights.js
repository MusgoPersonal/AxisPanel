export function createTrafficLights(toolId, { onClose, onMinimize, onMaximize, isActive }) {
  const container = document.createElement('div');
  container.className = 'traffic-lights' + (isActive ? '' : ' unfocused');
  container.innerHTML = `
    <button class="tl-btn tl-close" aria-label="Cerrar" title="Cerrar">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    <button class="tl-btn tl-minimize" aria-label="Minimizar" title="Minimizar">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 6H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    <button class="tl-btn tl-maximize" aria-label="Maximizar" title="Maximizar">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
  `;
  
  const closeBtn = container.querySelector('.tl-close');
  const minimizeBtn = container.querySelector('.tl-minimize');
  const maximizeBtn = container.querySelector('.tl-maximize');
  
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose?.();
  });
  
  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onMinimize?.();
  });
  
  maximizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onMaximize?.();
  });
  
  return {
    element: container,
    setActive(active) {
      container.classList.toggle('unfocused', !active);
    },
    destroy() {
      container.remove();
    }
  };
}

export const TrafficLightsStyles = `
.traffic-lights {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  pointer-events: none;
}

.traffic-lights.unfocused .tl-btn {
  opacity: 0.5;
}

.tl-btn {
  pointer-events: auto;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  background: var(--tl-bg);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 0 0 0.5px var(--tl-border);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 100ms ease, background 100ms ease;
  color: rgba(0,0,0,0.6);
}

.tl-btn:hover {
  transform: scale(1.15);
}

.tl-btn:active {
  transform: scale(0.95);
}

.tl-close { --tl-bg: #ff5f57; --tl-border: #e0443e; }
.tl-minimize { --tl-bg: #febc2e; --tl-border: #de931a; }
.tl-maximize { --tl-bg: #28ca42; --tl-border: #1aab29; }

.traffic-lights.unfocused .tl-close { --tl-bg: #c4c4c5; --tl-border: #a8a8a9; }
.traffic-lights.unfocused .tl-minimize { --tl-bg: #c4c4c5; --tl-border: #a8a8a9; }
.traffic-lights.unfocused .tl-maximize { --tl-bg: #c4c4c5; --tl-border: #a8a8a9; }
`;