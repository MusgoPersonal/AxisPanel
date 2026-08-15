const path = require('path');
const fs = require('fs');
const calification = require('./calification-agent.js');

const channels = {
  telegram:    { name: 'Telegram',    icon: '✈️', module: null, loaded: false, status: 'disconnected', desc: 'Bot @axispanel_bot — escucha grupos' },
  whatsapp:    { name: 'WhatsApp',    icon: '💬', module: null, loaded: false, status: 'disconnected', desc: 'Baileys — QR para conectar' },
  instagram:   { name: 'Instagram',   icon: '📸', module: null, loaded: false, status: 'disconnected', desc: 'Pendiente' },
  facebook:    { name: 'Facebook',    icon: '👍', module: null, loaded: false, status: 'disconnected', desc: 'Pendiente' },
  tiktok:      { name: 'TikTok',      icon: '🎵', module: null, loaded: false, status: 'disconnected', desc: 'Pendiente' },
  email:       { name: 'Email',       icon: '📧', module: null, loaded: false, status: 'disconnected', desc: 'Pendiente' },
};

function loadAll(app, deps) {
  const { authLimiter, apiLimiter, crmDb, crmModule } = deps;

  // Try to load each channel module
  const channelFiles = {
    telegram:  path.join(__dirname, '..', 'scrapers', 'telegram.js'),
    whatsapp:  path.join(__dirname, '..', 'scrapers', 'whatsapp.js'),
  };

  for (const [id, filePath] of Object.entries(channelFiles)) {
    try {
      const mod = require(filePath);
      channels[id].module = mod;
      channels[id].loaded = true;

      if (mod.registerRoutes && id === 'telegram') {
        mod.registerRoutes(app, { authLimiter, leadsDB: deps.leadsDB, saveDB: deps.saveDB, loadDB: deps.loadDB });
      }

      if (mod.setSaveMessageHandler) {
        mod.setSaveMessageHandler(async (entry) => {
          try {
            if (crmDb) {
              const sourceId = `${id}_${entry.from || entry.phone || entry.email || Date.now()}`;
              let lead = crmModule.getLeadBySourceId(crmDb, id, sourceId);
              if (!lead) {
                lead = crmModule.createLead(crmDb, {
                  source: id, source_id: sourceId,
                  name: entry.name || entry.from || entry.phone || id,
                  phone: entry.phone || entry.from || '',
                  email: entry.email || '',
                  stage: 'new', score: 30
                });
              }
              crmModule.addInteraction(crmDb, lead.id, {
                type: id, content: entry.text || entry.content || '',
                direction: 'incoming',
                metadata: JSON.stringify({ name: entry.name, channel: id })
              });

              // Auto-response via calification agent
              try {
                const history = crmDb.prepare('SELECT content, direction, created_at FROM interactions WHERE lead_id = ? ORDER BY created_at DESC LIMIT 5').all(lead.id).reverse();
                const result = await calification.qualify(
                  { name: entry.name, need: entry.text || '', channel: id, phone: entry.phone || '' },
                  history.slice(-5)
                );
                if (result.reply && result.reply !== '(sin respuesta)') {
                  crmModule.addInteraction(crmDb, lead.id, {
                    type: 'calification', content: result.reply,
                    direction: 'outgoing',
                    metadata: JSON.stringify({ channel: id, stage: result.stage, score: result.score })
                  });
                  if (result.stage) {
                    crmModule.moveLeadStage(crmDb, lead.id, result.stage, 'calification_agent', 'Auto-calificado');
                  }
                  if (result.score) {
                    crmModule.updateLead(crmDb, lead.id, { score: Math.max(lead.score || 0, result.score) });
                  }
                }
              } catch (e) {
                console.error(`[${id}] calification error:`, e.message);
              }
            }
          } catch (e) { console.error(`[${id}] save error:`, e.message); }
        });
      }

      if (mod.getStatus) {
        const st = mod.getStatus();
        channels[id].status = st.connected ? 'connected' : 'disconnected';
        channels[id].data = st;
      }
    } catch (e) {
      channels[id].loaded = false;
      channels[id].error = e.message;
    }
  }

  // Unified API
  app.get('/api/channels', (req, res) => {
    const result = {};
    for (const [id, ch] of Object.entries(channels)) {
      let status = ch.status;
      let extra = {};
      if (ch.module?.getStatus) {
        try {
          extra = ch.module.getStatus();
          status = extra.connected ? 'connected' : 'disconnected';
        } catch {}
      }
      result[id] = { name: ch.name, icon: ch.icon, status, description: ch.desc, loaded: ch.loaded, ...extra };
    }
    res.json({ channels: result });
  });

  // Start a channel
  app.post('/api/channels/:id/start', authLimiter, async (req, res) => {
    const ch = channels[req.params.id];
    if (!ch) return res.status(404).json({ error: `Canal '${req.params.id}' no encontrado` });
    if (!ch.module?.start) return res.status(501).json({ error: `Canal '${req.params.id}' no implementa start` });
    try {
      const result = await ch.module.start(req.body);
      ch.status = 'connecting';
      res.json({ success: true, message: `Conectando ${ch.name}...`, ...result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Stop a channel
  app.post('/api/channels/:id/stop', authLimiter, (req, res) => {
    const ch = channels[req.params.id];
    if (!ch) return res.status(404).json({ error: 'Canal no encontrado' });
    if (!ch.module?.stop) return res.status(501).json({ error: 'No implementa stop' });
    try {
      const result = ch.module.stop();
      ch.status = 'disconnected';
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Send via a channel
  app.post('/api/channels/:id/send', apiLimiter, async (req, res) => {
    const ch = channels[req.params.id];
    if (!ch) return res.status(404).json({ error: 'Canal no encontrado' });
    if (!ch.module?.sendMessage) return res.status(501).json({ error: 'No implementa send' });
    const { to, text } = req.body;
    if (!to || !text) return res.status(400).json({ error: 'to y text requeridos' });
    try {
      const result = await ch.module.sendMessage(to, text);
      res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // WhatsApp contacts (CRM)
  app.get('/api/channels/whatsapp/contacts', (req, res) => {
    const mod = channels.whatsapp && channels.whatsapp.module;
    if (!mod || !mod.getContacts) return res.status(501).json({ error: 'getContacts no disponible' });
    const list = mod.getContacts();
    res.json({ contacts: list, count: list.length });
  });

  app.post('/api/channels/whatsapp/sync-contacts', authLimiter, (req, res) => {
    const mod = channels.whatsapp && channels.whatsapp.module;
    if (!mod || !mod.getContacts) return res.status(501).json({ error: 'WhatsApp no disponible o sin contactos' });
    const list = mod.getContacts();
    let added = 0, updated = 0;
    for (const c of list) {
      const sourceId = `whatsapp_${c.phone}`;
      const lead = crmModule.getLeadBySourceId(crmDb, 'whatsapp', sourceId);
      if (!lead) {
        crmModule.createLead(crmDb, {
          source: 'whatsapp', source_id: sourceId,
          name: c.name || c.phone, phone: c.phone,
          stage: 'new', score: 20
        });
        added++;
      } else {
        const patch = {};
        if (!lead.name || lead.name === lead.phone || lead.name === c.phone) patch.name = c.name;
        if (!lead.phone) patch.phone = c.phone;
        if (Object.keys(patch).length) { crmModule.updateLead(crmDb, lead.id, patch); updated++; }
      }
    }
    res.json({ success: true, added, updated, total: list.length });
  });

  console.log('[Channels] Cargados:', Object.keys(channels).filter(k => channels[k].loaded).join(', '));
}

module.exports = { loadAll, channels };
