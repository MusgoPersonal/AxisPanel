<script>
  import { onMount, onDestroy } from 'svelte';

  export let systemStatus = {};

  let chatAgent = 'axischat';
  let prevChatAgent = 'axischat';
  let chatRouting = true;
  let chatSessionId = null;
  let chatMessages = [];
  let chatInput = '';
  let chatStatus = '';
  let chatScrollContainer;
  let dynamicAgents = [];
  let agencyAgents = [];
  let agentColors = {};

  let userScrolledUp = false;
  let scrapingFlowActive = false;

  let slashOpen = false;
  let slashFilter = '';
  let slashSelected = 0;
  let sidebarHover = false;
  let sidebarSection = null;
  let sidebarTabEl;
  let sidebarPos = { top: 0, right: 0 };
  let sidebarTimer = null;

  function updateSidebarPos() {
    if (!sidebarTabEl) return;
    const r = sidebarTabEl.getBoundingClientRect();
    sidebarPos = { top: r.top, right: window.innerWidth - r.right };
  }

  function onSidebarEnter() {
    clearTimeout(sidebarTimer);
    sidebarHover = true;
    updateSidebarPos();
  }

  function onSidebarLeave() {
    clearTimeout(sidebarTimer);
    sidebarTimer = setTimeout(() => { sidebarHover = false; }, 200);
  }

  $: filteredSlash = slashOpen ? SLASH_COMMANDS.filter(c => c.cmd.includes(slashFilter.toLowerCase())) : [];
  let scrapingFlowStep = 0;
  let scrapingFlowData = { query: '', location: '', category: 'clinicas_dentales' };

  let thinkingIndex = -1;
  let thinkingStart = 0;
  let progress = 0;
  let elapsedSecs = 0;
  let progressTimer = null;
  let initialized = false;

  function detectAgentFromMessage(msg) {
    const lower = msg.toLowerCase();
    if (/hermes|agent|asistente/.test(lower)) return 'hermes';
    if (/openclaw|claw/.test(lower)) return 'openclaw';
    if (/antigravity|agy/.test(lower)) return 'agy';
    if (/gemini|google/.test(lower)) return 'gemini';
    if (/opencode|open.?code/.test(lower)) return 'opencode';
    if (/skill/.test(lower)) return 'skills';
    if (/builder.?bot|chatbot|bot/.test(lower)) return 'builderbot';
    if (/agency|agente|agencia/.test(lower)) return 'agency';
    if (/mimo|xiaomi/.test(lower)) return 'mimo';
    for (const a of dynamicAgents) {
      if (lower.includes(a.name.toLowerCase())) return `agent:${a.name}`;
    }
    return null;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  const STATIC_AGENTS = [
    { id: 'axischat', label: '🌿 AxisChat' },
    { id: 'chatgeneral', label: '🌿 ChatGeneral (legacy)' },
    { id: 'hermes', label: '◈ Hermes' },
    { id: 'openclaw', label: '🦞 OpenClaw' },
    { id: 'agy', label: '△ Antigravity' },
    { id: 'gemini', label: '◆ Gemini' },
    { id: 'freebuff', label: '⚡ Freebuff' },
    { id: 'codebuff_general', label: '🧠 Codebuff General' },
    { id: 'codebuff_editor', label: '✏️ Codebuff Editor' },
    { id: 'codebuff_researcher', label: '🔍 Codebuff Researcher' },
    { id: 'codebuff_librarian', label: '📚 Codebuff Librarian' },
    { id: 'codebuff_thinker', label: '🤔 Codebuff Thinker' },
    { id: 'codebuff_basher', label: '💻 Codebuff Basher' },
    { id: 'opencode', label: '◇ OpenCode (terminal)' },
    { id: 'skills', label: '⚡ Skills' },
    { id: 'agency', label: '🏢 Agency' },
    { id: 'builderbot', label: '🤖 BuilderBot' },
  ];

  $: AGENTS = [...STATIC_AGENTS, ...dynamicAgents.map(a => ({ id: `agent:${a.name}`, label: `◆ ${a.name}` })), ...agencyAgents.map(a => ({ id: `agency:${a.slug}`, label: `🏢 ${a.name}` }))];

  $: {
    if (dynamicAgents.length || agencyAgents.length) {
      const colors = { axischat: '#22d3ee', chatgeneral: '#fbbf24', hermes: '#2dd4bf', openclaw: '#fbbf24', opencode: '#4ade80', agy: '#fb7185', gemini: '#2dd4bf', mimo: '#818cf8', freebuff: '#a855f7', sistema: '#94a3b8', codebuff_general: '#22d3ee', codebuff_editor: '#4ade80', codebuff_researcher: '#60a5fa', codebuff_librarian: '#fbbf24', codebuff_thinker: '#a78bfa', codebuff_basher: '#fb7185', opencode: '#4ade80', skills: '#f97316', agency: '#10b981', builderbot: '#f59e0b' };
      for (const a of dynamicAgents) colors[`agent:${a.name}`] = a.color;
      for (const a of agencyAgents) colors[`agency:${a.slug}`] = '#10b981';
      agentColors = colors;
    }
  }

  function getAgentColor(agent) {
    return agentColors[agent] || '#94a3b8';
  }

  const SLASH_COMMANDS = [
    { cmd: '/ayuda', desc: 'Mostrar comandos' },
    { cmd: '/rotar', desc: 'Forzar rotación de API key' },
    { cmd: '/limpiar', desc: 'Limpiar conversación' },
    { cmd: '/agente', desc: 'Cambiar agente' },
    { cmd: '/enrutador', desc: 'Activar/desactivar enrutador' },
    { cmd: '/status', desc: 'Estado del sistema' },
    { cmd: '/opencode', desc: 'Abrir OpenCode en terminal con tarea' },
    { cmd: '/exec', desc: 'Ejecutar comando shell y mostrar resultado' },
    { cmd: '/skills', desc: 'Agregar skills de Google (npx skills add google/skills)' },
    { cmd: '/agency', desc: 'Listar agentes de Agency Agents por división' },
    { cmd: '/agency <slug> <mensaje>', desc: 'Consultar un agente específico' },
    { cmd: '/builderbot', desc: 'Listar bots creados con BuilderBot' },
    { cmd: '/builderbot create <nombre>', desc: 'Crear un nuevo chatbot con BuilderBot' },
  ];

  onMount(async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      dynamicAgents = data.agents || [];
    } catch (e) { console.error('Error fetching agents:', e); }

    try {
      const res = await fetch('/api/agency/agents');
      const data = await res.json();
      agencyAgents = (data.agents || []).slice(0, 50);
    } catch (e) { console.error('Error fetching agency agents:', e); }

    const savedKey = `axis:chat:messages:${chatAgent}`;
    const saved = localStorage.getItem(savedKey);
    if (saved) {
      try { chatMessages = JSON.parse(saved); } catch {}
    }
    const savedAgent = localStorage.getItem('axis:chat:agent');
    if (savedAgent && AGENTS.find(a => a.id === savedAgent)) chatAgent = savedAgent;
    const savedSession = localStorage.getItem('axis:chat:session_id');
    if (savedSession) chatSessionId = savedSession;
    if (!saved || !JSON.parse(saved || '[]').length) {
      addChatBubble('agent', '🌿 **AxisChat**\n\nMulti-agente estilo Codebuff. Presioná **/** para comandos.', 'axischat');
    }
    initialized = true;
  });

  $: if (initialized) {
    const key = `axis:chat:messages:${chatAgent}`;
    if (chatMessages && chatMessages.length > 0) localStorage.setItem(key, JSON.stringify(chatMessages));
  }
  $: localStorage.setItem('axis:chat:agent', chatAgent);
  $: if (chatSessionId) localStorage.setItem('axis:chat:session_id', chatSessionId);

  onDestroy(() => {
    if (progressTimer) clearInterval(progressTimer);
    if (sidebarTimer) clearTimeout(sidebarTimer);
  });

  function switchChatHistory(oldAgent) {
    const prevKey = `axis:chat:messages:${oldAgent}`;
    if (chatMessages && chatMessages.length > 0) localStorage.setItem(prevKey, JSON.stringify(chatMessages));
    const newKey = `axis:chat:messages:${chatAgent}`;
    const saved = localStorage.getItem(newKey);
    try { chatMessages = saved ? JSON.parse(saved) : []; } catch { chatMessages = []; }
    if (!chatMessages.length) {
      addChatBubble('agent', `💬 **${AGENTS.find(a => a.id === chatAgent)?.label || chatAgent}**\n\nConversación nueva.`, chatAgent);
    }
  }

  function addChatBubble(role, text, agent) {
    chatMessages = [...chatMessages, { role, text, agent, time: new Date().toLocaleTimeString() }];
  }

  async function triggerRotation() {
    const res = await fetch('/api/rotate', { method: 'POST' });
    const data = await res.json();
    return data.success ? 'Rotado ✓' : 'Error: ' + data.error;
  }

  async function sendShellCommand(cmd) {
    if (!cmd) return;
    addChatBubble('user', `> ${cmd}`, chatAgent);

    thinkingStart = Date.now();
    progress = 0;
    elapsedSecs = 0;
    thinkingIndex = chatMessages.length;
    const execAgent = chatAgent.startsWith('agent:') ? chatAgent : 'sistema';
    chatMessages = [...chatMessages, { role: 'agent', text: '', agent: execAgent, time: '', pending: true }];
    chatStatus = 'Sistema';

    if (progressTimer) clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      elapsedSecs = (Date.now() - thinkingStart) / 1000;
      progress = Math.min(92, (elapsedSecs / 25) * 92);
      chatMessages = chatMessages;
    }, 80);

    try {
      let url, bodyData;
      if (chatAgent.startsWith('agent:')) {
        const agentName = chatAgent.slice(6);
        url = `/api/agents/${agentName}/exec`;
        bodyData = { command: cmd, timeout: 60000 };
      } else if (chatAgent.startsWith('codebuff_')) {
        url = '/api/codebuff/chat';
        bodyData = { message: cmd, agent_type: chatAgent.slice(9), use_cli: true };
      } else {
        url = '/api/shell/exec';
        bodyData = { command: cmd, timeout: 60000 };
      }
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(bodyData) });
      const data = await res.json();
      const output = data.stdout || data.stderr || '(sin salida)';
      finishThinking(output, execAgent);
    } catch(e) {
      finishThinking('Error: ' + e.message, execAgent);
    }
  }

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg) return;
    chatInput = '';
    if (msg.startsWith('/')) { handleSlash(msg); return; }

    if (msg.startsWith('>')) {
      sendShellCommand(msg.slice(1).trim());
      return;
    }

    if (scrapingFlowActive) {
      handleScrapingFlowInput(msg);
      return;
    }

    addChatBubble('user', msg, chatAgent);

    const intentRegex = /(necesito|quiero|buscar|obtener)\s+(clientes|prospectos|leads|negocios)/i;
    if (intentRegex.test(msg)) {
      scrapingFlowActive = true;
      scrapingFlowStep = 1;
      chatStatus = 'Scraping Flow';
      addChatBubble('agent', '👋 ¡Hola! Veo que quieres buscar nuevos leads o clientes.\n\nTe guiaré paso a paso. Primero:\n**¿Qué tipo de negocio deseas buscar?** (Ej. *Dentistas*, *Gimnasios*)', 'chatgeneral');
      return;
    }

    let target = chatAgent;
    if (chatRouting && chatAgent === 'chatgeneral') {
      target = detectAgentFromMessage(msg) || 'chatgeneral';
    }

    // ─── Bubble de "Pensando..." con barra de progreso ───
    thinkingStart = Date.now();
    progress = 0;
    elapsedSecs = 0;
    thinkingIndex = chatMessages.length;
    chatMessages = [...chatMessages, { role: 'agent', text: '', agent: target, time: '', pending: true }];
    chatStatus = 'Pensando...';

    if (progressTimer) clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      elapsedSecs = (Date.now() - thinkingStart) / 1000;
      progress = Math.min(92, (elapsedSecs / 25) * 92);
      chatMessages = chatMessages;
    }, 80);

    try {
      let url, bodyData;
      if (target.startsWith('agency:')) {
        const slug = target.slice(7);
        url = '/api/agency/chat';
        bodyData = { agent: slug, message: msg };
      } else if (target.startsWith('agent:')) {
        const agentName = target.slice(6);
        url = `/api/agents/${agentName}/chat`;
        bodyData = { message: msg };
      } else if (target === 'builderbot') {
        runBuilderBotCreate(msg.split(' ')[0] || 'mybot', 'baileys');
        return;
      } else if (target === 'agency') {
        runAgencyCmd(msg);
        return;
      } else if (target.startsWith('codebuff_')) {
        const agentType = target.slice(9);
        url = '/api/codebuff/chat';
        bodyData = { message: msg, agent_type: agentType };
      } else if (target === 'opencode') {
        runOpenCode(msg);
        return;
      } else if (target === 'skills') {
        runSkillsCmd(msg);
        return;
      } else {
        url = `/api/chat/${target}`;
        bodyData = { message: msg, session_id: chatSessionId };
      }
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(bodyData) });
      const data = await res.json();
      if (data.session_id) chatSessionId = data.session_id;
      finishThinking(data.reply || '(sin respuesta)', target);
    } catch(e) {
      finishThinking('Error: ' + e.message, chatAgent);
    }
  }

  function finishThinking(text, agent) {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    const elapsed = ((Date.now() - thinkingStart) / 1000).toFixed(1);
    if (thinkingIndex >= 0 && thinkingIndex < chatMessages.length) {
      chatMessages[thinkingIndex] = {
        role: 'agent',
        text,
        agent,
        time: new Date().toLocaleTimeString() + ` +${elapsed}s`,
        pending: false
      };
      chatMessages = chatMessages;
    }
    progress = 0;
    thinkingIndex = -1;
    chatStatus = '';
  }

  function handleScrapingFlowInput(msg) {
    addChatBubble('user', msg, 'chatgeneral');
    
    if (scrapingFlowStep === 1) {
      scrapingFlowData.query = msg;
      scrapingFlowStep = 2;
      addChatBubble('agent', `Entendido: **${msg}**.\n\nSiguiente pregunta:\n**¿En qué ciudad o ubicación deseas buscar?** (Ej. *Santiago*, *Valparaíso*)`, 'chatgeneral');
    } else if (scrapingFlowStep === 2) {
      scrapingFlowData.location = msg;
      scrapingFlowStep = 3;
      addChatBubble('agent', `Ubicación: **${msg}**.\n\nÚltima pregunta:\n**¿Bajo qué categoría los clasifico en el CRM?** (Ej. *clinicas_dentales*, *gimnasios*, *otros*)`, 'chatgeneral');
    } else if (scrapingFlowStep === 3) {
      scrapingFlowData.category = msg;
      scrapingFlowActive = false;
      scrapingFlowStep = 0;
      chatStatus = 'Iniciando Scraper...';
      
      const fullQuery = `${scrapingFlowData.query} en ${scrapingFlowData.location}`;
      
      addChatBubble('agent', `🚀 ¡Todo listo! Iniciando extracción para:\n* Búsqueda: **${fullQuery}**\n* Categoría CRM: **${scrapingFlowData.category}**\n\nLos leads aparecerán en tu CRM en unos minutos.`, 'chatgeneral');
      
      fetch('/api/scrape/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: fullQuery, category: scrapingFlowData.category })
      }).then(res => res.json()).then(data => {
        if (data.success) {
          addChatBubble('agent', `✓ Extracción completada. Se guardaron **${data.saved || 0}** leads.`, 'chatgeneral');
        } else {
          addChatBubble('agent', `❌ Error en extracción: ${data.error}`, 'chatgeneral');
        }
        chatStatus = '';
      }).catch(err => {
        addChatBubble('agent', `❌ Error de red: ${err.message}`, 'chatgeneral');
        chatStatus = 'Error';
      });
    }
  }

  async function runOpenCode(task) {
    try {
      const res = await fetch('/api/opencode/exec', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ task }) });
      const data = await res.json();
      addChatBubble('agent', data.success ? `🖥️ **OpenCode**\n${data.message}` : `❌ ${data.error}`, 'opencode');
    } catch(e) {
      addChatBubble('agent', `❌ Error: ${e.message}`, 'opencode');
    }
  }

  async function runShellExec(cmd) {
    addChatBubble('user', `> ${cmd}`, chatAgent);
    try {
      const res = await fetch('/api/shell/exec', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ command: cmd, timeout: 30000 }) });
      const data = await res.json();
      const output = data.stdout || data.stderr || '(sin salida)';
      addChatBubble('agent', `\`\`\`\n${output.slice(0, 2000)}\n\`\`\``, 'sistema');
    } catch(e) {
      addChatBubble('agent', `❌ ${e.message}`, 'sistema');
    }
  }

  async function runAgencyCmd(input) {
    const parts = input.split(' ');
    const slug = parts[0];
    const msg = parts.slice(1).join(' ');

    if (!msg) {
      try {
        const res = await fetch(`/api/agency/agents?division=${slug}`);
        const data = await res.json();
        if (data.agents && data.agents.length > 0) {
          let list = `🏢 **${slug}** — ${data.agents.length} agentes:\n\n`;
          for (const a of data.agents) {
            list += `• **${a.name}** — \`/agency ${a.slug} <mensaje>\`\n`;
          }
          addChatBubble('agent', list, 'agency');
        } else {
          const divRes = await fetch('/api/agency/divisions');
          const divData = await divRes.json();
          const divisions = divData.divisions || {};
          const divInfo = divisions[slug];
          if (divInfo) {
            addChatBubble('agent', `🏢 **${divInfo.label}** — sin agentes cargados`, 'agency');
          } else {
            addChatBubble('agent', `❌ División '${slug}' no encontrada. Usá /agency para listar.`, 'agency');
          }
        }
      } catch (e) { addChatBubble('agent', `❌ Error: ${e.message}`, 'agency'); }
      return;
    }

    addChatBubble('user', `🏢 [${slug}] ${msg}`, chatAgent);
    thinkingStart = Date.now();
    progress = 0;
    elapsedSecs = 0;
    thinkingIndex = chatMessages.length;
    chatMessages = [...chatMessages, { role: 'agent', text: '', agent: `agency:${slug}`, time: '', pending: true }];
    chatStatus = 'Agency';
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      elapsedSecs = (Date.now() - thinkingStart) / 1000;
      progress = Math.min(92, (elapsedSecs / 25) * 92);
      chatMessages = chatMessages;
    }, 80);
    try {
      const res = await fetch('/api/agency/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: slug, message: msg })
      });
      const data = await res.json();
      finishThinking(data.reply || '(sin respuesta)', `agency:${slug}`);
    } catch (e) { finishThinking('Error: ' + e.message, `agency:${slug}`); }
  }

  async function runBuilderBotList() {
    try {
      const res = await fetch('/api/builderbot/bots');
      const data = await res.json();
      if (data.bots && data.bots.length > 0) {
        let list = '🤖 **BuilderBot** — bots creados:\n\n';
        for (const b of data.bots) {
          list += `• **${b.name}** (v${b.version})\n`;
        }
        addChatBubble('agent', list, 'builderbot');
      } else {
        addChatBubble('agent', '🤖 **BuilderBot** — No hay bots aún. Creá uno con: `/builderbot create <nombre>`', 'builderbot');
      }
    } catch (e) { addChatBubble('agent', `❌ Error: ${e.message}`, 'builderbot'); }
  }

  async function runBuilderBotCreate(name, provider) {
    addChatBubble('user', `🤖 Crear bot: ${name} (${provider})`, chatAgent);
    thinkingStart = Date.now();
    progress = 0;
    elapsedSecs = 0;
    thinkingIndex = chatMessages.length;
    chatMessages = [...chatMessages, { role: 'agent', text: '', agent: 'builderbot', time: '', pending: true }];
    chatStatus = 'BuilderBot';
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      elapsedSecs = (Date.now() - thinkingStart) / 1000;
      progress = Math.min(92, (elapsedSecs / 25) * 92);
      chatMessages = chatMessages;
    }, 80);
    try {
      const res = await fetch('/api/builderbot/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, provider })
      });
      const data = await res.json();
      if (data.success) {
        finishThinking(`✅ Bot **${name}** creado exitosamente.\nPath: \`${data.path}\`\n\nPara iniciarlo: disponible desde el panel de BuilderBot.`, 'builderbot');
      } else {
        finishThinking(`❌ Error: ${data.error}`, 'builderbot');
      }
    } catch (e) { finishThinking('Error: ' + e.message, 'builderbot'); }
  }

  async function runSkillsCmd(msg) {
    addChatBubble('user', msg, chatAgent);
    thinkingStart = Date.now();
    progress = 0;
    elapsedSecs = 0;
    thinkingIndex = chatMessages.length;
    chatMessages = [...chatMessages, { role: 'agent', text: '', agent: 'skills', time: '', pending: true }];
    chatStatus = 'Skills';
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      elapsedSecs = (Date.now() - thinkingStart) / 1000;
      progress = Math.min(92, (elapsedSecs / 25) * 92);
      chatMessages = chatMessages;
    }, 80);
    try {
      const res = await fetch('/api/skills/exec', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message: msg, timeout: 60000 }) });
      const data = await res.json();
      const output = data.output || data.stdout || data.stderr || '(sin salida)';
      finishThinking(output, 'skills');
    } catch(e) {
      finishThinking('Error: ' + e.message, 'skills');
    }
  }

  async function handleSlash(cmd) {
    const p = cmd.split(' ');
    switch(p[0]) {
      case '/ayuda': addChatBubble('agent', SLASH_COMMANDS.map(c => `${c.cmd} — ${c.desc}`).join('\n'), 'chatgeneral'); break;
      case '/rotar': triggerRotation().then(r => addChatBubble('agent', `🔄 ${r}`, 'chatgeneral')); break;
      case '/limpiar': chatMessages = []; chatSessionId = null; addChatBubble('agent', '🧹 Limpiado', 'chatgeneral'); break;
      case '/agente': if (p[1] && AGENTS.find(a => a.id === p[1])) { prevChatAgent = chatAgent; chatAgent = p[1]; chatSessionId = null; switchChatHistory(prevChatAgent); } break;
      case '/enrutador': chatRouting = !chatRouting; addChatBubble('agent', `Enrutador ${chatRouting ? '✅ ON' : '❌ OFF'}`, 'chatgeneral'); break;
      case '/status': addChatBubble('agent', `Provider: ${systemStatus.current_provider}\nRotaciones: ${systemStatus.rotation_count}`, 'chatgeneral'); break;
      case '/opencode': runOpenCode(p.slice(1).join(' ') || '(sin tarea)'); break;
      case '/exec': runShellExec(p.slice(1).join(' ')); break;
      case '/skills': runSkillsCmd(p.slice(1).join(' ') || 'add google/skills'); break;
      case '/agency': {
        if (p[1] && p[1] !== 'list') {
          runAgencyCmd(p.slice(1).join(' '));
        } else {
          let msg = '🏢 **Agency Agents** — divisiones disponibles:\n\n';
          try {
            const divRes = await fetch('/api/agency/divisions');
            const divData = await divRes.json();
            const divisions = divData.divisions || {};
            for (const [key, div] of Object.entries(divisions)) {
              msg += `**${div.label}** — \`/agency ${key}\` para listar agentes\n`;
            }
          } catch (e) { msg += `Error: ${e.message}`; }
          addChatBubble('agent', msg, 'agency');
        }
        break;
      }
      case '/builderbot': {
        if (p[1] === 'create' && p[2]) {
          runBuilderBotCreate(p[2], p[3] || 'baileys');
        } else {
          runBuilderBotList();
        }
        break;
      }
      default: addChatBubble('agent', `? ${p[0]} no encontrado. /ayuda`, 'chatgeneral');
    }
    chatStatus = '';
  }

  function onChatKeydown(e) {
    if (slashOpen && filteredSlash.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); slashSelected = Math.min(slashSelected + 1, filteredSlash.length - 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); slashSelected = Math.max(slashSelected - 1, 0); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = filteredSlash[slashSelected];
        chatInput = chosen.cmd + ' ';
        slashOpen = false;
        slashFilter = '';
        return;
      }
      if (e.key === 'Escape') { slashOpen = false; slashFilter = ''; return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); return; }
    if (e.key === 'Escape') { slashOpen = false; slashFilter = ''; }
  }

  function onChatInput(e) {
    const val = e.target.value;
    const slashIdx = val.lastIndexOf('/');
    if (slashIdx >= 0 && (slashIdx === 0 || val[slashIdx - 1] === ' ') && !val.endsWith(' ')) {
      slashOpen = true;
      slashFilter = val.slice(slashIdx + 1);
      slashSelected = 0;
    } else {
      slashOpen = false;
    }
  }

  function onChatScroll() {
    const el = chatScrollContainer;
    if (!el) return;
    userScrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 60;
  }

  $: if (chatMessages && chatScrollContainer && !userScrolledUp) {
    setTimeout(() => { if (chatScrollContainer) chatScrollContainer.scrollTop = chatScrollContainer.scrollHeight; }, 50);
  }
</script>

<div class="chat-shell">
  <div class="chat-top">
    <select value={chatAgent} class="agent-sel" on:change={(e) => { prevChatAgent = chatAgent; chatAgent = e.target.value; chatSessionId = null; switchChatHistory(prevChatAgent); }}>
      {#each AGENTS as a}<option value={a.id}>{a.label}</option>{/each}
    </select>
    <button class="pill-btn" class:on={chatRouting} on:click={() => { chatRouting = !chatRouting; addChatBubble('agent', `Enrutador ${chatRouting ? '✅ ON' : '❌ OFF'}`, 'chatgeneral'); }}>{chatRouting ? '⚡ Enrutador ON' : '🌀 Enrutador OFF'}</button>
    <span class="chat-status">{chatStatus || '● ' + AGENTS.find(a => a.id === chatAgent)?.label}</span>
  </div>
  <div class="chat-msgs" bind:this={chatScrollContainer} on:scroll={onChatScroll}>
    {#each chatMessages as msg, i}
      <div class="bubble" class:me={msg.role === 'user'} class:them={msg.role === 'agent'}>
        {#if msg.pending}
          <div class="thinking-content">
            <div class="thinking-dots">
              <span></span><span></span><span></span>
              <span class="thinking-label">Pensando</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: {i === thinkingIndex ? progress : 0}%"></div>
            </div>
            <div class="bubble-meta">
              {#if msg.agent}
                {#if msg.agent.startsWith('agent:')}
                  <span class="tag" style="background: rgba({parseInt(getAgentColor(msg.agent).slice(1,3),16)},{parseInt(getAgentColor(msg.agent).slice(3,5),16)},{parseInt(getAgentColor(msg.agent).slice(5,7),16)},0.15); color: {getAgentColor(msg.agent)}">{msg.agent.slice(6)}</span>
                {:else}
                  <span class="tag tag-{msg.agent}">{msg.agent}</span>
                {/if}
              {/if}
              {#if thinkingStart > 0}
                <span class="elapsed">{elapsedSecs.toFixed(1)}s</span>
              {/if}
            </div>
          </div>
        {:else}
          <div class="bubble-text">{@html renderMarkdown(msg.text)}</div>
          <div class="bubble-meta">
            {#if msg.agent}
              {#if msg.agent.startsWith('agent:')}
                <span class="tag" style="background: rgba({parseInt(getAgentColor(msg.agent).slice(1,3),16)},{parseInt(getAgentColor(msg.agent).slice(3,5),16)},{parseInt(getAgentColor(msg.agent).slice(5,7),16)},0.15); color: {getAgentColor(msg.agent)}">{msg.agent.slice(6)}</span>
              {:else}
                <span class="tag tag-{msg.agent}">{msg.agent}</span>
              {/if}
            {/if}
            {msg.time}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="chat-input">
    {#if slashOpen && filteredSlash.length > 0}
      <div class="slash-dropup">
        {#each filteredSlash as cmd, i}
          <button class="slash-item" class:selected={i === slashSelected} on:mousedown={() => { chatInput = cmd.cmd + ' '; slashOpen = false; }}>{cmd.cmd} <span class="slash-desc">{cmd.desc}</span></button>
        {/each}
      </div>
    {/if}
    <textarea bind:value={chatInput} on:keydown={onChatKeydown} on:input={onChatInput} placeholder="Mensaje... / para comandos" rows="1"></textarea>
    <button class="btn-primary" on:click={sendChat}>Enviar</button>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sidebar-tab" bind:this={sidebarTabEl} on:mouseenter={onSidebarEnter} on:mouseleave={onSidebarLeave}>
    <span class="tab-label">◈</span>
  </div>
</div>

{#if sidebarHover}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sidebar-panel" style="top: {sidebarPos.top}px; right: {window.innerWidth - sidebarPos.right < 500 ? 'auto' : sidebarPos.right + 24 + 'px'}; left: {window.innerWidth - sidebarPos.right < 500 ? sidebarPos.right + 24 + 'px' : 'auto'};" on:mouseenter={onSidebarEnter} on:mouseleave={onSidebarLeave}>
    <div class="sidebar-section">
      <button class="sidebar-header" on:click={() => sidebarSection = sidebarSection === 'comandos' ? null : 'comandos'}>
        Comandos <span class="section-arrow">{sidebarSection === 'comandos' ? '▾' : '▸'}</span>
      </button>
      {#if sidebarSection === 'comandos'}
        <div class="sidebar-body">
          {#each SLASH_COMMANDS as cmd}
            <button class="sidebar-item" on:click={() => { chatInput = cmd.cmd + ' '; sidebarHover = false; }}>
              <span class="cmd">{cmd.cmd}</span>
              <span class="desc">{cmd.desc}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="sidebar-section">
      <button class="sidebar-header" on:click={() => sidebarSection = sidebarSection === 'agentes' ? null : 'agentes'}>
        Agentes ({AGENTS.length}) <span class="section-arrow">{sidebarSection === 'agentes' ? '▾' : '▸'}</span>
      </button>
      {#if sidebarSection === 'agentes'}
        <div class="sidebar-body">
          {#each AGENTS as a}
            <button class="sidebar-item" on:click={() => { prevChatAgent = chatAgent; chatAgent = a.id; chatSessionId = null; switchChatHistory(prevChatAgent); sidebarHover = false; }}>
              {a.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .chat-top { display: flex; align-items: center; gap: 10px; padding: 8px 0; margin-bottom: 8px; flex-wrap: wrap; flex-shrink: 0; backdrop-filter: blur(12px); background: rgba(14, 16, 21, 0.65); border-bottom: 1px solid var(--border-color); }
  .agent-sel { padding: 6px 10px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; }
  .pill-btn { padding: 4px 14px; border-radius: 20px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 12px; }
  .pill-btn.on { background: var(--accent-glow); border-color: var(--accent); color: var(--accent); }
  .chat-status { font-size: 12px; color: var(--text-muted); margin-left: auto; }
  
  .chat-msgs { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 0 0 12px; }
  .bubble { max-width: 75%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
  .bubble.me { align-self: flex-end; background: var(--accent-glow); border: 1px solid var(--accent-border); border-bottom-right-radius: 6px; }
  .bubble.them { align-self: flex-start; background: var(--bg-card); border: 1px solid var(--border-color); border-bottom-left-radius: 6px; }
  .bubble-text { color: var(--text-primary); }
  .bubble-meta { font-size: 10px; color: var(--text-muted); margin-top: 4px; display: flex; gap: 6px; align-items: center; }
  .tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
  .tag-hermes { background: rgba(45,212,191,0.15); color: #2dd4bf; }
  .tag-openclaw { background: rgba(251,191,36,0.15); color: #fbbf24; }
  .tag-opencode { background: rgba(74,222,128,0.15); color: #4ade80; }
  .tag-agy { background: rgba(251,113,133,0.15); color: #fb7185; }
  .tag-gemini { background: rgba(45,212,191,0.15); color: #2dd4bf; }
  .tag-axischat { background: rgba(34,211,238,0.15); color: #22d3ee; }
  .tag-freebuff { background: rgba(168,85,247,0.15); color: #a855f7; }
  .tag-chatgeneral { background: rgba(251,191,36,0.15); color: #fbbf24; }
  .tag-sistema { background: rgba(148,163,184,0.15); color: #94a3b8; }
  .tag-mimo { background: rgba(129,140,248,0.15); color: #818cf8; }
  .tag-codebuff_general { background: rgba(34,211,238,0.15); color: #22d3ee; }
  .tag-codebuff_editor { background: rgba(74,222,128,0.15); color: #4ade80; }
  .tag-codebuff_researcher { background: rgba(96,165,250,0.15); color: #60a5fa; }
  .tag-codebuff_librarian { background: rgba(251,191,36,0.15); color: #fbbf24; }
  .tag-codebuff_thinker { background: rgba(167,139,250,0.15); color: #a78bfa; }
  .tag-codebuff_basher { background: rgba(251,113,133,0.15); color: #fb7185; }
  .tag-agent { background: rgba(160,174,192,0.15); color: #a0aec0; }
  .tag-agency { background: rgba(16,185,129,0.15); color: #10b981; }
  .tag-builderbot { background: rgba(245,158,11,0.15); color: #f59e0b; }
  
  .thinking-content { display: flex; flex-direction: column; gap: 8px; min-width: 200px; }
  .thinking-dots { display: flex; align-items: center; gap: 4px; }
  .thinking-dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: bounce 1.2s infinite; }
  .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
  .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
  .thinking-label { font-size: 12px; color: var(--accent); margin-left: 6px; animation: pulse-text 1.5s ease-in-out infinite; }
  @keyframes pulse-text { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  .progress-track { width: 100%; height: 4px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--color-warning)); border-radius: 4px; transition: width 0.3s ease; }
  .elapsed { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  @keyframes bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }

  .chat-shell { display: flex; flex-direction: column; height: 100%; }

  .chat-input { display: flex; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border-color); flex-shrink: 0; position: relative; }
  .chat-input textarea { flex: 1; padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); resize: none; max-height: 100px; outline: none; }
  .chat-input textarea:focus { border-color: var(--accent); }

  .slash-dropup { position: absolute; bottom: calc(100% + 4px); left: 0; right: 80px; background: rgba(14, 16, 21, 0.95); backdrop-filter: blur(12px); border: 1px solid var(--border-color); border-radius: 8px; padding: 4px; box-shadow: 0 -4px 20px rgba(0,0,0,0.4); z-index: 10; }
  .slash-item { display: flex; gap: 8px; align-items: center; width: 100%; padding: 6px 10px; background: none; border: none; border-radius: 4px; color: var(--text-primary); font-size: 12px; font-family: var(--font-sans); text-align: left; cursor: pointer; }
  .slash-item.selected { background: rgba(74, 222, 128, 0.12); }
  .slash-item:hover { background: rgba(255,255,255,0.06); }
  .slash-desc { color: var(--text-muted); font-size: 11px; }

  .sidebar-tab { position: relative; flex-shrink: 0; width: 20px; display: flex; align-items: center; justify-content: center; cursor: default; border-left: 1px solid var(--border-color); margin-left: 12px; transition: background var(--transition-fast); }
  .sidebar-tab:hover { background: rgba(255,255,255,0.04); }
  .tab-label { font-size: 10px; color: var(--text-muted); writing-mode: vertical-rl; letter-spacing: 0.1em; user-select: none; pointer-events: none; }

  .sidebar-panel { position: fixed; min-width: 220px; max-height: 80vh; overflow-y: auto; background: rgba(14, 16, 21, 0.95); backdrop-filter: blur(16px); border: 1px solid var(--border-color); border-radius: 10px; padding: 6px; box-shadow: 4px 0 24px rgba(0,0,0,0.5); z-index: 1000; }
  .sidebar-section + .sidebar-section { margin-top: 2px; border-top: 1px solid var(--border-color); padding-top: 2px; }
  .sidebar-header { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 8px 10px; background: none; border: none; border-radius: 6px; color: var(--text-secondary); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-family: var(--font-sans); cursor: pointer; }
  .sidebar-header:hover { color: var(--text-primary); background: rgba(255,255,255,0.04); }
  .section-arrow { font-size: 8px; opacity: 0.5; }
  .sidebar-body { display: flex; flex-direction: column; gap: 1px; padding: 2px 4px 6px; }
  .sidebar-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; background: none; border: none; border-radius: 4px; color: var(--text-primary); font-size: 12px; font-family: var(--font-sans); text-align: left; cursor: pointer; }
  .sidebar-item:hover { background: rgba(255,255,255,0.06); color: var(--accent-light); }
  .sidebar-item .cmd { font-weight: 600; color: var(--accent); }
  .sidebar-item .desc { color: var(--text-muted); font-size: 11px; }
</style>