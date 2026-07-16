export function createToolConfig(overrides = {}) {
  return {
    title: overrides.title || 'Tool',
    resizable: overrides.resizable ?? true,
    expandable: overrides.expandable ?? false,
    width: overrides.width || 900,
    height: overrides.height || 650,
    minWidth: overrides.minWidth || 400,
    minHeight: overrides.minHeight || 300,
    shouldOpenWindow: overrides.shouldOpenWindow ?? true,
    externalAction: overrides.externalAction || null,
    dockBreaksBefore: overrides.dockBreaksBefore || false,
    icon: overrides.icon || 'shells',
    iconText: overrides.iconText || null,
    category: overrides.category || 'general',
    ...overrides
  };
}

export const TOOLS_CONFIG = {
  dashboard: createToolConfig({
    title: 'Dashboard',
    icon: 'dashboard',
    width: 1000,
    height: 700,
    category: 'main'
  }),
  
  chat: createToolConfig({
    title: 'Axis Chat',
    icon: 'chat',
    width: 900,
    height: 700,
    expandable: true,
    category: 'main'
  }),
  
  leads: createToolConfig({
    title: 'Lead Gen',
    icon: 'leads',
    width: 1100,
    height: 750,
    category: 'generate'
  }),
  
  scraping: createToolConfig({
    title: 'Scraping',
    icon: 'scraping',
    width: 950,
    height: 700,
    category: 'generate'
  }),
  
  crmKanban: createToolConfig({
    title: 'CRM Kanban',
    icon: 'crmkanban',
    width: 1200,
    height: 800,
    category: 'crm'
  }),
  
  crmTable: createToolConfig({
    title: 'CRM Tabla',
    icon: 'crmtable',
    width: 1100,
    height: 750,
    category: 'crm'
  }),
  
  crmStats: createToolConfig({
    title: 'CRM Métricas',
    icon: 'crmstats',
    width: 900,
    height: 700,
    category: 'crm'
  }),
  
  addkey: createToolConfig({
    title: 'API Keys',
    icon: 'addkey',
    width: 700,
    height: 600,
    resizable: false,
    category: 'config'
  }),
  
  shells: createToolConfig({
    title: 'Cloud Shells',
    icon: 'shells',
    width: 1000,
    height: 700,
    category: 'apps'
  }),
  
  storage: createToolConfig({
    title: 'Cloud Storage',
    icon: 'storage',
    width: 950,
    height: 750,
    category: 'apps'
  }),
  
  logs: createToolConfig({
    title: 'Logs',
    icon: 'logs',
    width: 900,
    height: 650,
    category: 'config'
  }),
  
  settings: createToolConfig({
    title: 'Settings',
    icon: 'settings',
    width: 800,
    height: 600,
    category: 'config'
  }),
  
  openpencil: createToolConfig({
    title: 'OpenPencil',
    icon: 'openpencil',
    width: 1200,
    height: 800,
    category: 'generate'
  }),
  
  openpencilChat: createToolConfig({
    title: 'OpenPencil Chat',
    icon: 'chat',
    width: 1000,
    height: 750,
    category: 'apps'
  }),
  
  content: createToolConfig({
    title: 'Content Factory',
    icon: 'content',
    width: 1000,
    height: 750,
    category: 'apps'
  }),
  
  outreach: createToolConfig({
    title: 'Outreach',
    icon: 'outreach',
    width: 950,
    height: 700,
    category: 'apps'
  }),

  autoconfig: createToolConfig({
    title: 'Auto-Config',
    icon: 'autoconfig',
    width: 700,
    height: 600,
    resizable: false,
    category: 'config'
  }),

  codegraf: createToolConfig({
    title: 'Codegraf',
    icon: 'codegraf',
    width: 1200,
    height: 800,
    category: 'main',
    externalAction: 'http://localhost:9749'
  }),

  builderbot: createToolConfig({
    title: 'BuilderBot',
    icon: 'builderbot',
    width: 1000,
    height: 750,
    category: 'generate'
  }),

  agency: createToolConfig({
    title: 'Agency Agents',
    icon: 'agency',
    width: 1000,
    height: 750,
    category: 'generate'
  }),

  n8n: createToolConfig({
    title: 'n8n',
    icon: 'n8n',
    width: 1200,
    height: 850,
    category: 'apps',
    externalAction: 'http://localhost:5678'
  }),

  calcom: createToolConfig({
    title: 'Cal.com',
    icon: 'calcom',
    width: 1000,
    height: 750,
    category: 'apps'
  }),

  obscura: createToolConfig({
    title: 'Obscura',
    icon: 'obscura',
    width: 1000,
    height: 750,
    category: 'generate',
    externalAction: 'http://localhost:9222'
  }),

  obsidian: createToolConfig({
    title: 'Obsidian',
    icon: 'obsidian',
    width: 950,
    height: 700,
    category: 'apps'
  }),

  daily: createToolConfig({
    title: 'Daily Workflow',
    icon: 'daily',
    width: 700,
    height: 500,
    category: 'main',
    shouldOpenWindow: false,
    externalAction: '/api/workflow/daily'
  })
};

export const TOOL_CATEGORIES = {
  main: { label: 'Principal', order: 0 },
  generate: { label: 'Generar', order: 1 },
  crm: { label: 'CRM', order: 2 },
  apps: { label: 'Aplicaciones', order: 3 },
  config: { label: 'Configuración', order: 4 }
};

export function getToolsByCategory() {
  const grouped = {};
  for (const [id, config] of Object.entries(TOOLS_CONFIG)) {
    if (!grouped[config.category]) grouped[config.category] = [];
    grouped[config.category].push({ id, ...config });
  }
  return grouped;
}

export function getDockTools() {
  return Object.entries(TOOLS_CONFIG)
    .filter(([, config]) => config.dockBreaksBefore || true)
    .sort((a, b) => {
      const catOrder = TOOL_CATEGORIES[a[1].category]?.order ?? 99;
      const catOrderB = TOOL_CATEGORIES[b[1].category]?.order ?? 99;
      if (catOrder !== catOrderB) return catOrder - catOrderB;
      return (a[1].dockBreaksBefore ? -1 : 0) - (b[1].dockBreaksBefore ? -1 : 0);
    });
}

export function getDockItemsByCategory() {
  const grouped = {};
  for (const [id, config] of Object.entries(TOOLS_CONFIG)) {
    if (!grouped[config.category]) grouped[config.category] = [];
    grouped[config.category].push({ id, ...config });
  }
  return grouped;
}