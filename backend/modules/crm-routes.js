function createCRMRoutes(app, db, authLimiter, apiLimiter) {
  // ─── Leads list ───
  app.get('/api/crm/leads', apiLimiter, (req, res) => {
    try {
      const result = require('./crm-db.js').getLeads(db, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Lead detail ───
  app.get('/api/crm/leads/:id', apiLimiter, (req, res) => {
    try {
      const lead = require('./crm-db.js').getLead(db, parseInt(req.params.id));
      if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
      res.json(lead);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Create lead ───
  app.post('/api/crm/leads', authLimiter, (req, res) => {
    try {
      const lead = require('./crm-db.js').createLead(db, req.body);
      res.status(201).json(lead);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Update lead ───
  app.patch('/api/crm/leads/:id', authLimiter, (req, res) => {
    try {
      const lead = require('./crm-db.js').updateLead(db, parseInt(req.params.id), req.body);
      if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
      res.json(lead);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Delete lead ───
  app.delete('/api/crm/leads/:id', authLimiter, (req, res) => {
    try {
      require('./crm-db.js').deleteLead(db, parseInt(req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Move lead stage ───
  app.post('/api/crm/leads/:id/move', authLimiter, (req, res) => {
    try {
      const { stage, note } = req.body;
      if (!stage) return res.status(400).json({ error: 'stage requerido' });
      const movedBy = req.user ? req.user.email || req.user.uid : 'api';
      const lead = require('./crm-db.js').moveLeadStage(db, parseInt(req.params.id), stage, movedBy, note || '');
      if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
      res.json(lead);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Add interaction ───
  app.post('/api/crm/leads/:id/interactions', authLimiter, (req, res) => {
    try {
      const interaction = require('./crm-db.js').addInteraction(db, parseInt(req.params.id), req.body);
      res.status(201).json(interaction);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Create task ───
  app.post('/api/crm/leads/:id/tasks', authLimiter, (req, res) => {
    try {
      const task = require('./crm-db.js').createTask(db, parseInt(req.params.id), req.body);
      res.status(201).json(task);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Complete task ───
  app.post('/api/crm/tasks/:id/complete', authLimiter, (req, res) => {
    try {
      const task = require('./crm-db.js').completeTask(db, parseInt(req.params.id));
      if (!task) return res.status(404).json({ error: 'Tarea no encontrada o ya completada' });
      res.json(task);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Pipeline stats ───
  app.get('/api/crm/pipeline', apiLimiter, (req, res) => {
    try {
      const stats = require('./crm-db.js').getPipelineStats(db);
      res.json({ stages: stats });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Global stats ───
  app.get('/api/crm/stats', apiLimiter, (req, res) => {
    try {
      const stats = require('./crm-db.js').getStats(db);
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Categories list (from DB) ───
  app.get('/api/crm/categories', apiLimiter, (req, res) => {
    try {
      const cats = db.prepare("SELECT category, COUNT(*) as count FROM leads WHERE length(category) > 0 GROUP BY category ORDER BY count DESC").all();
      res.json(cats);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Sources list ───
  app.get('/api/crm/sources', apiLimiter, (req, res) => {
    try {
      const sources = db.prepare('SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC').all();
      res.json(sources);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { createCRMRoutes };
