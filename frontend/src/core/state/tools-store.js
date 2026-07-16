import { persisted } from '../helpers/persisted.js';
import { TOOLS_CONFIG } from '../config/tools-config.js';

const toolIds = Object.keys(TOOLS_CONFIG);

const initialState = {
  open: {},
  active: null,
  zIndices: {},
  fullscreen: {},
  isBeingDragged: false,
  minimized: {},
  positions: {},
  sizes: {}
};

toolIds.forEach(id => {
  initialState.open[id] = false;
  initialState.zIndices[id] = 0;
  initialState.fullscreen[id] = false;
  initialState.minimized[id] = false;
  initialState.positions[id] = null;
  initialState.sizes[id] = null;
});

const persistedState = persisted('axis:tools-state', {
  open: {},
  active: null,
  zIndices: {},
  fullscreen: {},
  minimized: {},
  positions: {},
  sizes: {}
});

let activeZIndex = 100;
const subscribers = new Set();

function notify() {
  subscribers.forEach(fn => fn(getState()));
}

function getState() {
  const persisted = persistedState.getState();
  return {
    open: { ...initialState.open, ...persisted.open },
    active: persisted.active,
    zIndices: { ...initialState.zIndices, ...persisted.zIndices },
    fullscreen: { ...initialState.fullscreen, ...persisted.fullscreen },
    minimized: { ...initialState.minimized, ...persisted.minimized },
    positions: { ...initialState.positions, ...persisted.positions },
    sizes: { ...initialState.sizes, ...persisted.sizes },
    isBeingDragged: initialState.isBeingDragged
  };
}

function setState(partial) {
  const current = persistedState.getState();
  const merged = { ...current, ...partial };
  persistedState.value = merged;
  notify();
}

function focusTool(toolId) {
  if (!toolIds.includes(toolId)) return;
  activeZIndex++;
  setState({
    active: toolId,
    zIndices: { ...getState().zIndices, [toolId]: activeZIndex },
    open: { ...getState().open, [toolId]: true }
  });
}

function openTool(toolId) {
  if (!toolIds.includes(toolId)) return;
  focusTool(toolId);
}

function closeTool(toolId) {
  if (!toolIds.includes(toolId)) return;
  const state = getState();
  const newOpen = { ...state.open, [toolId]: false };
  const newFullscreen = { ...state.fullscreen, [toolId]: false };
  const newMinimized = { ...state.minimized, [toolId]: false };
  const newPositions = { ...state.positions };
  delete newPositions[toolId];
  const newSizes = { ...state.sizes };
  delete newSizes[toolId];
  let newActive = state.active;
  
  if (state.active === toolId) {
    const openTools = Object.entries(newOpen).filter(([k, v]) => v && k !== toolId);
    newActive = openTools.length > 0 ? openTools[openTools.length - 1][0] : null;
  }
  
  setState({ open: newOpen, fullscreen: newFullscreen, minimized: newMinimized, positions: newPositions, sizes: newSizes, active: newActive });
}

function toggleTool(toolId) {
  const state = getState();
  if (state.open[toolId]) closeTool(toolId);
  else openTool(toolId);
}

function toggleFullscreen(toolId) {
  if (!toolIds.includes(toolId)) return;
  const state = getState();
  const willMaximize = !state.fullscreen[toolId];
  setState({ fullscreen: { ...state.fullscreen, [toolId]: willMaximize } });
}

function setMinimized(toolId, minimized) {
  if (!toolIds.includes(toolId)) return;
  const state = getState();
  setState({ minimized: { ...state.minimized, [toolId]: minimized } });
}

function setPosition(toolId, { x, y }) {
  if (!toolIds.includes(toolId)) return;
  const state = getState();
  setState({ positions: { ...state.positions, [toolId]: { x, y } } });
}

function setSize(toolId, { width, height }) {
  if (!toolIds.includes(toolId)) return;
  const state = getState();
  setState({ sizes: { ...state.sizes, [toolId]: { width, height } } });
}

function setDragging(dragging) {
  initialState.isBeingDragged = dragging;
  notify();
}

function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function getToolConfig(toolId) {
  return TOOLS_CONFIG[toolId];
}

function getAllTools() {
  return TOOLS_CONFIG;
}

function getOpenTools() {
  return Object.entries(getState().open).filter(([, v]) => v).map(([k]) => k);
}

function tileWindows() {
  const state = getState();
  const openIds = Object.entries(state.open).filter(([, v]) => v).map(([k]) => k);
  if (openIds.length === 0) return;

  const topBarH = 40;
  const padding = 20;
  const gap = 12;
  const dockH = 100;
  const total = openIds.length;
  const cols = Math.min(total, Math.ceil(Math.sqrt(total)));
  const rows = Math.ceil(total / cols);

  const availW = window.innerWidth - padding * 2 - gap * (cols - 1);
  const availH = window.innerHeight - topBarH - dockH - padding * 2 - gap * (rows - 1);
  const cellW = Math.floor(availW / cols);
  const cellH = Math.floor(availH / rows);

  const newPositions = { ...state.positions };
  const newSizes = { ...state.sizes };

  openIds.forEach((id, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    newPositions[id] = { x: padding + col * (cellW + gap), y: topBarH + padding + row * (cellH + gap) };
    newSizes[id] = { width: cellW, height: cellH };
  });

  setState({ positions: newPositions, sizes: newSizes });
}

function cascadeWindows() {
  const state = getState();
  const openIds = Object.entries(state.open).filter(([, v]) => v).map(([k]) => k);
  if (openIds.length === 0) return;

  const baseX = 60;
  const baseY = 40;
  const step = 28;

  const newPositions = { ...state.positions };
  openIds.forEach((id, idx) => {
    newPositions[id] = { x: baseX + idx * step, y: baseY + idx * step };
  });

  setState({ positions: newPositions });
}

function closeAllWindows() {
  const state = getState();
  const openIds = Object.entries(state.open).filter(([, v]) => v).map(([k]) => k);
  openIds.forEach(id => closeTool(id));
}

export const ToolsStore = {
  get state() { return getState(); },
  subscribe,
  focusTool,
  openTool,
  closeTool,
  toggleTool,
  toggleFullscreen,
  setMinimized,
  setPosition,
  setSize,
  setDragging,
  getToolConfig,
  getAllTools,
  getOpenTools,
  tileWindows,
  cascadeWindows,
  closeAllWindows,
  toolIds
};

if (typeof window !== 'undefined') {
  window.ToolsStore = ToolsStore;
}