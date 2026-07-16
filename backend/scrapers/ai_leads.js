const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(process.env.USERPROFILE, '.config');
const LEADS_FILE = path.join(CONFIG_DIR, 'leads.json');
const KEYS_FILE = path.join(CONFIG_DIR, 'api_keys.json');

const CATEGORIES = [
  { query: 'clinica dental santiago', category: 'clinicas_dentales', target: 20 },
  { query: 'centro estetica santiago', category: 'estetica_belleza', target: 15 },
  { query: 'abogado santiago', category: 'abogados', target: 15 },
  { query: 'gimnasio santiago', category: 'gimnasios', target: 10 },
  { query: 'diseno web santiago', category: 'agencias_digitales', target: 10 },
];

function getGoogleKey() {
  try {
    const cfg = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    return cfg.providers?.google?.keys?.[0] || '';
  } catch { return ''; }
}

function loadLeads() {
  try { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')); }
  catch { return { leads: [], nextId: 1 }; }
}

function saveLeads(db) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(LEADS_FILE, JSON.stringify(db, null, 2));
}

async function generateWithGemini(prompt) {
  const key = getGoogleKey();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
      })
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini error ${response.status}: ${err.slice(0, 200)}`);
  }
  const data = await response.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  text = text.replace(/```json?\n?/gi, '').replace(/```/g, '');
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON in response');
  return JSON.parse(jsonMatch[0]);
}

async function generateLeadsAI(query, category, target) {
  const allLeads = [];
  const seen = new Set();

  while (allLeads.length < target) {
    const remaining = target - allLeads.length;
    const batchSize = Math.min(5, remaining);
    const exclude = allLeads.map(l => l.name).filter(Boolean).join(', ');
    const excludeNote = exclude ? ` Excluye estos que ya tengo: ${exclude}.` : '';
    const prompt = `Genera ${batchSize} negocios reales de "${query}" en Chile como JSON array.${excludeNote} Sin explicaciones. Formato: [{"name":"...","address":"...","phone":"+569...","website":"...","rating":4.5}]`;

    console.log(`    Solicitando ${batchSize} más...`);
    const leads = await generateWithGemini(prompt);
    let saved = 0;

    for (const l of leads) {
      const key = (l.name || '').toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      allLeads.push({
        name: l.name,
        address: l.address,
        phone: l.phone,
        website: l.website,
        rating: l.rating
      });
      saved++;
    }
    console.log(`    → Recibidos ${saved} nuevos`);
    if (saved === 0) break;
    await new Promise(r => setTimeout(r, 1500));
  }

  return allLeads;
}

async function run() {
  const db = loadLeads();
  const existing = new Set(db.leads.map(l => l.name?.toLowerCase().trim()));
  let totalSaved = 0;
  let nextId = db.nextId;

  for (const cat of CATEGORIES) {
    console.log(`\n=== ${cat.query} (target: ${cat.target}) ===`);
    try {
      const leads = await generateLeadsAI(cat.query, cat.category, cat.target);
      let saved = 0;
      for (const l of leads) {
        const key = (l.name || '').toLowerCase().trim();
        if (!key || existing.has(key)) continue;
        existing.add(key);
        db.leads.push({
          id: nextId++,
          source: 'ai_generator',
          source_id: `ai_${Date.now()}_${nextId}`,
          name: l.name,
          category: cat.category,
          address: l.address || null,
          phone: l.phone ? l.phone.replace(/\D/g, '').replace(/^56/, '').replace(/^0/, '') : null,
          email: l.email || null,
          website: l.website || null,
          rating: l.rating || null,
          reviews_count: null,
          score: Math.min((l.rating || 0) * 10 + (l.phone ? 10 : 0) + (l.website ? 15 : 0), 100),
          status: 'new',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        saved++;
      }
      console.log(`  → ${saved} nuevos leads guardados para ${cat.category}`);
      totalSaved += saved;
    } catch (e) {
      console.log(`  ✗ Error: ${e.message}`);
    }
  }

  db.nextId = nextId;
  saveLeads(db);
  console.log(`\n✅ Total: ${totalSaved} leads guardados (${db.leads.length} totales en DB)`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
