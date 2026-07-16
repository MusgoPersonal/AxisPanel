module.exports = function createObscuraApi(app, deps) {
  const { authLimiter, apiLimiter, execSync, fs, path, spawn } = deps;

  const OBSCURA_BIN = path.join(__dirname, '..', '..', 'obscura', 'bin', 'obscura.exe');
  let obscuraProcess = null;

  app.get('/api/calcom/status', (req, res) => {
    const calDir = path.join(__dirname, '..', '..', 'cal.diy');
    const cloned = fs.existsSync(path.join(calDir, 'package.json'));
    res.json({ cloned, path: calDir.replace(/\\/g, '/') });
  });

  app.get('/api/obscura/status', (req, res) => {
    const installed = fs.existsSync(OBSCURA_BIN);
    let running = false;
    if (obscuraProcess) {
      try { running = !obscuraProcess.killed; } catch { running = false; }
      if (!running) obscuraProcess = null;
    }
    if (!running) {
      try {
        const c = new AbortController(); setTimeout(() => c.abort(), 2000);
        running = fetch('http://localhost:9222/json/version', { signal: c.signal }).then(r => r.ok).catch(() => false);
      } catch {}
    }
    res.json({ installed, running, binary: OBSCURA_BIN, port: 9222 });
  });

  app.post('/api/obscura/start', authLimiter, (req, res) => {
    try {
      if (obscuraProcess && !obscuraProcess.killed) {
        return res.json({ success: true, message: 'Ya corriendo', port: 9222 });
      }
      const useStealth = req.body.stealth !== false;
      const args = ['serve', '--port', '9222'];
      if (useStealth) args.push('--stealth');
      const child = spawn(OBSCURA_BIN, args, {
        windowsHide: true, shell: true,
        stdio: 'ignore', detached: true
      });
      child.unref();
      obscuraProcess = child;
      res.json({ success: true, message: 'Obscura iniciando en :9222' + (useStealth ? ' con stealth' : ''), pid: child.pid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/obscura/stop', authLimiter, (req, res) => {
    try {
      if (obscuraProcess && !obscuraProcess.killed) {
        const pid = obscuraProcess.pid;
        obscuraProcess.kill('SIGTERM');
        obscuraProcess = null;
        res.json({ success: true, message: 'Obscura detenido', pid });
      } else {
        res.json({ success: true, message: 'No estaba corriendo' });
      }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/obscura/fetch', apiLimiter, async (req, res) => {
    const { url, stealth } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });
    try {
      const args = ['fetch', url];
      if (stealth !== false) args.push('--stealth');
      const child = spawn(OBSCURA_BIN, args, { windowsHide: true, timeout: 30000, shell: true });
      let out = ''; child.stdout.on('data', d => out += d);
      child.stderr.on('data', d => out += d);
      const code = await new Promise(r => child.on('close', r));
      if (code === 0) return res.json({ html: out.slice(0, 5000) });
      res.status(502).json({ error: out.slice(0, 500) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/n8n/status', async (req, res) => {
    let running = false;
    try {
      const c = new AbortController(); setTimeout(() => c.abort(), 3000);
      running = (await fetch('http://localhost:5678/healthz', { signal: c.signal })).ok;
    } catch {}
    let installed = false;
    try {
      execSync('n8n --version 2>nul', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
      installed = true;
    } catch {}
    res.json({ running, installed, port: 5678, url: 'http://localhost:5678' });
  });

  app.post('/api/n8n/start', authLimiter, (req, res) => {
    try {
      const child = spawn('n8n', ['start'], {
        windowsHide: true, shell: true,
        env: { ...process.env, N8N_PORT: '5678' },
        stdio: 'ignore', detached: true
      });
      child.unref();
      res.json({ success: true, message: 'n8n iniciando en http://localhost:5678', pid: child.pid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
