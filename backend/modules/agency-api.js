module.exports = function createAgencyApi(app, deps) {
  const { apiLimiter, fs, path, readFromFile, KEYS_FILE } = deps;

  const AGENCY_DIR = path.join(__dirname, '..', '..', 'agency-agents');
  const AGENCY_DIVISIONS = ['academic','design','engineering','finance','game-development','gis','healthcare','marketing','paid-media','product','project-management','sales','security','spatial-computing','specialized','support','testing'];

  app.get('/api/agency/divisions', (req, res) => {
    try {
      const divs = JSON.parse(fs.readFileSync(path.join(AGENCY_DIR, 'divisions.json'), 'utf8'));
      res.json(divs);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/agency/agents', (req, res) => {
    const division = req.query.division || null;
    try {
      const allAgents = [];
      const dirs = division ? [division] : AGENCY_DIVISIONS;
      for (const dir of dirs) {
        const dirPath = path.join(AGENCY_DIR, dir);
        if (!fs.existsSync(dirPath)) continue;
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
          const nameMatch = content.match(/^#\s+(.+)/m);
          const descMatch = content.match(/(?:descripci[oó]n|specialty|desc):\s*(.+)/i);
          allAgents.push({
            slug: file.replace('.md', ''),
            division: dir,
            name: nameMatch ? nameMatch[1].trim() : file.replace('.md', ''),
            description: descMatch ? descMatch[1].trim() : '',
            file: file,
          });
        }
      }
      res.json({ agents: allAgents, total: allAgents.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/agency/agent/:slug', (req, res) => {
    const { slug } = req.params;
    for (const dir of AGENCY_DIVISIONS) {
      const filePath = path.join(AGENCY_DIR, dir, `${slug}.md`);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return res.type('text/markdown').send(content);
      }
    }
    res.status(404).json({ error: `Agente '${slug}' no encontrado` });
  });

  app.post('/api/agency/chat', apiLimiter, async (req, res) => {
    const { agent, message } = req.body;
    if (!agent || !message) return res.status(400).json({ error: 'agent y message requeridos' });

    let agentContent = '';
    for (const dir of AGENCY_DIVISIONS) {
      const filePath = path.join(AGENCY_DIR, dir, `${agent}.md`);
      if (fs.existsSync(filePath)) {
        agentContent = fs.readFileSync(filePath, 'utf8');
        break;
      }
    }
    if (!agentContent) return res.status(404).json({ error: `Agente '${agent}' no encontrado` });

    const systemPrompt = `Actúa como el siguiente agente especializado. Sigue su personalidad, sus workflows y sus entregables al pie de la letra.\n\n---\n${agentContent}\n---`;

    try {
      const keysData = readFromFile(KEYS_FILE);
      const openrouterKey = keysData.providers?.openrouter?.keys?.[0];
      const googleKey = keysData.providers?.google?.keys?.[0];

      if (openrouterKey) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openrouterKey}` },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ],
            stream: false, max_tokens: 1500
          }),
          signal: AbortSignal.timeout(30000)
        });
        if (response.ok) {
          const data = await response.json();
          return res.json({ reply: data.choices?.[0]?.message?.content || '(sin respuesta)', agent });
        }
      }

      if (googleKey) {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': googleKey },
          body: JSON.stringify({
            model: 'gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ],
            stream: false, max_tokens: 1500
          }),
          signal: AbortSignal.timeout(15000)
        });
        if (response.ok) {
          const data = await response.json();
          return res.json({ reply: data.choices?.[0]?.message?.content || '(sin respuesta)', agent });
        }
      }

      res.status(502).json({ error: 'Sin API keys disponibles para consultar agente' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
