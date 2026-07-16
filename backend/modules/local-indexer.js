const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const INDEX_FILE = path.join(__dirname, '..', '..', '.codex-index.json');
const ROOT_DIR = path.resolve(path.join(__dirname, '..', '..'));

const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.cache', 'dist', 'build', '.venv', '__pycache__', 'target', 'bin', '.yarn']);
const EXCLUDE_EXTS = new Set(['.exe', '.dll', '.so', '.dylib', '.zip', '.gz', '.tar', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.eot', '.ttf', '.map', '.log']);

function walkDir(dir, relative = '') {
  const entries = [];
  try {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of list) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          entries.push(...walkDir(full, rel));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!EXCLUDE_EXTS.has(ext)) {
          try {
            const stat = fs.statSync(full);
            let preview = '';
            if (stat.size < 50000) {
              const content = fs.readFileSync(full, 'utf8').slice(0, 300);
              preview = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
            }
            entries.push({ path: rel, size: stat.size, mtime: stat.mtime.toISOString(), ext, preview });
          } catch {}
        }
      }
    }
  } catch {}
  return entries;
}

function buildIndex() {
  const files = walkDir(ROOT_DIR);
  const index = {
    version: 2,
    builtAt: new Date().toISOString(),
    root: ROOT_DIR,
    totalFiles: files.length,
    files
  };
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
  return index;
}

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch { return null; }
}

function searchIndex(query, limit = 30) {
  const index = loadIndex();
  if (!index) return { error: 'No hay índice. Construilo primero.' };
  const q = query.toLowerCase();
  const results = [];
  for (const f of index.files) {
    const nameMatch = f.path.toLowerCase().includes(q);
    const previewMatch = f.preview && f.preview.toLowerCase().includes(q);
    if (nameMatch || previewMatch) {
      results.push({
        path: f.path,
        size: f.size,
        ext: f.ext,
        preview: f.preview,
        matchType: nameMatch ? 'filename' : 'content'
      });
      if (results.length >= limit) break;
    }
  }
  return { query, totalResults: results.length, results };
}

function rgSearch(query, limit = 20) {
  try {
    const excludePatterns = Array.from(EXCLUDE_DIRS).join('/|');
    const args = [
      '--json',
      '--max-count', '3',
      '--max-depth', '15',
      '-g', '!node_modules/**',
      '-g', '!.git/**',
      '-g', '!dist/**',
      '-g', '!build/**',
      '-g', '!.venv/**',
      '-g', '!target/**',
      '-g', '!*.exe', '-g', '!*.dll', '-g', '!*.so',
      '-g', '!*.png', '-g', '!*.jpg', '-g', '!*.svg',
      '-g', '!*.zip', '-g', '!*.gz',
      '-g', '!*.map', '-g', '!*.log',
      '-i',
      '--', query,
      ROOT_DIR
    ];
    const out = execSync(`rg ${args.map(a => `"${a}"`).join(' ')}`, { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, shell: true });
    const lines = out.split('\n').filter(Boolean);
    const results = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'match') {
          const relPath = path.relative(ROOT_DIR, parsed.data.path.text).replace(/\\/g, '/');
          results.push({
            path: relPath,
            line: parsed.data.line_number,
            column: parsed.data.absolute_column || 0,
            text: parsed.data.lines.text.trim(),
            submatches: (parsed.data.submatches || []).map(s => s.match.text)
          });
        }
      } catch {}
    }
    return { query, totalResults: results.length, results: results.slice(0, limit) };
  } catch (e) {
    return { query, error: e.message, results: [] };
  }
}

module.exports = { buildIndex, loadIndex, searchIndex, rgSearch, INDEX_FILE, ROOT_DIR };
