const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const DOCKER_IMAGE = 'gosom/google-maps-scraper';
const DATA_DIR = path.join(process.env.USERPROFILE, '.config', 'gmaps_output');
const WSL_DISTRO = 'Ubuntu-22.04';
const TCP_HOST = 'tcp://127.0.0.1:2375';

let _dockerPrefix = null;

function _dockerCmd() {
  if (_dockerPrefix) return _dockerPrefix;

  const candidates = [];

  if (process.platform === 'win32') {
    candidates.push(
      { prefix: 'docker', label: 'native Windows', test: () => _tryExec('docker info --format "{{.ServerVersion}}"') },
      { prefix: `docker -H ${TCP_HOST}`, label: `TCP ${TCP_HOST}`, test: () => _tryExec(`docker -H ${TCP_HOST} info --format "{{.ServerVersion}}"`) },
      { prefix: `wsl -d ${WSL_DISTRO} docker`, label: `WSL ${WSL_DISTRO}`, test: () => _tryExec(`wsl -d ${WSL_DISTRO} docker info --format "{{.ServerVersion}}"`) },
    );
  } else {
    candidates.push(
      { prefix: 'docker', label: 'native', test: () => _tryExec('docker info --format "{{.ServerVersion}}"') },
    );
  }

  for (const c of candidates) {
    const out = c.test();
    if (out) {
      _dockerPrefix = c.prefix;
      console.log(`[GOSOM] Docker accesible via: ${c.label} (${c.prefix})`);
      return c.prefix;
    }
  }

  _dockerPrefix = false;
  return null;
}

function _tryExec(cmd) {
  try {
    const out = execSync(cmd, {
      encoding: 'utf8',
      timeout: 5000,
      shell: process.platform === 'win32' ? true : false,
      windowsHide: true,
    }).trim();
    return out.length > 0 && !out.includes('error') && !out.includes('Err') ? out : null;
  } catch { return null; }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function checkDocker() {
  return _dockerCmd() !== null;
}

function dockerExec(cmd, opts = {}) {
  const prefix = _dockerCmd();
  if (!prefix) throw new Error('Docker no disponible');
  const fullCmd = `${prefix} ${cmd}`;
  return execSync(fullCmd, {
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
    shell: process.platform === 'win32' ? true : false,
    windowsHide: true,
    maxBuffer: opts.maxBuffer || 10 * 1024 * 1024,
    ...opts,
  });
}

function checkImage() {
  try {
    const out = dockerExec(`image inspect ${DOCKER_IMAGE}`, { timeout: 10000 });
    return out.includes('"Id"');
  } catch { return false; }
}

function pullImage() {
  return new Promise((resolve, reject) => {
    console.log('[GOSOM] Pulling Docker image...');
    const prefix = _dockerCmd();
    if (!prefix) return reject(new Error('Docker no disponible'));
    const proc = exec(`${prefix} pull ${DOCKER_IMAGE}`, {
      shell: process.platform === 'win32' ? true : false,
      windowsHide: true,
    });
    proc.stdout.on('data', (d) => process.stdout.write(`[GOSOM] ${d}`));
    proc.stderr.on('data', (d) => process.stderr.write(`[GOSOM] ${d}`));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker pull exit code ${code}`));
    });
    proc.on('error', reject);
  });
}

function _resolvePaths() {
  const prefix = _dockerCmd();
  if (!prefix) return null;

  const isWsl = prefix.includes('wsl');
  const useTcp = prefix.includes('-H');

  if (isWsl) {
    const wslDataDir = `/mnt/c/Users/${process.env.USERNAME}/.config/gmaps_output`;
    const wslCacheDir = '/opt';
    return { dataDir: wslDataDir, cacheDir: wslCacheDir, prefix, isWsl, useTcp };
  }

  return { dataDir: DATA_DIR, cacheDir: 'gmaps-playwright-cache', prefix, isWsl, useTcp };
}

async function runScrape(queries, options = {}) {
  const {
    lang = 'es',
    depth = 3,
    concurrency = 2,
    timeout = 300000,
    zoom = 15,
    geo = null,
  } = options;

  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error('Se requiere al menos una query');
  }

  const paths = _resolvePaths();
  if (!paths) {
    const advice = process.platform === 'win32'
      ? '\nCorre "setup_docker.bat" como Administrador para configurarlo automáticamente.'
      : '';
    throw new Error(`Docker no está accesible.${advice}`);
  }

  ensureDir(DATA_DIR);

  const timestamp = Date.now();
  const wslDataDir = `/mnt/c/Users/${process.env.USERNAME}/.config/gmaps_output`;

  let queriesFile;
  let dockerQueriesPath;
  let dockerResultsPath;
  let cacheVolume;
  let resultsFilename = 'result.json';

  if (paths.isWsl) {
    queriesFile = path.join(DATA_DIR, `queries_${timestamp}.txt`);
    dockerQueriesPath = `${wslDataDir}/queries_${timestamp}.txt`;
    dockerResultsPath = `${wslDataDir}/${resultsFilename}`;
    cacheVolume = 'gmaps-playwright-cache:/opt';
  } else {
    queriesFile = path.join(DATA_DIR, `queries_${timestamp}.txt`);
    dockerQueriesPath = `/out/queries_${timestamp}.txt`;
    dockerResultsPath = `/out/${resultsFilename}`;
    cacheVolume = 'gmaps-playwright-cache:/opt';
  }

  fs.writeFileSync(queriesFile, queries.join('\n'), 'utf8');
  console.log(`[GOSOM] Queries escritas en: ${queriesFile}`);

  if (!checkImage()) {
    console.log('[GOSOM] Imagen no encontrada localmente. Descargando...');
    await pullImage();
  }

  const mountVol = paths.isWsl
    ? `-v "${wslDataDir}:/out" -v "${dockerQueriesPath}:/queries.txt:ro"`
    : `-v "${DATA_DIR}:/out" -v "${queriesFile}:/queries.txt:ro"`;

  const cmdParts = [
    `run --rm`,
    mountVol,
    `-v ${cacheVolume}`,
    DOCKER_IMAGE,
    `-input /queries.txt`,
    `-results /out/${resultsFilename}`,
    `-json`,
    `-depth ${depth}`,
    `-lang ${lang}`,
    `-c ${concurrency}`,
    ...(geo ? [`-geo "${geo}"`] : []),
    `-zoom ${zoom}`,
    `-exit-on-inactivity 5m`,
  ];
  const dockerArgs = cmdParts.join(' ');

  console.log(`[GOSOM] Ejecutando: ${paths.prefix} ${dockerArgs}`);

  try {
    const output = dockerExec(dockerArgs, { timeout, maxBuffer: 50 * 1024 * 1024 });
    console.log(`[GOSOM] Scraping output: ${output.slice(-200)}`);

    const resultPath = path.join(DATA_DIR, resultsFilename);
    if (!fs.existsSync(resultPath)) {
      throw new Error('No se generó archivo de resultados');
    }

    const raw = fs.readFileSync(resultPath, 'utf8');
    let results;
    try {
      results = JSON.parse(raw);
    } catch {
      throw new Error(`El archivo de resultados no es JSON válido. Contenido: ${raw.slice(0, 200)}`);
    }

    if (!Array.isArray(results)) {
      throw new Error(`Formato inesperado: se esperaba un array, se recibió ${typeof results}`);
    }

    console.log(`[GOSOM] ${results.length} resultados obtenidos`);

    const mapped = results.map((r, i) => ({
      id: i + 1,
      source: 'google_maps_gosom',
      source_id: r.data_id || r.cid || `gosom_${timestamp}_${i}`,
      name: r.title || r.name || 'Sin nombre',
      category: '',
      address: r.address || r.complete_address || null,
      phone: r.phone ? r.phone.replace(/\D/g, '') : null,
      email: r.emails && r.emails.length > 0 ? r.emails[0] : null,
      website: r.website ? r.website.replace(/^https?:\/\//, '').replace(/^www\./, '') : null,
      instagram: null,
      facebook: null,
      rating: r.review_rating || null,
      reviews_count: r.review_count || null,
      lat: r.latitude || null,
      lng: r.longitude || null,
      place_id: r.data_id || r.cid || null,
      types: r.category ? JSON.stringify([r.category]) : null,
      opening_hours: r.open_hours || null,
      photos: null,
      score: _calcScore(r),
      status: 'new',
      tags: null,
      enriched: r.emails && r.emails.length > 0 ? 1 : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    try { fs.unlinkSync(queriesFile); } catch {}
    try {
      const resultPath2 = path.join(DATA_DIR, resultsFilename);
      fs.renameSync(resultPath2, path.join(DATA_DIR, `result_${timestamp}.json`));
    } catch {}

    return mapped;
  } catch (e) {
    throw new Error(`Error en gosom scraper: ${e.message}`);
  }
}

function _calcScore(r) {
  let score = 0;
  if (r.review_rating) score += Math.min(r.review_rating * 10, 50);
  if (r.review_count) score += Math.min(r.review_count / 10, 30);
  if (r.phone) score += 10;
  if (r.website) score += 15;
  if (r.open_hours) score += 5;
  if (r.emails && r.emails.length > 0) score += 10;
  return Math.min(score, 100);
}

async function runFullScrapeGosom(categories) {
  const dockerOk = checkDocker();
  if (!dockerOk) {
    return { error: 'docker_unavailable' };
  }
  const queries = categories.map(c => c.query);
  const results = await runScrape(queries, { depth: 1, concurrency: 2 });
  return { results };
}

function getManualInstructions() {
  const via = _dockerCmd();
  if (via) {
    return `Docker está accesible vía: ${via}. No se necesitan instrucciones manuales.`;
  }

  if (process.platform !== 'win32') {
    return 'Instala Docker y asegúrate de que el servicio esté corriendo.';
  }

  return (
    'Docker no está accesible desde este proceso.\n\n' +
    'Para configurarlo automáticamente:\n' +
    '  1. Abre una terminal COMO ADMINISTRADOR\n' +
    '  2. Ejecuta: setup_docker.bat\n' +
    '  3. Sigue las instrucciones\n\n' +
    'O manualmente (elige UNA opción):\n\n' +
    'OPCION A - TCP (más simple):\n' +
    '  1. Edita %USERPROFILE%\\.docker\\daemon.json\n' +
    '  2. Agrega: "hosts": ["npipe:////./pipe/docker_engine", "tcp://127.0.0.1:2375"]\n' +
    '  3. Reinicia Docker Desktop\n\n' +
    'OPCION B - WSL Integration:\n' +
    '  1. Docker Desktop > Settings > Resources > WSL Integration\n' +
    '  2. Activa Ubuntu-22.04\n' +
    '  3. Apply & Restart\n\n' +
    'OPCION C - Terminal como Admin (temporal):\n' +
    '  Corre "node server.js" desde una terminal como Administrador'
  );
}

function importExistingResults() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('result_') && f.endsWith('.json'));
  if (files.length === 0) {
    const resultFile = path.join(DATA_DIR, 'result.json');
    if (fs.existsSync(resultFile)) files.push('result.json');
  }
  if (files.length === 0) return null;

  files.sort().reverse();
  const latest = path.join(DATA_DIR, files[0]);
  const raw = fs.readFileSync(latest, 'utf8');
  let results;
  try { results = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(results) || results.length === 0) return null;

  return results.map((r, i) => ({
    id: i + 1,
    source: 'google_maps_gosom',
    source_id: r.data_id || r.cid || `gosom_import_${i}`,
    name: r.title || r.name || 'Sin nombre',
    category: '',
    address: r.address || r.complete_address || null,
    phone: r.phone ? r.phone.replace(/\D/g, '') : null,
    email: r.emails && r.emails.length > 0 ? r.emails[0] : null,
    website: r.website ? r.website.replace(/^https?:\/\//, '').replace(/^www\./, '') : null,
    rating: r.review_rating || null,
    reviews_count: r.review_count || null,
    lat: r.latitude || null,
    lng: r.longitude || null,
    place_id: r.data_id || r.cid || null,
    score: _calcScore(r),
    status: 'new',
    enriched: r.emails && r.emails.length > 0 ? 1 : 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

module.exports = {
  runScrape,
  runFullScrapeGosom,
  checkDocker,
  checkImage,
  pullImage,
  importExistingResults,
  getManualInstructions,
};
