const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const cors = require('cors');
const crypto = require('crypto');

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason?.message || reason);
});

// ─── Environment detection ───
const IS_WIN = process.platform === 'win32';
const IS_WSL = !IS_WIN && fs.existsSync('/mnt/c/');
const HOME_DIR = (IS_WIN ? process.env.USERPROFILE : (IS_WSL ? '/home/lissette' : process.env.HOME)).replace(/\\/g, '/');
const CONFIG_DIR = (process.env.AXIS_CONFIG_DIR || path.join(HOME_DIR, '.config')).replace(/\\/g, '/');
const HERMES_DIR = (process.env.AXIS_HERMES_DIR || path.join(HOME_DIR, '.hermes')).replace(/\\/g, '/');

const PORT = parseInt(process.env.AXIS_PORT || '3030');
const HOST = process.env.AXIS_HOST || '0.0.0.0';
const AUTH_TOKEN = process.env.AXIS_AUTH_TOKEN || '';

let HERMES_API_KEY = process.env.HERMES_API_KEY || '';
try {
  const hermesEnvPath = path.join(HERMES_DIR, '.env');
  if (fs.existsSync(hermesEnvPath)) {
    const envContent = fs.readFileSync(hermesEnvPath, 'utf8');
    const match = envContent.match(/API_SERVER_KEY\s*=\s*(.*)/);
    if (match && match[1]) {
      HERMES_API_KEY = match[1].trim();
      console.log('[Setup] Token de Hermes cargado dinámicamente desde .hermes/.env');
    }
  }
} catch (e) {
  console.log('[Setup] No se pudo leer .hermes/.env para extraer el token:', e.message);
}

if (!process.env.AXIS_AUTH_TOKEN) {
  console.log('[Auth] AVISO: AXIS_AUTH_TOKEN no definido — acceso sin autenticación');
}

// ─── Paths ───
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(CONFIG_DIR);

const KEYS_FILE = path.join(CONFIG_DIR, 'api_keys.json');
const STATE_FILE = path.join(CONFIG_DIR, 'api_rotation_state.json');
const ROTATION_LOG = path.join(CONFIG_DIR, 'api_rotation.log');
const GATEWAY_LOG = path.join(HERMES_DIR, 'logs', 'gateway.log');
const REGISTERED_NODES_FILE = path.join(CONFIG_DIR, 'registered_nodes.json');
const B2_ACCOUNTS_FILE = path.join(CONFIG_DIR, 'b2_accounts.json');
const OPENPENCIL_LOCAL_DIR = path.join(HOME_DIR, 'odysseus', 'data', 'personal_docs', 'open-pencil-local');
const LEADS_JSON = path.join(CONFIG_DIR, 'leads.json');

// ─── Agent logs path ───
const AGENT_LOGS_DIR = path.join(__dirname, '..', 'logs', 'agents');
ensureDir(AGENT_LOGS_DIR);

// ─── AxisChat memory path ───
const AXISCHAT_MEMORY_FILE = path.join(__dirname, '..', 'axischatmemory.md');

// ─── System prompt instruction for agents about self-modification ───
const AXISCHAT_MEMORY_INSTRUCTION = (
  '[System: If the user asks you to modify the AxisPanel UI, the chat interface, or any part of this interface, ' +
  'first fetch GET /api/memory/axischat to understand the full codebase structure. ' +
  'The chat bubbles you see are rendered by frontend/src/modules/axischat/Chat.svelte — a Svelte component whose source code can be read and modified. ' +
  'You can also execute system commands by calling POST /api/shell/exec with { command: "..." }.]\n\n'
);

// ─── Bootstrap config files ───
const initialKeysPath = path.join(__dirname, '..', 'config', 'api_keys_initial.json');
if (!fs.existsSync(KEYS_FILE) && fs.existsSync(initialKeysPath)) {
  fs.copyFileSync(initialKeysPath, KEYS_FILE);
  console.log('[Setup] Copiado api_keys_initial.json a', KEYS_FILE);
}
const initialStatePath = path.join(__dirname, '..', 'config', 'api_rotation_state_initial.json');
if (!fs.existsSync(STATE_FILE) && fs.existsSync(initialStatePath)) {
  fs.copyFileSync(initialStatePath, STATE_FILE);
  console.log('[Setup] Copiado api_rotation_state_initial.json a', STATE_FILE);
}
if (!fs.existsSync(ROTATION_LOG)) fs.writeFileSync(ROTATION_LOG, '');

// ─── WSL path conversion ───
function toWSLPath(winPath) {
  if (!IS_WIN) return winPath;
  const absolute = path.resolve(winPath);
  return absolute.replace(/^([A-Za-z]):\\?/, (_, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/');
}

// ─── Rate limiting ───
let rateLimit;
try { rateLimit = require('express-rate-limit'); } catch { rateLimit = null; }

function createRateLimit(windowMs, max) {
  if (!rateLimit) return (req, res, next) => next();
  return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false });
}

const apiLimiter = createRateLimit(1 * 60 * 1000, 600);
const authLimiter = createRateLimit(15 * 60 * 1000, 200);

// ─── App setup ───
const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: [/^http:\/\/localhost/, /^http:\/\/127\.0\.0\.1/] }));
app.use(express.json({ limit: '10mb' }));
app.get('/crm', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'crm.html')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API Counter ───
const apiCounter = { total: 0, byRoute: {} };
function countAPI(req, res, next) {
  const route = req.method + ' ' + req.path;
  apiCounter.total++;
  apiCounter.byRoute[route] = (apiCounter.byRoute[route] || 0) + 1;
  next();
}
app.use('/api', countAPI);

app.get('/api/counter', (req, res) => {
  res.json({
    total: apiCounter.total,
    byRoute: Object.entries(apiCounter.byRoute)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([route, count]) => ({ route, count }))
  });
});

// ─── Auth middleware ───
let firebaseAdmin;
try {
  firebaseAdmin = require('firebase-admin');
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saPath && fs.existsSync(saPath)) {
    firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(saPath) });
    console.log('[Auth] Firebase Admin inicializado con service account');
  } else {
    firebaseAdmin.initializeApp({ projectId: 'hermes-cluster' });
    console.log('[Auth] Firebase Admin (ADC) — verifyIdToken disponible');
  }
} catch {
  firebaseAdmin = null;
  console.log('[Auth] Firebase Admin no disponible — usando token compartido');
}

app.use((req, res, next) => {
  const isPublic = req.path === '/' || req.path.startsWith('/css') || req.path.startsWith('/js') || req.path.startsWith('/api/hermes') || req.path.startsWith('/api/mcp/openpencil') || req.path.startsWith('/v1') || req.path.startsWith('/assets') || req.path.startsWith('/api/chat');
  if (isPublic) return next();
  if (req.path === '/api/providers' || req.path === '/api/pending' || req.path === '/api/scrape/categories' || req.path.startsWith('/api/crm') || req.path === '/api/rotate' || req.path === '/api/status' || req.path.startsWith('/api/keys') || req.path.startsWith('/api/logs') || req.path === '/api/b2/accounts' || req.path === '/api/docker/status' || req.path === '/api/openclaw/status' || req.path === '/api/agents' || req.path.startsWith('/api/agents/') || req.path.startsWith('/api/logs/agent/') || req.path === '/api/health/check' || req.path === '/api/health/fix' || req.path === '/api/counter' || req.path === '/api/ip' || req.path.startsWith('/api/cbm/') || req.path === '/api/skills/exec' || req.path.startsWith('/api/builderbot/') || req.path.startsWith('/api/agency/') || req.path.startsWith('/api/n8n/') || req.path.startsWith('/api/obscura/') || req.path.startsWith('/api/calcom/') || req.path.startsWith('/api/codex/') || req.path.startsWith('/api/obsidian/') || req.path.startsWith('/api/outreach/') || req.path.startsWith('/api/telegram/') || req.path.startsWith('/api/whatsapp/') || req.path.startsWith('/api/channels') || req.path.startsWith('/api/inbox') || req.path.startsWith('/api/calification/') || req.path.startsWith('/api/appointments/') || req.path === '/api/agendar') return next();

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-axis-token'];
  if (!token) {
    return res.status(401).json({ error: 'Token requerido. Envía x-axis-token o Authorization: Bearer <token>' });
  }

  if (firebaseAdmin && token.length > 100) {
    firebaseAdmin.auth().verifyIdToken(token).then((decoded) => {
      req.user = decoded;
      next();
    }).catch(() => res.status(403).json({ error: 'Token inválido' }));
  } else {
    if (token === AUTH_TOKEN) {
      req.user = { uid: 'api_token', email: 'api@axis.local' };
      next();
    } else {
      res.status(403).json({ error: 'Acceso denegado' });
    }
  }
});

// ─── Shell command safety ───
function sanitizeShellInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[;&|`$!#~<>*?'"(){}[\]\\^]/g, '').trim();
}

function isDangerousCommand(cmd) {
  const lower = cmd.toLowerCase();
  const blocked = ['invoke-expression', 'iex', 'invoke-command', 'icm', 'new-object',
    'downloadstring', 'downloadfile', 'start-process', 'rm -rf', 'rmdir /s',
    'format ', 'del /s', 'Remove-Item -Recurse', 'Set-ExecutionPolicy'];
  return blocked.some(b => lower.includes(b));
}

function execSafe(cmd, opts = {}) {
  const safe = sanitizeShellInput(cmd);
  if (!safe) throw new Error('Comando vacío o inválido');
  return execSync(safe, { encoding: 'utf8', timeout: opts.timeout || 15000, ...opts });
}

// ─── Shell Execution ───
app.post('/api/shell/exec', apiLimiter, async (req, res) => {
  const { command, timeout = 30000, capture } = req.body;
  if (!command || typeof command !== 'string') return res.status(400).json({ error: 'command string required' });
  try {
    const shell = IS_WIN ? 'powershell' : 'bash';
    const shellArgs = IS_WIN ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
    const child = spawn(shell, shellArgs, {
      windowsHide: true,
      timeout,
      env: { ...process.env },
      cwd: HOME_DIR,
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const exitCode = await new Promise((resolve) => {
      child.on('close', resolve);
      child.on('error', (err) => { stderr += err.message; resolve(-1); });
    });
    if (!capture) {
      res.json({ stdout, stderr, exitCode });
    } else {
      res.json({ stdout: stdout.slice(-capture), stderr: stderr.slice(-capture), exitCode, truncated: stdout.length > capture });
    }
  } catch (e) {
    res.status(500).json({ error: e.message, stdout: '', stderr: '', exitCode: -1 });
  }
});

// ─── Memory File ───
app.get('/api/memory/axischat', (req, res) => {
  try {
    if (!fs.existsSync(AXISCHAT_MEMORY_FILE)) return res.status(404).json({ error: 'Memory file not found' });
    const content = fs.readFileSync(AXISCHAT_MEMORY_FILE, 'utf8');
    res.type('text/markdown').send(content);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Leads Scraper ───
let leadsDB = { leads: [], nextId: 1 };
let scraperModule;
try { scraperModule = require('./scrapers/gmaps.js'); } catch { scraperModule = null; }
const {
  loadDB, saveDB, runFullScrape, getLeads, getLeadStats,
  updateLeadStatus, scrapeCategory, CATEGORIES_SANTIAGO,
  getMachineIP, enrichWithIP, queryIPIO
} = scraperModule || {};

let gosom;
try { gosom = require('./scrapers/gmaps_gosom.js'); } catch { gosom = null; }

let telegramScraper;
try { telegramScraper = require('./scrapers/telegram.js'); } catch { telegramScraper = null; }

let whatsappScraper;
try { whatsappScraper = require('./scrapers/whatsapp.js'); } catch { whatsappScraper = null; }

if (loadDB) {
  (async () => {
    try {
      leadsDB = await loadDB();
      console.log('[Leads] DB cargada:', leadsDB.leads.length, 'leads');
    } catch (e) { console.error('[Leads] Error loading DB:', e.message); }
  })();
}

async function reloadLeadsDB() { if (loadDB) leadsDB = await loadDB(); }

// ─── Cloudflare ───
async function crearSubdominio(nombreUsuario, ipDestino) {
  const ZONE_ID = process.env.CF_ZONE_ID || 'TU_ZONE_ID_AQUI';
  const API_TOKEN = process.env.CF_API_TOKEN || 'TU_API_TOKEN_AQUI';
  const DOMINIO_PRINCIPAL = process.env.CF_DOMAIN || 'tudominio.com';
  if (!process.env.CF_ZONE_ID) return null;
  const subdominio = `${nombreUsuario}.${DOMINIO_PRINCIPAL}`;
  const url = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`;
  const data = { type: 'A', name: subdominio, content: ipDestino === '::1' || ipDestino === '127.0.0.1' ? '8.8.8.8' : ipDestino, ttl: 1, proxied: true };
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (result.success) { console.log(`[Cloudflare] Subdominio creado: ${subdominio}`); return subdominio; }
    console.error('[Cloudflare] Error:', result.errors); return null;
  } catch (error) { console.error('[Cloudflare] Error de red:', error.message); return null; }
}

// ─── Provider catalog ───
const PROVIDERS = {
  nvidia: { name: 'NVIDIA', url: 'https://build.nvidia.com/api-key', prefix: 'nvapi-', models: ['meta/llama-3.3-70b-instruct', 'google/gemma-3-27b-it', 'deepseek-ai/deepseek-r1'] },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/settings/keys', prefix: 'sk-or-', models: ['anthropic/claude-sonnet-4', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct'] },
  google: { name: 'Google AI', url: 'https://aistudio.google.com/apikey', prefix: 'AIzaSy', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  deepseek: { name: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys', prefix: 'sk-', models: ['deepseek-chat', 'deepseek-reasoner'] },
  xai: { name: 'xAI', url: 'https://console.x.ai/', prefix: 'xai-', models: ['grok-3', 'grok-3-mini', 'grok-3-vision'] },
  opencode: { name: 'OpenCode Zen', url: 'https://opencode.ai/zen', prefix: '', models: ['deepseek-v4-flash-free', 'hermes-agent'] },
  mistral: { name: 'Mistral', url: 'https://console.mistral.ai/api-keys', prefix: '', models: ['mistral-large-latest', 'mistral-medium-latest', 'codestral-latest'] },
  groq: { name: 'Groq', url: 'https://console.groq.com/keys', prefix: 'gsk_', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
  cerebras: { name: 'Cerebras', url: 'https://cloud.cerebras.ai/', prefix: 'csk-', models: ['llama-3.3-70b', 'llama-3.1-8b'] },
  openai: { name: 'OpenAI', url: 'https://platform.openai.com/api-keys', prefix: 'sk-proj-', models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  anthropic: { name: 'Anthropic', url: 'https://console.anthropic.com/settings/keys', prefix: 'sk-ant-', models: ['claude-sonnet-4', 'claude-3-5-sonnet-latest'] },
  backblaze: { name: 'Backblaze B2', url: 'https://secure.backblaze.com/app_keys.htm', prefix: 'b2-', models: ['storage'] },
  mimo: { name: 'Xiaomi MiMo', url: 'https://platform.xiaomimimo.com', prefix: '', models: ['mimo-v2.5-pro', 'mimo-v2.5'] }
};

const PROVIDER_URLS = {
  nvidia: 'https://integrate.api.nvidia.com/v1', openrouter: 'https://openrouter.ai/api/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai', mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1', cerebras: 'https://api.cerebras.ai/v1',
  deepseek: 'https://api.deepseek.com/v1', xai: 'https://api.x.ai/v1',
  opencode: 'https://opencode.ai/zen/v1', openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  mimo: 'https://api.xiaomimimo.com/v1'
};

const PROVIDER_MODELS = {
  nvidia: 'meta/llama-3.3-70b-instruct', openrouter: 'anthropic/claude-sonnet-4',
  google: 'gemini-2.5-flash', mistral: 'mistral-large-latest',
  groq: 'llama-3.3-70b-versatile', cerebras: 'llama-3.3-70b',
  deepseek: 'deepseek-chat', xai: 'grok-3',
  opencode: 'deepseek-v4-flash-free', openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4',
  mimo: 'mimo-v2.5-pro'
};

// ─── File ops ───
function readFromFile(filepath) {
  try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); }
  catch (error) { throw new Error(`No se pudo leer ${filepath}: ${error.message}`); }
}
function writeToFile(filepath, data) {
  try { fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8'); }
  catch (error) { throw new Error(`No se pudo escribir ${filepath}: ${error.message}`); }
}
function readLog(filepath, lines = 100) {
  try {
    if (!fs.existsSync(filepath)) return '';
    return fs.readFileSync(filepath, 'utf8').split(/\r?\n/).slice(-lines).join('\n').trim();
  } catch { return ''; }
}

function detectProvider(key) {
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    if (provider.prefix && key.startsWith(provider.prefix)) return id;
  }
  if (/^[a-zA-Z0-9]{32,34}$/.test(key)) return 'mistral';
  return null;
}

function getActiveConfig() {
  try {
    const keysData = readFromFile(KEYS_FILE);
    const provider = keysData.current_provider;
    const keyIndex = keysData.current_key_index || 0;
    const keys = keysData.providers[provider]?.keys || [];
    return { provider, key: keys[keyIndex] || keys[0] || '', keysData };
  } catch { return { provider: null, key: null, keysData: null }; }
}

// ─── CRM Database init ───
const crmModule = require('./modules/crm-db.js');
const { initDB, migrateFromJson, createLead, getLeadBySourceId } = crmModule;
const crmDb = initDB(CONFIG_DIR);
const migrated = migrateFromJson(crmDb, LEADS_JSON);
if (migrated > 0) console.log(`[CRM] ${migrated} leads importados`);
if (telegramScraper && telegramScraper.setDb) telegramScraper.setDb(crmDb);
const { createCRMRoutes } = require('./modules/crm-routes.js');
createCRMRoutes(app, crmDb, authLimiter, apiLimiter);

// ─── Sync scraped leads to CRM SQLite ───
function syncLeadsToCRM(source, category) {
  let synced = 0;
  for (const lead of leadsDB.leads) {
    if (source && lead.source !== source) continue;
    if (category && lead.category !== category) continue;
    if (!lead.source_id) continue;
    const existing = getLeadBySourceId(crmDb, lead.source, lead.source_id);
    if (!existing) {
      try {
        createLead(crmDb, {
          source: lead.source,
          source_id: lead.source_id,
          name: lead.name,
          category: lead.category,
          address: lead.address,
          phone: lead.phone,
          email: lead.email,
          website: lead.website,
          instagram: lead.instagram,
          facebook: lead.facebook,
          rating: lead.rating,
          reviews_count: lead.reviews_count,
          lat: lead.lat,
          lng: lead.lng,
          place_id: lead.place_id,
          types: lead.types,
          opening_hours: lead.opening_hours,
          score: lead.score,
          stage: lead.status || 'new',
          tags: lead.tags,
          city: lead.city,
          notes: lead.notes,
        });
        synced++;
      } catch (e) {
        console.error('[CRM] Error syncing lead:', lead.name, e.message);
      }
    }
  }
  if (synced > 0) console.log(`[CRM] ${synced} leads sincronizados desde scraper`);
  return synced;
}

// ─── ENDPOINTS ───

app.get('/api/pending', (req, res) => {
  const tasks = [];
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      for (const [id, p] of Object.entries(cfg.providers || {})) {
        for (const k of p.keys || []) {
          if (k.includes('REEMPLAZA')) {
            tasks.push({ type: 'security', severity: 'high', message: `API keys de ${id} son placeholders — rotar desde Google Cloud Console` });
            break;
          }
        }
        const keyDetails = p.key_details || [];
        for (const d of keyDetails) {
          if ((d.email || '').includes('newen7909')) {
            tasks.push({ type: 'security', severity: 'high', message: 'Las API keys de Google expuestas en el repo necesitan rotación urgente' });
            break;
          }
        }
      }
    }
    if (!process.env.CF_ZONE_ID || process.env.CF_ZONE_ID === 'TU_ZONE_ID_AQUI') {
      tasks.push({ type: 'config', severity: 'medium', message: 'Cloudflare no configurado — subdominios no se crearán' });
    }
  } catch {}
  res.json({ tasks, total: tasks.length });
});

app.get('/api/providers', (req, res) => { res.json(PROVIDERS); });

app.get('/api/keys', (req, res) => {
  try { res.json(readFromFile(KEYS_FILE)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/status', apiLimiter, (req, res) => {
  try {
    const keysData = readFromFile(KEYS_FILE);
    const stateData = readFromFile(STATE_FILE);
    const cbmInstalled = fs.existsSync(CBM_BIN);
    const cbmIndexed = fs.existsSync(path.join(HOME_DIR, '.local', 'share', 'codebase-memory-mcp', 'index', 'C__AxisPanel'));
    res.json({
      providers: keysData.providers, current_provider: keysData.current_provider,
      current_key_index: keysData.current_key_index, last_rotate: stateData.last_rotate,
      rotation_count: stateData.rotation_count, provider_index: stateData.provider_index,
      key_index: stateData.key_index,
      cbm: { installed: cbmInstalled, indexed: cbmIndexed, port: 9749 }
    });
  } catch (error) { res.status(500).json({ error: 'No se pudieron leer los archivos: ' + error.message }); }
});

app.get('/api/logs/rotation', apiLimiter, (req, res) => {
  res.type('text/plain').send(readLog(ROTATION_LOG, parseInt(req.query.lines) || 80));
});
app.get('/api/logs/gateway', apiLimiter, (req, res) => {
  res.type('text/plain').send(readLog(GATEWAY_LOG, parseInt(req.query.lines) || 80));
});

app.post('/api/rotate', authLimiter, (req, res) => {
  try {
    const scriptPath = path.join(HERMES_DIR, 'skills', 'cloud-automation', 'api-rotation', 'auto_rotate.py');
    if (!fs.existsSync(scriptPath)) return res.status(400).json({ error: 'Script de rotación no encontrado' });
    const pyCmd = IS_WIN ? 'python' : 'python3';
    const result = execSafe(`"${pyCmd}" "${scriptPath}" force`, { timeout: 15000 });
    res.json({ success: true, output: result.trim() });
  } catch (error) { res.status(500).json({ error: 'Error al rotar: ' + error.message }); }
});

app.post('/api/keys', authLimiter, (req, res) => {
  try {
    const { key, provider: providerId, email, model } = req.body;
    if (!key || !providerId) return res.status(400).json({ error: 'Falta key o provider' });
    let resolvedProvider = providerId;
    if (providerId === 'auto') {
      const detected = detectProvider(key);
      if (!detected) return res.status(400).json({ error: 'No se pudo detectar el provider.' });
      resolvedProvider = detected;
    }
    const keysData = readFromFile(KEYS_FILE);
    if (!keysData.providers[resolvedProvider]) {
      keysData.providers[resolvedProvider] = {
        env_var: `${resolvedProvider.toUpperCase()}_API_KEY`, prefix: PROVIDERS[resolvedProvider]?.prefix || '',
        keys: [], tokens_limit: 5000000, threshold_pct: 80, tokens_used: {}
      };
    }
    const existingKeys = keysData.providers[resolvedProvider].keys || [];
    if (existingKeys.includes(key)) return res.status(400).json({ error: 'Esta key ya existe' });
    existingKeys.push(key);
    keysData.providers[resolvedProvider].keys = existingKeys;
    if (!keysData.providers[resolvedProvider].key_details) keysData.providers[resolvedProvider].key_details = [];
    keysData.providers[resolvedProvider].key_details.push({
      key: key.substring(0, 8) + '...' + key.substring(key.length - 4),
      email: email || '', model: model || PROVIDERS[resolvedProvider]?.models[0] || '',
      added: new Date().toISOString().split('T')[0], full_key_index: existingKeys.length - 1
    });
    writeToFile(KEYS_FILE, keysData);
    res.json({ success: true, message: `Key de ${PROVIDERS[resolvedProvider]?.name || resolvedProvider} agregada`, provider: resolvedProvider, total_keys: existingKeys.length });
  } catch (error) { res.status(500).json({ error: 'Error al agregar key: ' + error.message }); }
});

app.delete('/api/keys/:provider/:index', authLimiter, (req, res) => {
  try {
    const { provider, index } = req.params;
    const idx = parseInt(index);
    const keysData = readFromFile(KEYS_FILE);
    if (!keysData.providers[provider]) return res.status(404).json({ error: 'Provider no encontrado' });
    const keys = keysData.providers[provider].keys;
    if (idx < 0 || idx >= keys.length) return res.status(400).json({ error: 'Índice inválido' });
    keys.splice(idx, 1);
    if (keysData.providers[provider].key_details) keysData.providers[provider].key_details.splice(idx, 1);
    if (keysData.current_provider === provider && keysData.current_key_index >= keys.length) keysData.current_key_index = 0;
    writeToFile(KEYS_FILE, keysData);
    res.json({ success: true, message: `Key ${idx} de ${provider} eliminada`, remaining_keys: keys.length });
  } catch (error) { res.status(500).json({ error: 'Error al eliminar key: ' + error.message }); }
});

// ─── Legacy endpoint (backward compat) ───
app.post('/api/hermes/chat', async (req, res) => {
  const { messages, session_id } = req.body;
  const msg = Array.isArray(messages) ? messages.map(m => m.content).filter(Boolean).join('\n') : 'hola';
  const result = await chatWithHermes(msg, session_id, 60000);
  if (result.ok) return res.json({ choices: [{ message: { content: result.reply } }] });
  return res.status(502).json({ error: result.error });
});

// ─── Helper: chat unificado contra cualquier provider ───
async function chatWithProvider({ url, key, model, message, headers: extraHeaders = {}, timeoutMs = 30000 }) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  Object.assign(headers, extraHeaders);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: message }], stream: false, max_tokens: 1000 }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${errText.slice(0, 200)}` };
    }
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '(sin respuesta)';
    const sid = response.headers.get('X-Hermes-Session-Id');
    return { ok: true, reply, session_id: sid };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.message };
  }
}

async function chatWithHermes(message, session_id, timeoutMs = 30000) {
  const extraHeaders = session_id ? { 'X-Hermes-Session-Id': session_id } : {};
  return chatWithProvider({
    url: 'http://localhost:8642/v1',
    key: HERMES_API_KEY,
    model: 'hermes-agent',
    message, headers: extraHeaders, timeoutMs
  });
}

// ─── Agent logging ───
function logAgentActivity(agent, message) {
  try {
    const logFile = path.join(AGENT_LOGS_DIR, `${agent}.log`);
    const ts = new Date().toISOString();
    fs.appendFileSync(logFile, `[${ts}] ${message}\n`);
  } catch (e) { console.error(`[AgentLog/${agent}] Error:`, e.message); }
}

function readAgentLog(agent, lines = 100) {
  try {
    const logFile = path.join(AGENT_LOGS_DIR, `${agent}.log`);
    if (!fs.existsSync(logFile)) return '';
    return fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-lines).join('\n').trim();
  } catch { return ''; }
}

// ─── Helper: chat contra config de agente específico ───
async function chatWithAgent(agentName, message) {
  try {
    const keysData = readFromFile(KEYS_FILE);
    const agents = keysData.agents || {};
    const agentCfg = agents[agentName];
    if (!agentCfg) return { ok: false, error: `Agente '${agentName}' no configurado` };

    const provider = agentCfg.provider;
    const model = agentCfg.model || PROVIDER_MODELS[provider] || 'unknown';
    const agentKeys = (agentCfg.keys || []).filter(k => k && !k.includes('REEMPLAZA'));
    const key = agentKeys[0];

    if (!key || !PROVIDER_URLS[provider]) {
      return { ok: false, error: `Agente '${agentName}': sin key o URL para provider '${provider}'` };
    }

    const result = await chatWithProvider({
      url: PROVIDER_URLS[provider],
      key, model, message
    });
    if (result.ok) logAgentActivity(agentName, `Chat: "${message.slice(0, 80)}..." → "${result.reply.slice(0, 80)}..."`);
    return { ...result, from_provider: provider };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Helper: chat contra rotación de APIs ───
async function chatWithRotation(providerId, message) {
  try {
    const keysData = readFromFile(KEYS_FILE);
    const keysDataProviders = keysData.providers || {};
    const pId = providerId === 'gemini' ? 'google' : providerId;
    const currentProvider = keysData.current_provider || 'google';
    const activeProvider = keysDataProviders[pId]?.keys?.length ? pId : currentProvider;
    const providerCfg = keysDataProviders[activeProvider];
    const activeKeys = (providerCfg?.keys || []).filter(k => k && !k.includes('REEMPLAZA'));
    if (!activeKeys.length) return { ok: false, error: `Sin keys para ${activeProvider}` };

    const idx = keysData.current_key_index || 0;
    const key = activeKeys[idx] || activeKeys[0];
    const url = PROVIDER_URLS[activeProvider];
    const model = PROVIDER_MODELS[activeProvider];

    const result = await chatWithProvider({ url, key, model, message });
    return { ...result, from_provider: activeProvider };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── AxisChat uses Gemini Flash (free/cheap) ───
async function chatWithAxisChat(message) {
  try {
    const keysData = readFromFile(KEYS_FILE);
    // 1. Intentar Google Gemini directo (free tier)
    const googleKey = keysData.providers?.google?.keys?.[0];
    if (googleKey) {
      try {
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': googleKey },
          body: JSON.stringify({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: message }], stream: false, max_tokens: 1000 }),
          signal: AbortSignal.timeout(15000)
        });
        if (resp.ok) {
          const data = await resp.json();
          const reply = data.choices?.[0]?.message?.content || '(sin respuesta)';
          return { ok: true, reply, from_provider: 'gemini-flash' };
        }
      } catch {}
    }
    // 2. Fallback OpenRouter
    const openrouterKey = keysData.providers?.openrouter?.keys?.[0];
    if (!openrouterKey) return { ok: false, error: 'Sin API keys disponibles' };
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openrouterKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: message }],
        stream: false, max_tokens: 500
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
      return { ok: false, error: `Gemini Flash: HTTP ${response.status}` };
    }
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '(sin respuesta)';
    return { ok: true, reply, from_provider: 'gemini-flash' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Multi-Agent Chat Endpoints ───
app.post('/api/chat/:agent', async (req, res) => {
  const { agent } = req.params;
  const { message: rawMessage, session_id } = req.body;
  if (!rawMessage) return res.status(400).json({ error: 'Mensaje requerido' });

  const message = agent !== 'chatgeneral'
    ? AXISCHAT_MEMORY_INSTRUCTION + rawMessage
    : rawMessage;

  // 1. Hermes — intenta gateway local, fallback a rotación
  if (agent === 'hermes') {
    const result = await chatWithHermes(message, session_id, 30000);
    if (result.ok) return res.json({ reply: result.reply, session_id: result.session_id });
    console.log('[Chat] Hermes gateway falló, fallback a proveedor activo:', result.error);
    const fallback = await chatWithRotation('chatgeneral', message);
    if (fallback.ok) return res.json({ reply: `[Hermes offline → ${fallback.from_provider}]\n${fallback.reply}` });
    return res.status(502).json({ error: `Hermes: ${result.error} | Rotación: ${fallback.error}` });
  }

  // 2. OpenClaw — intenta gateway local, fallback a rotación
  if (agent === 'openclaw') {
    try {
      let openclawToken = process.env.OPENCLAW_TOKEN || '';
      try {
        const ocfg = readFromFile(path.join(HOME_DIR, '.openclaw', 'openclaw.json'));
        if (ocfg?.gateway?.auth?.token) openclawToken = ocfg.gateway.auth.token;
      } catch {}
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openclawToken}` };
      const response = await fetch('http://localhost:18789/v1/chat/completions', {
        method: 'POST', headers,
        body: JSON.stringify({ model: 'openclaw-agent', messages: [{ role: 'user', content: message }], stream: false }),
        signal: AbortSignal.timeout(15000)
      });
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '(sin respuesta)';
      return res.json({ reply });
    } catch (e) {
      console.log('[Chat] OpenClaw no disponible, fallback a rotación:', e.message);
    }
    const fallback = await chatWithRotation('chatgeneral', message);
    if (fallback.ok) return res.json({ reply: `[OpenClaw offline → ${fallback.from_provider}]\n${fallback.reply}` });
    return res.status(502).json({ error: `OpenClaw no disponible y rotación falló: ${fallback.error}` });
  }

  // 3. Caso Antigravity (agy)
  if (agent === 'agy' || agent === 'antigravity') {
    try {
      const agyPath = path.join(HOME_DIR, 'AppData', 'Local', 'agy', 'bin', 'agy.exe');
      if (!fs.existsSync(agyPath)) {
        console.log('[Chat/agy] agy.exe no encontrado en:', agyPath);
        return res.status(404).json({ error: 'Ejecutable agy.exe no encontrado en la ruta esperada' });
      }

      console.log('[Chat/agy] Ejecutando:', agyPath, '--print --print-timeout 110s');
      const child = spawn(agyPath, ['--print', '--print-timeout', '110s', message], {
        windowsHide: true,
        env: { ...process.env },
        cwd: HOME_DIR,
      });
      let stdout = '';
      let stderr = '';
      let responded = false;

      const timer = setTimeout(() => {
        console.log('[Chat/agy] Timeout de 120s alcanzado, matando proceso');
        child.kill();
      }, 120000);

      const sendResponse = (statusCode, body) => {
        if (responded) return;
        responded = true;
        clearTimeout(timer);
        res.status(statusCode).json(body);
      };

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('error', (err) => {
        console.error('[Chat/agy] Spawn error:', err.message);
        sendResponse(502, { error: `Error al ejecutar agy.exe: ${err.message}` });
      });

      child.on('close', (code) => {
        console.log(`[Chat/agy] Proceso terminó con código ${code}, stdout=${stdout.length}bytes, stderr=${stderr.length}bytes`);
        if (code === 0) {
          sendResponse(200, { reply: stdout.trim() || '(sin respuesta)', session_id: null });
        } else {
          const errMsg = stderr.trim() || stdout.trim() || 'Proceso terminó sin salida';
          sendResponse(502, { error: `Antigravity error (exit code ${code}): ${errMsg}` });
        }
      });
      return;
    } catch (e) {
      console.error('[Chat/agy] Excepción:', e.message);
      return res.status(502).json({ error: 'Error ejecutando Antigravity: ' + e.message });
    }
  }

  // 3.5. Freebuff → ejecuta comandos freebuff CLI directamente (usa rawMessage, sin instrucciones de memoria)
  if (agent === 'freebuff') {
    const agentLogName = 'freebuff';
    logAgentActivity(agentLogName, `Consulta: "${rawMessage.slice(0, 120)}..."`);

    try {
      const child = spawn('freebuff', ['--cwd', HOME_DIR, rawMessage], {
        windowsHide: true,
        timeout: 120000,
        shell: true
      });
      let out = '';
      child.stdout.on('data', d => { out += d.toString(); });
      child.stderr.on('data', d => { out += d.toString(); });
      const code = await new Promise(resolve => {
        child.on('close', resolve);
        child.on('error', (err) => { out += err.message; resolve(-1); });
      });
      logAgentActivity(agentLogName, `Freebuff exit ${code}: "${out.slice(0, 200)}"`);
      return res.json({ reply: out.slice(0, 3000) || `(exit ${code})`, via: 'freebuff' });
    } catch (e) {
      logAgentActivity(agentLogName, `Error: ${e.message}`);
      return res.status(502).json({ error: `Freebuff error: ${e.message}` });
    }
  }

  // 4. AxisChat → multi-agente estilo Codebuff, fallback a rotación
  if (agent === 'axischat') {
    const agentLogName = 'axischat';
    logAgentActivity(agentLogName, `Consulta: "${message.slice(0, 120)}..."`);

    // Detectar si es comando freebuff
    const fbMatch = message.match(/^!freebuff\s+(.+)/i);
    if (fbMatch) {
      try {
        const fbCmd = fbMatch[1];
        const child = spawn('freebuff', ['--cwd', HOME_DIR, fbCmd], { windowsHide: true, timeout: 60000 });
        let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
        const code = await new Promise(r => child.on('close', r));
        logAgentActivity(agentLogName, `Freebuff exit ${code}: "${out.slice(0, 200)}"`);
        return res.json({ reply: out.slice(0, 2000) || `(exit ${code})`, via: 'freebuff' });
      } catch (e) {
        return res.json({ reply: `Freebuff error: ${e.message}`, via: 'freebuff' });
      }
    }

    // Primero Hermes
    const hermesResult = await chatWithHermes(message, session_id, 30000);
    if (hermesResult.ok) {
      logAgentActivity(agentLogName, `Respuesta de Hermes: "${hermesResult.reply.slice(0, 120)}..."`);
      return res.json({ reply: hermesResult.reply, session_id: hermesResult.session_id, via: 'hermes' });
    }
    console.log(`[${agentLogName}] Hermes falló, fallback:`, hermesResult.error);
    logAgentActivity(agentLogName, `Hermes offline, fallback a Gemini Flash`);
    const fallback = await chatWithAxisChat(message);
    if (fallback.ok) {
      logAgentActivity(agentLogName, `Respuesta de ${fallback.from_provider}`);
      return res.json({ reply: fallback.reply, from_provider: fallback.from_provider, via: 'gemini-flash' });
    }
    logAgentActivity(agentLogName, `Error: ${fallback.error}`);
    return res.status(502).json({ error: `AxisChat: ${fallback.error}` });
  }

  // 5. ChatGeneral → legacy, redirige a AxisChat
  if (agent === 'chatgeneral') {
    return res.redirect(307, `/api/chat/axischat`);
  }

  // 5. Caso general: gemini, opencode, mimo u otros
  const result = await chatWithAgent(agent, message);
  if (result.ok) {
    return res.json({ reply: result.reply, from_provider: result.from_provider });
  }
  return res.status(502).json({ error: `Error en chat con agente ${agent}: ${result.error}` });
});

app.get('/api/hermes/skills', async (req, res) => {
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 3000);
    await fetch('http://localhost:8642/health/detailed', { signal: c.signal });
  } catch {}
  res.json({
    skills: [
      { id: 'hermes-agent', name: 'Hermes Agent', desc: 'Config/setup de Hermes', cmd: '/hermes' },
      { id: 'github-pr-workflow', name: 'GitHub PR', desc: 'Crear y gestionar PRs', cmd: '/github-pr' },
      { id: 'github-issues', name: 'GitHub Issues', desc: 'Crear/triage issues', cmd: '/github-issues' },
      { id: 'github-code-review', name: 'Code Review', desc: 'Revisar PRs con comentarios', cmd: '/code-review' },
      { id: 'codebase-inspection', name: 'Inspeccionar Código', desc: 'LOC, lenguajes, ratios', cmd: '/inspect' },
      { id: 'claude-code', name: 'Claude Code', desc: 'Delegar coding a Claude', cmd: '/claude-code' },
      { id: 'codex', name: 'Codex CLI', desc: 'Delegar coding a Codex', cmd: '/codex' },
      { id: 'systematic-debugging', name: 'Debug Sistemático', desc: '4 fases: root cause', cmd: '/debug' },
      { id: 'test-driven-development', name: 'TDD', desc: 'RED-GREEN-REFACTOR', cmd: '/tdd' },
      { id: 'writing-plans', name: 'Planes', desc: 'Planes de implementación', cmd: '/plan' },
      { id: 'jupyter-live-kernel', name: 'Jupyter', desc: 'Python iterativo en kernel', cmd: '/jupyter' },
      { id: 'llama-cpp', name: 'LLaMA.cpp', desc: 'Inferencia local GGUF', cmd: '/llama' },
      { id: 'serving-llms-vllm', name: 'vLLM', desc: 'Serving high-throughput', cmd: '/vllm' },
      { id: 'evaluating-llms-harness', name: 'LM Eval', desc: 'Benchmarks MMLU, GSM8K', cmd: '/lm-eval' },
      { id: 'youtube-content', name: 'YouTube', desc: 'Transcripciones/resúmenes', cmd: '/youtube' },
      { id: 'spotify', name: 'Spotify', desc: 'Play, search, queue', cmd: '/spotify' },
      { id: 'notion', name: 'Notion', desc: 'Pages, databases, markdown', cmd: '/notion' },
      { id: 'obsidian', name: 'Obsidian', desc: 'Leer/crear/editar notas', cmd: '/obsidian' },
      { id: 'ocr-and-documents', name: 'OCR/PDFs', desc: 'Extraer texto de docs', cmd: '/ocr' },
      { id: 'arxiv', name: 'arXiv', desc: 'Buscar papers', cmd: '/arxiv' },
      { id: 'blogwatcher', name: 'BlogWatcher', desc: 'Monitor RSS/Atom', cmd: '/blogwatcher' },
      { id: 'xurl', name: 'X/Twitter', desc: 'Post, search, DM', cmd: '/xurl' },
      { id: 'whatsapp-bot-baileys', name: 'WhatsApp Bot', desc: 'Bot Baileys + QR', cmd: '/whatsapp' },
      { id: 'architect-diagram', name: 'Diagrams', desc: 'SVG arquitectura/infra', cmd: '/diagram' },
      { id: 'frontend-design', name: 'Frontend', desc: 'Landing pages, UI', cmd: '/frontend' },
      { id: 'p5js', name: 'p5.js', desc: 'Gen art, shaders', cmd: '/p5js' },
      { id: 'pixel-art', name: 'Pixel Art', desc: 'NES, Game Boy, PICO-8', cmd: '/pixel' },
      { id: 'songwriting-and-ai-music', name: 'AI Music', desc: 'Songwriting + Suno', cmd: '/music' },
      { id: 'image-generate', name: 'Imagen AI', desc: 'Generar imágenes', cmd: '/image' }
    ],
    slash_commands: [
      { cmd: '/new', desc: 'Nueva sesión' }, { cmd: '/help', desc: 'Ayuda' }, { cmd: '/skills', desc: 'Lista skills' },
      { cmd: '/memory', desc: 'Ver memoria' }, { cmd: '/tools', desc: 'Lista herramientas' }, { cmd: '/config', desc: 'Configuración' },
      { cmd: '/status', desc: 'Estado del sistema' }, { cmd: '/stop', desc: 'Detener tarea' }, { cmd: '/plan', desc: 'Modo plan' },
      { cmd: '/debug', desc: 'Modo debug' }
    ],
    tools: [
      { name: 'terminal', desc: 'Ejecutar comandos shell' }, { name: 'browser', desc: 'Navegar web, clicks' },
      { name: 'web_search', desc: 'Buscar en internet' }, { name: 'read_file', desc: 'Leer archivos' },
      { name: 'write_file', desc: 'Escribir archivos' }, { name: 'patch', desc: 'Editar archivos' },
      { name: 'search_files', desc: 'Buscar en archivos' }, { name: 'delegate_task', desc: 'Subagentes paralelos' },
      { name: 'cronjob', desc: 'Tareas programadas' }, { name: 'vision_analyze', desc: 'Analizar imágenes' },
      { name: 'send_message', desc: 'Enviar mensajes' }, { name: 'memory', desc: 'Memoria persistente' }
    ]
  });
});

app.get('/api/hermes/status', async (req, res) => {
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 3000);
    res.json(await (await fetch('http://localhost:8642/health/detailed', { signal: c.signal })).json());
  } catch { res.json({ status: 'offline' }); }
});

app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { hostname, role } = req.body;
    const ip = req.ip;
    let data = { nodes: [] };
    if (fs.existsSync(REGISTERED_NODES_FILE)) data = JSON.parse(fs.readFileSync(REGISTERED_NODES_FILE, 'utf8'));
    const subdominioGenerado = await crearSubdominio(hostname, ip);
    data.nodes.push({ hostname, role, ip, subdomain: subdominioGenerado || 'pendiente', lastSeen: new Date().toISOString() });
    fs.writeFileSync(REGISTERED_NODES_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true, message: `Nodo ${hostname} registrado`, domain: subdominioGenerado });
  } catch (error) { res.status(500).json({ error: 'Error al registrar: ' + error.message }); }
});

app.post('/api/update-keys', authLimiter, (req, res) => {
  try {
    const { provider, keys: newKeys, mode } = req.body;
    const keysData = readFromFile(KEYS_FILE);
    if (keysData.providers[provider]) {
      let currentKeys = keysData.providers[provider].keys || [];
      if (mode === 'append') {
        const uniqueNewKeys = newKeys.filter(key => !currentKeys.includes(key));
        keysData.providers[provider].keys = [...currentKeys, ...uniqueNewKeys];
      } else {
        keysData.providers[provider].keys = newKeys;
      }
      writeToFile(KEYS_FILE, keysData);
      res.json({ success: true, message: `Claves de ${provider} actualizadas.` });
    } else { res.status(400).json({ error: 'Proveedor no encontrado' }); }
  } catch (error) { res.status(500).json({ error: 'Error al actualizar: ' + error.message }); }
});

// ─── AGENT ENDPOINTS ───
app.get('/api/agents', apiLimiter, (req, res) => {
  try {
    const keysData = readFromFile(KEYS_FILE);
    const agents = keysData.agents || {};
    const list = Object.entries(agents).map(([name, cfg]) => ({
      name,
      provider: cfg.provider,
      model: cfg.model,
      color: cfg.color || '#94a3b8',
      has_keys: (cfg.keys || []).filter(k => k && !k.includes('REEMPLAZA')).length > 0,
      key_count: (cfg.keys || []).filter(k => k && !k.includes('REEMPLAZA')).length
    }));
    res.json({ agents: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/agents/:name/chat', apiLimiter, async (req, res) => {
  const { name } = req.params;
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensaje requerido' });
  logAgentActivity(name, `Chat: "${message.slice(0, 80)}..."`);
  const result = await chatWithAgent(name, message);
  if (result.ok) return res.json({ reply: result.reply, from_provider: result.from_provider });
  logAgentActivity(name, `Error: ${result.error}`);
  return res.status(502).json({ error: `Error en agente ${name}: ${result.error}` });
});

app.post('/api/agents/:name/exec', apiLimiter, async (req, res) => {
  const { name } = req.params;
  const { command, timeout = 30000 } = req.body;
  if (!command) return res.status(400).json({ error: 'Comando requerido' });
  logAgentActivity(name, `Exec: ${command}`);
  try {
    const shell = IS_WIN ? 'powershell' : 'bash';
    const shellArgs = IS_WIN ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
    const child = spawn(shell, shellArgs, { windowsHide: true, timeout, env: { ...process.env }, cwd: HOME_DIR });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const exitCode = await new Promise((resolve) => {
      child.on('close', resolve);
      child.on('error', (err) => { stderr += err.message; resolve(-1); });
    });
    logAgentActivity(name, `Exec result (exit ${exitCode}): ${(stdout || stderr).slice(0, 200)}...`);
    res.json({ stdout, stderr, exitCode, agent: name });
  } catch (e) {
    logAgentActivity(name, `Exec error: ${e.message}`);
    res.status(500).json({ error: e.message, agent: name });
  }
});

app.get('/api/logs/agent/:name', apiLimiter, (req, res) => {
  const { name } = req.params;
  const lines = parseInt(req.query.lines) || 80;
  res.type('text/plain').send(readAgentLog(name, lines));
});

app.post('/api/agents/config', authLimiter, (req, res) => {
  try {
    const { name, provider, model, keys, color, mode } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre de agente requerido' });
    const keysData = readFromFile(KEYS_FILE);
    if (!keysData.agents) keysData.agents = {};
    if (!keysData.agents[name]) keysData.agents[name] = {};
    if (provider) keysData.agents[name].provider = provider;
    if (model) keysData.agents[name].model = model;
    if (color) keysData.agents[name].color = color;
    if (keys) {
      if (mode === 'replace') {
        keysData.agents[name].keys = keys;
      } else {
        const existing = keysData.agents[name].keys || [];
        for (const k of keys) { if (k && !existing.includes(k)) existing.push(k); }
        keysData.agents[name].keys = existing;
      }
    }
    if (req.body.clear_keys) {
      keysData.agents[name].keys = [];
    }
    writeToFile(KEYS_FILE, keysData);
    res.json({ success: true, message: `Agente '${name}' actualizado` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/agents/:name', authLimiter, (req, res) => {
  try {
    const { name } = req.params;
    const keysData = readFromFile(KEYS_FILE);
    if (!keysData.agents?.[name]) return res.status(404).json({ error: 'Agente no encontrado' });
    delete keysData.agents[name];
    writeToFile(KEYS_FILE, keysData);
    res.json({ success: true, message: `Agente '${name}' eliminado` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CODEBUFF INTEGRATION ───
const CODEBUFF_DIR = path.join(HOME_DIR, 'Downloads', 'codebuff');

app.post('/api/codebuff/chat', apiLimiter, async (req, res) => {
  const { message, agent_type = 'general' } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensaje requerido' });

  const codebuffAgents = {
    general: { name: 'General', desc: 'Propósito general', model: 'gpt-4o-mini' },
    editor: { name: 'Editor', desc: 'Edición de código', model: 'anthropic/claude-sonnet-4' },
    researcher: { name: 'Researcher', desc: 'Investigación web', model: 'google/gemini-2.5-flash' },
    librarian: { name: 'Librarian', desc: 'Gestión de archivos', model: 'meta/llama-3.3-70b-instruct' },
    thinker: { name: 'Thinker', desc: 'Razonamiento profundo', model: 'deepseek-chat' },
    basher: { name: 'Basher', desc: 'Comandos shell', model: 'gpt-4o' },
  };

  const agent = codebuffAgents[agent_type] || codebuffAgents.general;
  logAgentActivity('codebuff', `${agent.name}: "${message.slice(0, 120)}..."`);

  // Intentar freebuff CLI primero
  if (req.body.use_cli) {
    try {
      const scriptContent = `#!freebuff\n${message}`;
      const tmpFile = path.join(HOME_DIR, 'AppData', 'Local', 'Temp', `cb-${Date.now()}.md`);
      fs.writeFileSync(tmpFile, scriptContent);
      const child = spawn('freebuff', ['--cwd', CODEBUFF_DIR, '--help'], { windowsHide: true, timeout: 15000 });
      let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
      await new Promise(r => child.on('close', r));
      fs.unlinkSync(tmpFile);
      return res.json({ reply: out.slice(0, 2000) || '(sin salida)', via: 'freebuff_cli' });
    } catch (e) {
      logAgentActivity('codebuff', `Freebuff CLI falló: ${e.message}`);
    }
  }

  // Usar rotación con el modelo del agente Codebuff
  try {
    const keysData = readFromFile(KEYS_FILE);
    const openrouterKey = keysData.providers?.openrouter?.keys?.[0];
    if (openrouterKey) {
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openrouterKey}` };
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers,
        body: JSON.stringify({
          model: agent.model, messages: [
            { role: 'system', content: `Sos el agente "${agent.name}" de Codebuff. ${agent.desc}. Respondé de forma útil y concisa.` },
            { role: 'user', content: message }
          ], stream: false, max_tokens: 1500
        }),
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '(sin respuesta)';
      logAgentActivity('codebuff', `Respuesta de ${agent.name}: "${reply.slice(0, 120)}..."`);
      return res.json({ reply, agent: agent_type, via: 'openrouter' });
    }
  } catch (e) {
    logAgentActivity('codebuff', `Error: ${e.message}`);
  }

  return res.status(502).json({ error: 'Codebuff no disponible' });
});

app.get('/api/codebuff/agents', (req, res) => {
  res.json({
    agents: [
      { id: 'general', name: 'General', desc: 'Propósito general', icon: '🧠', color: '#22d3ee' },
      { id: 'editor', name: 'Editor', desc: 'Edición de código', icon: '✏️', color: '#4ade80' },
      { id: 'researcher', name: 'Researcher', desc: 'Investigación web', icon: '🔍', color: '#60a5fa' },
      { id: 'librarian', name: 'Librarian', desc: 'Gestión de archivos', icon: '📚', color: '#fbbf24' },
      { id: 'thinker', name: 'Thinker', desc: 'Razonamiento profundo', icon: '🤔', color: '#a78bfa' },
      { id: 'basher', name: 'Basher', desc: 'Comandos shell', icon: '💻', color: '#fb7185' },
    ],
    repo: CODEBUFF_DIR
  });
});

// ─── OPENCODE EXEC ───
app.post('/api/opencode/exec', apiLimiter, async (req, res) => {
  const { task, cwd } = req.body;
  if (!task) return res.status(400).json({ error: 'Tarea requerida' });

  const targetDir = cwd || 'C:\\AxisPanel';
  const taskFile = path.join(HOME_DIR, 'AppData', 'Local', 'Temp', `opencode-task-${Date.now()}.md`);

  try {
    fs.writeFileSync(taskFile, task, 'utf8');

    let cmd;
    if (IS_WIN) {
      // Abre una nueva ventana de terminal con opencode + el archivo de tarea
      cmd = `start "OpenCode" wt -w 0 nt -d "${targetDir}" cmd /k "echo Tarea cargada desde AxisChat && type ${taskFile} && echo. && npx opencode"`;
    } else {
      cmd = `x-terminal-emulator -e "cd ${targetDir} && echo 'Tarea cargada desde AxisChat' && cat ${taskFile} && npx opencode"`;
    }

    const child = spawn(cmd, [], { shell: true, detached: true, windowsHide: false, stdio: 'ignore' });
    child.unref();

    logAgentActivity('opencode', `Terminal abierta: "${task.slice(0, 120)}..." en ${targetDir}`);
    res.json({
      success: true,
      message: `OpenCode abierto en nueva terminal\nDirectorio: ${targetDir}\nTarea: ${task.slice(0, 200)}`,
      task_id: path.basename(taskFile)
    });
  } catch (e) {
    logAgentActivity('opencode', `Error: ${e.message}`);
    try { fs.unlinkSync(taskFile); } catch {}
    res.status(500).json({ error: e.message });
  }
});

// ─── SKILLS CLI ───
app.post('/api/skills/exec', apiLimiter, async (req, res) => {
  const { message, timeout = 60000 } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensaje requerido' });
  try {
    const args = message.split(' ');
    const cmd = args[0];
    const rest = args.slice(1);
    let skillsArgs = '';
    if (cmd === 'add') {
      const pkg = rest[0] || 'google/skills';
      skillsArgs = `add ${pkg} -y`;
    } else if (cmd === 'list' || cmd === 'ls') {
      skillsArgs = 'list';
    } else if (cmd === 'find') {
      skillsArgs = `find ${rest.join(' ')}`;
    } else if (cmd === 'remove') {
      skillsArgs = `remove ${rest.join(' ')}`;
    } else {
      skillsArgs = message;
    }
    const fullCmd = `npx skills ${skillsArgs}`;
    console.log(`[SKILLS] Ejecutando: ${fullCmd}`);
    const result = execSync(fullCmd, { encoding: 'utf8', timeout, shell: true, maxBuffer: 1024 * 1024 });
    logAgentActivity('skills', `Ejecutado: ${fullCmd}`);
    res.json({ success: true, output: result, command: fullCmd });
  } catch (e) {
    const stderr = e.stderr || e.message || '';
    logAgentActivity('skills', `Error: ${stderr.slice(0, 500)}`);
    res.json({ success: false, output: stderr, error: stderr, command: `npx skills ${message}` });
  }
});

// ─── CODEBASE MEMORY MCP (Codegraf) ───
const CBM_BIN = path.join(process.env.LOCALAPPDATA || HOME_DIR, 'Programs', 'codebase-memory-mcp', 'codebase-memory-mcp.exe');
const CBM_INDEX_DIR = path.join(HOME_DIR, '.local', 'share', 'codebase-memory-mcp', 'index');

app.get('/api/cbm/status', async (req, res) => {
  try {
    if (!fs.existsSync(CBM_BIN)) return res.json({ installed: false, error: 'Binario no encontrado' });
    const indexFile = path.join(CBM_INDEX_DIR, 'C__AxisPanel');
    const indexed = fs.existsSync(indexFile);
    res.json({ installed: true, indexed, bin: CBM_BIN, version: '0.9.0', port: 9749, indexPath: CBM_INDEX_DIR });
  } catch (e) {
    res.json({ installed: false, error: e.message });
  }
});

app.post('/api/cbm/query', apiLimiter, async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Consulta requerida' });
  try {
    const child = spawn(CBM_BIN, ['cli', 'query_graph', '--query', query, '--path', 'C:\\AxisPanel'], { windowsHide: true, timeout: 30000 });
    let out = ''; child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => out += d);
    const code = await new Promise(r => child.on('close', r));
    if (code === 0) return res.json({ result: out.slice(0, 5000) });
    res.status(502).json({ error: out.slice(0, 500) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cbm/index', apiLimiter, async (req, res) => {
  try {
    const child = spawn(CBM_BIN, ['cli', 'index_repository', '--path', 'C:\\AxisPanel'], { windowsHide: true, timeout: 120000 });
    let out = ''; child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => out += d);
    const code = await new Promise(r => child.on('close', r));
    // Check for worker log
    const cacheLogDir = path.join(HOME_DIR, '.cache', 'codebase-memory-mcp', 'logs');
    let workerLog = '';
    if (fs.existsSync(cacheLogDir)) {
      const logs = fs.readdirSync(cacheLogDir).filter(f => f.startsWith('.worker-')).sort().reverse();
      if (logs.length > 0) {
        const logPath = path.join(cacheLogDir, logs[0]);
        workerLog = fs.readFileSync(logPath, 'utf8').slice(-2000);
      }
    }
    res.json({
      success: code === 0,
      output: out.slice(0, 2000),
      workerLog: workerLog || null,
      hint: code !== 0 ? 'El worker crasheó en un archivo. Esto es un bug conocido de v0.9.0 en Windows. Probá excluir node_modules/ y archivos grandes.' : null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cbm/log', (req, res) => {
  const cacheLogDir = path.join(HOME_DIR, '.cache', 'codebase-memory-mcp', 'logs');
  try {
    if (!fs.existsSync(cacheLogDir)) return res.json({ log: null, error: 'No logs encontrados' });
    const logs = fs.readdirSync(cacheLogDir).filter(f => f.startsWith('.worker-')).sort().reverse();
    if (logs.length === 0) return res.json({ log: null, error: 'No worker logs' });
    const logContent = fs.readFileSync(path.join(cacheLogDir, logs[0]), 'utf8').slice(-5000);
    res.type('text/plain').send(logContent);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CODEX — Local indexer (reemplazo de Codegraf que funciona en Windows) ───
const localIndexer = require('./modules/local-indexer');

app.get('/api/codex/status', (req, res) => {
  const index = localIndexer.loadIndex();
  res.json({
    hasIndex: !!index,
    totalFiles: index?.totalFiles || 0,
    builtAt: index?.builtAt || null,
    root: localIndexer.ROOT_DIR,
    indexFile: localIndexer.INDEX_FILE
  });
});

app.post('/api/codex/build', apiLimiter, (req, res) => {
  try {
    const start = Date.now();
    const index = localIndexer.buildIndex();
    res.json({ success: true, totalFiles: index.totalFiles, duration: Date.now() - start + 'ms' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/codex/search', apiLimiter, (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Falta ?q=' });
  const fromIndex = req.query.mode !== 'rg';
  if (fromIndex) {
    return res.json(localIndexer.searchIndex(q));
  }
  res.json(localIndexer.rgSearch(q));
});

app.post('/api/codex/query', apiLimiter, (req, res) => {
  const { query, mode } = req.body;
  if (!query) return res.status(400).json({ error: 'Falta query' });
  const indexResults = localIndexer.searchIndex(query);
  const rgResults = localIndexer.rgSearch(query);
  res.json({
    query,
    indexResults: indexResults.results?.slice(0, 10) || [],
    rgResults: rgResults.results?.slice(0, 10) || [],
    totalIndex: indexResults.totalResults || 0,
    totalRg: rgResults.totalResults || 0
  });
});

// ─── Module: Obsidian API ───
try { require('./modules/obsidian-api')(app, { authLimiter, apiLimiter }); } catch (e) { console.error('[OBSIDIAN] Error:', e.message); }

// ─── Module: Outreach API ───
const createOutreachApi = require('./modules/outreach-api');
const outreachApi = createOutreachApi(app, { configDir: CONFIG_DIR, crmDb, leadsJson: LEADS_JSON, authLimiter });
const getOutreachData = outreachApi.getOutreachData;

// ─── Module: Follow-Up Automator ───
const createFollowUpModule = require('./modules/followup-automator');
const followUp = createFollowUpModule(app, {
  configDir: CONFIG_DIR,
  crmDb: typeof crmDb !== 'undefined' ? crmDb : null,
  leadsJsonPath: LEADS_JSON,
  getOutreachData,
  authLimiter,
  apiLimiter
});

// ─── HEALTH / AUTO-CONFIG ───
app.get('/api/health/check', apiLimiter, async (req, res) => {
  const issues = [];
  try {
    const keysData = readFromFile(KEYS_FILE);

    // 1. API Keys — providers sin keys
    for (const [provider, cfg] of Object.entries(keysData.providers || {})) {
      const validKeys = (cfg.keys || []).filter(k => k && !k.includes('REEMPLAZA'));
      if (validKeys.length === 0) {
        issues.push({ category: 'api_keys', severity: 'high', message: `Provider '${provider}' sin API keys`, fix_type: 'add_key', fix_data: { target: provider, type: 'provider' } });
      }
    }

    // 2. API Keys — agentes sin keys
    for (const [name, cfg] of Object.entries(keysData.agents || {})) {
      const validKeys = (cfg.keys || []).filter(k => k && !k.includes('REEMPLAZA'));
      if (validKeys.length === 0) {
        issues.push({ category: 'api_keys', severity: 'high', message: `Agente '${name}' (${cfg.provider}) sin API key`, fix_type: 'add_key', fix_data: { target: name, type: 'agent', provider: cfg.provider } });
      }
    }

    // 3. Hermes Gateway
    try {
      const c = new AbortController(); setTimeout(() => c.abort(), 2000);
      await fetch('http://localhost:8642/health', { signal: c.signal });
    } catch {
      issues.push({ category: 'service', severity: 'high', message: 'Hermes Gateway no responde en puerto 8642', fix_type: 'install_hermes', fix_data: {} });
    }

    // 4. OpenClaw Gateway
    try {
      const c = new AbortController(); setTimeout(() => c.abort(), 2000);
      await fetch('http://localhost:18789/health', { signal: c.signal });
    } catch {
      issues.push({ category: 'service', severity: 'medium', message: 'OpenClaw no responde en puerto 18789', fix_type: 'install_openclaw', fix_data: {} });
    }

    // 5. Docker
    try {
      execSync('docker --version', { encoding: 'utf8', timeout: 3000, stdio: 'pipe' });
      try {
        execSync('docker ps --format "{{.ID}}"', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
      } catch {
        issues.push({ category: 'tool', severity: 'medium', message: 'Docker Desktop instalado pero el engine no está corriendo', fix_type: 'start_docker', fix_data: {} });
      }
    } catch {
      issues.push({ category: 'tool', severity: 'medium', message: 'Docker no instalado', fix_type: 'download_docker', fix_data: { url: 'https://www.docker.com/products/docker-desktop/' } });
    }

    // 6. Node.js
    try {
      const ver = execSync('node --version', { encoding: 'utf8', timeout: 3000 }).trim();
      const m = ver.match(/v(\d+)/);
      if (m && parseInt(m[1]) < 18) {
        issues.push({ category: 'tool', severity: 'low', message: `Node.js ${ver} — versión antigua (≥18 recomendado)`, fix_type: 'download_node', fix_data: { url: 'https://nodejs.org/' } });
      }
    } catch {
      issues.push({ category: 'tool', severity: 'high', message: 'Node.js no instalado', fix_type: 'download_node', fix_data: { url: 'https://nodejs.org/' } });
    }

    // 7. Git
    try {
      execSync('git --version', { encoding: 'utf8', timeout: 3000 });
    } catch {
      issues.push({ category: 'tool', severity: 'low', message: 'Git no instalado', fix_type: 'download_git', fix_data: { url: 'https://git-scm.com/downloads' } });
    }

    // 8. nssm (Windows Service helper)
    if (IS_WIN) {
      try {
        execSync('nssm --version 2>nul', { encoding: 'utf8', timeout: 3000, stdio: 'pipe' });
      } catch {
        issues.push({ category: 'tool', severity: 'low', message: 'nssm no instalado (necesario para servicio Windows)', fix_type: 'install_nssm', fix_data: { url: 'https://github.com/nssm/nssm/releases' } });
      }
    }

    // 9. AxisPanel como servicio Windows
    if (IS_WIN) {
      try {
        execSync('sc query AxisPanel 2>nul', { encoding: 'utf8', timeout: 3000, stdio: 'pipe' });
      } catch {
        issues.push({ category: 'service', severity: 'low', message: 'AxisPanel no está instalado como servicio Windows', fix_type: 'install_service', fix_data: {} });
      }
    }

  } catch (e) {
    console.error('[Health] Error en escaneo:', e.message);
  }

  res.json({
    issues,
    total: issues.length,
    critical: issues.filter(i => i.severity === 'high').length,
    medium: issues.filter(i => i.severity === 'medium').length,
    low: issues.filter(i => i.severity === 'low').length,
    healthy: issues.length === 0
  });
});

app.post('/api/health/fix', authLimiter, async (req, res) => {
  const { fix_type, fix_data } = req.body;
  if (!fix_type) return res.status(400).json({ error: 'fix_type requerido' });

  try {
    switch (fix_type) {
      case 'install_hermes': {
        const script = path.join(HERMES_DIR, 'scripts', 'setup.ps1');
        if (fs.existsSync(script)) {
          const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { cwd: HERMES_DIR, windowsHide: true, timeout: 120000 });
          let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
          await new Promise(r => child.on('close', r));
          res.json({ success: true, message: 'Script de Hermes ejecutado', output: out.slice(-500) });
        } else {
          res.json({ success: false, message: 'Script de setup no encontrado. Cloná Hermes manualmente.', guide: 'git clone https://github.com/anomalyco/hermes.git ~/.hermes' });
        }
        break;
      }
      case 'install_openclaw': {
        const script = path.join(HOME_DIR, '.openclaw', 'setup.ps1');
        if (fs.existsSync(script)) {
          const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, timeout: 120000 });
          let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
          await new Promise(r => child.on('close', r));
          res.json({ success: true, message: 'Script de OpenClaw ejecutado', output: out.slice(-500) });
        } else {
          res.json({ success: false, message: 'Script de setup no encontrado.', guide: 'Descargá OpenClaw desde https://github.com/anomalyco/openclaw' });
        }
        break;
      }
      case 'start_docker': {
        if (IS_WIN) {
          const child = spawn('powershell', ['-NoProfile', '-Command', 'Start-Process "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"'], { windowsHide: true, timeout: 10000 });
          let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
          await new Promise(r => child.on('close', r));
          res.json({ success: true, message: 'Iniciando Docker Desktop...' });
        } else {
          const child = spawn('systemctl', ['start', 'docker'], { timeout: 10000 });
          let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
          await new Promise(r => child.on('close', r));
          res.json({ success: true, message: 'Iniciando Docker...' });
        }
        break;
      }
      case 'download_docker':
      case 'download_node':
      case 'download_git': {
        const url = fix_data?.url;
        if (url) {
          execSync(`start "" "${url}"`, { shell: true, timeout: 3000 });
          res.json({ success: true, message: `Abriendo ${url}` });
        } else {
          res.json({ success: false, message: 'URL no especificada' });
        }
        break;
      }
      case 'install_nssm': {
        if (IS_WIN) {
          const nssmDir = path.join(HOME_DIR, 'AppData', 'Local', 'nssm');
          ensureDir(nssmDir);
          const url = 'https://github.com/nssm/nssm/releases/download/v2.24-101-gd9a6c10/nssm-2.24-101-gd9a6c10.zip';
          const zipPath = path.join(nssmDir, 'nssm.zip');
          try {
            const resp = await fetch(url);
            const buf = Buffer.from(await resp.arrayBuffer());
            fs.writeFileSync(zipPath, buf);
            execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${nssmDir}' -Force"`, { timeout: 15000 });
            res.json({ success: true, message: 'nssm descargado. Agregá a PATH manualmente.', path: path.join(nssmDir, 'nssm-2.24-101-gd9a6c10', 'win64') });
          } catch (e) {
            res.json({ success: false, message: `No se pudo descargar nssm: ${e.message}. Descargalo de ${url}` });
          }
        } else {
          res.json({ success: false, message: 'nssm solo disponible en Windows' });
        }
        break;
      }
      case 'install_service': {
        const script = path.join(__dirname, '..', 'scripts', 'install-service.ps1');
        if (fs.existsSync(script)) {
          const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, timeout: 60000 });
          let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
          await new Promise(r => child.on('close', r));
          res.json({ success: true, message: 'Script de servicio ejecutado. Probá abrir AxisPanel como Admin.', output: out.slice(-500) });
        } else {
          res.json({ success: false, message: 'install-service.ps1 no encontrado en scripts/' });
        }
        break;
      }
      default:
        res.status(400).json({ error: `fix_type '${fix_type}' desconocido` });
    }
  } catch (e) {
    res.status(500).json({ error: `Error ejecutando ${fix_type}: ${e.message}` });
  }
});

// ─── IP QUERY ───
app.get('/api/ip', async (req, res) => {
  try {
    if (!getMachineIP) return res.json({ ip: null, error: 'IP module not loaded' });
    const ip = await getMachineIP();
    const target = req.query.target || null;
    if (target) {
      const geo = await queryIPIO(target);
      return res.json({ ip: target, geo });
    }
    res.json({ ip });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Module: Leads Scraping API ───
try { require('./modules/leads-api')(app, { authLimiter, apiLimiter, leadsDB, saveDB, loadDB, getLeads, getLeadStats, updateLeadStatus, runFullScrape, scrapeCategory, CATEGORIES_SANTIAGO, gosom, syncLeadsToCRM }); } catch (e) { console.error('[LEADS] Error:', e.message); }

// ─── Module: Inbox API ───
try { require('./modules/inbox-api.js')(app, { crmDb, authLimiter }); } catch (e) { console.error('[INBOX] Error:', e.message); }

// ─── Channel Manager (Telegram, WhatsApp, RRSS) ───
try {
  const channelManager = require('./modules/channel-manager.js');
  channelManager.loadAll(app, { authLimiter, apiLimiter, crmDb, crmModule, leadsDB, saveDB, loadDB });
} catch (e) { console.error('[Channels] Error:', e.message); }

// ─── Calification Agent API ───
const calificationAgent = require('./modules/calification-agent.js');
app.get('/api/calification/portfolio', (req, res) => {
  const p = calificationAgent.getPortfolio();
  if (!p) return res.status(500).json({ error: 'Portfolio no cargado' });
  res.json(p);
});

app.post('/api/calification/chat', apiLimiter, async (req, res) => {
  const { leadId, message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'message requerido' });
  try {
    let lead = null;
    let msgHistory = history || [];
    if (leadId && crmDb) {
      lead = crmModule.getLead(crmDb, parseInt(leadId));
      if (lead) {
        msgHistory = crmDb.prepare('SELECT content, direction, created_at FROM interactions WHERE lead_id = ? ORDER BY created_at DESC LIMIT 10').all(lead.id).reverse()
          .map(i => ({ content: i.content, direction: i.direction }));
        msgHistory.push({ content: message, direction: 'incoming' });
      }
    }
    const result = await calificationAgent.qualify(
      { name: lead?.name || req.body.name || '', need: message, channel: req.body.channel || 'manual', phone: lead?.phone || '' },
      msgHistory
    );
    if (leadId && crmDb && lead) {
      crmDb.prepare("UPDATE leads SET score = MAX(?, score), stage = CASE WHEN ? IS NOT NULL THEN ? ELSE stage END WHERE id = ?")
        .run(result.score || 0, result.stage, result.stage, lead.id);
      crmModule.addInteraction(crmDb, lead.id, { type: 'calification', content: result.reply, direction: 'outgoing', channel: 'manual' });
      if (result.stage && result.stage !== lead.stage) {
        crmModule.moveLeadStage(crmDb, lead.id, result.stage, 'calification_agent', 'Calificado por IA');
      }
    }
    res.json({ reply: result.reply, stage: result.stage, score: result.score });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Docker Setup Helper ───
app.get('/api/setup/docker', (req, res) => {
  const setupPath = path.join(__dirname, '..', 'scripts', 'setup_docker.bat');
  if (fs.existsSync(setupPath)) {
    try {
      execSync(`start "" "${setupPath}"`, { shell: true, timeout: 3000 });
      res.json({ success: true, message: 'setup_docker.bat abierto' });
    } catch (e) {
      res.json({ success: true, message: 'Archivo listo para abrir manualmente', file: setupPath });
    }
  } else {
    res.status(404).json({ success: false, error: 'setup_docker.bat no encontrado' });
  }
});

// ─── Module: Appointments API ───
try { require('./modules/appointments-api.js')(app, { crmDb, authLimiter }); } catch (e) { console.error('[APPOINTMENTS] Error:', e.message); }

// ─── Module: B2 Backup API ───
try { require('./modules/b2-api')(app, { authLimiter, apiLimiter, execSync, fs, path, ensureDir, HOME_DIR, IS_WIN, IS_WSL, toWSLPath }); } catch (e) { console.error('[B2] Error:', e.message); }

// ─── Module: Google Drive (stub) ───
try { require('./modules/drive-api')(app, {}); } catch (e) { console.error('[DRIVE] Error:', e.message); }

// ─── OPENPENCIL MCP ───
let openPencilMCPProcess = null;
let openPencilViteProcess = null;
const MCP_PORT = 7600;
const MCP_WS_PORT = 7601;

app.post('/api/mcp/openpencil/start', authLimiter, (req, res) => {
  if (openPencilMCPProcess) return res.json({ success: true, message: 'MCP ya corriendo', port: MCP_PORT });
  try {
    const mcpEntry = path.join(OPENPENCIL_LOCAL_DIR, 'packages', 'mcp', 'dist', 'index.mjs');
    console.log('[MCP] Starting:', process.execPath, mcpEntry);
    const mcpOptions = {
      cwd: path.join(OPENPENCIL_LOCAL_DIR, 'packages', 'mcp'), stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(MCP_PORT), WS_PORT: String(MCP_WS_PORT), HOST: '127.0.0.1', OPENPENCIL_MCP_ROOT: path.join(HOME_DIR, 'Documents'), OPENPENCIL_MCP_CORS_ORIGIN: `http://localhost:${PORT}` }
    };
    openPencilMCPProcess = spawn(process.execPath, [mcpEntry], mcpOptions);
    openPencilMCPProcess.stdout.on('data', (d) => console.log('[MCP stdout]', d.toString().trim()));
    openPencilMCPProcess.stderr.on('data', (d) => console.error('[MCP stderr]', d.toString().trim()));
    openPencilMCPProcess.on('error', (err) => { console.error('[MCP] Spawn error:', err.message); openPencilMCPProcess = null; });
    openPencilMCPProcess.on('exit', (code) => { console.log('[MCP] Exit code', code); openPencilMCPProcess = null; });
    setTimeout(() => res.json({ success: true, message: 'MCP iniciado', port: MCP_PORT, wsPort: MCP_WS_PORT }), 2000);
  } catch (e) { openPencilMCPProcess = null; res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/mcp/openpencil/stop', authLimiter, (req, res) => {
  if (openPencilMCPProcess) { openPencilMCPProcess.kill('SIGTERM'); openPencilMCPProcess = null; res.json({ success: true, message: 'MCP detenido' }); }
  else { res.json({ success: true, message: 'MCP no estaba corriendo' }); }
});

app.post('/api/mcp/openpencil/start-vite', authLimiter, (req, res) => {
  if (openPencilViteProcess) return res.json({ success: true, message: 'Vite ya corriendo', port: 1420 });
  try {
    const cmd = IS_WIN ? 'npx.cmd' : 'npx';
    console.log('[Vite] Starting OpenPencil dev server...');
    const viteOptions = { cwd: OPENPENCIL_LOCAL_DIR, stdio: ['ignore', 'pipe', 'pipe'] };
    if (IS_WIN) viteOptions.shell = true;
    openPencilViteProcess = spawn(cmd, ['vite'], viteOptions);
    openPencilViteProcess.stdout.on('data', (d) => console.log('[Vite stdout]', d.toString().trim()));
    openPencilViteProcess.stderr.on('data', (d) => console.error('[Vite stderr]', d.toString().trim()));
    openPencilViteProcess.on('error', (err) => { console.error('[Vite] Spawn error:', err.message); openPencilViteProcess = null; });
    openPencilViteProcess.on('exit', (code) => { console.log('[Vite] Exit code', code); openPencilViteProcess = null; });
    setTimeout(() => res.json({ success: true, message: 'Vite iniciado', port: 1420 }), 5000);
  } catch (e) { openPencilViteProcess = null; res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/mcp/openpencil/stop-vite', authLimiter, (req, res) => {
  if (openPencilViteProcess) { openPencilViteProcess.kill('SIGTERM'); openPencilViteProcess = null; res.json({ success: true, message: 'Vite detenido' }); }
  else { res.json({ success: true, message: 'Vite no estaba corriendo' }); }
});

app.get('/api/mcp/openpencil/status', async (req, res) => {
  let mcpRunning = false, viteRunning = false;
  try { const c = new AbortController(); setTimeout(() => c.abort(), 3000); mcpRunning = (await fetch(`http://localhost:${MCP_PORT}/health`, { signal: c.signal })).ok; } catch {}
  try { const c = new AbortController(); setTimeout(() => c.abort(), 2000); viteRunning = (await fetch('http://localhost:1420', { signal: c.signal })).ok; } catch {}
  res.json({ mcpRunning, viteRunning, mcpPort: MCP_PORT, openPencilPort: 1420, mcpEndpoint: `http://localhost:${MCP_PORT}/mcp`, openPencilUrl: 'http://localhost:1420' });
});

app.get('/api/mcp/openpencil/health', async (req, res) => {
  try { const c = new AbortController(); setTimeout(() => c.abort(), 3000); res.json(await (await fetch(`http://localhost:${MCP_PORT}/health`, { signal: c.signal })).json()); }
  catch (e) { res.json({ status: 'offline', error: e.message }); }
});

// ─── HERMES CONTROL ───
let hermesProcess = null;
app.post('/api/hermes/start', authLimiter, (req, res) => {
  if (hermesProcess) return res.json({ success: true, message: 'Hermes ya corriendo' });
  try {
    const pythonExe = path.join(HERMES_DIR, 'hermes-agent', 'venv', 'Scripts', 'python.exe');
    const cliPy = path.join(HERMES_DIR, 'hermes-agent', 'cli.py');
    console.log('[Hermes] Starting:', pythonExe, 'cli.py gateway');
    const hermesOptions = {
      cwd: path.join(HERMES_DIR, 'hermes-agent'),
      stdio: ['ignore', 'pipe', 'pipe']
    };
    if (IS_WIN) hermesOptions.shell = true;
    hermesProcess = spawn(pythonExe, [cliPy, '--gateway'], hermesOptions);
    hermesProcess.stdout.on('data', (d) => console.log('[Hermes stdout]', d.toString().trim()));
    hermesProcess.stderr.on('data', (d) => console.error('[Hermes stderr]', d.toString().trim()));
    hermesProcess.on('error', (err) => { console.error('[Hermes] Spawn error:', err.message); hermesProcess = null; });
    hermesProcess.on('exit', (code) => { console.log('[Hermes] Exit code', code); hermesProcess = null; });
    setTimeout(() => res.json({ success: true, message: 'Hermes iniciado' }), 3000);
  } catch (e) { hermesProcess = null; res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/hermes/stop', authLimiter, (req, res) => {
  if (hermesProcess) { hermesProcess.kill('SIGTERM'); hermesProcess = null; res.json({ success: true, message: 'Hermes detenido' }); }
  else { res.json({ success: true, message: 'Hermes no estaba corriendo' }); }
});

// ─── OPENCLAW CONTROL ───
let openclawProcess = null;
app.post('/api/openclaw/start', authLimiter, (req, res) => {
  if (openclawProcess) return res.json({ success: true, message: 'OpenClaw ya corriendo' });
  try {
    const gatewayCmd = path.join(HOME_DIR, '.openclaw', 'gateway.cmd');
    console.log('[OpenClaw] Starting via gateway.cmd:', gatewayCmd);
    const openclawOptions = {
      cwd: path.join(HOME_DIR, '.openclaw'),
      stdio: ['ignore', 'pipe', 'pipe']
    };
    if (IS_WIN) openclawOptions.shell = true;
    openclawProcess = spawn(gatewayCmd, [], openclawOptions);
    openclawProcess.stdout.on('data', (d) => console.log('[OpenClaw stdout]', d.toString().trim()));
    openclawProcess.stderr.on('data', (d) => console.error('[OpenClaw stderr]', d.toString().trim()));
    openclawProcess.on('error', (err) => { console.error('[OpenClaw] Spawn error:', err.message); openclawProcess = null; });
    openclawProcess.on('exit', (code) => { console.log('[OpenClaw] Exit code', code); openclawProcess = null; });
    setTimeout(() => res.json({ success: true, message: 'OpenClaw iniciado' }), 3000);
  } catch (e) { openclawProcess = null; res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/openclaw/stop', authLimiter, (req, res) => {
  if (openclawProcess) { openclawProcess.kill('SIGTERM'); openclawProcess = null; res.json({ success: true, message: 'OpenClaw detenido' }); }
  else { res.json({ success: true, message: 'OpenClaw no estaba corriendo' }); }
});

app.get('/api/openclaw/status', async (req, res) => {
  let running = false;
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 2000);
    running = (await fetch('http://localhost:18789/health', { signal: c.signal })).ok;
  } catch {}
  res.json({ running, port: 18789 });
});

// ─── DOCKER CONTROL ───
const DOCKER_COMPOSE_DIR = path.join(HOME_DIR, 'odysseus');

async function checkDockerAvailable() {
  try {
    execSync('docker info 2>nul', { encoding: 'utf8', timeout: 3000, windowsHide: true, shell: true });
    return true;
  } catch { return false; }
}

function dockerCompose(args) {
  return execSync(`docker compose ${args}`, { encoding: 'utf8', timeout: 30000, windowsHide: true, cwd: DOCKER_COMPOSE_DIR });
}

app.get('/api/docker/status', async (req, res) => {
  const dockerOk = await checkDockerAvailable();
  if (!dockerOk) return res.json({ docker_available: false, services: [] });
  try {
    const running = dockerCompose('ps --services --filter "status=running"').trim().split('\n').filter(Boolean);
    const all = dockerCompose('ps --services').trim().split('\n').filter(Boolean);
    const services = all.map(s => ({
      name: s,
      running: running.includes(s)
    }));
    res.json({ docker_available: true, services });
  } catch (e) {
    res.json({ docker_available: true, services: [], error: e.message });
  }
});

app.post('/api/docker/up', authLimiter, async (req, res) => {
  const { services } = req.body;
  if (!services || !Array.isArray(services) || services.length === 0)
    return res.status(400).json({ error: 'Lista de servicios requerida' });
  try {
    dockerCompose(`up -d ${services.join(' ')}`);
    res.json({ success: true, message: `Servicios iniciados: ${services.join(', ')}` });
  } catch (e) { res.status(500).json({ error: 'Error al iniciar servicios: ' + e.message }); }
});

app.post('/api/docker/down', authLimiter, async (req, res) => {
  const { services } = req.body;
  if (!services || !Array.isArray(services) || services.length === 0)
    return res.status(400).json({ error: 'Lista de servicios requerida' });
  try {
    dockerCompose(`down ${services.join(' ')}`);
    res.json({ success: true, message: `Servicios detenidos: ${services.join(', ')}` });
  } catch (e) { res.status(500).json({ error: 'Error al detener servicios: ' + e.message }); }
});

// ─── WORKFLOW ───
app.post('/api/workflow/start', authLimiter, async (req, res) => {
  const steps = [];
  try {
    steps.push({ step: 'Hermes Gateway', status: 'starting' });
    const hRes = await fetch(`http://localhost:${PORT}/api/hermes/start`, { method: 'POST' });
    const hData = await hRes.json();
    steps[0].status = hData.success ? 'started' : 'error';
    steps[0].message = hData.message;
  } catch (e) {
    steps[0] = { step: 'Hermes Gateway', status: 'error', message: e.message };
  }

  const dockerOk = await checkDockerAvailable();
  if (dockerOk) {
    try {
      steps.push({ step: 'Docker (chromadb, searxng)', status: 'starting' });
      dockerCompose('up -d chromadb searxng');
      steps[1].status = 'started';
    } catch (e) {
      steps.push({ step: 'Docker (chromadb, searxng)', status: 'error', message: e.message });
    }
  } else {
    steps.push({ step: 'Docker', status: 'skipped', message: 'Docker no disponible' });
  }

  try {
    steps.push({ step: 'OpenPencil MCP', status: 'starting' });
    const mRes = await fetch(`http://localhost:${PORT}/api/mcp/openpencil/start`, { method: 'POST' });
    const mData = await mRes.json();
    steps[steps.length - 1].status = mData.success ? 'started' : 'error';
    steps[steps.length - 1].message = mData.message;
  } catch (e) {
    steps[steps.length - 1] = { step: 'OpenPencil MCP', status: 'error', message: e.message };
  }

  res.json({ success: true, steps });
});

// ─── Obsidian fs-direct helper (multiplataforma) ───
function obsidian(args) {
  try {
    const vault = process.env.AXIS_OBSIDIAN_VAULT || (IS_WIN ? 'C:\\AxisPanel\\vault' : '/opt/axispanel/vault');
    const action = args[0];
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.md`;
    if (action === 'daily:read') {
      const file = path.join(vault, today);
      const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      return { code: 0, stdout: content, stderr: '' };
    }
    if (action === 'daily:append') {
      const file = path.join(vault, today);
      fs.mkdirSync(vault, { recursive: true });
      const contentArg = args.find(a => a.startsWith('content='));
      const content = contentArg ? contentArg.slice('content='.length) : '';
      fs.appendFileSync(file, '\n' + content, 'utf8');
      return { code: 0, stdout: `Appended to ${today}`, stderr: '' };
    }
    return { code: -1, stdout: '', stderr: `Comando no soportado: ${action}` };
  } catch (e) {
    return { code: 1, stdout: '', stderr: e.message };
  }
}

// ─── DAILY WORKFLOW: Obsidian + CRM ───
app.post('/api/workflow/daily', authLimiter, async (req, res) => {
  try {
    const today = new Date();
    const dateStr = today.toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    let newLeads = [], pipelineStats = [], followUpInfo = { activeRules: 0, pending: 0 };
    try {
      const l = await (await fetch(`http://localhost:${PORT}/api/crm/leads?limit=5&sort=newest`, { headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } })).json();
      newLeads = l.leads || [];
      const p = await (await fetch(`http://localhost:${PORT}/api/crm/pipeline`, { headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } })).json();
      pipelineStats = p.stages || [];
      const f = await (await fetch(`http://localhost:${PORT}/api/followup/status`, { headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } })).json();
      followUpInfo = f;
    } catch {}

    const stageCounts = {};
    for (const s of pipelineStats) stageCounts[s.stage] = s.count;
    const totalLeads = pipelineStats.reduce((a, s) => a + s.count, 0);

    const content = `# 📅 Daily — ${dateStr}

## 📊 Pipeline CRM
| Etapa | Cantidad |
|-------|----------|
${Object.entries(stageCounts).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}
| **Total** | **${totalLeads}** |

## 🆕 Últimos Leads
${newLeads.map(l => `- **${l.name}** (${l.category}) — ${l.phone || 'sin teléfono'} — Score: ${l.score || 0}`).join('\n')}

## 🔄 Follow-ups
- Reglas activas: ${followUpInfo.activeRules}
- Follow-ups pendientes: ${followUpInfo.pending}
- Scheduler: ${followUpInfo.schedulerRunning ? '✅ Activo' : '❌ Detenido'}

---
_Generado automáticamente por AxisPanel el ${today.toISOString()}_
`;

    const obsRes = await obsidian(['daily:append', `content=${content}`]);
    res.json({
      success: true,
      content,
      obsidian: { code: obsRes.code, stdout: obsRes.stdout?.slice(0, 100), stderr: obsRes.stderr?.slice(0, 100) },
      stats: { totalLeads, newLeads: newLeads.length, activeRules: followUpInfo.activeRules }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/workflow/daily', async (req, res) => {
  try {
    const obsRes = await obsidian(['daily:read']);
    res.json({ success: obsRes.code === 0, content: obsRes.stdout, error: obsRes.stderr });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/mcp/openpencil/tools', async (req, res) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`http://localhost:${MCP_PORT}/tools`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await response.json();
    res.json({ tools: data.tools || [] });
  } catch (e) {
    res.status(502).json({ tools: [], error: 'MCP no responde: ' + e.message });
  }
});

app.post('/api/mcp/openpencil/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Falta mensaje' });
  
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const response = await fetch(`http://localhost:${MCP_PORT}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Error en MCP chat: ' + e.message });
  }
});

// ─── OpenAI-compatible proxy (for Hermes / any OpenAI client) ───

const PROVIDER_AUTH = {
  nvidia: { type: 'bearer' },
  openrouter: { type: 'bearer' },
  google: { type: 'header', key: 'x-goog-api-key' },
  mistral: { type: 'bearer' },
  groq: { type: 'bearer' },
  cerebras: { type: 'bearer' },
};

function getActiveProvider() {
  const keysData = readFromFile(KEYS_FILE);
  const provider = keysData.current_provider || 'openrouter';
  const idx = keysData.current_key_index || 0;
  const providerCfg = keysData.providers?.[provider];
  const activeKeys = (providerCfg?.keys || []).filter(k => k && !k.includes('REEMPLAZA'));
  if (!activeKeys.length) return null;
  const key = activeKeys[idx] || activeKeys[0];
  const url = PROVIDER_URLS[provider];
  const model = PROVIDER_MODELS[provider] || (providerCfg?.models?.[0]);
  if (!url || !key) return null;
  return { provider, url, key, model, auth: PROVIDER_AUTH[provider] || { type: 'bearer' } };
}

function buildProxyHeaders(active, originalHeaders) {
  const headers = { 'Content-Type': 'application/json' };
  if (active.auth.type === 'bearer') {
    headers['Authorization'] = `Bearer ${active.key}`;
  } else if (active.auth.type === 'header') {
    headers[active.auth.key] = active.key;
  }
  const accept = originalHeaders?.['accept'];
  if (accept) headers['Accept'] = accept;
  return headers;
}

const PROXY_LIMIT = createRateLimit(1 * 60 * 1000, 200);

app.get('/v1/models', PROXY_LIMIT, async (req, res) => {
  const active = getActiveProvider();
  if (!active) return res.status(502).json({ error: 'No active provider configured' });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(`${active.url}/models`, {
      headers: buildProxyHeaders(active, {}),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return res.status(resp.status).json({ error: `Provider error: ${resp.status}` });
    const data = await resp.json();
    const models = (data.data || data.models || []).filter(m => {
      const id = m.id || m;
      return !id.includes('embedding') && !id.includes('tts') && !id.includes('whisper') && !id.includes('dall-e');
    });
    res.json({ object: 'list', data: models });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/v1/chat/completions', PROXY_LIMIT, async (req, res) => {
  console.log('[Proxy Request] Recibida llamada a /v1/chat/completions. Body:', JSON.stringify(req.body));
  const active = getActiveProvider();
  if (!active) return res.status(502).json({ error: 'No active provider configured' });
  const { stream } = req.body;
  try {
    const body = { ...req.body };
    if (!body.model || body.model === 'hermes-agent') {
      body.model = active.model;
    }
    if (active.provider === 'google') body.model = body.model || 'gemini-2.5-flash';
    const headers = buildProxyHeaders(active, req.headers);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 300000);
    const resp = await fetch(`${active.url}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      return res.status(resp.status).json({ error: `Provider error (${resp.status}): ${errBody.slice(0, 500)}` });
    }
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (resp.body && typeof resp.body.pipe === 'function') {
        resp.body.pipe(res);
      } else if (resp.body && typeof resp.body.getReader === 'function') {
        const reader = resp.body.getReader();
        const pump = () => {
          reader.read().then(({ done, value }) => {
            if (done) { res.end(); return; }
            res.write(value);
            pump();
          }).catch(() => res.end());
        };
        pump();
      } else {
        const text = await resp.text();
        res.write(text);
        res.end();
      }
      req.on('close', () => { ctrl.abort(); try { resp.body?.destroy?.(); } catch {} try { resp.body?.cancel?.(); } catch {} });
    } else {
      const data = await resp.json();
      try {
        const usage = data.usage;
        if (usage && usage.total_tokens) {
          const keysDataUpdate = readFromFile(KEYS_FILE);
          const providerId = active.provider;
          if (keysDataUpdate.providers[providerId]) {
            if (!keysDataUpdate.providers[providerId].tokens_used) {
              keysDataUpdate.providers[providerId].tokens_used = {};
            }
            const today = new Date().toISOString().split('T')[0];
            const currentUsed = keysDataUpdate.providers[providerId].tokens_used[today] || 0;
            keysDataUpdate.providers[providerId].tokens_used[today] = currentUsed + usage.total_tokens;
            writeToFile(KEYS_FILE, keysDataUpdate);
            console.log(`[Token Usage Proxy] Actualizados tokens para ${providerId}: +${usage.total_tokens}`);
          }
        }
      } catch (tuErr) {
        console.error('[Token Usage Proxy] Error al registrar uso:', tuErr.message);
      }
      res.json(data);
    }
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'Provider timeout' });
    res.status(502).json({ error: e.message });
  }
});

app.all('/v1/*', PROXY_LIMIT, async (req, res) => {
  const active = getActiveProvider();
  if (!active) return res.status(502).json({ error: 'No active provider configured' });
  const path = req.path.replace(/^\/v1/, '');
  try {
    const headers = buildProxyHeaders(active, req.headers);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const url = `${active.url}${path}`;
    const opts = { method: req.method, headers, signal: ctrl.signal };
    if (req.method !== 'GET' && req.method !== 'HEAD') opts.body = JSON.stringify(req.body);
    const resp = await fetch(url, opts);
    clearTimeout(timer);
    const data = await resp.json().catch(() => ({}));
    res.status(resp.status).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ─── Module: Builderbot API ───
try { require('./modules/builderbot-api')(app, { authLimiter, apiLimiter, execSync, fs, path, ensureDir, spawn }); } catch (e) { console.error('[BUILDERBOT] Error:', e.message); }

// ─── Module: Agency Agents API ───
try { require('./modules/agency-api')(app, { apiLimiter, fs, path, readFromFile, KEYS_FILE }); } catch (e) { console.error('[AGENCY] Error:', e.message); }

// ─── Module: Obscura / n8n / Cal.com ───
try { require('./modules/obscura-api')(app, { authLimiter, apiLimiter, execSync, fs, path, spawn }); } catch (e) { console.error('[OBSCURA] Error:', e.message); }

// ─── Startup ───
app.listen(PORT, HOST, () => {
  const env = IS_WIN ? 'Windows' : (IS_WSL ? 'WSL' : 'Linux');
  console.log(`[Axis Command Center] http://${HOST}:${PORT} (${env})`);
  console.log(`[Auth] Autenticación: ${AUTH_TOKEN ? 'token desde AXIS_AUTH_TOKEN' : '(ninguna — usar axischat sin auth)'}`);
  if (!process.env.AXIS_AUTH_TOKEN) console.log('[Auth] Set AXIS_AUTH_TOKEN env var for a fixed token');
  if (typeof followUp !== 'undefined') {
    followUp.startScheduler();
    console.log('[FollowUp] Scheduler iniciado (cada 60s)');
  }
});
