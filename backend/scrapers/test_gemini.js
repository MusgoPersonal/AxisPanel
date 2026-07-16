const fs = require('fs');
const path = require('path');
const KEYS_FILE = path.join(process.env.USERPROFILE, '.config', 'api_keys.json');
const cfg = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
const key = cfg.providers.google.keys[0];

const prompt = `Genera 20 negocios reales de "clinica dental santiago" en Chile como JSON array. Sin explicaciones. Formato: [{"name":"...","address":"...","phone":"+569...","website":"...","rating":4.5}]`;

fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000 }
  })
}).then(r => r.text()).then(t => {
  console.log('=== RAW RESPONSE ===');
  console.log(t.substring(0, 1000));
  try {
    const data = JSON.parse(t);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('=== TEXT ===');
    console.log(text.substring(0, 1000));
    const m = text.match(/\[[\s\S]*?\]/);
    if (m) {
      console.log('=== JSON ===');
      console.log(JSON.stringify(JSON.parse(m[0]), null, 2));
    } else {
      console.log('NO JSON FOUND IN TEXT');
    }
  } catch(e) {
    console.log('PARSE ERROR:', e.message);
  }
}).catch(e => console.log('FETCH ERROR:', e.message));
