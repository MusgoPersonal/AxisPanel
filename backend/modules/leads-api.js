module.exports = function createLeadsApi(app, deps) {
  const { authLimiter, apiLimiter, leadsDB, saveDB, loadDB, getLeads, getLeadStats, updateLeadStatus, runFullScrape, scrapeCategory, CATEGORIES_SANTIAGO, gosom, syncLeadsToCRM } = deps;

  app.get('/api/leads/stats', apiLimiter, (req, res) => {
    if (!leadsDB || !getLeadStats) return res.status(500).json({ error: 'DB no inicializada' });
    try { res.json(getLeadStats(leadsDB)); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/leads', apiLimiter, (req, res) => {
    if (!leadsDB || !getLeads) return res.status(500).json({ error: 'DB no inicializada' });
    try {
      const { category, status, minScore, limit = 100, offset = 0 } = req.query;
      res.json({ leads: getLeads(leadsDB, { category: category || null, status: status || null, minScore: minScore ? parseInt(minScore) : null, limit: parseInt(limit), offset: parseInt(offset) }), total: 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/leads/:id', apiLimiter, (req, res) => {
    if (!leadsDB) return res.status(500).json({ error: 'DB no inicializada' });
    try {
      const lead = leadsDB.leads.find(l => l.id == req.params.id);
      if (!lead) return res.status(404).json({ error: 'No encontrado' });
      res.json(lead);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/leads/:id', authLimiter, async (req, res) => {
    if (!leadsDB || !updateLeadStatus) return res.status(500).json({ error: 'DB no inicializada' });
    try {
      const { status, tags } = req.body;
      await updateLeadStatus(leadsDB, req.params.id, status, tags);
      if (saveDB) saveDB(leadsDB);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/scrape/run', authLimiter, async (req, res) => {
    if (!leadsDB || !runFullScrape) return res.status(500).json({ error: 'Scraper no disponible' });
    try {
      const total = await runFullScrape();
      leadsDB = await loadDB();
      syncLeadsToCRM('google_maps');
      res.json({ success: true, total });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/scrape/category', authLimiter, async (req, res) => {
    if (!leadsDB || !scrapeCategory) return res.status(500).json({ error: 'Scraper no disponible' });
    try {
      const { query, category, priority } = req.body;
      if (!query || !category) return res.status(400).json({ error: 'query y category requeridos' });
      const saved = await scrapeCategory(leadsDB, { query, category, priority: priority || 1 });
      leadsDB = await loadDB();
      syncLeadsToCRM('google_maps', category);
      res.json({ success: true, saved });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/scrape/categories', (req, res) => {
    res.json(CATEGORIES_SANTIAGO || []);
  });

  app.get('/api/scrape/gosom/status', (req, res) => {
    if (!gosom) return res.json({ docker_available: false, docker_ok: false, image_available: false, error: 'gosom module not loaded' });
    const dockerOk = gosom.checkDocker();
    const imageOk = dockerOk ? gosom.checkImage() : false;
    res.json({ docker_available: dockerOk, image_available: imageOk, image_name: 'gosom/google-maps-scraper', docker_ok: dockerOk && imageOk });
  });

  app.post('/api/scrape/gosom/run', authLimiter, async (req, res) => {
    if (!leadsDB) return res.status(500).json({ error: 'DB no inicializada' });
    if (!gosom) return res.json({ success: false, error: 'gosom module not loaded' });
    try {
      const { queries, depth = 1, concurrency = 2, lang = 'es' } = req.body;
      const inputQueries = Array.isArray(queries) && queries.length > 0 ? queries : CATEGORIES_SANTIAGO.map(c => c.query);
      const dockerOk = gosom.checkDocker();
      if (!dockerOk) return res.json({ success: false, docker_unavailable: true, message: 'Docker no accesible', instructions: gosom.getManualInstructions() });
      const result = await gosom.runScrape(inputQueries, { depth, concurrency, lang });
      let savedCount = 0;
      for (const lead of result) {
        const exists = leadsDB.leads.find(l => l.source === 'google_maps_gosom' && l.source_id === lead.source_id);
        if (!exists) { lead.id = leadsDB.nextId++; leadsDB.leads.push(lead); savedCount++; }
      }
      await saveDB(leadsDB); leadsDB = await loadDB();
      syncLeadsToCRM('google_maps_gosom');
      res.json({ success: true, total_results: result.length, saved: savedCount, message: `${result.length} resultados, ${savedCount} nuevos` });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/scrape/gosom/import', authLimiter, async (req, res) => {
    if (!leadsDB) return res.status(500).json({ error: 'DB no inicializada' });
    if (!gosom) return res.json({ success: false, error: 'gosom module not loaded' });
    try {
      const results = gosom.importExistingResults();
      if (!results) return res.json({ success: false, message: 'No hay resultados previos. Ejecuta el scraper primero.' });
      let savedCount = 0;
      for (const lead of results) {
        const exists = leadsDB.leads.find(l => l.source === 'google_maps_gosom' && l.source_id === lead.source_id);
        if (!exists) { lead.id = leadsDB.nextId++; leadsDB.leads.push(lead); savedCount++; }
      }
      await saveDB(leadsDB); leadsDB = await loadDB();
      syncLeadsToCRM('google_maps_gosom');
      res.json({ success: true, total_results: results.length, saved: savedCount, message: `${savedCount} leads importados` });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
