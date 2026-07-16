module.exports = function createBuilderbotApi(app, deps) {
  const { authLimiter, apiLimiter, execSync, fs, path, ensureDir, spawn } = deps;

  app.get('/api/builderbot/status', async (req, res) => {
    try {
      const builderbotDir = path.join(__dirname, '..', '..', 'builderbot');
      const installed = fs.existsSync(builderbotDir);
      let version = null;
      if (installed) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(builderbotDir, 'package.json'), 'utf8'));
          version = pkg.version;
        } catch {}
      }
      res.json({ installed, version, dir: builderbotDir });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/builderbot/create', apiLimiter, async (req, res) => {
    const { name, provider = 'baileys', database = 'json' } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre del bot requerido' });
    try {
      const botsDir = path.join(__dirname, '..', '..', 'bots');
      ensureDir(botsDir);
      const botPath = path.join(botsDir, name);
      if (fs.existsSync(botPath)) return res.status(400).json({ error: `Ya existe un bot llamado '${name}'` });
      const child = spawn('npx.cmd', ['create-builderbot', name, '--provider', provider, '--database', database], {
        cwd: botsDir, windowsHide: true, timeout: 120000, shell: true
      });
      let out = '';
      child.stdout.on('data', d => { out += d.toString(); });
      child.stderr.on('data', d => { out += d.toString(); });
      const code = await new Promise(r => child.on('close', r));
      if (code !== 0) return res.status(500).json({ error: `Error creando bot: ${out.slice(0, 500)}` });
      res.json({ success: true, message: `Bot '${name}' creado`, path: botPath, output: out.slice(0, 1000) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/builderbot/bots', apiLimiter, (req, res) => {
    const botsDir = path.join(__dirname, '..', '..', 'bots');
    ensureDir(botsDir);
    try {
      const bots = fs.readdirSync(botsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(botsDir, d.name, 'package.json')))
        .map(d => {
          let pkg = {};
          try { pkg = JSON.parse(fs.readFileSync(path.join(botsDir, d.name, 'package.json'), 'utf8')); } catch {}
          return { name: d.name, version: pkg.version || '?', description: pkg.description || '' };
        });
      res.json({ bots });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/builderbot/start/:name', authLimiter, async (req, res) => {
    const { name } = req.params;
    const botPath = path.join(__dirname, '..', '..', 'bots', name);
    if (!fs.existsSync(botPath)) return res.status(404).json({ error: `Bot '${name}' no encontrado` });
    try {
      const child = spawn('node', ['app.js'], { cwd: botPath, windowsHide: true, shell: true });
      let out = '';
      child.stdout.on('data', d => out += d.toString());
      child.stderr.on('data', d => out += d.toString());
      setTimeout(() => {
        res.json({ success: true, message: `Bot '${name}' iniciado`, pid: child.pid, output: out.slice(0, 500) });
      }, 3000);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
