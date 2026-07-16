import { persisted } from '../helpers/persisted.js';

const defaultPreferences = {
  theme: {
    scheme: 'dark',
    primaryColor: 'blue',
    accentColor: 'green'
  },
  dock: {
    autoHide: true,
    size: 56,
    magnification: true
  },
  windows: {
    animations: true,
    snapToEdges: true
  },
  reducedMotion: false
};

const preferences = persisted('axis:preferences', defaultPreferences);

const subscribers = new Set();

function notify() {
  subscribers.forEach(fn => fn(getState()));
}

function getState() {
  return preferences.getState();
}

function setState(partial) {
  const current = getState();
  const merged = deepMerge(current, partial);
  preferences.value = merged;
  notify();
  applyTheme(merged);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function applyTheme(prefs) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(prefs.theme.scheme);
  
  if (prefs.reducedMotion) {
    root.style.setProperty('--transition-duration', '0ms');
  } else {
    root.style.removeProperty('--transition-duration');
  }
}

function toggleTheme() {
  const current = getState();
  setState({ theme: { ...current.theme, scheme: current.theme.scheme === 'dark' ? 'light' : 'dark' } });
}

function setPrimaryColor(color) {
  const current = getState();
  setState({ theme: { ...current.theme, primaryColor: color } });
}

function setDockAutoHide(enabled) {
  const current = getState();
  setState({ dock: { ...current.dock, autoHide: enabled } });
}

function setReducedMotion(enabled) {
  setState({ reducedMotion: enabled });
}

function subscribe(fn) {
  subscribers.add(fn);
  fn(getState());
  return () => subscribers.delete(fn);
}

applyTheme(getState());

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
    setReducedMotion(e.matches);
  });
  
  window.PreferencesStore = {
    get state() { return getState(); },
    subscribe,
    toggleTheme,
    setPrimaryColor,
    setDockAutoHide,
    setReducedMotion,
    setState
  };
}

export const PreferencesStore = {
  get state() { return getState(); },
  subscribe,
  toggleTheme,
  setPrimaryColor,
  setDockAutoHide,
  setReducedMotion,
  setState
};