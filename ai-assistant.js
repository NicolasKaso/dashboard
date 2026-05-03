/**
 * ai-assistant.js
 * Gemini-powered AI assistant for calendar management.
 * Supports: create/delete events, bulk schedule import, CSV & image parsing.
 * Depends on: config.js, state.js, google-api.js, calendar.js
 */

// ============================================================
// CONSTANTS — paste your Gemini API key below
// ============================================================

const AI_GEMINI_KEY = 'AIzaSyAKxBWqYt3OH3T3bRCTVC475ipMFL9EcXg';
const AI_MODEL      = 'gemini-2.0-flash';
const AI_SYSTEM     = `You are a calendar assistant for a student dashboard. Today is ${new Date().toDateString()}.
You can manage the user's Google Calendar using the provided tools.
When the user provides a schedule (CSV text or image), parse ALL events and bulk-create them.
For recurring weekly classes, create one event per week for each occurrence until the end of semester (assume ~16 weeks from today if not specified).
Be concise and confirm what you did. When listing events, be brief. Always call tools when the user asks you to do something — don't just describe what you'd do.
Format dates as YYYY-MM-DD and times as HH:MM (24h) when calling tools.`;

// Gemini function declarations (equivalent to Anthropic tools)
const AI_TOOLS = [{
  functionDeclarations: [
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
  ]
}];

// ============================================================
// TOOL EXECUTORS
// ============================================================

async function aiExecTool(name, input) {
  const token = AppState.get().accessToken;
  if (!token) return { error: 'Not connected to Google Calendar. Please connect first.' };

  if (name === 'create_event') {
    return await aiCreateEvent(input, token);
  }
  if (name === 'bulk_create_events') {
    return await aiBulkCreate(input.events, token);
  }
  if (name === 'list_events') {
    return await aiListEvents(input, token);
  }
  if (name === 'delete_events_by_query') {
    return await aiDeleteByQuery(input, token);
  }
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
  // batch in groups of 10 to avoid rate limits
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
  const items = (data.items || []).map(e => ({
    id:      e.id,
    summary: e.summary,
    start:   e.start.dateTime || e.start.date
  }));
  return { count: items.length, events: items };
}

async function aiDeleteByQuery(input, token) {
  const listed = await aiListEvents(input, token);
  if (listed.error) return listed;
  if (!listed.events.length) return { deleted: 0, message: 'No matching events found.' };

  const query  = input.query.toLowerCase();
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
  _messages:   [],    // Gemini contents history [{role, parts}]
  _attachment: null,  // { type: 'image'|'csv', name, data (base64 or text), mediaType }
  _busy:       false,

  // --------------------------------------------------------
  // Panel open/close
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // File attachment
  // --------------------------------------------------------

  openFilePicker() {
    const input = document.getElementById('ai-file-input');
    if (input) input.click();
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
      // Treat as text (CSV, txt, etc.)
      const text = await file.text();
      this._attachment = { type: 'csv', name: file.name, data: text };
    }

    if (name) name.textContent = '📎 ' + file.name;
    if (bar)  bar.classList.add('visible');
  },

  clearAttachment() {
    this._attachment = null;
    const bar  = document.getElementById('ai-attachment-bar');
    const inp  = document.getElementById('ai-file-input');
    if (bar) bar.classList.remove('visible');
    if (inp) inp.value = '';
  },

  // --------------------------------------------------------
  // Send message
  // --------------------------------------------------------

  async send(overrideText) {
    if (this._busy) return;
    const textarea = document.getElementById('ai-input');
    const text     = (overrideText || textarea?.value || '').trim();
    if (!text && !this._attachment) return;

    this._busy = true;
    this._setSendDisabled(true);

    // Build user message parts for Gemini
    let parts = [];

    if (this._attachment?.type === 'image') {
      parts.push({ inlineData: { mimeType: this._attachment.mediaType, data: this._attachment.data } });
      parts.push({ text: text || 'Please parse this schedule image and add all classes to my calendar.' });
      this._addBubble('user', (text || 'Parse this schedule image') + '\n[Image: ' + this._attachment.name + ']');
    } else if (this._attachment?.type === 'csv') {
      parts.push({ text: (text ? text + '\n\n' : 'Import this schedule:\n\n') + this._attachment.data });
      this._addBubble('user', (text ? text + '\n' : '') + '[File: ' + this._attachment.name + ']');
    } else {
      parts.push({ text });
      this._addBubble('user', text);
    }

    this.clearAttachment();
    if (textarea) textarea.value = '';

    this._messages.push({ role: 'user', parts });

    // Remove suggestions on first message
    document.getElementById('ai-suggestions')?.remove();

    // Show typing indicator
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

  // --------------------------------------------------------
  // Agentic loop — handles multi-step tool use (Gemini)
  // --------------------------------------------------------

  async _runAgentLoop(typingEl) {
    let iterations = 0;
    const MAX_ITER = 8;

    while (iterations++ < MAX_ITER) {
      const response = await this._callGemini();
      typingEl?.remove();
      typingEl = null;

      const candidate = response.candidates?.[0];
      const parts     = candidate?.content?.parts || [];

      // Push assistant turn into history
      this._messages.push({ role: 'model', parts });

      // Collect text
      const textParts = parts.filter(p => p.text);
      if (textParts.length) {
        const txt = textParts.map(p => p.text).join('\n').trim();
        if (txt) this._addBubble('assistant', txt);
      }

      // Check for function calls
      const fnCalls = parts.filter(p => p.functionCall);
      if (!fnCalls.length) break;

      // Execute each function call
      const fnResults = [];
      for (const part of fnCalls) {
        const { name, args } = part.functionCall;
        const toolEl = this._addToolCall(name);
        let result;
        try {
          result = await aiExecTool(name, args);
          if (['create_event', 'bulk_create_events', 'delete_events_by_query'].includes(name)) {
            if (GoogleAPI.isTokenValid()) Calendar.fetchEvents();
          }
        } catch (err) {
          result = { error: err.message };
        }
        toolEl?.remove();
        fnResults.push({ functionResponse: { name, response: result } });
      }

      // Feed results back as a user turn
      this._messages.push({ role: 'user', parts: fnResults });
      typingEl = this._addTyping();
    }

    typingEl?.remove();
  },

  // --------------------------------------------------------
  // Gemini API call
  // --------------------------------------------------------

  async _callGemini() {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      AI_MODEL + ':generateContent?key=' + AI_GEMINI_KEY;

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        system_instruction: { parts: [{ text: AI_SYSTEM }] },
        tools:    AI_TOOLS,
        contents: this._messages
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data;
  },

  // --------------------------------------------------------
  // UI helpers
  // --------------------------------------------------------

  _addBubble(cls, text) {
    const msgs = document.getElementById('ai-messages');
    if (!msgs) return;
    const el = document.createElement('div');
    el.className = 'ai-bubble ' + cls;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  },

  _addToolCall(toolName) {
    const msgs = document.getElementById('ai-messages');
    if (!msgs) return;
    const labels = {
      create_event:          '📅 Creating event…',
      bulk_create_events:    '📅 Bulk creating events…',
      list_events:           '🔍 Fetching events…',
      delete_events_by_query:'🗑 Deleting events…'
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

window.aiToggle        = () => AIAssistant.toggle();
window.aiClose         = () => AIAssistant.close();
window.aiSend          = () => AIAssistant.send();
window.aiSendSuggestion = (t) => AIAssistant.send(t);
window.aiOpenFilePicker = () => AIAssistant.openFilePicker();
window.aiClearAttachment = () => AIAssistant.clearAttachment();

window.aiHandleFileInput = (input) => {
  if (input.files && input.files[0]) AIAssistant.handleFile(input.files[0]);
};

window.aiKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); AIAssistant.send(); }
};
