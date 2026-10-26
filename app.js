/* VastAI - personal AI chat (static, runs fully in the browser) */
(() => {
  const API_BASE = "https://api.groq.com/openai/v1";
  const STORE = { chats: "vastai_chats", settings: "vastai_settings", theme: "vastai_theme" };
  const PREFERRED_MODELS = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"];
  const EXCLUDE_MODELS = /whisper|tts|guard|playai|orpheus|distil|prompt-guard|compound/i;
  const MAX_HISTORY = 24;
  const MAX_FILE_CHARS = 60000;
  const DEFAULT_SYSTEM =
    "You are VastAI, a helpful, knowledgeable and friendly AI assistant. " +
    "Give clear, accurate, well-structured answers. Use markdown when it helps (lists, tables, code blocks with language tags). " +
    "Be concise unless the user asks for detail. If you are not sure about something, say so.";

  const $ = (id) => document.getElementById(id);
  const el = {
    sidebar: $("sidebar"), backdrop: $("backdrop"), chatList: $("chatList"), search: $("searchChats"),
    messages: $("messages"), welcome: $("welcome"), input: $("input"), send: $("sendBtn"),
    model: $("modelSelect"), modal: $("settingsModal"), apiKey: $("apiKey"), sys: $("systemPrompt"),
    temp: $("temperature"), tempVal: $("tempVal"), toast: $("toast"), fileInput: $("fileInput"),
    attachments: $("attachments"),
  };

  /* ---------- Storage ---------- */
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast("Storage full. Delete some chats."); } };

  let chats = load(STORE.chats, []);
  let settings = Object.assign({ apiKey: "", model: "", systemPrompt: DEFAULT_SYSTEM, temperature: 0.7 }, load(STORE.settings, {}));
  let currentId = null;
  let controller = null;
  let pendingFiles = [];

  const persistChats = () => save(STORE.chats, chats);
  const persistSettings = () => save(STORE.settings, settings);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const current = () => chats.find((c) => c.id === currentId);

  /* ---------- Theme ---------- */
  const applyTheme = (t) => { document.documentElement.dataset.theme = t; save(STORE.theme, t); };
  applyTheme(load(STORE.theme, "dark"));
  $("toggleTheme").onclick = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg; el.toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  /* ---------- Markdown ---------- */
  marked.setOptions({ gfm: true, breaks: true });
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function renderMarkdown(text) {
    const html = DOMPurify.sanitize(marked.parse(text || ""));
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    wrap.querySelectorAll("pre > code").forEach((code) => {
      const lang = (code.className.match(/language-([\w+-]+)/) || [])[1] || "text";
      try { hljs.highlightElement(code); } catch {}
      const pre = code.parentElement;
      const block = document.createElement("div");
      block.className = "code-block";
      block.innerHTML = `<div class="code-head"><span>${escapeHtml(lang)}</span><button class="copy-code">Copy</button></div>`;
      pre.replaceWith(block);
      block.appendChild(pre);
    });
    wrap.querySelectorAll("a").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
    return wrap.innerHTML;
  }

  el.messages.addEventListener("click", (e) => {
    const btn = e.target.closest(".copy-code");
    if (!btn) return;
    const code = btn.closest(".code-block").querySelector("code").innerText;
    navigator.clipboard.writeText(code).then(() => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1500); });
  });

  /* ---------- Sidebar ---------- */
  function groupLabel(ts) {
    const d = new Date(ts), now = new Date();
    const day = 86400000, diff = (new Date(now.toDateString()) - new Date(d.toDateString())) / day;
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff <= 7) return "Previous 7 days";
    if (diff <= 30) return "Previous 30 days";
    return "Older";
  }

  function renderChatList() {
    const q = el.search.value.trim().toLowerCase();
    const list = chats
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)))
      .sort((a, b) => b.updated - a.updated);
    el.chatList.innerHTML = "";
    let lastGroup = "";
    list.forEach((c) => {
      const g = groupLabel(c.updated);
      if (g !== lastGroup) {
        const h = document.createElement("div"); h.className = "chat-group"; h.textContent = g;
        el.chatList.appendChild(h); lastGroup = g;
      }
      const item = document.createElement("button");
      item.className = "chat-item" + (c.id === currentId ? " active" : "");
      item.innerHTML = `<span class="title"></span><span class="actions"><span data-act="rename" title="Rename">✎</span><span data-act="delete" title="Delete">🗑</span></span>`;
      item.querySelector(".title").textContent = c.title;
      item.onclick = (e) => {
        const act = e.target.dataset.act;
        if (act === "rename") {
          const t = prompt("Rename chat", c.title);
          if (t && t.trim()) { c.title = t.trim(); persistChats(); renderChatList(); }
          return;
        }
        if (act === "delete") {
          if (!confirm("Delete this chat?")) return;
          chats = chats.filter((x) => x.id !== c.id); persistChats();
          if (currentId === c.id) newChat(); else renderChatList();
          return;
        }
        openChat(c.id); closeSidebar();
      };
      el.chatList.appendChild(item);
    });
    if (!list.length) el.chatList.innerHTML = `<div class="chat-group">${q ? "No matches" : "No chats yet"}</div>`;
  }

  const openSidebar = () => { el.sidebar.classList.add("open"); el.backdrop.classList.add("open"); };
  const closeSidebar = () => { el.sidebar.classList.remove("open"); el.backdrop.classList.remove("open"); };
  $("openSidebar").onclick = openSidebar;
  $("closeSidebar").onclick = closeSidebar;
  el.backdrop.onclick = closeSidebar;
  el.search.oninput = renderChatList;

  /* ---------- Chat views ---------- */
  function newChat() {
    if (controller) controller.abort();
    currentId = null;
    el.messages.innerHTML = ""; el.messages.appendChild(el.welcome); el.welcome.style.display = "";
    renderChatList(); closeSidebar(); el.input.focus();
  }
  $("newChatBtn").onclick = newChat;
  $("topNewChat").onclick = newChat;

  function openChat(id) {
    if (controller) controller.abort();
    currentId = id;
    const c = current();
    el.messages.innerHTML = "";
    if (!c || !c.messages.length) { el.messages.appendChild(el.welcome); el.welcome.style.display = ""; }
    else c.messages.forEach((m, i) => addMessageEl(m, i));
    renderChatList(); scrollBottom(true);
  }

  function addMessageEl(m, index) {
    const row = document.createElement("div");
    row.className = "msg " + m.role;
    if (m.role === "user") {
      const body = document.createElement("div"); body.className = "body";
      (m.files || []).forEach((f) => { const chip = document.createElement("div"); chip.className = "file-chip"; chip.textContent = "📄 " + f; body.appendChild(chip); });
      if ((m.files || []).length) body.appendChild(document.createElement("br"));
      body.appendChild(document.createTextNode(m.display ?? m.content));
      row.appendChild(body);
    } else {
      row.innerHTML = `<div class="avatar">V</div><div class="body"><div class="md"></div><div class="msg-tools"><button data-act="copy">Copy</button><button data-act="regen">Regenerate</button></div></div>`;
      row.querySelector(".md").innerHTML = renderMarkdown(m.content);
      row.querySelector(".msg-tools").onclick = (e) => {
        const act = e.target.dataset.act;
        if (act === "copy") navigator.clipboard.writeText(m.content).then(() => toast("Copied"));
        if (act === "regen") regenerate();
      };
    }
    el.welcome.style.display = "none";
    el.messages.appendChild(row);
    return row;
  }

  function scrollBottom(force) {
    const nearBottom = el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 160;
    if (force || nearBottom) el.messages.scrollTop = el.messages.scrollHeight;
  }

  /* ---------- Models ---------- */
  async function loadModels() {
    el.model.innerHTML = `<option>${settings.apiKey ? "Loading models..." : "Add API key in Settings"}</option>`;
    if (!settings.apiKey) return;
    try {
      const r = await fetch(API_BASE + "/models", { headers: { Authorization: "Bearer " + settings.apiKey } });
      if (!r.ok) throw new Error(r.status === 401 ? "Invalid API key" : "HTTP " + r.status);
      const data = await r.json();
      const ids = data.data.filter((m) => m.active !== false && !EXCLUDE_MODELS.test(m.id)).map((m) => m.id).sort();
      if (!ids.length) throw new Error("No chat models found");
      const preferred = PREFERRED_MODELS.find((p) => ids.includes(p)) || ids[0];
      if (!settings.model || !ids.includes(settings.model)) { settings.model = preferred; persistSettings(); }
      el.model.innerHTML = ids.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join("");
      el.model.value = settings.model;
    } catch (err) {
      el.model.innerHTML = `<option>Model error: ${escapeHtml(err.message)}</option>`;
      toast(err.message);
    }
  }
  el.model.onchange = () => { settings.model = el.model.value; persistSettings(); toast("Model: " + settings.model); };

  /* ---------- Files ---------- */
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  async function readFile(file) {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let out = "";
      for (let p = 1; p <= pdf.numPages && out.length < MAX_FILE_CHARS; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        out += `\n[Page ${p}]\n` + tc.items.map((i) => i.str).join(" ");
      }
      return out;
    }
    return await file.text();
  }

  $("attachBtn").onclick = () => el.fileInput.click();
  el.fileInput.onchange = async () => {
    for (const f of el.fileInput.files) {
      if (f.size > 15 * 1024 * 1024) { toast(f.name + " is too large"); continue; }
      try {
        let text = await readFile(f);
        if (text.length > MAX_FILE_CHARS) { text = text.slice(0, MAX_FILE_CHARS); toast(f.name + " trimmed to fit"); }
        pendingFiles.push({ name: f.name, text });
      } catch { toast("Could not read " + f.name); }
    }
    el.fileInput.value = ""; renderAttachments(); updateSend();
  };

  function renderAttachments() {
    el.attachments.innerHTML = "";
    pendingFiles.forEach((f, i) => {
      const chip = document.createElement("div"); chip.className = "file-chip";
      chip.innerHTML = `<span></span><b title="Remove">✕</b>`;
      chip.querySelector("span").textContent = "📄 " + f.name;
      chip.querySelector("b").onclick = () => { pendingFiles.splice(i, 1); renderAttachments(); updateSend(); };
      el.attachments.appendChild(chip);
    });
  }

  /* ---------- Sending ---------- */
  function autoGrow() { el.input.style.height = "auto"; el.input.style.height = Math.min(el.input.scrollHeight, 200) + "px"; }
  function updateSend() {
    if (controller) { el.send.classList.add("stop"); el.send.textContent = "■"; el.send.disabled = false; el.send.title = "Stop"; return; }
    el.send.classList.remove("stop"); el.send.textContent = "➤"; el.send.title = "Send";
    el.send.disabled = !el.input.value.trim() && !pendingFiles.length;
  }
  el.input.addEventListener("input", () => { autoGrow(); updateSend(); });
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.innerWidth > 820) { e.preventDefault(); if (!controller) sendMessage(); }
  });
  el.send.onclick = () => (controller ? controller.abort() : sendMessage());
  document.querySelectorAll(".suggestions button").forEach((b) => (b.onclick = () => { el.input.value = b.dataset.prompt; autoGrow(); sendMessage(); }));

  function sendMessage() {
    const text = el.input.value.trim();
    if (!text && !pendingFiles.length) return;
    if (!settings.apiKey) { openSettings(); toast("Add your Groq API key first"); return; }

    let c = current();
    if (!c) {
      c = { id: uid(), title: (text || pendingFiles[0].name).slice(0, 48), messages: [], created: Date.now(), updated: Date.now() };
      chats.push(c); currentId = c.id;
    }
    const fileBlock = pendingFiles.map((f) => `<file name="${f.name}">\n${f.text}\n</file>`).join("\n\n");
    const msg = {
      role: "user",
      content: fileBlock ? `${fileBlock}\n\n${text || "Please review the attached file(s)."}` : text,
      display: text || "(attached files)",
      files: pendingFiles.map((f) => f.name),
    };
    c.messages.push(msg); c.updated = Date.now(); persistChats();
    addMessageEl(msg, c.messages.length - 1);
    el.input.value = ""; pendingFiles = []; renderAttachments(); autoGrow();
    renderChatList(); scrollBottom(true);
    streamReply(c);
  }

  function regenerate() {
    const c = current();
    if (!c || controller) return;
    while (c.messages.length && c.messages[c.messages.length - 1].role === "assistant") c.messages.pop();
    if (!c.messages.length) return;
    persistChats(); openChat(c.id); streamReply(c);
  }

  async function streamReply(c) {
    const row = addMessageEl({ role: "assistant", content: "" });
    const mdEl = row.querySelector(".md");
    const tools = row.querySelector(".msg-tools"); tools.style.display = "none";
    mdEl.innerHTML = `<span class="thinking"><i></i><i></i><i></i></span>`;
    scrollBottom(true);

    const now = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });
    const history = c.messages.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
    const payload = {
      model: settings.model,
      stream: true,
      temperature: Number(settings.temperature),
      messages: [{ role: "system", content: `${settings.systemPrompt}\n\nCurrent date and time: ${now}.` }, ...history],
    };

    controller = new AbortController(); updateSend();
    let full = "", rafPending = false, finished = false;
    const paint = () => { rafPending = false; if (finished) return; mdEl.innerHTML = renderMarkdown(full); mdEl.classList.add("cursor"); scrollBottom(); };

    try {
      const r = await fetch(API_BASE + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!r.ok) {
        let detail = ""; try { detail = (await r.json()).error?.message || ""; } catch {}
        if (r.status === 401) throw new Error("Invalid API key. Update it in Settings.");
        if (r.status === 429) throw new Error("Free limit reached for now. Wait a minute or switch model. " + detail);
        throw new Error(`Error ${r.status}: ${detail}`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) { full += delta; if (!rafPending) { rafPending = true; requestAnimationFrame(paint); } }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        finished = true; controller = null; updateSend();
        mdEl.classList.remove("cursor");
        mdEl.innerHTML = `<p class="error">⚠ ${escapeHtml(err.message)}</p>`;
        if (full) mdEl.innerHTML = renderMarkdown(full) + mdEl.innerHTML;
        tools.style.display = ""; tools.querySelector('[data-act="copy"]').style.display = "none";
        tools.onclick = (e) => e.target.dataset.act === "regen" && regenerate();
        if (full) { c.messages.push({ role: "assistant", content: full }); persistChats(); }
        return;
      }
    }

    finished = true; controller = null; updateSend();
    mdEl.classList.remove("cursor");
    if (!full) full = "_(stopped)_";
    mdEl.innerHTML = renderMarkdown(full);
    const m = { role: "assistant", content: full };
    c.messages.push(m); c.updated = Date.now(); persistChats(); renderChatList();
    tools.style.display = "";
    tools.onclick = (e) => {
      const act = e.target.dataset.act;
      if (act === "copy") navigator.clipboard.writeText(m.content).then(() => toast("Copied"));
      if (act === "regen") regenerate();
    };
    scrollBottom();
    if (c.messages.length === 2) autoTitle(c);
  }

  async function autoTitle(c) {
    try {
      const r = await fetch(API_BASE + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey },
        body: JSON.stringify({
          model: settings.model, temperature: 0.3, max_tokens: 20,
          messages: [{ role: "user", content: `Write a short title (max 5 words, no quotes, no punctuation at end) for a chat that starts with:\n\n${c.messages[0].display.slice(0, 500)}` }],
        }),
      });
      if (!r.ok) return;
      const t = (await r.json()).choices?.[0]?.message?.content?.replace(/["*#]/g, "").trim();
      if (t && t.length < 60) { c.title = t; persistChats(); renderChatList(); }
    } catch {}
  }

  /* ---------- Settings ---------- */
  function openSettings() {
    el.apiKey.value = settings.apiKey; el.sys.value = settings.systemPrompt;
    el.temp.value = settings.temperature; el.tempVal.textContent = settings.temperature;
    el.modal.classList.add("open"); closeSidebar();
  }
  $("openSettings").onclick = openSettings;
  $("closeSettings").onclick = () => el.modal.classList.remove("open");
  el.modal.onclick = (e) => { if (e.target === el.modal) el.modal.classList.remove("open"); };
  el.temp.oninput = () => (el.tempVal.textContent = el.temp.value);
  $("saveSettings").onclick = () => {
    const keyChanged = el.apiKey.value.trim() !== settings.apiKey;
    settings.apiKey = el.apiKey.value.trim();
    settings.systemPrompt = el.sys.value.trim() || DEFAULT_SYSTEM;
    settings.temperature = Number(el.temp.value);
    persistSettings(); el.modal.classList.remove("open"); toast("Settings saved");
    if (keyChanged) loadModels();
  };
  $("clearAll").onclick = () => {
    if (!confirm("Delete ALL chats? This cannot be undone.")) return;
    chats = []; persistChats(); newChat(); el.modal.classList.remove("open"); toast("All chats deleted");
  };

  /* ---------- Init ---------- */
  renderChatList(); updateSend(); loadModels();
  if (!settings.apiKey) setTimeout(openSettings, 400);
})();
