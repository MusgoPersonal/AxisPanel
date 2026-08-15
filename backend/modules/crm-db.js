const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PIPELINE_STAGES = ['new', 'contacted', 'responded', 'qualified', 'proposal', 'client', 'closed', 'lost', 'ignored'];
const PIPELINE_DISPLAY = {
  new: 'Nuevo', contacted: 'Contactado', responded: 'Respondió',
  qualified: 'Calificado', proposal: 'Propuesta', client: 'Cliente',
  closed: 'Cerrado', lost: 'Perdido', ignored: 'Ignorado'
};

function initDB(configDir) {
  const dbPath = path.join(configDir, 'crm.db');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT,
      name TEXT NOT NULL DEFAULT '',
      category TEXT DEFAULT '',
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      website TEXT DEFAULT '',
      instagram TEXT DEFAULT '',
      facebook TEXT DEFAULT '',
      rating REAL,
      reviews_count INTEGER DEFAULT 0,
      lat REAL,
      lng REAL,
      place_id TEXT,
      types TEXT,
      opening_hours TEXT,
      score INTEGER DEFAULT 0,
      stage TEXT NOT NULL DEFAULT 'new',
      tags TEXT DEFAULT '',
      enriched INTEGER DEFAULT 0,
      city TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pipeline_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      moved_by TEXT DEFAULT 'system',
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'note',
      direction TEXT DEFAULT 'outbound',
      content TEXT DEFAULT '',
      channel TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'completed',
      scheduled_at TEXT,
      completed_at TEXT DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      type TEXT DEFAULT 'follow_up',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      due_at TEXT,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      assigned_to TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      channel TEXT NOT NULL DEFAULT 'telegram',
      channel_id TEXT,
      title TEXT DEFAULT '',
      unread INTEGER DEFAULT 0,
      last_message TEXT DEFAULT '',
      last_activity TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
    CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_activity ON conversations(last_activity);

    CREATE TABLE IF NOT EXISTS enrichment_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      method TEXT NOT NULL,
      field TEXT DEFAULT '',
      found_value TEXT DEFAULT '',
      success INTEGER DEFAULT 0,
      attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
    CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category);
    CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
    CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score);
    CREATE INDEX IF NOT EXISTS idx_pipeline_lead ON pipeline_log(lead_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_lead ON interactions(lead_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
  `);

  return db;
}

function migrateFromJson(db, jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    console.log('[CRM] No leads.json found at', jsonPath);
    return 0;
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
  if (count > 0) {
    console.log('[CRM] DB already has', count, 'leads, skipping migration');
    return 0;
  }

  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw);
    const leadsList = data.leads || data || [];

    if (!Array.isArray(leadsList) || leadsList.length === 0) {
      console.log('[CRM] No leads to migrate');
      return 0;
    }

    const insert = db.prepare(`
      INSERT INTO leads (id, source, source_id, name, category, address, phone, email, website,
        instagram, facebook, rating, reviews_count, lat, lng, place_id, types, opening_hours,
        score, stage, tags, enriched, created_at, updated_at)
      VALUES (@id, @source, @source_id, @name, @category, @address, @phone, @email, @website,
        @instagram, @facebook, @rating, @reviews_count, @lat, @lng, @place_id, @types, @opening_hours,
        @score, @stage, @tags, @enriched, @created_at, @updated_at)
    `);

    const tx = db.transaction(() => {
      for (const lead of leadsList) {
        insert.run({
          id: lead.id || undefined,
          source: lead.source || 'google_maps',
          source_id: lead.source_id || null,
          name: lead.name || 'Sin nombre',
          category: lead.category || '',
          address: lead.address || '',
          phone: lead.phone || '',
          email: lead.email || '',
          website: lead.website || '',
          instagram: lead.instagram || '',
          facebook: lead.facebook || '',
          rating: lead.rating || null,
          reviews_count: lead.reviews_count || 0,
          lat: lead.lat || null,
          lng: lead.lng || null,
          place_id: lead.place_id || null,
          types: lead.types || null,
          opening_hours: lead.opening_hours || null,
          score: lead.score || 0,
          stage: lead.status || 'new',
          tags: Array.isArray(lead.tags) ? lead.tags.join(',') : (lead.tags || ''),
          enriched: lead.enriched || 0,
          created_at: lead.created_at || new Date().toISOString(),
          updated_at: lead.updated_at || new Date().toISOString()
        });
      }
    });

    tx();
    console.log(`[CRM] Migrated ${leadsList.length} leads from leads.json`);
    return leadsList.length;
  } catch (e) {
    console.error('[CRM] Migration error:', e.message);
    return 0;
  }
}

function getLeads(db, filters = {}) {
  const {
    stage, category, source, search, city,
    score_min, score_max, enriched,
    page = 1, limit = 50, sort = 'created_at', order = 'desc'
  } = filters;

  const conditions = [];
  const params = {};

  if (stage) { conditions.push('l.stage = @stage'); params.stage = stage; }
  if (category) { conditions.push('l.category = @category'); params.category = category; }
  if (source) { conditions.push('l.source = @source'); params.source = source; }
  if (city) { conditions.push('l.city = @city'); params.city = city; }
  if (enriched !== undefined) { conditions.push('l.enriched = @enriched'); params.enriched = enriched ? 1 : 0; }
  if (score_min !== undefined) { conditions.push('l.score >= @score_min'); params.score_min = parseInt(score_min); }
  if (score_max !== undefined) { conditions.push('l.score <= @score_max'); params.score_max = parseInt(score_max); }
  if (search) {
    conditions.push('(l.name LIKE @search OR l.email LIKE @search OR l.phone LIKE @search OR l.website LIKE @search OR l.address LIKE @search OR l.tags LIKE @search)');
    params.search = `%${search}%`;
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;
  const allowedSort = ['created_at', 'updated_at', 'score', 'name', 'stage', 'rating'];
  const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';

  const total = db.prepare(`SELECT COUNT(*) as c FROM leads l ${where}`).get(params).c;
  const leads = db.prepare(`SELECT l.* FROM leads l ${where} ORDER BY l.${sortCol} ${sortDir} LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset });

  const leadIds = leads.map(l => l.id);
  let interactions = {};
  let tasks = {};
  if (leadIds.length > 0) {
    const placeholders = leadIds.map(() => '?').join(',');
    const interRows = db.prepare(`SELECT * FROM interactions WHERE lead_id IN (${placeholders}) ORDER BY created_at DESC`).all(...leadIds);
    for (const row of interRows) {
      if (!interactions[row.lead_id]) interactions[row.lead_id] = [];
      interactions[row.lead_id].push(row);
    }
    const taskRows = db.prepare(`SELECT * FROM tasks WHERE lead_id IN (${placeholders}) AND completed = 0 ORDER BY due_at ASC`).all(...leadIds);
    for (const row of taskRows) {
      if (!tasks[row.lead_id]) tasks[row.lead_id] = [];
      tasks[row.lead_id].push(row);
    }
  }

  const result = leads.map(l => ({
    ...l,
    interactions: interactions[l.id] || [],
    pending_tasks: tasks[l.id] || []
  }));

  return { leads: result, total, page, limit, total_pages: Math.ceil(total / limit) };
}

function getLead(db, id) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!lead) return null;
  lead.pipeline_log = db.prepare('SELECT * FROM pipeline_log WHERE lead_id = ? ORDER BY created_at DESC').all(id);
  lead.interactions = db.prepare('SELECT * FROM interactions WHERE lead_id = ? ORDER BY created_at DESC').all(id);
  lead.tasks = db.prepare('SELECT * FROM tasks WHERE lead_id = ? ORDER BY due_at ASC').all(id);
  lead.enrichment_log = db.prepare('SELECT * FROM enrichment_log WHERE lead_id = ? ORDER BY attempted_at DESC').all(id);
  return lead;
}

function createLead(db, data) {
  const lead = {
    source: data.source || 'manual',
    source_id: data.source_id || null,
    name: data.name || 'Sin nombre',
    category: data.category || '',
    address: data.address || '',
    phone: data.phone || '',
    email: data.email || '',
    website: data.website || '',
    instagram: data.instagram || '',
    facebook: data.facebook || '',
    rating: data.rating || null,
    reviews_count: data.reviews_count || 0,
    lat: data.lat || null,
    lng: data.lng || null,
    place_id: data.place_id || null,
    types: data.types || null,
    opening_hours: data.opening_hours || null,
    score: data.score || 0,
    stage: data.stage || 'new',
    tags: Array.isArray(data.tags) ? data.tags.join(',') : (data.tags || ''),
    city: data.city || '',
    notes: data.notes || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const result = db.prepare(`
    INSERT INTO leads (source, source_id, name, category, address, phone, email, website,
      instagram, facebook, rating, reviews_count, lat, lng, place_id, types, opening_hours,
      score, stage, tags, city, notes, created_at, updated_at)
    VALUES (@source, @source_id, @name, @category, @address, @phone, @email, @website,
      @instagram, @facebook, @rating, @reviews_count, @lat, @lng, @place_id, @types, @opening_hours,
      @score, @stage, @tags, @city, @notes, @created_at, @updated_at)
  `).run(lead);

  const leadId = result.lastInsertRowid;
  logPipeline(db, leadId, null, lead.stage, 'system', 'Lead creado');
  return getLead(db, leadId);
}

function updateLead(db, id, data) {
  const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!existing) return null;

  const fields = ['name', 'category', 'address', 'phone', 'email', 'website', 'instagram', 'facebook',
    'rating', 'reviews_count', 'lat', 'lng', 'place_id', 'types', 'opening_hours', 'score', 'tags', 'city', 'notes', 'enriched'];
  const updates = [];
  const params = { id };

  for (const f of fields) {
    if (data[f] !== undefined) {
      updates.push(`${f} = @${f}`);
      params[f] = data[f];
    }
  }

  if (updates.length > 0) {
    params.updated_at = new Date().toISOString();
    updates.push('updated_at = @updated_at');
    db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = @id`).run(params);
  }

  return getLead(db, id);
}

function moveLeadStage(db, id, toStage, movedBy, note) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!lead) return null;
  if (!PIPELINE_STAGES.includes(toStage)) throw new Error(`Invalid stage: ${toStage}`);

  const fromStage = lead.stage;
  if (fromStage === toStage) return getLead(db, id);

  db.prepare('UPDATE leads SET stage = ?, updated_at = ? WHERE id = ?').run(toStage, new Date().toISOString(), id);
  logPipeline(db, id, fromStage, toStage, movedBy || 'system', note || '');
  return getLead(db, id);
}

function logPipeline(db, leadId, fromStage, toStage, movedBy, note) {
  db.prepare(`
    INSERT INTO pipeline_log (lead_id, from_stage, to_stage, moved_by, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(leadId, fromStage, toStage, movedBy || 'system', note || '');
}

function addInteraction(db, leadId, data) {
  const result = db.prepare(`
    INSERT INTO interactions (lead_id, type, direction, content, channel, status, scheduled_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(leadId, data.type || 'note', data.direction || 'outbound', data.content || '',
    data.channel || 'manual', data.status || 'completed', data.scheduled_at || null,
    data.status === 'completed' ? new Date().toISOString() : null
  );
  db.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), leadId);
  return db.prepare('SELECT * FROM interactions WHERE id = ?').get(result.lastInsertRowid);
}

function createTask(db, leadId, data) {
  const result = db.prepare(`
    INSERT INTO tasks (lead_id, type, title, description, due_at, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(leadId || null, data.type || 'follow_up', data.title, data.description || '',
    data.due_at || null, data.assigned_to || ''
  );
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
}

function completeTask(db, id) {
  const result = db.prepare(`
    UPDATE tasks SET completed = 1, completed_at = ? WHERE id = ? AND completed = 0
  `).run(new Date().toISOString(), id);
  return result.changes > 0 ? db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) : null;
}

function deleteLead(db, id) {
  db.prepare('DELETE FROM leads WHERE id = ?').run(id);
}

function getPipelineStats(db) {
  const stages = db.prepare(`
    SELECT stage, COUNT(*) as count FROM leads GROUP BY stage ORDER BY
      CASE stage
        WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'responded' THEN 3
        WHEN 'qualified' THEN 4 WHEN 'proposal' THEN 5 WHEN 'client' THEN 6
        WHEN 'closed' THEN 7 WHEN 'lost' THEN 8 WHEN 'ignored' THEN 9
        ELSE 10 END
  `).all();

  const allStages = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s] = { stage: s, display: PIPELINE_DISPLAY[s], count: 0 };
    return acc;
  }, {});

  for (const s of stages) {
    if (allStages[s.stage]) allStages[s.stage].count = s.count;
  }

  return Object.values(allStages);
}

function getStats(db) {
  const total = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
  const enriched = db.prepare('SELECT COUNT(*) as c FROM leads WHERE enriched = 1').get().c;
  const withEmail = db.prepare("SELECT COUNT(*) as c FROM leads WHERE length(email) > 0 AND email IS NOT NULL").get().c;
  const withPhone = db.prepare("SELECT COUNT(*) as c FROM leads WHERE length(phone) > 0 AND phone IS NOT NULL").get().c;
  const withWebsite = db.prepare("SELECT COUNT(*) as c FROM leads WHERE length(website) > 0 AND website IS NOT NULL").get().c;
  const todayLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE date(created_at) = date('now')").get().c;
  const weekLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE created_at >= datetime('now', '-7 days')").get().c;

  const bySource = db.prepare('SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC').all();
  const byCategory = db.prepare('SELECT category, COUNT(*) as count FROM leads WHERE category != "" GROUP BY category ORDER BY count DESC LIMIT 10').all();
  const pendingTasks = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE completed = 0 AND due_at <= datetime("now", "+1 day")').get().c;
  const avgScore = db.prepare('SELECT AVG(score) as avg FROM leads').get().avg || 0;

  return { total, enriched, withEmail, withPhone, withWebsite, todayLeads, weekLeads, bySource, byCategory, pendingTasks, avgScore: Math.round(avgScore) };
}

function getLeadBySourceId(db, source, sourceId) {
  return db.prepare('SELECT * FROM leads WHERE source = ? AND source_id = ?').get(source, sourceId);
}

// ─── Tags ───
function listTags(db) {
  return db.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE').all();
}

function upsertTag(db, name) {
  const tag = String(name || '').trim();
  if (!tag) return null;
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tag);
  return db.prepare('SELECT * FROM tags WHERE name = ?').get(tag);
}

function syncLeadTags(db, tagsString) {
  if (!tagsString) return;
  const parts = String(tagsString).split(',').map(t => t.trim()).filter(Boolean);
  const stmt = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  for (const p of parts) stmt.run(p);
}

// ─── Tasks ───
function listTasks(db, filters = {}) {
  const { leadId, completed } = filters;
  const conditions = [];
  const params = {};
  if (leadId !== undefined) { conditions.push('t.lead_id = @leadId'); params.leadId = parseInt(leadId); }
  if (completed !== undefined) { conditions.push('t.completed = @completed'); params.completed = completed ? 1 : 0; }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return db.prepare(`SELECT t.*, l.name as lead_name FROM tasks t LEFT JOIN leads l ON t.lead_id = l.id ${where} ORDER BY (t.completed = 1) ASC, (t.due_at IS NULL) ASC, t.due_at ASC, t.created_at DESC`).all(params);
}

function deleteTask(db, id) {
  return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
}

// ─── Bulk actions ───
function bulkUpdateLeads(db, ids, data) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  if (data.action === 'delete') {
    return db.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`).run(...ids).changes;
  }
  if (data.action === 'move' && data.value) {
    const r = db.prepare(`UPDATE leads SET stage = ?, updated_at = ? WHERE id IN (${placeholders})`).run(data.value, new Date().toISOString(), ...ids);
    return r.changes;
  }
  if (data.action === 'tag' && data.value) {
    const leads = db.prepare(`SELECT id, tags FROM leads WHERE id IN (${placeholders})`).all(...ids);
    const upd = db.prepare('UPDATE leads SET tags = ?, updated_at = ? WHERE id = ?');
    let n = 0;
    for (const l of leads) {
      const existing = (l.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      if (!existing.includes(data.value)) existing.push(data.value);
      upd.run(existing.join(','), new Date().toISOString(), l.id);
      n++;
    }
    syncLeadTags(db, data.value);
    return n;
  }
  if (data.action === 'untag' && data.value) {
    const leads = db.prepare(`SELECT id, tags FROM leads WHERE id IN (${placeholders})`).all(...ids);
    const upd = db.prepare('UPDATE leads SET tags = ?, updated_at = ? WHERE id = ?');
    let n = 0;
    for (const l of leads) {
      const existing = (l.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      const next = existing.filter(t => t !== data.value);
      if (next.length !== existing.length) { upd.run(next.join(','), new Date().toISOString(), l.id); n++; }
    }
    return n;
  }
  return 0;
}

module.exports = {
  initDB, migrateFromJson, getLeads, getLead, createLead, updateLead,
  moveLeadStage, addInteraction, createTask, completeTask, deleteLead,
  getPipelineStats, getStats, getLeadBySourceId,
  listTags, upsertTag, syncLeadTags, listTasks, deleteTask, bulkUpdateLeads,
  PIPELINE_STAGES, PIPELINE_DISPLAY
};
