const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(process.env.USERPROFILE, '.config', 'telegram-scraper.json');

let bot = null;
let config = loadConfig();
let keywords = config.keywords || [
  'necesito página web', 'necesito pagina web',
  'necesito manejo de rrss', 'necesito redes sociales',
  'necesito video', 'necesito un video',
  'necesito tarjetas', 'necesito presentación',
  'necesito flyer', 'necesito un flyer',
  'necesito digitalizar', 'digitalizar mi negocio',
  'quiero una página web', 'busco quien haga',
  'necesito alguien que me ayude',
  'necesito marketing digital',
  'necesito diseño gráfico', 'necesito diseño grafico',
  'cuánto cobras por', 'presupuesto para página web',
  'recomienden diseñador', 'recomienden community manager'
];
let leadsFound = [];
let status = { running: false, startedAt: null, groups: [], messagesSeen: 0, leadsSaved: 0 };
let crmDb = null;

function setDb(db) { crmDb = db; }

function writeToCrm(lead) {
  if (!crmDb) return false;
  try {
    const existing = crmDb.prepare('SELECT id FROM leads WHERE source = ? AND source_id = ?').get('telegram', lead.source_id);
    if (existing) {
      crmDb.prepare('INSERT INTO interactions (lead_id, type, direction, content, channel, status) VALUES (?, ?, ?, ?, ?, ?)').run(existing.id, 'message', 'inbound', lead.message, 'telegram', 'completed');
      crmDb.prepare('UPDATE conversations SET last_message = ?, last_activity = datetime(\'now\'), unread = unread + 1 WHERE lead_id = ? AND channel = \'telegram\'').run(lead.message, existing.id);
      return true;
    }
    const r = crmDb.prepare('INSERT INTO leads (source, source_id, name, category, stage, score, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('telegram', lead.source_id, lead.name, 'social_listen', 'new', lead.score, lead.contact || '', lead.created_at, lead.created_at);
    const leadId = r.lastInsertRowid;
    crmDb.prepare('INSERT INTO conversations (lead_id, channel, channel_id, title, unread, last_message, last_activity) VALUES (?, ?, ?, ?, 1, ?, datetime(\'now\'))').run(leadId, 'telegram', lead.group_id, lead.group_name, lead.message);
    crmDb.prepare('INSERT INTO interactions (lead_id, type, direction, content, channel, status) VALUES (?, ?, ?, ?, ?, ?)').run(leadId, 'message', 'inbound', lead.message, 'telegram', 'completed');
    return true;
  } catch (e) {
    console.error('[TELEGRAM] Error writing to CRM:', e.message);
    return false;
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveConfig() {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ token: config.token, keywords, leadsFound, status }, null, 2), 'utf8');
}

const STOP_WORDS = new Set(['de','la','el','en','un','una','mi','tu','su','lo','las','los','y','e','o','a','que','es','por','para','con','del','al','como','más','mas','pero','le','no','se','me','te','lo','le','ya','fue','era','has','han','hay','sea','sido','todo','sin']);

function matchKeywords(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const msgWords = new Set(lower.split(/\s+/).filter(w => w.length > 1));

  let bestMatch = null;
  let bestScore = 0;

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    // Exact substring match (rápido)
    if (lower.includes(kwLower)) return kw;

    // Word-level match para frases con palabras entre medio
    const kwWords = kwLower.split(/\s+/).filter(w => !STOP_WORDS.has(w) && w.length > 1);
    if (kwWords.length === 0) continue;

    let hits = 0;
    for (const w of kwWords) {
      if (msgWords.has(w)) hits++;
    }

    const ratio = hits / kwWords.length;
    if (ratio >= 0.5 && ratio > bestScore) {
      bestScore = ratio;
      bestMatch = kw;
    }
  }

  return bestMatch;
}

function startBot(token) {
  if (bot) stopBot();

  config.token = token;
  try {
    bot = new Telegraf(token);

    bot.on('message', (ctx) => {
      const msg = ctx.message;
      if (!msg || !msg.text) return;
      status.messagesSeen++;

      const matched = matchKeywords(msg.text);
      if (!matched) return;

      const chat = msg.chat;
      const from = msg.from;
      const lead = {
        id: `tg_${msg.message_id}_${Date.now()}`,
        source: 'telegram',
        source_id: msg.message_id.toString(),
        name: `${from?.first_name || ''} ${from?.last_name || ''}`.trim() || from?.username || 'Desconocido',
        username: from?.username || null,
        telegram_id: from?.id?.toString() || null,
        group_name: chat?.title || chat?.type || 'DM',
        group_id: chat?.id?.toString() || null,
        message: msg.text,
        matched_keyword: matched,
        contact: from?.username ? `@${from.username}` : null,
        status: 'new',
        priority: keywords.indexOf(matched) >= 0 ? 1 : 2,
        score: 10,
        category: 'social_listen',
        created_at: new Date().toISOString()
      };

      leadsFound.push(lead);
      writeToCrm(lead);
      status.leadsSaved++;

      console.log(`[TELEGRAM] Lead detectado: ${lead.name} en "${lead.group_name}" → "${matched}"`);
      saveConfig();
    });

    bot.launch();
    status.running = true;
    status.startedAt = new Date().toISOString();
    saveConfig();
    console.log('[TELEGRAM] Bot iniciado');
    return { success: true, message: 'Bot de Telegram iniciado' };
  } catch (e) {
    bot = null;
    status.running = false;
    console.error('[TELEGRAM] Error al iniciar bot:', e.message);
    return { success: false, error: e.message };
  }
}

function stopBot() {
  if (bot) {
    bot.stop();
    bot = null;
  }
  status.running = false;
  saveConfig();
  console.log('[TELEGRAM] Bot detenido');
  return { success: true, message: 'Bot detenido' };
}

function getLeads(limit = 50) {
  return leadsFound.slice(-limit).reverse();
}

function clearLeads() {
  leadsFound = [];
  saveConfig();
}

async function getBotInfo() {
  if (!bot || !status.running) return { running: false };
  try {
    const me = await bot.telegram.getMe();
    const updates = await bot.telegram.getUpdates();
    const groups = [];
    const seen = new Set();
    for (const u of updates) {
      if (u.my_chat_member) {
        const chat = u.my_chat_member.chat;
        if (!seen.has(chat.id)) {
          seen.add(chat.id);
          groups.push({
            id: chat.id.toString(),
            title: chat.title || chat.type || 'Unknown',
            type: chat.type
          });
        }
      }
    }
    status.groups = groups;
    saveConfig();
    return {
      running: true,
      bot: { id: me.id, username: me.username, first_name: me.first_name },
      groups,
      keywords: keywords.length,
      messagesSeen: status.messagesSeen,
      leadsSaved: status.leadsSaved
    };
  } catch (e) {
    return { running: true, error: e.message };
  }
}

function registerRoutes(app, { authLimiter, leadsDB, saveDB, loadDB }) {
  app.get('/api/telegram/status', async (req, res) => {
    const botInfo = await getBotInfo();
    res.json({ ...botInfo, leadsCount: leadsFound.length, keywords });
  });

  app.post('/api/telegram/start', authLimiter, (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Falta token del bot' });
    res.json(startBot(token));
  });

  app.post('/api/telegram/stop', authLimiter, (req, res) => {
    res.json(stopBot());
  });

  app.get('/api/telegram/leads', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({ leads: getLeads(limit) });
  });

  app.post('/api/telegram/leads/clear', authLimiter, (req, res) => {
    clearLeads();
    res.json({ success: true });
  });

  app.put('/api/telegram/keywords', authLimiter, (req, res) => {
    const { keywords: kws } = req.body;
    if (!kws || !Array.isArray(kws)) return res.status(400).json({ error: 'keywords debe ser un array' });
    setKeywords(kws);
    res.json({ success: true, keywords });
  });

  app.get('/api/telegram/keywords', (req, res) => {
    res.json({ keywords });
  });

  app.post('/api/telegram/leads/sync', authLimiter, async (req, res) => {
    if (!leadsDB || !saveDB) return res.status(500).json({ error: 'CRM DB no disponible' });
    const leads = getLeads(9999);
    let saved = 0;
    for (const lead of leads) {
      const exists = leadsDB.leads.find(l => l.source === 'telegram' && l.source_id === lead.source_id);
      if (!exists) {
        lead.id = leadsDB.nextId++;
        leadsDB.leads.push(lead);
        saved++;
      }
    }
    if (saved > 0) { await saveDB(leadsDB); leadsDB = await loadDB(); }
    clearLeads();
    res.json({ success: true, synced: saved, total: leads.length });
  });
}

module.exports = {
  startBot, stopBot, getBotInfo, getLeads, clearLeads, matchKeywords, setDb, registerRoutes,
  get keywords() { return [...keywords]; },
  setKeywords: (kws) => { keywords = kws; saveConfig(); },
  get status() { return { ...status }; },
  get leads() { return leadsFound; }
};
