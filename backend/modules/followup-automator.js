const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function createFollowUpModule(app, { configDir, crmDb, leadsJsonPath, getOutreachData, authLimiter, apiLimiter }) {
  const FOLLOWUP_FILE = path.join(configDir, 'followup.json');
  const PORT = parseInt(process.env.AXIS_PORT || '3030');
  const AUTH_TOKEN = process.env.AXIS_AUTH_TOKEN || 'Pr0sp3r1d4d...C0m';
  let schedulerInterval = null;

  function getData() {
    try {
      if (!fs.existsSync(FOLLOWUP_FILE)) return { rules: [], history: [] };
      return JSON.parse(fs.readFileSync(FOLLOWUP_FILE, 'utf8'));
    } catch { return { rules: [], history: [] }; }
  }

  function saveData(data) {
    fs.writeFileSync(FOLLOWUP_FILE, JSON.stringify(data, null, 2), 'utf8');
  }

  function getAllLeads() {
    if (fs.existsSync(leadsJsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(leadsJsonPath, 'utf8'));
      return parsed.leads || [];
    }
    if (crmDb) {
      return crmDb.prepare('SELECT * FROM leads').all();
    }
    return [];
  }

  function getLastContactDate(leadId, data) {
    const dates = [];
    const outreach = getOutreachData();
    for (const entry of (outreach.history || [])) {
      for (const s of (entry.sent || [])) {
        if (s.email || s.phone) {
          const lead = getAllLeads().find(l => (l.email === s.email) || (l.phone === s.phone) || (l.telefono === s.phone));
          if (lead && (lead.id?.toString() === leadId || lead.id === leadId)) {
            dates.push(new Date(entry.timestamp));
          }
        }
      }
    }
    for (const entry of (data.history || [])) {
      if (entry.leadId === leadId) {
        dates.push(new Date(entry.sentAt));
      }
    }
    return dates.length > 0 ? Math.max(...dates) : null;
  }

  async function executeRule(rule, lead, data) {
    const name = lead.name || lead.nombre || '';
    const email = lead.email || '';
    const phone = lead.phone || lead.telefono || '';
    const company = lead.company || lead.empresa || '';

    const outreachData = getOutreachData();
    let subject = rule.subject || '';
    let body = rule.body || '';
    let bodyText = rule.bodyText || '';

    if (rule.templateId) {
      const tpl = (outreachData.templates || []).find(t => t.id === rule.templateId);
      if (tpl) {
        if (!subject) subject = tpl.subject || '';
        if (!body) body = tpl.body || '';
        if (!bodyText) bodyText = tpl.bodyText || '';
      }
    }

    const personalizedBody = body
      .replace(/{{name}}/g, name).replace(/{{email}}/g, email).replace(/{{company}}/g, company);
    const personalizedSubject = subject
      .replace(/{{name}}/g, name).replace(/{{company}}/g, company);
    const personalizedText = bodyText
      .replace(/{{name}}/g, name).replace(/{{email}}/g, email).replace(/{{company}}/g, company);

    const payload = {
      leadIds: [lead.id?.toString() || lead.id],
      channel: rule.channel || 'email',
      subject: personalizedSubject,
      body: personalizedBody,
      bodyText: personalizedText,
      templateId: rule.templateId || null
    };

    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/outreach/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH_TOKEN}` },
        body: JSON.stringify(payload)
      });
      const result = await r.json();
      data.history.unshift({
        id: crypto.randomBytes(4).toString('hex'),
        ruleId: rule.id, ruleName: rule.name,
        leadId: lead.id?.toString() || lead.id, leadName: name,
        channel: rule.channel || 'email',
        sentAt: new Date().toISOString(),
        success: result.success,
        error: result.error || (result.errors > 0 ? result.errorList?.[0]?.error : null)
      });
      return result;
    } catch (e) {
      data.history.unshift({
        id: crypto.randomBytes(4).toString('hex'),
        ruleId: rule.id, ruleName: rule.name,
        leadId: lead.id?.toString() || lead.id, leadName: name,
        channel: rule.channel || 'email',
        sentAt: new Date().toISOString(),
        success: false,
        error: e.message
      });
      return { success: false, error: e.message };
    }
  }

  async function checkAndExecute() {
    const data = getData();
    const activeRules = data.rules.filter(r => r.enabled !== false);
    if (activeRules.length === 0) return;

    const now = Date.now();
    let changed = false;

    for (const rule of activeRules) {
      const leads = getAllLeads();
      for (const lead of leads) {
        const leadId = lead.id?.toString() || lead.id;
        const contactsForRule = data.history.filter(h => h.ruleId === rule.id && h.leadId === leadId);
        if (contactsForRule.length >= (rule.maxFollowUps || 3)) continue;

        if (rule.onlyIfNoResponse) {
          const lastResponse = getLastContactDate(leadId, data);
          if (lastResponse) continue;
        }

        const lastContact = getLastContactDate(leadId, data);
        let shouldSend = false;

        if (rule.trigger === 'delay' && rule.daysAfterLastContact > 0) {
          const cutoff = rule.daysAfterLastContact * 24 * 60 * 60 * 1000;
          if (!lastContact) {
            const created = new Date(lead.created_at || lead.createdAt || lead.created || now);
            shouldSend = (now - created.getTime()) >= cutoff;
          } else {
            shouldSend = (now - lastContact.getTime()) >= cutoff;
          }
        }

        if (rule.trigger === 'schedule' && rule.cronExpression) {
          continue;
        }

        if (shouldSend) {
          const contactField = rule.channel === 'whatsapp' ? 'phone' : 'email';
          const contact = rule.channel === 'whatsapp' ? (lead.phone || lead.telefono) : lead.email;
          if (!contact) continue;

          changed = true;
          await executeRule(rule, lead, data);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    if (changed) {
      if (data.history.length > 500) data.history = data.history.slice(0, 500);
      saveData(data);
    }
  }

  // ─── Routes ───

  app.get('/api/followup/rules', (req, res) => {
    const data = getData();
    res.json({ rules: data.rules || [] });
  });

  app.post('/api/followup/rules', authLimiter, (req, res) => {
    const { name, trigger, daysAfterLastContact, channel, templateId, subject, body, bodyText, maxFollowUps, onlyIfNoResponse, cronExpression } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const data = getData();
    const rule = {
      id: crypto.randomBytes(4).toString('hex'),
      name, enabled: true,
      trigger: trigger || 'delay',
      daysAfterLastContact: parseInt(daysAfterLastContact) || 3,
      channel: channel || 'email',
      templateId: templateId || null,
      subject: subject || '',
      body: body || '',
      bodyText: bodyText || '',
      maxFollowUps: parseInt(maxFollowUps) || 3,
      onlyIfNoResponse: onlyIfNoResponse !== false,
      cronExpression: cronExpression || null,
      createdAt: new Date().toISOString()
    };
    data.rules.push(rule);
    saveData(data);
    res.json({ success: true, rule });
  });

  app.put('/api/followup/rules/:id', authLimiter, (req, res) => {
    const data = getData();
    const idx = data.rules.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Regla no encontrada' });
    const fields = ['name', 'enabled', 'trigger', 'daysAfterLastContact', 'channel', 'templateId', 'subject', 'body', 'bodyText', 'maxFollowUps', 'onlyIfNoResponse', 'cronExpression'];
    for (const f of fields) {
      if (req.body[f] !== undefined) data.rules[idx][f] = req.body[f];
    }
    data.rules[idx].updatedAt = new Date().toISOString();
    saveData(data);
    res.json({ success: true, rule: data.rules[idx] });
  });

  app.delete('/api/followup/rules/:id', authLimiter, (req, res) => {
    const data = getData();
    data.rules = data.rules.filter(r => r.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
  });

  app.get('/api/followup/history', (req, res) => {
    const data = getData();
    res.json({ history: (data.history || []).slice(0, 100) });
  });

  app.post('/api/followup/trigger', authLimiter, async (req, res) => {
    await checkAndExecute();
    res.json({ success: true, message: 'Follow-up check ejecutado' });
  });

  app.get('/api/followup/status', (req, res) => {
    const data = getData();
    const activeRules = (data.rules || []).filter(r => r.enabled);
    res.json({
      activeRules: activeRules.length,
      totalRules: (data.rules || []).length,
      totalFollowUps: (data.history || []).length,
      schedulerRunning: schedulerInterval !== null
    });
  });

  // ─── Scheduler ───
  function startScheduler() {
    if (schedulerInterval) clearInterval(schedulerInterval);
    schedulerInterval = setInterval(checkAndExecute, 60000);
    checkAndExecute();
  }

  function stopScheduler() {
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
  }

  return { startScheduler, stopScheduler, checkAndExecute };
};
