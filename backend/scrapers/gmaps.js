const { Client } = require('@googlemaps/google-maps-services-js');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const https = require('https');

function getApiKey() {
  if (process.env.GMAPS_API_KEY) {
    return process.env.GMAPS_API_KEY;
  }
  try {
    const configPath = path.join(process.env.USERPROFILE, '.config', 'api_keys.json');
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const googleProvider = data.providers?.google;
      if (googleProvider && googleProvider.keys && googleProvider.keys.length > 0) {
        const keyIndex = data.current_provider === 'google' ? (data.current_key_index || 0) : 0;
        return googleProvider.keys[keyIndex] || googleProvider.keys[0];
      }
    }
  } catch (error) {
    console.error('[SCRAPER] Error leyendo api_keys.json:', error.message);
  }
  return '';
}

const DB_FILE = path.join(process.env.USERPROFILE, '.config', 'leads.json');

const client = new Client({});

const CATEGORIES_SANTIAGO = [
  { query: 'clinica dental santiago', category: 'clinicas_dentales', priority: 1 },
  { query: 'centro estetica santiago', category: 'estetica_belleza', priority: 1 },
  { query: 'gimnasio santiago', category: 'gimnasios', priority: 2 },
  { query: 'restaurante santiago', category: 'restaurantes', priority: 3 },
  { query: 'clínica veterinaria santiago', category: 'veterinarias', priority: 2 },
  { query: 'inmobiliaria santiago', category: 'inmobiliarias', priority: 2 },
  { query: 'abogado santiago', category: 'abogados', priority: 2 },
  { query: 'contador santiago', category: 'contadores', priority: 2 },
  { query: 'diseño web santiago', category: 'agencias_digitales', priority: 1 },
  { query: 'marketing digital santiago', category: 'agencias_digitales', priority: 1 },
  { query: 'odontologo santiago', category: 'clinicas_dentales', priority: 1 },
  { query: 'ortodoncia santiago', category: 'clinicas_dentales', priority: 1 },
  { query: 'implantes dentales santiago', category: 'clinicas_dentales', priority: 1 },
  { query: 'depilacion laser santiago', category: 'estetica_belleza', priority: 1 },
  { query: 'medicina estetica santiago', category: 'estetica_belleza', priority: 1 },
  { query: 'fisioterapia santiago', category: 'salud_bienestar', priority: 2 },
  { query: 'psicologo santiago', category: 'salud_bienestar', priority: 2 },
  { query: 'nutricionista santiago', category: 'salud_bienestar', priority: 2 },
  { query: 'colegio particular santiago', category: 'educacion', priority: 3 },
  { query: 'academia ingles santiago', category: 'educacion', priority: 3 },
];

let machineIP = null;

async function getMachineIP() {
  if (machineIP) return machineIP;
  const ip = await queryIPIO(null);
  if (ip && typeof ip === 'string') machineIP = ip;
  else if (ip?.ip) machineIP = ip.ip;
  return machineIP;
}

async function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(await fs.promises.readFile(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[DB] Error loading:', e.message);
  }
  return { leads: [], nextId: 1 };
}

async function saveDB(db) {
  try {
    await fs.promises.writeFile(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('[DB] Error saving:', e.message);
  }
}

function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/\D/g, '').replace(/^56/, '').replace(/^0/, '');
}

function normalizeWebsite(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

function calculateScore(place) {
  let score = 0;
  if (place.rating) score += Math.min(place.rating * 10, 50);
  if (place.user_ratings_total) score += Math.min(place.user_ratings_total / 10, 30);
  if (place.formatted_phone_number) score += 10;
  if (place.website) score += 15;
  if (place.opening_hours) score += 5;
  return Math.min(score, 100);
}

async function queryIPIO(ip) {
  const endpoint = ip ? `/${ip}` : '';
  const url = `https://api.ipquery.io${endpoint}?format=json`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function enrichWithIP(website) {
  if (!website) return {};
  try {
    const records = await dns.resolve4(website);
    if (!records || records.length === 0) return {};
    const ip = records[0];
    const geo = await queryIPIO(ip);
    return {
      ip,
      ip_isp: geo?.isp?.isp || null,
      ip_asn: geo?.isp?.asn || null,
      ip_org: geo?.isp?.org || null,
      ip_country: geo?.location?.country || null,
      ip_city: geo?.location?.city || null,
      ip_state: geo?.location?.state || null,
      ip_lat: geo?.location?.latitude || null,
      ip_lon: geo?.location?.longitude || null,
      ip_timezone: geo?.location?.timezone || null,
      ip_risk_score: geo?.risk?.risk_score ?? null,
      ip_is_vpn: geo?.risk?.is_vpn || false,
      ip_is_datacenter: geo?.risk?.is_datacenter || false,
    };
  } catch {
    return {};
  }
}

async function searchPlaces(query, location = '-33.4489,-70.6693', radius = 50000) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GMAPS_API_KEY no configurada. Revisa ~/.config/api_keys.json o variable GMAPS_API_KEY');
  }
  
  console.log(`[SCRAPER] Llamando Places API con key: ${apiKey.substring(0, 8)}...`);
  
  const response = await client.placesNearby({
    params: {
      location,
      radius,
      keyword: query,
      key: apiKey,
      language: 'es',
    },
    timeout: 10000,
  });
  
  if (response.data.status === 'REQUEST_DENIED') {
    throw new Error(`API Google rechazó la solicitud: ${response.data.error_message || 'La key no tiene Places API habilitada o está restringida'}`);
  }
  if (response.data.status === 'INVALID_REQUEST') {
    throw new Error(`Solicitud inválida: ${response.data.error_message || ''}`);
  }
  if (response.data.status === 'OVER_QUERY_LIMIT') {
    throw new Error('Límite de cuota excedido para esta API key');
  }
  if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API respondió con status: ${response.data.status} - ${response.data.error_message || ''}`);
  }
  
  console.log(`[SCRAPER] Places API OK: ${(response.data.results || []).length} resultados para "${query}"`);
  return response.data.results || [];
}

async function getPlaceDetails(placeId) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GMAPS_API_KEY no configurada');
  }
  
  const response = await client.placeDetails({
    params: {
      place_id: placeId,
      fields: [
        'name',
        'formatted_address',
        'formatted_phone_number',
        'website',
        'rating',
        'user_ratings_total',
        'types',
        'geometry',
        'opening_hours',
        'photos',
        'place_id',
      ].join(','),
      key: apiKey,
      language: 'es',
    },
    timeout: 10000,
  });
  
  if (response.data.status === 'REQUEST_DENIED') {
    throw new Error(`PlaceDetails: Key sin permisos - ${response.data.error_message || ''}`);
  }
  if (response.data.status === 'NOT_FOUND') {
    throw new Error(`PlaceDetails: place_id ${placeId} no encontrado`);
  }
  if (response.data.status !== 'OK') {
    throw new Error(`PlaceDetails: ${response.data.status} - ${response.data.error_message || ''}`);
  }
  
  return response.data.result;
}

async function saveLead(db, place, category, ipData = {}) {
  const phone = normalizePhone(place.formatted_phone_number);
  const website = normalizeWebsite(place.website);
  const score = calculateScore(place);
  
  const existingIdx = db.leads.findIndex(l => l.source === 'google_maps' && l.source_id === place.place_id);
  
  const lead = {
    id: existingIdx >= 0 ? db.leads[existingIdx].id : db.nextId++,
    source: 'google_maps',
    source_id: place.place_id,
    name: place.name,
    category,
    address: place.formatted_address || null,
    phone,
    email: null,
    website,
    instagram: null,
    facebook: null,
    rating: place.rating || null,
    reviews_count: place.user_ratings_total || null,
    lat: place.geometry?.location?.lat || null,
    lng: place.geometry?.location?.lng || null,
    place_id: place.place_id,
    types: JSON.stringify(place.types || []),
    opening_hours: place.opening_hours ? JSON.stringify(place.opening_hours) : null,
    photos: place.photos ? JSON.stringify(place.photos.slice(0, 3).map(p => p.photo_reference)) : null,
    score,
    status: existingIdx >= 0 ? db.leads[existingIdx].status : 'new',
    tags: existingIdx >= 0 ? db.leads[existingIdx].tags : null,
    enriched: 0,
    ip: ipData.ip || null,
    ip_isp: ipData.ip_isp || null,
    ip_asn: ipData.ip_asn || null,
    ip_org: ipData.ip_org || null,
    ip_country: ipData.ip_country || null,
    ip_city: ipData.ip_city || null,
    ip_state: ipData.ip_state || null,
    ip_lat: ipData.ip_lat || null,
    ip_lon: ipData.ip_lon || null,
    ip_timezone: ipData.ip_timezone || null,
    ip_risk_score: ipData.ip_risk_score ?? null,
    ip_is_vpn: ipData.ip_is_vpn || false,
    ip_is_datacenter: ipData.ip_is_datacenter || false,
    created_at: existingIdx >= 0 ? db.leads[existingIdx].created_at : new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  if (existingIdx >= 0) {
    db.leads[existingIdx] = lead;
  } else {
    db.leads.push(lead);
  }
  
  await saveDB(db);
  return lead.id;
}

async function scrapeCategory(db, { query, category, priority }) {
  console.log(`[SCRAPER] Buscando: ${query} (${category})`);
  
  try {
    const places = await searchPlaces(query);
    console.log(`[SCRAPER] ${places.length} resultados para ${query}`);
    
    let saved = 0;
    for (const place of places) {
      if (!place.place_id) continue;
      
      try {
        const details = await getPlaceDetails(place.place_id);
        if (details) {
          const ipData = await enrichWithIP(normalizeWebsite(details.website));
          await saveLead(db, details, category, ipData);
          saved++;
        }
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        console.error(`[SCRAPER] Error detail ${place.place_id}:`, e.message);
      }
    }
    
    console.log(`[SCRAPER] Guardados ${saved} leads para ${category}`);
    return saved;
  } catch (e) {
    console.error(`[SCRAPER] Error search ${query}:`, e.message);
    return 0;
  }
}

async function runFullScrape() {
  const db = await loadDB();
  let total = 0;
  
  console.log('[SCRAPER] Iniciando scraping completo Santiago...');
  
  for (const cat of CATEGORIES_SANTIAGO.sort((a, b) => a.priority - b.priority)) {
    const saved = await scrapeCategory(db, cat);
    total += saved;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`[SCRAPER] COMPLETADO. Total leads: ${total}`);
  return total;
}

function getLeads(db, { category, status, minScore, limit = 100, offset = 0 }) {
  let leads = db.leads;
  
  if (category) leads = leads.filter(l => l.category === category);
  if (status) leads = leads.filter(l => l.status === status);
  if (minScore) leads = leads.filter(l => l.score >= minScore);
  
  leads.sort((a, b) => b.score - a.score || new Date(b.created_at) - new Date(a.created_at));
  
  return leads.slice(offset, offset + limit);
}

function getLeadStats(db) {
  const leads = db.leads;
  const total = leads.length;
  const byCategory = {};
  const byStatus = {};
  let sumScore = 0;
  let withPhone = 0;
  let withWebsite = 0;
  let withIP = 0;
  
  for (const l of leads) {
    byCategory[l.category] = (byCategory[l.category] || 0) + 1;
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    sumScore += l.score || 0;
    if (l.phone) withPhone++;
    if (l.website) withWebsite++;
    if (l.ip) withIP++;
  }
  
  return {
    total,
    byCategory: Object.entries(byCategory).map(([category, c]) => ({ category, c })).sort((a,b) => b.c - a.c),
    byStatus: Object.entries(byStatus).map(([status, c]) => ({ status, c })),
    avgScore: total ? Math.round(sumScore / total) : 0,
    withPhone,
    withWebsite,
    withIP
  };
}

async function updateLeadStatus(db, id, status, tags = null) {
  const lead = db.leads.find(l => l.id == id);
  if (lead) {
    lead.status = status;
    if (tags) lead.tags = tags;
    lead.updated_at = new Date().toISOString();
    await saveDB(db);
    return true;
  }
  return false;
}

module.exports = {
  loadDB,
  saveDB,
  runFullScrape,
  getLeads,
  getLeadStats,
  updateLeadStatus,
  scrapeCategory,
  CATEGORIES_SANTIAGO,
  getMachineIP,
  enrichWithIP,
  queryIPIO,
};

