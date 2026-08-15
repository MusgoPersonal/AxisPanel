module.exports = function createInboxApi(app, { crmDb, authLimiter }) {

  app.get('/api/inbox', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const channel = req.query.channel || null;

      let sql = `SELECT c.*, l.name as lead_name, l.email as lead_email, l.phone as lead_phone, l.stage as lead_stage
        FROM conversations c LEFT JOIN leads l ON c.lead_id = l.id
        WHERE c.status = 'active'`;
      const params = [];
      if (channel) { sql += ' AND c.channel = ?'; params.push(channel); }
      sql += ' ORDER BY c.last_activity DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const conversations = crmDb.prepare(sql).all(...params);
      const total = crmDb.prepare("SELECT COUNT(*) as c FROM conversations WHERE status = 'active'").get().c;
      const unread = crmDb.prepare("SELECT SUM(unread) as c FROM conversations WHERE status = 'active'").get().c || 0;
      res.json({ conversations, total, unread });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/inbox/:id/messages', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const messages = crmDb.prepare(
        `SELECT i.*, l.name as lead_name FROM interactions i
         LEFT JOIN leads l ON i.lead_id = l.id
         WHERE i.lead_id = ? ORDER BY i.created_at DESC LIMIT ?`
      ).all(req.params.id, limit);
      res.json({ messages });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/inbox/:id/messages', (req, res) => {
    try {
      const { content, direction, channel } = req.body || {};
      if (!content) return res.status(400).json({ error: 'content requerido' });
      const lead = crmDb.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
      if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
      const interaction = require('./crm-db.js').addInteraction(crmDb, lead.id, {
        type: 'chat', content, direction: direction || 'outgoing', channel: channel || 'manual'
      });
      res.json({ success: true, message: interaction });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/inbox/stats', (req, res) => {
    try {
      const byChannel = crmDb.prepare(
        "SELECT channel, COUNT(*) as count, SUM(unread) as unread FROM conversations WHERE status = 'active' GROUP BY channel"
      ).all();
      const total = crmDb.prepare("SELECT COUNT(*) as c FROM conversations WHERE status = 'active'").get().c;
      const totalLeads = crmDb.prepare('SELECT COUNT(*) as c FROM leads').get().c;
      const byStage = crmDb.prepare('SELECT stage, COUNT(*) as count FROM leads GROUP BY stage ORDER BY count DESC').all();
      res.json({ total, totalLeads, byChannel, byStage });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

};
