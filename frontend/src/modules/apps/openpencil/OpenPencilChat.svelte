<script>
  let messages = [];
  let input = '';
  let status = '';

  async function send() {
    if (!input.trim()) return;
    messages.push({ role: 'user', text: input });
    const text = input;
    input = '';
    status = 'Pensando...';
    try {
      const res = await fetch('/api/mcp/openpencil/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      messages.push({ role: 'assistant', text: data.reply || data.text || '(sin respuesta)' });
      status = '';
    } catch (e) { status = 'Error: ' + e.message; }
  }
</script>

<div class="chat">
  <div class="msgs">
    {#if messages.length === 0}
      <p class="empty">Chat del lienzo — enviá instrucciones de dibujo.</p>
    {/if}
    {#each messages as msg}
      <div class="msg {msg.role}">
        <span class="bubble">{msg.text}</span>
      </div>
    {/each}
  </div>
  {#if status}<div class="status">{status}</div>{/if}
  <form on:submit|preventDefault={send} class="input-row">
    <input bind:value={input} placeholder="Escribí un comando de dibujo..." />
    <button type="submit" disabled={!input.trim()}>→</button>
  </form>
</div>

<style>
  .chat { display: flex; flex-direction: column; height: 100%; }
  .msgs { flex: 1; overflow-y: auto; padding: 12px 0; }
  .empty { text-align: center; color: var(--text-muted); padding: 24px; }
  .msg { margin-bottom: 8px; }
  .msg.user { text-align: right; }
  .bubble { display: inline-block; padding: 8px 12px; border-radius: 8px; max-width: 80%; font-size: 13px; line-height: 1.4; background: var(--bg-card); }
  .msg.user .bubble { background: var(--accent-glow); color: var(--accent); }
  .status { font-size: 11px; color: var(--text-muted); padding: 4px 0; }
  .input-row { display: flex; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); }
  .input-row input { flex: 1; padding: 8px 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; }
  .input-row input:focus { outline: none; border-color: var(--accent); }
  .input-row button { padding: 8px 16px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
  .input-row button:disabled { opacity: 0.4; }
</style>