const fs = require('fs');
const path = require('path');

const SERVICES_FILE = path.join(__dirname, '..', 'config', 'services.json');
let portfolio = null;
try { portfolio = JSON.parse(fs.readFileSync(SERVICES_FILE, 'utf8')); } catch { portfolio = null; }

function buildSystemPrompt(leadInfo = {}) {
  const services = portfolio ? portfolio.segments.map(s =>
    `${s.name} (${s.price_range}): ${s.services.map(sv => `- ${sv.name}: $${sv.price} — ${sv.desc}`).join('\n')}`
  ).join('\n\n') : 'No disponible';

  const addons = portfolio ? portfolio.addons.map(a =>
    `- ${a.name}: $${a.price}`
  ).join('\n') : '';

  const BOOKING_URL = 'http://localhost:3030/api/agendar';

  return `Eres Jordan, el dueño de AxisPanel. Eres chileno, hablas como chileno, con confianza pero sin ser pesado. Tu objetivo es vender servicios digitales.

INSTRUCCIONES ESTRICTAS:
1. NUNCA digas que eres una IA o chatbot
2. Siempre responde como Jordan, el dueño
3. Usa un tono amistoso, cercano, chileno (po, weon, cachai, dale)
4. Escucha al lead primero, entiende qué necesita
5. Ofrece el servicio adecuado según su presupuesto
6. Guía la conversación hacia: entender necesidad → presentar solución → agendar llamada
7. NO des precio exacto hasta que te pregunten
8. Si preguntan precio, da el rango del segmento adecuado
9. Si muestran interés, ofrécete a agendar una reunión — pásale este link: ${BOOKING_URL}
10. Si preguntan por disponibilidad, deciles que reserven directamente en el link

INFORMACIÓN DEL LEAD:
- Nombre: ${leadInfo.name || 'Cliente'}
- Lo que busca: ${leadInfo.need || 'servicios digitales'}
- Canal: ${leadInfo.channel || 'desconocido'}

SERVICIOS DISPONIBLES:
${services}

${addons ? 'EXTRAS:\n' + addons : ''}
`;
}

async function qualify(leadInfo, messageHistory = []) {
  const active = getActiveProviderFromServer();
  if (!active) return { reply: 'Sin provider configurado', stage: null, score: null };

  const systemPrompt = buildSystemPrompt(leadInfo);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...messageHistory.slice(-10).map(m => ({
      role: m.direction === 'incoming' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  const response = await fetch(`${active.url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${active.key}`
    },
    body: JSON.stringify({
      model: active.model,
      messages,
      stream: false,
      max_tokens: 800,
      temperature: 0.8
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Provider error: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || '(sin respuesta)';

  const stage = detectStage(reply, leadInfo);
  const bookingLink = 'http://localhost:3030/api/agendar';
  const finalReply = stage === 'proposal' && !reply.includes(bookingLink)
    ? reply + '\n\nAgenda acá la reunión y conversamos sin compromiso 👉 ' + bookingLink
    : reply;

  return {
    reply: finalReply,
    stage,
    score: calculateScore(reply, leadInfo)
  };
}

function detectStage(reply, leadInfo) {
  const lower = reply.toLowerCase();
  if (lower.includes('agendar') || lower.includes('reunión') || lower.includes('cuándo podemos') || lower.includes('hagamos una llamada')) return 'proposal';
  if (lower.includes('presupuesto') || lower.includes('precio') || lower.includes('cuánto') || lower.includes('valor') || lower.includes('costo') || lower.includes('$$') || lower.includes('oferta')) return 'qualified';
  if (lower.includes('qué necesitas') || lower.includes('cuéntame') || lower.includes('dime') || lower.includes('qué servicio') || lower.includes('estás buscando')) return 'contacted';
  if (lower.includes('gracias') || lower.includes('hablamos luego') || lower.includes('lo voy a pensar') || lower.includes('lo pienso') || lower.includes('no gracias')) return 'new';
  return 'contacted';
}

function calculateScore(reply, leadInfo) {
  let score = 30;
  if (reply.length > 100) score += 10;
  if (reply.includes('agendar') || reply.includes('reunión')) score += 25;
  if (reply.includes('precio') || reply.includes('presupuesto')) score += 20;
  if (reply.includes('trabajo') || reply.includes('portafolio') || reply.includes('ejemplo')) score += 15;
  if (reply.includes('llamada') || reply.includes('whatsapp') || reply.includes('número')) score += 10;
  if (leadInfo.phone) score += 5;
  if (leadInfo.need && leadInfo.need.length > 10) score += 10;
  return Math.min(score, 100);
}

let _providerCache = null;
function getActiveProviderFromServer() {
  if (_providerCache) return _providerCache;
  try {
    const HOME_DIR = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\jordan';
    const KEYS_FILE = path.join(HOME_DIR, '.config', 'api_keys.json');
    const keysData = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    const provider = keysData.current_provider || 'openrouter';
    const providerCfg = keysData.providers?.[provider];
    const activeKeys = (providerCfg?.keys || []).filter(k => k && !k.includes('REEMPLAZA'));
    if (!activeKeys.length) return null;
    const PROVIDER_URLS = {
      openrouter: 'https://openrouter.ai/api/v1',
      google: 'https://generativelanguage.googleapis.com/v1beta/openai',
      nvidia: 'https://integrate.api.nvidia.com/v1',
      groq: 'https://api.groq.com/openai/v1',
      mistral: 'https://api.mistral.ai/v1',
      cerebras: 'https://api.cerebras.ai/v1',
    };
    const PROVIDER_MODELS = {
      openrouter: 'google/gemini-2.5-flash',
      google: 'gemini-2.5-flash',
      groq: 'llama-3.3-70b-versatile',
      nvidia: 'meta/llama-3.1-70b-instruct',
      mistral: 'mistral-large-latest',
      cerebras: 'llama-3.1-8b',
    };
    _providerCache = {
      provider,
      url: PROVIDER_URLS[provider] || PROVIDER_URLS.openrouter,
      key: activeKeys[0],
      model: PROVIDER_MODELS[provider] || 'google/gemini-2.5-flash',
    };
    return _providerCache;
  } catch { return null; }
}

function getPortfolio() {
  return portfolio;
}

function getResponseTemplate(name, vars = {}) {
  if (!portfolio || !portfolio.response_templates || !portfolio.response_templates[name]) return null;
  let tpl = portfolio.response_templates[name];
  for (const [k, v] of Object.entries(vars)) {
    tpl = tpl.replace(new RegExp(`{{${k}}}`, 'g'), v);
  }
  return tpl;
}

module.exports = { qualify, detectStage, calculateScore, buildSystemPrompt, getPortfolio, getResponseTemplate };
