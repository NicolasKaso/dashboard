/**
 * ai-assistant.js
 * Groq-powered AI assistant for calendar management.
 * Uses llama-3.3-70b via Groq API (OpenAI-compatible).
 * Depends on: config.js, state.js, google-api.js, calendar.js
 */

const AI_GROQ_KEY = 'xai-muw7iv3M9nyyiBAAi8Eq09tl80o22mjikZluwS23X8Ig6C97yk5aNWnMFPrwzg9FObCHjIVvwY0YihaO';
const AI_MODEL    = 'llama-3.3-70b-versatile';
const AI_SYSTEM   = `You are a calendar assistant for a student dashboard. Today is ${new Date().toDateString()}.
You can manage the user's Google Calendar using the provided tools.
When the user provides a schedule (CSV text or image), parse ALL events and bulk-create them.
For recurring weekly classes, create one event per week for each occurrence until end of semester (~16 weeks from today if not specified).
Be concise and confirm what you did. Format dates as YYYY-MM-DD and times as HH:MM (24h).`;

// OpenAI-compatible tool definitions for Groq
const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_event',
      description: 'Create a single Google Calendar event.',
      parameters: {
        type: 'object',
        properties: {
          summary:     { type: 'string',  description: 'Event title' },
          date:        { type: 'string',  description: 'YYYY-MM-DD' },
          start_time:  { type: 'string',  description: 'HH:MM (24h), omit for all-day' },
          end_time:    { type: 'string',  description: 'HH:MM (24h), omit for all-day' },
          location:    { type: 'string',  description: 'Optional location' },
          description: { type: 'string',  description: 'Optional description' },
          color_id:    { type: 'string',  description: '1-11 Google Calendar color ID (optional)' }
        },
        required: ['summary', 'date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bulk_create_events',
      description: 'Create multiple events at once. Use for schedule imports.',
      parameters: {
        type: 'object',
        properties: {
          events: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                summary:    { type: 'string' },
                date:       { type: 'string', description: 'YYYY-MM-DD' },
                start_time: { type: 'string', description: 'HH:MM (24h)' },
                end_time:   { type: 'string', description: 'HH:MM (24h)' },
                location:   { type: 'string' },
                color_id:   { type: 'string' }
              },
              required: ['summary', 'date']
            }
          }
        },
        required: ['events']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_events',
      description: 'List upcoming calendar events in a date range.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date:   { type: 'string', description: 'YYYY-MM-DD' },
          query:      { type: 'string', description: 'Optional text search filter' }
        },
        required: ['start_date', 'end_date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_events_by_query',
      description: 'Delete all events matching a search query in a date range.',
      parameters: {
        type: 'object',
        properties: {
          query:      { type: 'string', description: 'Title/keyword to match (case-insensitive)' },
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date:   { type: 'string', description: 'YYYY-MM-DD' }
        },
        required: ['query', 'start_date', 'end_date']
      }
    }
  }
];

// ============================================================
// TOOL EXECUTORS
// ============================================================

async function aiExecTool(name, input) {
  const token = AppState.get().accessToken;
  if (!token) return { error: 'Not connected to Google Calendar. Please connect first.' };
  if (name === 'create_event')          return await aiCreateEvent(input, token);
  if (name === 'bulk_create_events')    return await aiBulkCreate(input.events, token);
  if (name === 'list_events')           return await aiListEvents(input, token);
  if (name === 'delete_events_by_query')return await aiDeleteByQuery(input, token);
  return { error: 'Unknown tool: ' + name };
}

function aiEventBody(ev) {
  const body = {
    summary:     ev.summary,
    location:    ev.location    || '',
    description: ev.description || ''
  };
  if (ev.start_time) {
    body.start = { dateTime: ev.date + 'T' + ev.start_time + ':00' };
    body.end   = { dateTime: ev.date + 'T' + (ev.end_time || ev.start_time) + ':00' };
  } else {
    const endDate = new Date(ev.date + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 1);
    body.start = { date: ev.date };
    body.end   = { date: endDate.toISOString().split('T')[0] };
  }
  if (ev.color_id) body.colorId = String(ev.color_id);
  return body;
}

async function aiCreateEvent(ev, token) {
  const res  = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method:  'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body:    JSON.stringify(aiEventBody(ev))
  });
  const data = await res.json();
  if (data.error) return { error: data.error.message };
  return { success: true, id: data.id, summary: data.summary, start: data.start };
}

async function aiBulkCreate(events, token) {
  let created = 0, failed = 0;
  for (let i = 0; i < events.length; i += 10) {
    const chunk = events.slice(i, i + 10);
    await Promise.all(chunk.map(async ev => {
      const res  = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method:  'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body:    JSON.stringify(aiEventBody(ev))
      });
      const data = await res.json();
      data.error ? failed++ : created++;
    }));
    if (i + 10 < events.length) await new Promise(r => setTimeout(r, 200));
  }
  return { created, failed, total: events.length };
}

async function aiListEvents(input, token) {
  const start = new Date(input.start_date + 'T00:00:00').toISOString();
  const end   = new Date(input.end_date   + 'T23:59:59').toISOString();
  const q     = input.query ? '&q=' + encodeURIComponent(input.query) : '';
  const res   = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
    '?timeMin=' + start + '&timeMax=' + end +
    '&singleEvents=true&orderBy=startTime&maxResults=50' + q,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const data = await res.json();
  if (data.error) return { error: data.error.message };
  return {
    count: (data.items || []).length,
    events: (data.items || []).map(e => ({
      id: e.id, summary: e.summary, start: e.start.dateTime || e.start.date
    }))
  };
}

async function aiDeleteByQuery(input, token) {
  const listed = await aiListEvents(input, token);
  if (listed.error) return listed;
  if (!listed.events.length) return { deleted: 0, message: 'No matching events found.' };
  const query   = input.query.toLowerCase();
  const matches = listed.events.filter(e => e.summary?.toLowerCase().includes(query));
  if (!matches.length) return { deleted: 0, message: 'No events matched "' + input.query + '".' };
  let deleted = 0;
  for (const ev of matches) {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/' + ev.id,
      { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }
    );
    if (res.status === 204 || res.ok) deleted++;
  }
  return { deleted, total_found: matches.length };
}

// ============================================================
// AI MODULE
// ============================================================

const AIAssistant = {
  _open:       false,
  _messages:   [],   // OpenAI-format: [{role, content}]
  _attachment: null,
  _busy:       false,

  toggle() {
    this._open = !this._open;
    document.getElementById('ai-panel')?.classList.toggle('open', this._open);
    document.body.classList.toggle('ai-panel-open', this._open);
    document.getElementById('ai-toggle-btn')?.classList.toggle('active', this._open);
  },

  close() {
    this._open = false;
    document.getElementById('ai-panel')?.classList.remove('open');
    document.body.classList.remove('ai-panel-open');
    document.getElementById('ai-toggle-btn')?.classList.remove('active');
  },

  openFilePicker() {
    document.getElementById('ai-file-input')?.click();
  },

  async handleFile(file) {
    if (!file) return;
    const bar  = document.getElementById('ai-attachment-bar');
    const name = document.getElementById('ai-attachment-name');
    if (file.type.startsWith('image/')) {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('Read failed'));
        r.readAsDataURL(file);
      });
      this._attachment = { type: 'image', name: file.name, data: b64, mediaType: file.type };
    } else {
      const text = await file.text();
      this._attachment = { type: 'csv', name: file.name, data: text };
    }
    if (name) name.textContent = '📎 ' + file.name;
    if (bar)  bar.classList.add('visible');
  },

  clearAttachment() {
    this._attachment = null;
    document.getElementById('ai-attachment-bar')?.classList.remove('visible');
    const inp = document.getElementById('ai-file-input');
    if (inp) inp.value = '';
  },

  async send(overrideText) {
    if (this._busy) return;
    const textarea = document.getElementById('ai-input');
    const text     = (overrideText || textarea?.value || '').trim();
    if (!text && !this._attachment) return;

    this._busy = true;
    this._setSendDisabled(true);

    // Build user message content
    let content;
    if (this._attachment?.type === 'image') {
      // Groq supports vision on some models; send as text description fallback
      content = (text || 'Parse this schedule image and add all classes to my calendar.') +
        '\n[Image attached: ' + this._attachment.name + ' — please parse it as a schedule]';
      this._addBubble('user', (text || 'Parse schedule image') + '\n[Image: ' + this._attachment.name + ']');
    } else if (this._attachment?.type === 'csv') {
      content = (text ? text + '\n\n' : 'Import this schedule:\n\n') + this._attachment.data;
      this._addBubble('user', (text ? text + '\n' : '') + '[File: ' + this._attachment.name + ']');
    } else {
      content = text;
      this._addBubble('user', text);
    }

    this.clearAttachment();
    if (textarea) textarea.value = '';
    this._messages.push({ role: 'user', content });
    document.getElementById('ai-suggestions')?.remove();

    const typingEl = this._addTyping();
    try {
      await this._runAgentLoop(typingEl);
    } catch (err) {
      typingEl?.remove();
      this._addBubble('error', 'Error: ' + (err.message || 'Something went wrong.'));
      console.error(err);
    }

    this._busy = false;
    this._setSendDisabled(false);
    if (textarea) textarea.focus();
  },

  async _runAgentLoop(typingEl) {
    let iterations = 0;
    const MAX_ITER = 8;

    while (iterations++ < MAX_ITER) {
      const response = await this._callGroq();
      typingEl?.remove();
      typingEl = null;

      const msg       = response.choices?.[0]?.message;
      const toolCalls = msg?.tool_calls || [];
      const textContent = msg?.content || '';

      // Push assistant message to history
      this._messages.push({
        role:       'assistant',
        content:    textContent || null,
        tool_calls: toolCalls.length ? toolCalls : undefined
      });

      if (textContent) this._addBubble('assistant', textContent);
      if (!toolCalls.length) break;

      // Execute tools
      const toolResults = [];
      for (const tc of toolCalls) {
        const toolEl = this._addToolCall(tc.function.name);
        let result;
        try {
          const args = JSON.parse(tc.function.arguments);
          result = await aiExecTool(tc.function.name, args);
          if (['create_event','bulk_create_events','delete_events_by_query'].includes(tc.function.name)) {
            if (GoogleAPI.isTokenValid()) Calendar.fetchEvents();
          }
        } catch (err) {
          result = { error: err.message };
        }
        toolEl?.remove();
        toolResults.push({
          role:         'tool',
          tool_call_id: tc.id,
          content:      JSON.stringify(result)
        });
      }

      this._messages.push(...toolResults);
      typingEl = this._addTyping();
    }

    typingEl?.remove();
  },

  async _callGroq() {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + AI_GROQ_KEY,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        model:    AI_MODEL,
        messages: [{ role: 'system', content: AI_SYSTEM }, ...this._messages],
        tools:    AI_TOOLS,
        tool_choice: 'auto',
        max_tokens:  1024
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data;
  },

  _addBubble(cls, text) {
    const msgs = document.getElementById('ai-messages');
    if (!msgs) return;
    const el = document.createElement('div');
    el.className   = 'ai-bubble ' + cls;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  },

  _addToolCall(toolName) {
    const msgs = document.getElementById('ai-messages');
    if (!msgs) return;
    const labels = {
      create_event:           '📅 Creating event…',
      bulk_create_events:     '📅 Bulk creating events…',
      list_events:            '🔍 Fetching events…',
      delete_events_by_query: '🗑 Deleting events…'
    };
    const el = document.createElement('div');
    el.className = 'ai-tool-call';
    el.innerHTML = '<div class="ai-tool-spinner"></div><span>' + (labels[toolName] || toolName) + '</span>';
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  },

  _addTyping() {
    const msgs = document.getElementById('ai-messages');
    if (!msgs) return;
    const el = document.createElement('div');
    el.className = 'ai-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  },

  _setSendDisabled(val) {
    const btn = document.getElementById('ai-send-btn');
    if (btn) btn.disabled = val;
  }
};

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.aiToggle         = () => AIAssistant.toggle();
window.aiClose          = () => AIAssistant.close();
window.aiSend           = () => AIAssistant.send();
window.aiSendSuggestion = (t) => AIAssistant.send(t);
window.aiOpenFilePicker = () => AIAssistant.openFilePicker();
window.aiClearAttachment= () => AIAssistant.clearAttachment();

window.aiHandleFileInput = (input) => {
  if (input.files?.[0]) AIAssistant.handleFile(input.files[0]);
};

window.aiKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); AIAssistant.send(); }
};
