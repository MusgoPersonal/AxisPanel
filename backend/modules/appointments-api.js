const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function sendTelegramNotification(appointment) {
  const configPath = path.join(process.env.USERPROFILE, '.config', 'telegram-scraper.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return false; }
  const token = config.token;
  const adminChatId = config.admin_chat_id;
  if (!token || !adminChatId) return false;

  const msg = `📅 *Nuevo agendamiento* \\[${appointment.status || 'pending'}\\]\n👤 ${appointment.name}${appointment.email ? ' \\(' + appointment.email.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&') + '\\)' : ''}${appointment.phone ? ' \\- ' + appointment.phone : ''}\n📋 ${appointment.service_name || 'Sin especificar'}\n📆 ${appointment.date} a las ${appointment.time}${appointment.notes ? '\n💬 ' + appointment.notes.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&') : ''}`;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: adminChatId, text: msg, parse_mode: 'MarkdownV2' })
    });
    return r.ok;
  } catch { return false; }
}

async function sendLeadConfirmation(appointment) {
  if (!appointment.phone) return false;
  const configPath = path.join(process.env.USERPROFILE, '.config', 'telegram-scraper.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return false; }
  const token = config.token;
  if (!token) return false;

  const msg = `¡Hola ${appointment.name}! 👋\n\nSoy Jordan de AxisPanel. Recibí tu agendamiento para el ${appointment.date} a las ${appointment.time}${appointment.service_name ? ' para hablar sobre ' + appointment.service_name : ''}.\n\nTe confirmaré por aquí mismo. Cualquier cambio me avisas.\n\n¡Nos vemos!`;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: appointment.phone, text: msg })
    });
    return r.ok;
  } catch { return false; }
}

module.exports = function createAppointmentsApi(app, { crmDb, authLimiter }) {

  crmDb.exec(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    name TEXT,
    email TEXT,
    phone TEXT,
    service_id TEXT,
    service_name TEXT,
    date TEXT,
    time TEXT,
    duration INTEGER DEFAULT 30,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    token TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  const insertStmt = crmDb.prepare(`INSERT INTO appointments
    (lead_id, name, email, phone, service_id, service_name, date, time, duration, notes, token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const allStmt = crmDb.prepare('SELECT * FROM appointments ORDER BY created_at DESC');
  const getStmt = crmDb.prepare('SELECT * FROM appointments WHERE id = ?');
  const getByLeadStmt = crmDb.prepare('SELECT * FROM appointments WHERE lead_id = ? ORDER BY date DESC');
  const getByTokenStmt = crmDb.prepare('SELECT * FROM appointments WHERE token = ?');
  const updateStmt = crmDb.prepare('UPDATE appointments SET status = ?, notes = ? WHERE id = ?');
  const availableStmt = crmDb.prepare(`SELECT time FROM appointments WHERE date = ? AND status = 'confirmed' ORDER BY time`);

  app.get('/api/appointments', (req, res) => {
    const { lead_id, status } = req.query;
    if (lead_id) return res.json({ appointments: getByLeadStmt.all(lead_id) });
    if (status) return res.json({ appointments: allStmt.all().filter(a => a.status === status) });
    res.json({ appointments: allStmt.all() });
  });

  app.get('/api/appointments/:id', (req, res) => {
    const a = getStmt.get(req.params.id);
    if (!a) return res.status(404).json({ error: 'No encontrado' });
    res.json(a);
  });

  app.post('/api/appointments', authLimiter, (req, res) => {
    const { lead_id, name, email, phone, service_id, service_name, date, time, duration, notes } = req.body;
    if (!name && !lead_id) return res.status(400).json({ error: 'name o lead_id requerido' });
    const token = crypto.randomBytes(8).toString('hex');
    const r = insertStmt.run(lead_id || null, name || '', email || '', phone || '', service_id || '', service_name || '', date || '', time || '', duration || 30, notes || '', token);
    res.json({ success: true, id: r.lastInsertRowid, token });
  });

  app.post('/api/appointments/public', async (req, res) => {
    const { name, email, phone, service_name, date, time, notes } = req.body;
    if (!name || !date || !time) return res.status(400).json({ error: 'name, date y time requeridos' });
    const token = crypto.randomBytes(8).toString('hex');
    insertStmt.run(null, name, email || '', phone || '', '', service_name || '', date, time, 30, notes || '', token);
    const appointment = { name, email, phone, service_name, date, time, notes, token, status: 'pending' };
    sendTelegramNotification(appointment);
    res.json({ success: true, message: 'Agendado correctamente, te confirmaremos por Telegram', token });
  });

  app.put('/api/appointments/:id', authLimiter, (req, res) => {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ error: 'status requerido' });
    updateStmt.run(status, notes || '', req.params.id);
    res.json({ success: true });
  });

  app.patch('/api/appointments/:token/cancel', (req, res) => {
    const a = getByTokenStmt.get(req.params.token);
    if (!a) return res.status(404).json({ error: 'No encontrado' });
    updateStmt.run('cancelled', 'Cancelado por el cliente', a.id);
    res.json({ success: true });
  });

  app.get('/api/appointments/available/:date', (req, res) => {
    const busy = availableStmt.all(req.params.date).map(r => r.time);
    const allSlots = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];
    const available = allSlots.filter(s => !busy.includes(s));
    res.json({ date: req.params.date, available });
  });

  app.get('/api/appointments/stats/summary', (req, res) => {
    const all = allStmt.all();
    res.json({
      total: all.length,
      pending: all.filter(a => a.status === 'pending').length,
      confirmed: all.filter(a => a.status === 'confirmed').length,
      done: all.filter(a => a.status === 'done').length,
      cancelled: all.filter(a => a.status === 'cancelled').length,
    });
  });

  app.get('/api/agendar', (req, res) => {
    const slots = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agendar - AxisPanel</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:520px;margin:2rem auto;padding:0 1rem;background:#f5f5f5}
.card{background:#fff;border-radius:12px;padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{font-size:1.3rem;margin:0 0 .3rem 0;color:#333}
p{color:#666;font-size:.9rem;margin:0 0 1.2rem 0}
label{display:block;font-size:.85rem;font-weight:600;color:#444;margin:.8rem 0 .2rem 0}
input,select{width:100%;padding:.6rem;border:1px solid #ddd;border-radius:8px;font-size:.95rem;box-sizing:border-box}
button{width:100%;margin-top:1.2rem;padding:.7rem;background:#22c55e;color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer}
button:hover{background:#16a34a}
.msg{padding:.6rem;border-radius:8px;margin:.8rem 0 0 0;font-size:.85rem;display:none}
.msg.ok{background:#dcfce7;color:#166534;display:block}
.msg.err{background:#fee2e2;color:#991b1b;display:block}
select option{font-size:.9rem}
</style></head><body>
<div class="card">
<h1>Agenda una reunión</h1>
<p>Conversemos sobre tu proyecto — sin compromiso</p>
<form id="form">
<label>Nombre *</label><input id="name" required>
<label>Email</label><input id="email" type="email">
<label>WhatsApp</label><input id="phone" type="tel" placeholder="+56 9 XXXX XXXX">
<label>¿Qué servicio te interesa?</label>
<select id="service"><option>No sé todavía</option><option>Flyer digital</option><option>Landing page</option><option>Sitio web multipágina</option><option>Tienda online</option><option>Manejo de Redes Sociales</option><option>Video promocional</option><option>Digitalización completa</option></select>
<label>Fecha *</label><input id="date" type="date" required>
<label>Horario *</label><select id="time" required>${slots.map(s => '<option>' + s + '</option>').join('')}</select>
<label>Comentario</label><input id="notes" placeholder="Cuéntanos breve de tu proyecto">
<div id="msg" class="msg"></div>
<button type="submit">Agendar reunión</button>
</form></div>
<script>
document.getElementById('date').valueAsDate=new Date();
document.getElementById('form').onsubmit=async function(e){e.preventDefault();
const b={name:this.name.value,email:this.email.value,phone:this.phone.value,service_name:this.service.value,date:this.date.value,time:this.time.value,notes:this.notes.value};
try{const r=await fetch('/api/appointments/public',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const d=await r.json();const m=document.getElementById('msg');
if(d.success){m.className='msg ok';m.innerText='✅ Agendado. Te confirmaremos por Telegram.';this.querySelector('button').disabled=true}
else{m.className='msg err';m.innerText='Error: '+d.error}}
catch(e){document.getElementById('msg').className='msg err';document.getElementById('msg').innerText='Error de conexión'}}
</script></body></html>`);
  });
};
