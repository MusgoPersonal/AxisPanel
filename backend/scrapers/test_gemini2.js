const fs = require('fs');
const path = require('path');
const KEYS_FILE = path.join(process.env.USERPROFILE, '.config', 'api_keys.json');
const cfg = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
const key = cfg.providers.google.keys[0];

const prompt = `Genera 5 negocios reales de "clinica dental santiago" en Chile como JSON array. Sin explicaciones. Formato: [{"name":"...","address":"...","phone":"+569...","website":"...","rating":4.5}]`;

fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
  })
}).then(r => r.text()).then(t => {
  const data = JSON.parse(t);
  const candidate = data.candidates?.[0];
  console.log('finishReason:', candidate?.finishReason);
  console.log('usage:', JSON.stringify(data.usageMetadata));
  let text = candidate?.content?.parts?.[0]?.text || '';
  console.log('=== TEXT LENGTH:', text.length);
  text = text.replace(/```json?\n?/gi, '').replace(/```/g, '');
  console.log('=== CLEANED:', text.substring(0, 500));
  const m = text.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      console.log('=== PARSED OK:', parsed.length, 'items');
    } catch(e) {
      console.log('PARSE ERROR:', e.message);
    }
  } else {
    console.log('NO JSON ARRAY FOUND');
  }
}).catch(e => console.log('FETCH ERROR:', e.message));
