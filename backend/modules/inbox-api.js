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
         JOIN conversations c ON i.lead_id = c.lead_id
         LEFT JOIN leads l ON i.lead_id = l.id
         WHERE c.id = ? ORDER BY i.created_at DESC LIMIT ?`
      ).all(req.params.id, limit);
      res.json({ messages });
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
