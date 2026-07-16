# AxisPanel Self-Modification Context

## Purpose
This file documents the **entire AxisPanel UI codebase** so that AI agents (Hermes, OpenCode, ChatGeneral) understand they can modify the chat interface and all UI components when asked. When a user says "modificate a vos mismo" or "cambia esa burbuja", the agent should use this file to locate the source code and suggest/produce edits.

**Crucial distinction**: The agent's own chat interface it renders responses in is NOT the agent's internal runtime — it is a **Svelte component** (`Chat.svelte`) whose source code the agent can read, understand, and modify. Same for all other AxisPanel tools (Dashboard, CRM, Scraper, Settings, etc.).

---

## Project Structure (C:\AxisPanel\)

```
C:\AxisPanel\
├── backend\
│   ├── server.js              # Express backend (routes, chat, shell, memory)
│   ├── modules\
│   │   ├── crm-db.js          # SQLite CRM database
│   │   └── crm-routes.js      # CRM API routes
│   ├── scrapers\
│   │   ├── gmaps.js           # Google Maps Places API scraper
│   │   └── gmaps_gosom.js     # Docker-based scraper
│   └── public\                # Built frontend (served statically)
├── frontend\
│   ├── src\
│   │   ├── App.svelte         # Root component - window manager, tool routing
│   │   ├── core\              # Core state & config
│   │   │   ├── config\tools-config.js
│   │   │   └── state\tools-store.js
│   │   ├── lib\               # Shared UI components
│   │   │   ├── Window.svelte          # Draggable/resizable window wrapper
│   │   │   ├── Dock.svelte            # Dock bar at bottom
│   │   │   ├── CommandPalette.svelte  # Command palette overlay
│   │   │   └── background\           # Animated background
│   │   └── modules\           # Tool modules (one per tool)
│   │       ├── axischat\Chat.svelte   # <-- THE CHAT COMPONENT
│   │       ├── dashboard\Dashboard.svelte
│   │       ├── scraping\Scraper.svelte
│   │       ├── crm\Kanban.svelte, Leads.svelte, CrmTable.svelte, CrmStats.svelte
│   │       ├── settings\Settings.svelte, AddKey.svelte, LogsView.svelte
│   │       └── apps\                 # Additional tools
│   │           ├── content\Content.svelte
│   │           ├── openpencil\OpenPencil.svelte, OpenPencilChat.svelte
│   │           ├── outreach\Outreach.svelte
│   │           ├── shells\Shells.svelte
│   │           └── storage\Storage.svelte
│   ├── vite.config.js
│   └── package.json
├── config\                    # Config templates
│   ├── api_keys_initial.json
│   └── api_rotation_state_initial.json
├── scripts\                   # Utility scripts
├── docs\README.md
├── axischatmemory.md          # <-- THIS FILE
└── package.json               # Root package.json (npm start → node backend/server.js)
```

---

## How UI Modules are Rendered

`App.svelte` (the root component) manages all tools:
- Tools are opened/closed via `ToolsStore.openTool(toolId)`
- Each open tool is rendered inside a `<Window>` wrapper component
- The mapping of `toolId` → component is in `App.svelte` lines ~279-318

| toolId | Component | File |
|--------|-----------|------|
| `dashboard` | `<Dashboard>` | `src/modules/dashboard/Dashboard.svelte` |
| `chat` | `<ChatView>` | `src/modules/axischat/Chat.svelte` |
| `scraping` | `<Scraper>` | `src/modules/scraping/Scraper.svelte` |
| `crmKanban` | `<Kanban>` | `src/modules/crm/Kanban.svelte` |
| `leads` | `<Leads>` | `src/modules/crm/Leads.svelte` |
| `crmTable` | `<CrmTable>` | `src/modules/crm/CrmTable.svelte` |
| `crmStats` | `<CrmStats>` | `src/modules/crm/CrmStats.svelte` |
| `settings` | `<Settings>` | `src/modules/settings/Settings.svelte` |
| `addkey` | `<AddKey>` | `src/modules/settings/AddKey.svelte` |
| `logs` | `<LogsView>` | `src/modules/settings/LogsView.svelte` |
| `shells` | `<Shells>` | `src/modules/apps/shells/Shells.svelte` |
| `storage` | `<Storage>` | `src/modules/apps/storage/Storage.svelte` |
| `openpencil` | `<OpenPencil>` | `src/modules/apps/openpencil/OpenPencil.svelte` |
| `openpencilChat` | `<OpenPencilChat>` | `src/modules/apps/openpencil/OpenPencilChat.svelte` |
| `content` | `<Content>` | `src/modules/apps/content/Content.svelte` |
| `outreach` | `<Outreach>` | `src/modules/apps/outreach/Outreach.svelte` |

### Library Components
| Component | File | Purpose |
|-----------|------|---------|
| `Window` | `src/lib/Window.svelte` | Draggable, resizable window frame (header, resize handles, fullscreen) |
| `Dock` | `src/lib/Dock.svelte` | Bottom dock with tool icons |
| `CommandPalette` | `src/lib/CommandPalette.svelte` | `Ctrl+P` command palette |
| `ParticlesCore` | `src/lib/background/ParticlesCore.svelte` | Animated particle background |
| `BorderHUD` | `src/lib/background/BorderHUD.svelte` | HUD overlay |

---

## AxisChat Component in Detail

**File**: `C:\AxisPanel\frontend\src\modules\axischat\Chat.svelte`

### State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `chatMessages` | `Array<{role, text, agent, time, pending?}>` | All messages in current session |
| `chatAgent` | `string` | Currently selected agent ID |
| `chatRouting` | `boolean` | Router toggle |
| `chatSessionId` | `string\|null` | Session ID for Hermes |
| `chatStatus` | `string` | Status text shown in toolbar |
| `thinkingIndex` | `number` | Index of pending message (-1 when none) |
| `thinkingStart` | `number` | Timestamp when thinking started |
| `progress` | `number` | Progress bar percentage (0-92) |
| `elapsedSecs` | `number` | Seconds elapsed while waiting |
| `progressTimer` | `interval\|null` | Timer for progress animation |

### Message Object Shape

```js
{
  role: 'user' | 'agent',
  text: 'string',        // Message content
  agent: 'string',       // Agent ID (chatgeneral, hermes, etc.)
  time: 'string',        // Locale time string, e.g. "12:34:56 AM +3.2s"
  pending: boolean       // true while waiting for response
}
```

### Bubble HTML Structure

**Completed message** (pending=false):
```html
<div class="bubble me|them">
  <div class="bubble-text">{msg.text}</div>
  <div class="bubble-meta">
    <span class="tag tag-{msg.agent}">{msg.agent}</span>
    {msg.time}
  </div>
</div>
```

**Pending/Thinking message** (pending=true):
```html
<div class="bubble me|them">
  <div class="thinking-content">
    <div class="thinking-dots">
      <span></span><span></span><span></span>
      <span class="thinking-label">Pensando</span>
    </div>
    <div class="progress-track">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>
    <div class="bubble-meta">
      <span class="tag tag-{msg.agent}">{msg.agent}</span>
      <span class="elapsed">{elapsedSecs.toFixed(1)}s</span>
    </div>
  </div>
</div>
```

**Shell command output message** (for `>` prefixed commands):
```html
<div class="bubble them">
  <div class="bubble-text">{output}</div>
  <div class="bubble-meta">
    <span class="tag tag-sistema">Sistema</span>
    {time}
  </div>
</div>
```

### CSS Classes

| Class | Target | Purpose |
|-------|--------|---------|
| `.bubble` | All messages | Base bubble style |
| `.bubble.me` | User messages | Right-aligned, accent background |
| `.bubble.them` | Agent/system messages | Left-aligned, card background |
| `.bubble-text` | Message content | Text inside bubble |
| `.bubble-meta` | Bottom metadata | Agent tag + timestamp |
| `.tag` | Agent tag | Base tag pill style |
| `.tag-hermes` | Hermes tag | Teal (#2dd4bf) |
| `.tag-openclaw` | OpenClaw tag | Amber (#fbbf24) |
| `.tag-opencode` | OpenCode tag | Green (#4ade80) |
| `.tag-agy` | Antigravity tag | Pink (#fb7185) |
| `.tag-gemini` | Gemini tag | Teal (#2dd4bf) |
| `.tag-chatgeneral` | ChatGeneral tag | Amber (#fbbf24) |
| `.tag-sistema` | Shell output tag | System tag color |
| `.thinking-content` | Pending animation container | Flex column |
| `.thinking-dots` | Animated dots row | Flex row |
| `.thinking-label` | "Pensando" label | Pulsing text |
| `.progress-track` | Progress bar background | Track |
| `.progress-fill` | Progress bar fill | Gradient fill |
| `.elapsed` | Elapsed seconds | Tabular numbers |

### Key Functions

| Function | Description |
|----------|-------------|
| `addChatBubble(role, text, agent)` | Appends a complete message to `chatMessages` |
| `sendChat()` | Reads input, handles `>` prefix, sends to API, manages pending state |
| `finishThinking(text, agent)` | Replaces pending bubble with response + elapsed time |
| `handleSlash(cmd)` | Processes slash commands (/ayuda, /rotar, /limpiar, /agente, etc.) |
| `triggerRotation()` | Calls POST /api/rotate to force API key rotation |

### Agent Definitions

```js
const AGENTS = [
  { id: 'chatgeneral', label: '🌿 ChatGeneral' },
  { id: 'hermes',       label: '◈ Hermes' },
  { id: 'openclaw',    label: '🦞 OpenClaw' },
  { id: 'opencode',    label: '◇ OpenCode' },
  { id: 'agy',         label: '△ Antigravity' },
  { id: 'gemini',      label: '◆ Gemini' },
];
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/ayuda` | Show all commands |
| `/rotar` | Force API key rotation |
| `/limpiar` | Clear conversation |
| `/agente <id>` | Switch agent |
| `/enrutador` | Toggle router |
| `/status` | System status |

### Shell Command Prefix (`>`)

When a message starts with `>`, instead of sending to an agent, the backend executes it as a PowerShell command via `POST /api/shell/exec`. The output appears as a bubble with agent="sistema" and tag "Sistema".

Example:
```
> ipconfig /all
> whoami
> Get-ChildItem C:\Users
```

---

## Backend API Endpoints

All endpoints defined in `C:\AxisPanel\backend\server.js`.

### Chat
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/chat/:agent` | Send message to agent (hermes, chatgeneral, gemini, etc.) |
| POST | `/api/hermes/chat` | Legacy Hermes endpoint |
| GET | `/api/hermes/skills` | List Hermes skills/tools |
| GET | `/api/hermes/status` | Hermes gateway health |

### Keys & Rotation
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/keys` | Read api_keys.json |
| POST | `/api/keys` | Add a new API key |
| DELETE | `/api/keys/:provider/:index` | Remove API key |
| POST | `/api/rotate` | Force key rotation |
| POST | `/api/update-keys` | Batch update keys |
| GET | `/api/status` | Current provider/key state |

### Shell (NEW)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/shell/exec` | Execute PowerShell command, returns { stdout, stderr, exitCode } |

### Memory (NEW)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/memory/axischat` | Returns the contents of this file (axischatmemory.md) |

### System
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | System status (provider, rotation count) |
| GET | `/api/logs/rotation` | Rotation logs |
| GET | `/api/logs/gateway` | Hermes gateway logs |
| GET | `/api/providers` | Provider catalog |
| GET | `/api/pending` | Pending tasks/alerts |
| POST | `/api/hermes/start` | Start Hermes agent process |
| POST | `/api/hermes/stop` | Stop Hermes agent process |
| POST | `/api/openclaw/start` | Start OpenClaw gateway |
| POST | `/api/openclaw/stop` | Stop OpenClaw gateway |
| POST | `/api/docker/up` | Start docker services |
| POST | `/api/docker/down` | Stop docker services |

### Scraping & CRM
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/leads` | List leads |
| POST | `/api/scrape/category` | Run category scrape |
| POST | `/api/scrape/run` | Run full scrape |
| GET | `/api/crm/*` | CRM operations (via crm-routes.js) |

### Proxy
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/chat/completions` | OpenAI-compatible proxy to active provider |
| GET | `/v1/models` | List models from active provider |

---

## System Prompt for Agents

When an agent (Hermes, OpenCode, etc.) processes a user request, the backend injects this instruction into the system prompt:

> "If asked to modify the AxisPanel UI or any part of the interface, first fetch `GET /api/memory/axischat` for full context on all UI components, file paths, CSS classes, and render logic. Understand that the chat interface you are responding in is a Svelte component at `frontend/src/modules/axischat/Chat.svelte` whose source code can be read and modified."

---

## How to Modify UI Files

When a user says "modifica esta burbuja" or "cambia el color de X" or "agrega un calendario":

1. **Locate the file**: Use the tables above to find the correct `.svelte` file
2. **Read the file**: Fetch the full source
3. **Understand the structure**: The component uses Svelte 5 syntax with `<script>`, template HTML, and `<style>` sections
4. **CSS scoping**: All styles are Svelte-scoped by default — no leaking
5. **CSS variables**: The app uses CSS custom properties (`--bg-card, --accent, --text-primary, etc.`) defined at the root level
6. **Modify and respond**: Return the exact code changes needed (or write them if a write API is available)
