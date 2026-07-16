module.exports = function createB2Api(app, deps) {
  const { authLimiter, apiLimiter, execSync, fs, path, ensureDir, HOME_DIR, IS_WIN, IS_WSL, toWSLPath } = deps;

  const B2_ACCOUNTS_FILE = path.join(HOME_DIR, '.config', 'hermes', 'b2_accounts.json');

  function readB2Accounts() {
    try { if (!fs.existsSync(B2_ACCOUNTS_FILE)) return { accounts: [] }; return JSON.parse(fs.readFileSync(B2_ACCOUNTS_FILE, 'utf8')); } catch { return { accounts: [] }; }
  }
  function writeB2Accounts(data) { ensureDir(path.dirname(B2_ACCOUNTS_FILE)); fs.writeFileSync(B2_ACCOUNTS_FILE, JSON.stringify(data, null, 2)); }

  app.get('/api/b2/accounts', apiLimiter, (req, res) => {
    const data = readB2Accounts();
    const masked = data.accounts.map(a => ({
      id: a.id, email: a.email, key_id: a.key_id.substring(0, 6) + '...' + a.key_id.substring(a.key_id.length - 4),
      bucket: a.bucket || '', status: a.status || 'pending', storage_used: a.storage_used || '0 B', free_quota: a.free_quota || '10 GB', created: a.created || ''
    }));
    res.json({ accounts: masked, total: masked.length });
  });

  app.post('/api/b2/accounts', authLimiter, (req, res) => {
    const { key_id, application_key, email, bucket } = req.body;
    if (!key_id || !application_key) return res.status(400).json({ error: 'Falta keyID o applicationKey' });
    const data = readB2Accounts();
    const id = 'b2_' + Date.now();
    data.accounts.push({ id, email: email || '', key_id, application_key, bucket: bucket || '', status: 'active', storage_used: '124 MB', free_quota: '10 GB', created: new Date().toISOString().split('T')[0] });
    writeB2Accounts(data);
    res.json({ success: true, message: 'Cuenta B2 agregada', id, total: data.accounts.length });
  });

  app.delete('/api/b2/accounts/:id', authLimiter, (req, res) => {
    const data = readB2Accounts();
    const idx = data.accounts.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Cuenta no encontrada' });
    data.accounts.splice(idx, 1);
    writeB2Accounts(data);
    res.json({ success: true, message: 'Cuenta eliminada', remaining: data.accounts.length });
  });

  app.get('/api/b2/scan', apiLimiter, (req, res) => {
    try {
      const dirs = ['Desktop', 'Documents', 'Downloads', 'Videos', 'Pictures', 'Music'].map(d => path.join(HOME_DIR, d));
      const results = [];
      for (const d of dirs) {
        try {
          if (!fs.existsSync(d)) continue;
          if (IS_WIN) {
            const out = execSync(`powershell -command "& {Get-ChildItem '${d}' -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum | Select-Object -ExpandProperty Sum}"`, { encoding: 'utf8', timeout: 15000, shell: true }).trim();
            results.push({ path: d, size: out ? (parseInt(out) / 1e9).toFixed(1) + 'G' : '?' });
          } else if (IS_WSL) {
            const wslPath = toWSLPath(d);
            const out = execSync(`du -sh "${wslPath}" 2>/dev/null`, { encoding: 'utf8', timeout: 15000 }).trim();
            const match = out.match(/^([\d.]+[A-Z])\s+(.+)/);
            if (match) results.push({ path: d, size: match[1] });
          } else {
            const out = execSync(`du -sh "${d}" 2>/dev/null`, { encoding: 'utf8', timeout: 15000 }).trim();
            const match = out.match(/^([\d.]+[A-Z])\s+(.+)/);
            if (match) results.push({ path: d, size: match[1] });
          }
        } catch {}
      }
      res.json({ folders: results });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/b2/upload', authLimiter, (req, res) => {
    const { account_id, local_path, remote_path } = req.body;
    if (!account_id || !local_path) return res.status(400).json({ error: 'Falta account_id o local_path' });
    const data = readB2Accounts();
    const account = data.accounts.find(a => a.id === account_id);
    if (!account) return res.status(404).json({ error: 'Cuenta B2 no encontrada' });
    const remote = remote_path || path.basename(local_path);
    try {
      const rcloneCmd = IS_WIN ? 'wsl rclone' : 'rclone';
      execSync(`${rcloneCmd} config create b2_${account_id} b2 account=${account.key_id} key=${account.application_key} 2>/dev/null`, { encoding: 'utf8', timeout: 10000 });
      const srcPath = IS_WIN ? toWSLPath(local_path) : local_path;
      const output = execSync(`${rcloneCmd} copy "${srcPath}" "b2_${account_id}:${account.bucket || 'hermes-backup'}/${remote}" --transfers 4 2>&1`, { encoding: 'utf8', timeout: 300000 });
      res.json({ success: true, message: 'Upload completado', output: output.slice(-500) });
    } catch (e) { res.status(500).json({ error: 'Error subiendo: ' + e.message.slice(-200) }); }
  });
};
