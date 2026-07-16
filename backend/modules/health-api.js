const os = require('os');
const { execSync } = require('child_process');

module.exports = function createHealthApi(app, deps) {
  const { authLimiter, apiLimiter, readFromFile, KEYS_FILE, CONFIG_DIR } = deps;

  app.get('/api/health/check', apiLimiter, async (req, res) => {
    const issues = [];
    try {
      const keysData = readFromFile(KEYS_FILE);

      for (const [provider, cfg] of Object.entries(keysData.providers || {})) {
        const activeKeys = (cfg.keys || []).filter(k => k && !k.includes('REEMPLAZA'));
        if (activeKeys.length === 0) issues.push({ severity: 'high', area: 'keys', message: `${provider}: sin keys activas` });
      }

      const logs = readFromFile(path.join(CONFIG_DIR, 'logs', 'hermes.json'));
      const recentLogs = (logs.logs || []).slice(-5);
      const errorRate = recentLogs.filter(l => l.error).length;
      if (recentLogs.length > 0 && errorRate / recentLogs.length > 0.5) issues.push({ severity: 'medium', area: 'hermes', message: `Tasa de error alta (${errorRate}/${recentLogs.length})` });

      const mem = process.memoryUsage();
      const disk = (() => { try { return parseFloat(execSync('wmic logicaldisk get size,freespace /format:csv 2>nul', { shell: true, timeout: 3000 }).toString().split('\n').filter(l => l.includes('C:'))[0]?.split(',')[2] || 0); } catch { return 0; } })();

      res.json({ status: issues.length === 0 ? 'healthy' : 'degraded', issues, uptime: process.uptime(), memory: { rss: Math.round(mem.rss / 1024 / 1024) + 'MB', heap: Math.round(mem.heapUsed / 1024 / 1024) + 'MB' }, free_disk_gb: Math.round(disk / 1073741824) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/health/fix', authLimiter, async (req, res) => {
    const fixes = [];
    try {
      const plan = req.body.plan;
      if (plan === 'keys') {
        fixes.push({ action: 'keys', status: 'manual', message: 'Agregá keys en /api/rotate o en el panel de Keys' });
      } else if (plan === 'hermes') {
        fixes.push({ action: 'hermes', status: 'manual', message: 'Revisá los logs en /api/logs' });
      } else {
        fixes.push({ action: 'unknown', status: 'error', message: 'Plan no reconocido. Usá: keys, hermes' });
      }
      res.json({ success: true, fixes, message: fixes.length > 0 ? 'Revisá las sugerencias arriba' : 'Todo ok' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/ip', async (req, res) => {
    try {
      const [r1, r2] = await Promise.allSettled([
        fetch('https://api.ipify.org?format=json').then(r => r.json()),
        fetch('https://ipapi.co/json').then(r => r.json())
      ]);
      const ipv4 = r1.status === 'fulfilled' ? r1.value.ip : null;
      const geo = r2.status === 'fulfilled' ? { city: r2.value.city, region: r2.value.region, country: r2.value.country_name, org: r2.value.org } : {};
      res.json({ ip: ipv4 || 'unknown', hostname: os.hostname(), platform: process.platform, ...geo });
    } catch { res.json({ ip: 'unknown', hostname: os.hostname(), platform: process.platform }); }
  });

  app.get('/api/setup/docker', (req, res) => {
    const setupPath = path.join(__dirname, '..', 'scripts', 'setup_docker.bat');
    if (fs.existsSync(setupPath)) {
      try {
        execSync(`start "" "${setupPath}"`, { shell: true, timeout: 3000 });
        res.json({ success: true, message: 'setup_docker.bat abierto' });
      } catch (e) { res.json({ success: true, message: 'Archivo listo para abrir manualmente', file: setupPath }); }
    } else { res.status(404).json({ success: false, error: 'setup_docker.bat no encontrado' }); }
  });
};
