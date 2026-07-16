const fs = require('fs');
const path = require('path');

module.exports = function createOutreachApi(app, { configDir, crmDb, leadsJson, authLimiter }) {
  const OUTREACH_FILE = path.join(configDir, 'outreach.json');

  function getOutreachData() {
    try {
      if (!fs.existsSync(OUTREACH_FILE)) return { config: null, templates: [], history: [] };
      return JSON.parse(fs.readFileSync(OUTREACH_FILE, 'utf8'));
    } catch { return { config: null, templates: [], history: [] }; }
  }

  function saveOutreachData(data) {
    fs.writeFileSync(OUTREACH_FILE, JSON.stringify(data, null, 2), 'utf8');
  }

  app.get('/api/outreach/config', (req, res) => {
    const data = getOutreachData();
    res.json({ config: data.config || null, hasConfig: !!data.config });
  });

  app.post('/api/outreach/config', authLimiter, (req, res) => {
    const { provider, apiKey, smtp, whatsapp } = req.body;
    const data = getOutreachData();
    data.config = { provider: provider || 'smtp', apiKey: apiKey || '', smtp: smtp || null, whatsapp: whatsapp || null, updatedAt: new Date().toISOString() };
    saveOutreachData(data);
    res.json({ success: true, config: data.config });
  });

  app.get('/api/outreach/templates', (req, res) => {
    res.json({ templates: getOutreachData().templates || [] });
  });

  app.post('/api/outreach/templates', authLimiter, (req, res) => {
    const { name, subject, body, bodyText } = req.body;
    if (!name || (!subject && !bodyText) || (!body && !bodyText)) return res.status(400).json({ error: 'Faltan campos: name, subject/bodyText, body/bodyText' });
    const data = getOutreachData();
    const tpl = { id: Date.now().toString(36), name, subject: subject || '', body: body || '', bodyText: bodyText || '', createdAt: new Date().toISOString() };
    data.templates = data.templates || [];
    data.templates.push(tpl);
    saveOutreachData(data);
    res.json({ success: true, template: tpl });
  });

  app.put('/api/outreach/templates/:id', authLimiter, (req, res) => {
    const { name, subject, body, bodyText } = req.body;
    const data = getOutreachData();
    const idx = (data.templates || []).findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Template no encontrado' });
    if (name) data.templates[idx].name = name;
    if (subject !== undefined) data.templates[idx].subject = subject;
    if (body !== undefined) data.templates[idx].body = body;
    if (bodyText !== undefined) data.templates[idx].bodyText = bodyText;
    data.templates[idx].updatedAt = new Date().toISOString();
    saveOutreachData(data);
    res.json({ success: true, template: data.templates[idx] });
  });

  app.delete('/api/outreach/templates/:id', authLimiter, (req, res) => {
    const data = getOutreachData();
    data.templates = (data.templates || []).filter(t => t.id !== req.params.id);
    saveOutreachData(data);
    res.json({ success: true });
  });

  app.post('/api/outreach/send', authLimiter, async (req, res) => {
    const { leadIds, templateId, subject: customSubject, body: customBody, bodyText: customBodyText, testEmail, channel } = req.body;
    const chan = channel || 'email';
    const data = getOutreachData();
    if (!data.config) return res.status(400).json({ error: 'Configurá un provider primero' });
    if (chan === 'whatsapp' && !data.config.whatsapp) return res.status(400).json({ error: 'Configurá WhatsApp primero' });

    let subject = customSubject || '';
    let body = customBody || '';
    let bodyText = customBodyText || '';
    let tplName = '';

    if (templateId) {
      const tpl = (data.templates || []).find(t => t.id === templateId);
      if (!tpl) return res.status(404).json({ error: 'Template no encontrado' });
      subject = tpl.subject || '';
      body = tpl.body || '';
      bodyText = tpl.bodyText || '';
      tplName = tpl.name;
    }

    if (chan === 'email' && !body) return res.status(400).json({ error: 'Falta body HTML para email' });
    if (chan === 'whatsapp' && !bodyText) return res.status(400).json({ error: 'Falta bodyText para WhatsApp' });

    let leads = [];
    try {
      let allLeads = [];
      if (leadsJson && fs.existsSync(leadsJson)) {
        const parsed = JSON.parse(fs.readFileSync(leadsJson, 'utf8'));
        allLeads = parsed.leads || parsed || [];
      } else if (crmDb) {
        allLeads = crmDb.prepare('SELECT * FROM leads').all();
      }
      if (testEmail) {
        leads = [{ email: testEmail, name: 'Test', phone: '' }];
      } else if (leadIds && leadIds.length > 0) {
        leads = allLeads.filter(l => leadIds.includes(l.id?.toString() || l.id));
      } else {
        leads = allLeads.filter(l => chan === 'email' ? l.email : (l.phone || l.telefono));
      }
    } catch { return res.status(500).json({ error: 'Error al leer leads' }); }

    const contactField = chan === 'email' ? 'email' : 'phone';
    if (leads.length === 0) return res.status(400).json({ error: `No hay leads con ${contactField}` });

    const sent = [];
    const errors = [];

    for (const lead of leads.slice(0, chan === 'whatsapp' ? 20 : 50)) {
      try {
        const contact = lead[contactField] || lead.email || lead.phone || lead.telefono || '';
        const name = lead.name || lead.nombre || '';
        const company = lead.company || lead.empresa || '';

        if (chan === 'email') {
          const personalizedBody = body.replace(/{{name}}/g, name).replace(/{{email}}/g, lead.email || '').replace(/{{company}}/g, company);
          const personalizedSubject = subject.replace(/{{name}}/g, name).replace(/{{company}}/g, company);

          if (data.config.provider === 'resend') {
            const r = await fetch('https://api.resend.com/emails', {
              method: 'POST', headers: { 'Authorization': `Bearer ${data.config.apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: data.config.smtp?.from || 'onboarding@resend.dev', to: lead.email, subject: personalizedSubject, html: personalizedBody })
            });
            if (r.ok) sent.push({ email: lead.email, name });
            else errors.push({ email: lead.email, error: (await r.json()).error?.message || r.statusText });
          } else if (data.config.provider === 'sendgrid') {
            const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
              method: 'POST', headers: { 'Authorization': `Bearer ${data.config.apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ personalizations: [{ to: [{ email: lead.email }] }], from: { email: data.config.smtp?.from || 'noreply@axispanel.com' }, subject: personalizedSubject, content: [{ type: 'text/html', value: personalizedBody }] })
            });
            if (r.ok) sent.push({ email: lead.email, name });
            else errors.push({ email: lead.email, error: r.statusText });
          } else if (data.config.provider === 'smtp' && data.config.smtp) {
            try {
              const nodemailer = require('nodemailer');
              const transporter = nodemailer.createTransport({ host: data.config.smtp.host, port: data.config.smtp.port || 587, secure: data.config.smtp.secure || false, auth: { user: data.config.smtp.user, pass: data.config.smtp.pass } });
              await transporter.sendMail({ from: data.config.smtp.from || data.config.smtp.user, to: lead.email, subject: personalizedSubject, html: personalizedBody });
              sent.push({ email: lead.email, name });
            } catch (e) { errors.push({ email: lead.email, error: e.message }); }
          } else {
            errors.push({ email: lead.email, error: 'Provider no soportado' });
          }
        } else if (chan === 'whatsapp') {
          const wa = data.config.whatsapp;
          if (wa.provider === 'twilio') {
            const personalizedMsg = bodyText.replace(/{{name}}/g, name).replace(/{{email}}/g, lead.email || '').replace(/{{company}}/g, company);
            const auth = Buffer.from(`${wa.accountSid}:${wa.authToken}`).toString('base64');
            const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${wa.accountSid}/Messages.json`, {
              method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ To: contact, From: `whatsapp:${wa.fromNumber}`, Body: personalizedMsg })
            });
            const result = await r.json();
            if (r.ok) sent.push({ phone: contact, name, sid: result.sid });
            else errors.push({ phone: contact, error: result.message || r.statusText });
          } else {
            sent.push({ phone: contact, name, note: 'modo manual — copiá el mensaje' });
          }
        }
      } catch (e) { errors.push({ email: lead.email || lead.phone, error: e.message }); }
    }

    data.history = data.history || [];
    data.history.unshift({ id: Date.now().toString(36), timestamp: new Date().toISOString(), channel: chan, sentCount: sent.length, errorCount: errors.length, templateId: templateId || null, templateName: tplName, subject: chan === 'email' ? subject : '', sent: sent.slice(0, 10), errors: errors.slice(0, 10) });
    if (data.history.length > 100) data.history = data.history.slice(0, 100);
    saveOutreachData(data);
    res.json({ success: true, channel: chan, sent: sent.length, errors: errors.length, sentList: sent.slice(0, 10), errorList: errors.slice(0, 10) });
  });

  app.get('/api/outreach/history', (req, res) => {
    res.json({ history: (getOutreachData().history || []).slice(0, 50) });
  });

  return { getOutreachData };
};
