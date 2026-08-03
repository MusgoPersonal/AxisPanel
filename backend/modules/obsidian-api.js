const fs = require('fs');
const path = require('path');

module.exports = function createObsidianApi(app, { authLimiter, apiLimiter }) {
  const IS_WIN = process.platform === 'win32';
  const VAULT_PATH = process.env.AXIS_OBSIDIAN_VAULT ||
    (IS_WIN ? 'C:\\AxisPanel\\vault' : '/opt/axispanel/vault');
  const OBSIDIAN_CLI = IS_WIN
    ? path.join(
        process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'),
        'Programs', 'Obsidian', 'Obsidian.com'
      )
    : '/usr/bin/obsidian';

  function vaultExists() {
    return fs.existsSync(VAULT_PATH) && fs.statSync(VAULT_PATH).isDirectory();
  }

  function listNotes() {
    if (!vaultExists()) return [];
    try {
      return fs.readdirSync(VAULT_PATH).filter(f => f.endsWith('.md'));
    } catch { return []; }
  }

  function resolveVaultPath(filePath) {
    const p = filePath.endsWith('.md') ? filePath : filePath + '.md';
    return path.join(VAULT_PATH, p);
  }

  function readNote(filePath) {
    const fullPath = resolveVaultPath(filePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf8');
  }

  function writeNote(filePath, content) {
    const fullPath = resolveVaultPath(filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    return fullPath;
  }

  function appendNote(filePath, content) {
    const fullPath = resolveVaultPath(filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.appendFileSync(fullPath, '\n' + content, 'utf8');
    return fullPath;
  }

  function getDailyPath() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day + '.md';
  }

  function searchInNotes(query, limit) {
    const results = [];
    const notes = listNotes();
    const lowerQuery = query.toLowerCase();
    const max = parseInt(limit) || 20;
    for (const file of notes) {
      try {
        const content = readNote(file);
        if (!content) continue;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lowerQuery)) {
            results.push({ file, line: i + 1, content: lines[i].trim().slice(0, 200) });
            if (results.length >= max) break;
          }
        }
      } catch {}
      if (results.length >= max) break;
    }
    return results;
  }

  app.get('/api/obsidian/status', async (req, res) => {
    const installed = fs.existsSync(OBSIDIAN_CLI);
    if (!vaultExists()) {
      return res.json({ installed, connected: false, error: 'Vault no encontrado: ' + VAULT_PATH });
    }
    const notes = listNotes();
    res.json({
      installed,
      connected: true,
      vaultPath: VAULT_PATH,
      fileCount: notes.length,
      files: notes,
      mode: 'fs-direct'
    });
  });

  app.post('/api/obsidian/search', apiLimiter, async (req, res) => {
    const { query, limit } = req.body;
    if (!query) return res.status(400).json({ error: 'Falta query' });
    if (!vaultExists()) return res.status(404).json({ error: 'Vault no encontrado' });
    const results = searchInNotes(query, limit);
    res.json({ results });
  });

  app.post('/api/obsidian/read', apiLimiter, async (req, res) => {
    const { file, path: filePath } = req.body;
    const target = filePath || file;
    if (!target) return res.status(400).json({ error: 'Falta file o path' });
    const content = readNote(target);
    if (content === null) return res.status(404).json({ error: 'No encontrado: ' + target });
    res.json({ success: true, content });
  });

  app.post('/api/obsidian/create', apiLimiter, async (req, res) => {
    const { name, content, template, path: filePath, open } = req.body;
    let target = filePath || (name || 'nota-' + Date.now()) + '.md';
    if (!target.endsWith('.md')) target += '.md';
    const fullPath = writeNote(target, content || '');
    res.json({ success: true, path: fullPath.replace(VAULT_PATH + path.sep, '') });
  });

  app.post('/api/obsidian/tasks', apiLimiter, async (req, res) => {
    const { file, daily, done, todo } = req.body;
    const target = daily ? getDailyPath() : (file || getDailyPath());
    if (!vaultExists()) return res.status(404).json({ error: 'Vault no encontrado' });
    const content = readNote(target);
    if (!content) return res.json({ results: [] });
    const re = /^[\s>]*[-*]\s+\[([ xX])\]\s+(.+)$/gm;
    const results = [];
    let m;
    while ((m = re.exec(content)) !== null) {
      const completed = m[1] === 'x' || m[1] === 'X';
      if (done && !completed) continue;
      if (todo && completed) continue;
      results.push({ file: target, completed, text: m[2], raw: m[0].trim() });
    }
    res.json({ results });
  });

  app.post('/api/obsidian/daily', apiLimiter, async (req, res) => {
    const { action, content } = req.body;
    const today = getDailyPath();
    if (action === 'append' || action === 'prepend') {
      if (!content) return res.status(400).json({ error: 'Falta content' });
      if (!vaultExists()) fs.mkdirSync(VAULT_PATH, { recursive: true });
      if (action === 'prepend') {
        const existing = readNote(today);
        writeNote(today, content + '\n' + (existing || ''));
      } else {
        appendNote(today, content);
      }
      return res.json({ success: true, file: today, action });
    }
    const existing = readNote(today);
    res.json({ success: true, content: existing || '(daily vacía)' });
  });

  app.post('/api/obsidian/command', apiLimiter, async (req, res) => {
    const { cmd } = req.body;
    if (!cmd || typeof cmd !== 'string') return res.status(400).json({ error: 'Falta cmd' });
    const parts = cmd.trim().split(/\s+/);
    if (parts[0] === 'read' && parts[1]) {
      const target = parts[1].replace(/^(file|path)=/, '');
      const content = readNote(target);
      if (content === null) return res.json({ code: 1, stdout: '', stderr: 'No encontrado' });
      return res.json({ code: 0, stdout: content, stderr: '' });
    }
    if (parts[0] === 'create') {
      let name = '', content = '';
      for (const p of parts.slice(1)) {
        if (p.startsWith('name=')) name = p.slice(5);
        else if (p.startsWith('content=')) content = p.slice(8);
      }
      if (name) {
        writeNote(name + '.md', content);
        return res.json({ code: 0, stdout: 'Creado: ' + name + '.md', stderr: '' });
      }
    }
    if (parts[0] === 'search') {
      let query = '', limit = 20;
      for (const p of parts.slice(1)) {
        if (p.startsWith('query=')) query = p.slice(6);
        else if (p.startsWith('limit=')) limit = parseInt(p.slice(6)) || 20;
      }
      if (query) return res.json({ code: 0, stdout: JSON.stringify(searchInNotes(query, limit)), stderr: '' });
    }
    if (parts[0] === 'version') return res.json({ code: 0, stdout: 'fs-direct', stderr: '' });
    if (parts[0] === 'vault' && parts[1] === 'list') {
      return res.json({ code: 0, stdout: 'name\tAxisPanel\npath\t' + VAULT_PATH + '\nfiles\t' + listNotes().length, stderr: '' });
    }
    res.json({ code: -1, stdout: '', stderr: 'Comando no soportado en modo fs: ' + cmd });
  });

  app.get('/api/obsidian/graph', async (req, res) => {
    try {
      if (!vaultExists()) return res.json({ nodes: [], edges: [] });
      const files = listNotes();
      const wikilinkRe = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
      const nodes = []; const edges = []; const noteMap = {};
      for (const file of files) {
        const name = file.replace('.md', '');
        noteMap[name] = true;
        nodes.push({ id: name, name, file });
      }
      for (const file of files) {
        const name = file.replace('.md', '');
        const content = fs.readFileSync(path.join(VAULT_PATH, file), 'utf8');
        const matches = content.matchAll(wikilinkRe);
        const seen = new Set();
        for (const m of matches) {
          const target = m[1].trim();
          if (target !== name && noteMap[target] && !seen.has(target)) {
            seen.add(target);
            edges.push({ source: name, target });
          }
        }
      }
      res.json({ nodes, edges });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
