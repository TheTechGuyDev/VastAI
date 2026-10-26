/* VastAI - personal AI chat (static, runs fully in the browser) */
(() => {
  const PROVIDERS = {
    groq: { name: "Groq", base: "https://api.groq.com/openai/v1", key: () => settings.apiKey },
    gemini: { name: "Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", key: () => settings.geminiKey },
  };
  const STORE = { chats: "vastai_chats", settings: "vastai_settings", theme: "vastai_theme" };
  const PREFERRED = ["groq:llama-3.3-70b-versatile", "groq:openai/gpt-oss-120b", "groq:llama-3.1-8b-instant"];
  const GROQ_EXCLUDE = /whisper|tts|guard|playai|orpheus|distil|compound/i;
  const GROQ_VISION = /vision|llama-4|scout|maverick|llava/i;
  const GEMINI_EXCLUDE = /embed|tts|image|live|aqa|imagen|veo|audio|native|learnlm|gemma|thinking-exp|computer|robotics/i;
  const MAX_HISTORY = 24;
  const MAX_FILE_CHARS = 60000;
  const ARTIFACT_MIN_LINES = 12;
  const PREVIEW_LANGS = ["html", "htm", "svg", "jsx", "tsx", "react"];
  const DEFAULT_SYSTEM =
    "You are VastAI, a helpful, knowledgeable and friendly AI assistant. " +
    "Give clear, accurate, well-structured answers. Use markdown when it helps (lists, tables, code blocks with language tags). " +
    "Be concise unless the user asks for detail. If you are not sure about something, say so.";
  const CODE_RULES =
    "\n\nCode rules: When asked to build a website, web page, landing page, UI component, game or web app, " +
    "reply with a one-line intro, then ONE complete self-contained ```html code block (all CSS inside <style>, all JS inside <script>, CDN links allowed, " +
    "use real-looking content and a polished modern design), then a short summary. Never split HTML, CSS and JS into separate blocks for websites. " +
    "If the user specifically asks for React, use ONE ```jsx block with a component named App as the default export, no local file imports. " +
    "For other languages (Python, Dart, etc.) use normal code blocks with the correct language tag.";

  const $ = (id) => document.getElementById(id);
  const el = {
    sidebar: $("sidebar"), backdrop: $("backdrop"), chatList: $("chatList"), search: $("searchChats"),
    messages: $("messages"), welcome: $("welcome"), input: $("input"), send: $("sendBtn"),
    picker: $("modelPicker"), modelBtn: $("modelBtn"), modelLabel: $("modelLabel"), modelMenu: $("modelMenu"),
    modal: $("settingsModal"), apiKey: $("apiKey"), geminiKey: $("geminiKey"), sys: $("systemPrompt"),
    temp: $("temperature"), tempVal: $("tempVal"), toast: $("toast"), attachments: $("attachments"),
    attachWrap: document.querySelector(".attach-wrap"),
    panel: $("panel"), panelLang: $("panelLang"), panelName: $("panelName"), panelStatus: $("panelStatus"),
    panelCode: $("panelCode"), panelCodeWrap: $("panelCodeWrap"), panelFrame: $("panelFrame"), previewTab: $("previewTab"),
  };

  /* ---------- Storage ---------- */
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast("Storage full. Delete some chats."); } };

  let chats = load(STORE.chats, []);
  let settings = Object.assign({ apiKey: "", geminiKey: "", model: "", systemPrompt: DEFAULT_SYSTEM, temperature: 0.7 }, load(STORE.settings, {}));
  if (settings.model && !settings.model.includes(":")) settings.model = "groq:" + settings.model;
  let models = [];
  let currentId = null;
  let controller = null;
  let pendingFiles = [];   // {name, text}
  let pendingImages = [];  // {name, dataUrl}

  const persistChats = () => save(STORE.chats, chats);
  const persistSettings = () => save(STORE.settings, settings);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const current = () => chats.find((c) => c.id === currentId);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isMobile = () => window.innerWidth <= 820;

  /* ---------- Theme ---------- */
  const applyTheme = (t) => { document.documentElement.dataset.theme = t; save(STORE.theme, t); };
  applyTheme(load(STORE.theme, "dark"));
  $("toggleTheme").onclick = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg; el.toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2400);
  }

  /* ---------- Code blocks & artifacts ---------- */
  const EXT = { html: "html", htm: "html", css: "css", javascript: "js", js: "js", jsx: "jsx", tsx: "tsx", typescript: "ts", ts: "ts",
    python: "py", py: "py", dart: "dart", java: "java", kotlin: "kt", swift: "swift", go: "go", rust: "rs", php: "php", ruby: "rb",
    c: "c", cpp: "cpp", csharp: "cs", cs: "cs", sql: "sql", json: "json", yaml: "yml", yml: "yml", bash: "sh", sh: "sh", shell: "sh",
    svg: "svg", xml: "xml", markdown: "md", md: "md", react: "jsx", vue: "vue" };

  // Extract fenced code blocks from markdown text (handles an unclosed final block while streaming)
  function extractBlocks(text) {
    const blocks = [];
    const re = /^```([\w+#.-]*)[^\n]*\n([\s\S]*?)(^```\s*$|(?![\s\S]))/gm;
    let m;
    while ((m = re.exec(text))) {
      blocks.push({ lang: (m[1] || "text").toLowerCase(), code: m[2].replace(/\n$/, ""), closed: !!m[3] });
      if (!m[3]) break;
    }
    return blocks;
  }
  const isArtifact = (b) => PREVIEW_LANGS.includes(b.lang) || b.code.split("\n").length >= ARTIFACT_MIN_LINES;
  const canPreview = (b) => PREVIEW_LANGS.includes(b.lang);

  function fileNameFor(b, text) {
    const ext = EXT[b.lang] || "txt";
    if (ext === "html") {
      const t = (b.code.match(/<title>([^<]{1,60})<\/title>/i) || [])[1];
      if (t) return t.trim();
      return "index.html";
    }
    if (ext === "jsx" || ext === "tsx") return "App." + ext;
    return "code." + ext;
  }

  marked.setOptions({ gfm: true, breaks: true });

  // Renders markdown. In assistant messages, large or previewable code blocks become artifact cards.
  function renderMarkdown(text, opts = {}) {
    const blocks = opts.artifacts ? extractBlocks(text) : [];
    const html = DOMPurify.sanitize(marked.parse(text || ""));
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const used = new Set();
    wrap.querySelectorAll("pre > code").forEach((code) => {
      const lang = (code.className.match(/language-([\w+#.-]+)/) || [])[1] || "text";
      const txt = code.textContent.trim();
      const idx = blocks.findIndex((b, i) => !used.has(i) && b.code.trim() === txt);
      if (idx >= 0) used.add(idx);
      const block = idx >= 0 ? blocks[idx] : null;
      const pre = code.parentElement;
      if (block && isArtifact(block)) {
        const card = document.createElement("div");
        card.className = "artifact-card";
        card.dataset.block = idx;
        const live = opts.streaming && !block.closed;
        const lines = block.code.split("\n").length;
        card.innerHTML = `<div class="art-ic">&lt;/&gt;</div><div><div class="art-name">${escapeHtml(fileNameFor(block))}</div>` +
          `<div class="art-sub ${live ? "live" : ""}">${live ? "Writing code... " + lines + " lines" : (canPreview(block) ? "Click to view code and preview" : "Click to open code") + " · " + lines + " lines"}</div></div>`;
        pre.replaceWith(card);
        return;
      }
      try { hljs.highlightElement(code); } catch {}
      const box = document.createElement("div");
      box.className = "code-block";
      box.innerHTML = `<div class="code-head"><span>${escapeHtml(lang)}</span><button class="copy-code">Copy</button></div>`;
      pre.replaceWith(box);
      box.appendChild(pre);
    });
    wrap.querySelectorAll("a").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
    return wrap.innerHTML;
  }

  el.messages.addEventListener("click", (e) => {
    const btn = e.target.closest(".copy-code");
    if (btn) {
      const code = btn.closest(".code-block").querySelector("code").innerText;
      navigator.clipboard.writeText(code).then(() => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1500); });
      return;
    }
    const card = e.target.closest(".artifact-card");
    if (card) {
      const row = card.closest(".msg");
      const text = row && row._getText ? row._getText() : "";
      const block = extractBlocks(text)[Number(card.dataset.block)];
      if (block) openPanel(block, { preview: canPreview(block) && block.closed });
    }
  });

  /* ---------- Panel ---------- */
  let panelBlock = null;

  function buildPreviewDoc(b) {
    if (b.lang === "svg") return `<!doctype html><html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${b.code}</body></html>`;
    if (["jsx", "tsx", "react"].includes(b.lang)) {
      let code = b.code
        .replace(/^\s*import\s+[^;]*?from\s+['"]react['"];?\s*$/gm, "")
        .replace(/^\s*import\s+[^;]*?from\s+['"]react-dom(\/client)?['"];?\s*$/gm, "")
        .replace(/^\s*import\s+['"][^'"]+\.css['"];?\s*$/gm, "");
      let comp = "App";
      const named = code.match(/export\s+default\s+function\s+(\w+)/) || code.match(/export\s+default\s+class\s+(\w+)/);
      if (named) { comp = named[1]; code = code.replace(/export\s+default\s+(function|class)/, "$1"); }
      else {
        const ref = code.match(/export\s+default\s+(\w+)\s*;?/);
        if (ref) { comp = ref[1]; code = code.replace(/export\s+default\s+\w+\s*;?/, ""); }
      }
      code = code.replace(/^\s*export\s+/gm, "");
      const safe = code.replace(/<\/script/gi, "<\\/script");
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js"><\/script>
<style>body{margin:0;font-family:system-ui,sans-serif}</style></head><body><div id="root"></div>
<script>window.onerror=function(m){document.body.insertAdjacentHTML('beforeend','<pre style="color:#b91c1c;padding:16px;white-space:pre-wrap">'+m+'</pre>')}<\/script>
<script type="text/babel" data-presets="react,typescript" data-filename="App.tsx">
const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext, Fragment } = React;
${safe}
ReactDOM.createRoot(document.getElementById('root')).render(<${comp} />);
<\/script></body></html>`;
    }
    return b.code; // html
  }

  function paintPanelCode(b) {
    let html;
    const lang = b.lang === "react" ? "jsx" : b.lang;
    try { html = hljs.getLanguage(lang) ? hljs.highlight(b.code, { language: lang }).value : hljs.highlightAuto(b.code).value; }
    catch { html = escapeHtml(b.code); }
    el.panelCode.innerHTML = html;
  }

  function setTab(tab) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    el.panel.classList.toggle("show-preview", tab === "preview");
    if (tab === "preview" && panelBlock) el.panelFrame.srcdoc = buildPreviewDoc(panelBlock);
  }

  function openPanel(b, { preview = false, live = false } = {}) {
    const isNew = !panelBlock || panelBlock !== b;
    panelBlock = b;
    el.panel.classList.add("open");
    el.panelLang.textContent = b.lang;
    el.panelName.textContent = fileNameFor(b);
    el.panelStatus.textContent = live ? "● Writing..." : "";
    el.previewTab.disabled = !canPreview(b) || live;
    paintPanelCode(b);
    if (live) {
      setTab("code");
      el.panelCodeWrap.scrollTop = el.panelCodeWrap.scrollHeight;
    } else if (preview) setTab("preview");
    else if (isNew) setTab("code");
  }

  function closePanel() { el.panel.classList.remove("open"); el.panelFrame.srcdoc = ""; panelBlock = null; }

  document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => !t.disabled && setTab(t.dataset.tab)));
  $("panelClose").onclick = closePanel;
  $("panelCopy").onclick = () => panelBlock && navigator.clipboard.writeText(panelBlock.code).then(() => toast("Code copied"));
  $("panelDownload").onclick = () => {
    if (!panelBlock) return;
    const ext = EXT[panelBlock.lang] || "txt";
    const name = ext === "html" ? "index.html" : fileNameFor(panelBlock).includes(".") ? fileNameFor(panelBlock) : "code." + ext;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([panelBlock.code], { type: "text/plain" }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $("panelOpen").onclick = () => {
    if (!panelBlock) return;
    const doc = canPreview(panelBlock) ? buildPreviewDoc(panelBlock) : `<pre>${escapeHtml(panelBlock.code)}</pre>`;
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
    window.open(url, "_blank");
  };

  /* ---------- Sidebar ---------- */
  function groupLabel(ts) {
    const d = new Date(ts), now = new Date();
    const diff = (new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000;
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff <= 7) return "Previous 7 days";
    if (diff <= 30) return "Previous 30 days";
    return "Older";
  }

  function renderChatList() {
    const q = el.search.value.trim().toLowerCase();
    const list = chats
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => (m.display || m.content).toLowerCase().includes(q)))
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
    currentId = null; closePanel();
    el.messages.innerHTML = ""; el.messages.appendChild(el.welcome); el.welcome.style.display = "";
    renderChatList(); closeSidebar(); el.input.focus();
  }
  $("newChatBtn").onclick = newChat;
  $("topNewChat").onclick = newChat;

  function openChat(id) {
    if (controller) controller.abort();
    currentId = id; closePanel();
    const c = current();
    el.messages.innerHTML = "";
    if (!c || !c.messages.length) { el.messages.appendChild(el.welcome); el.welcome.style.display = ""; }
    else c.messages.forEach((m) => addMessageEl(m));
    renderChatList(); scrollBottom(true);
  }

  function addMessageEl(m) {
    const row = document.createElement("div");
    row.className = "msg " + m.role;
    if (m.role === "user") {
      const body = document.createElement("div"); body.className = "body";
      (m.images || []).forEach((src) => { const img = document.createElement("img"); img.className = "msg-img"; img.src = src; body.appendChild(img); });
      (m.files || []).forEach((f) => { const chip = document.createElement("div"); chip.className = "file-chip"; chip.textContent = "📄 " + f; body.appendChild(chip); });
      if ((m.files || []).length) body.appendChild(document.createElement("br"));
      body.appendChild(document.createTextNode(m.display ?? m.content));
      row.appendChild(body);
    } else {
      row.innerHTML = `<div class="avatar">V</div><div class="body"><div class="md"></div><div class="msg-tools"><button data-act="copy">Copy</button><button data-act="regen">Regenerate</button><span class="model-tag"></span></div></div>`;
      row._getText = () => m.content;
      row.querySelector(".md").innerHTML = renderMarkdown(m.content, { artifacts: true });
      if (m.model) row.querySelector(".model-tag").textContent = m.model.split(":").pop();
      bindTools(row, m);
    }
    el.welcome.style.display = "none";
    el.messages.appendChild(row);
    return row;
  }

  function bindTools(row, m) {
    row.querySelector(".msg-tools").onclick = (e) => {
      const act = e.target.dataset.act;
      if (act === "copy") navigator.clipboard.writeText(m.content).then(() => toast("Copied"));
      if (act === "regen") regenerate();
    };
  }

  function scrollBottom(force) {
    const nearBottom = el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 160;
    if (force || nearBottom) el.messages.scrollTop = el.messages.scrollHeight;
  }

  /* ---------- Models ---------- */
  const findModel = (key) => models.find((m) => m.key === key);

  async function fetchModels(provider) {
    const p = PROVIDERS[provider];
    if (!p.key()) return [];
    const r = await fetch(p.base + "/models", { headers: { Authorization: "Bearer " + p.key() } });
    if (!r.ok) throw new Error(`${p.name}: ${r.status === 401 || r.status === 400 || r.status === 403 ? "invalid API key" : "HTTP " + r.status}`);
    const data = await r.json();
    return (data.data || []).map((m) => String(m.id).replace(/^models\//, "")).filter((id) =>
      provider === "groq" ? !GROQ_EXCLUDE.test(id) : /gemini/i.test(id) && !GEMINI_EXCLUDE.test(id)
    ).sort().map((id) => ({
      key: provider + ":" + id, id, provider,
      vision: provider === "gemini" || GROQ_VISION.test(id),
    }));
  }

  async function loadModels() {
    el.modelLabel.textContent = settings.apiKey || settings.geminiKey ? "Loading models..." : "Add API key in Settings";
    const results = await Promise.allSettled([fetchModels("groq"), fetchModels("gemini")]);
    models = [];
    results.forEach((r) => { if (r.status === "fulfilled") models.push(...r.value); else toast(r.reason.message); });
    if (models.length && !findModel(settings.model)) {
      settings.model = (PREFERRED.find((k) => findModel(k)) || models[0].key);
      persistSettings();
    }
    renderModelMenu();
  }

  function renderModelMenu() {
    const cur = findModel(settings.model);
    el.modelLabel.textContent = cur ? cur.id : models.length ? "Choose model" : (settings.apiKey || settings.geminiKey ? "No models found" : "Add API key in Settings");
    el.modelMenu.innerHTML = "";
    if (!models.length) { el.modelMenu.innerHTML = `<div class="model-empty">Add your Groq key in Settings to load models.</div>`; return; }
    ["groq", "gemini"].forEach((prov) => {
      const list = models.filter((m) => m.provider === prov);
      if (!list.length) return;
      const g = document.createElement("div"); g.className = "model-group"; g.textContent = PROVIDERS[prov].name;
      el.modelMenu.appendChild(g);
      list.forEach((m) => {
        const b = document.createElement("button");
        b.className = "model-opt" + (m.key === settings.model ? " active" : "");
        b.innerHTML = `<span class="check">${m.key === settings.model ? "✓" : ""}</span><span class="name"></span>${m.vision ? '<span class="badge">vision</span>' : ""}`;
        b.querySelector(".name").textContent = m.id;
        b.onclick = () => { settings.model = m.key; persistSettings(); renderModelMenu(); el.picker.classList.remove("open"); };
        el.modelMenu.appendChild(b);
      });
    });
  }

  el.modelBtn.onclick = (e) => { e.stopPropagation(); el.attachWrap.classList.remove("open"); el.picker.classList.toggle("open"); };

  function visionModel() {
    const cur = findModel(settings.model);
    if (cur && cur.vision) return cur;
    return models.find((m) => m.provider === "groq" && m.vision) ||
      models.find((m) => m.provider === "gemini" && /flash/i.test(m.id) && !/lite|preview|exp/i.test(m.id)) ||
      models.find((m) => m.provider === "gemini" && /flash/i.test(m.id)) ||
      models.find((m) => m.vision);
  }

  /* ---------- Attachments ---------- */
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  async function readPdf(file) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = "";
    for (let p = 1; p <= pdf.numPages && out.length < MAX_FILE_CHARS; p++) {
      const tc = await (await pdf.getPage(p)).getTextContent();
      out += `\n[Page ${p}]\n` + tc.items.map((i) => i.str).join(" ");
    }
    return out;
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const max = 1280, scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  const inputs = { image: $("fileImage"), pdf: $("filePdf"), doc: $("fileDoc") };
  $("attachBtn").onclick = (e) => { e.stopPropagation(); el.picker.classList.remove("open"); el.attachWrap.classList.toggle("open"); };
  document.querySelectorAll("#attachMenu button").forEach((b) => (b.onclick = () => { el.attachWrap.classList.remove("open"); inputs[b.dataset.kind].click(); }));
  document.addEventListener("click", (e) => {
    if (!el.attachWrap.contains(e.target)) el.attachWrap.classList.remove("open");
    if (!el.picker.contains(e.target)) el.picker.classList.remove("open");
  });

  async function handleFiles(list, kind) {
    for (const f of list) {
      if (f.size > 20 * 1024 * 1024) { toast(f.name + " is too large"); continue; }
      try {
        if (kind === "image" || f.type.startsWith("image/")) {
          if (pendingImages.length >= 4) { toast("Max 4 images per message"); continue; }
          pendingImages.push({ name: f.name, dataUrl: await compressImage(f) });
        } else {
          let text = f.name.toLowerCase().endsWith(".pdf") ? await readPdf(f) : await f.text();
          if (!text.trim()) { toast(f.name + " has no readable text"); continue; }
          if (text.length > MAX_FILE_CHARS) { text = text.slice(0, MAX_FILE_CHARS); toast(f.name + " trimmed to fit"); }
          pendingFiles.push({ name: f.name, text });
        }
      } catch { toast("Could not read " + f.name); }
    }
    renderAttachments(); updateSend();
  }
  Object.entries(inputs).forEach(([kind, inp]) => (inp.onchange = async () => { await handleFiles(inp.files, kind); inp.value = ""; }));

  // Paste images straight into the box
  el.input.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); handleFiles(files, "image"); }
  });

  function renderAttachments() {
    el.attachments.innerHTML = "";
    pendingImages.forEach((f, i) => {
      const chip = document.createElement("div"); chip.className = "img-chip";
      chip.innerHTML = `<img class="thumb" alt=""><b title="Remove">✕</b>`;
      chip.querySelector("img").src = f.dataUrl;
      chip.querySelector("b").onclick = () => { pendingImages.splice(i, 1); renderAttachments(); updateSend(); };
      el.attachments.appendChild(chip);
    });
    pendingFiles.forEach((f, i) => {
      const chip = document.createElement("div"); chip.className = "file-chip";
      chip.innerHTML = `<span></span><b title="Remove">✕</b>`;
      chip.querySelector("span").textContent = "📄 " + f.name;
      chip.querySelector("b").onclick = () => { pendingFiles.splice(i, 1); renderAttachments(); updateSend(); };
      el.attachments.appendChild(chip);
    });
  }

  /* ---------- Sending ---------- */
  function autoGrow() {
    el.input.style.height = "auto";
    const h = el.input.scrollHeight;
    el.input.style.height = Math.min(h, 220) + "px";
    el.input.style.overflowY = h > 220 ? "auto" : "hidden";
  }
  const hasInput = () => el.input.value.trim() || pendingFiles.length || pendingImages.length;
  function updateSend() {
    if (controller) { el.send.classList.add("stop"); el.send.textContent = "■"; el.send.disabled = false; el.send.title = "Stop"; return; }
    el.send.classList.remove("stop"); el.send.textContent = "➤"; el.send.title = "Send";
    el.send.disabled = !hasInput();
  }
  el.input.addEventListener("input", () => { autoGrow(); updateSend(); });
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !isMobile()) { e.preventDefault(); if (!controller) sendMessage(); }
  });
  el.send.onclick = () => (controller ? controller.abort() : sendMessage());
  document.querySelectorAll(".suggestions button").forEach((b) => (b.onclick = () => { el.input.value = b.dataset.prompt; autoGrow(); sendMessage(); }));

  function sendMessage() {
    const text = el.input.value.trim();
    if (!hasInput()) return;
    if (!models.length) { openSettings(); toast("Add your Groq API key first"); return; }
    let useModel = findModel(settings.model);
    if (pendingImages.length && !(useModel && useModel.vision)) {
      useModel = visionModel();
      if (!useModel) { openSettings(); toast("Add a Gemini API key to send images"); return; }
    }

    let c = current();
    if (!c) {
      c = { id: uid(), title: (text || pendingImages[0]?.name || pendingFiles[0].name).slice(0, 48), messages: [], created: Date.now(), updated: Date.now() };
      chats.push(c); currentId = c.id;
    }
    const fileBlock = pendingFiles.map((f) => `<file name="${f.name}">\n${f.text}\n</file>`).join("\n\n");
    const fallback = pendingImages.length ? "Describe this image." : "Please review the attached file(s).";
    const msg = {
      role: "user",
      content: fileBlock ? `${fileBlock}\n\n${text || fallback}` : (text || fallback),
      display: text || (pendingImages.length ? "" : "(attached files)"),
      files: pendingFiles.map((f) => f.name),
      images: pendingImages.map((i) => i.dataUrl),
    };
    c.messages.push(msg); c.updated = Date.now(); persistChats();
    addMessageEl(msg);
    el.input.value = ""; pendingFiles = []; pendingImages = []; renderAttachments(); autoGrow();
    renderChatList(); scrollBottom(true);
    streamReply(c, useModel);
  }

  function regenerate() {
    const c = current();
    if (!c || controller) return;
    while (c.messages.length && c.messages[c.messages.length - 1].role === "assistant") c.messages.pop();
    if (!c.messages.length) return;
    persistChats(); openChat(c.id);
    const last = c.messages[c.messages.length - 1];
    let m = findModel(settings.model);
    if (last.images?.length && !(m && m.vision)) m = visionModel();
    streamReply(c, m);
  }

  function buildHistory(c, model) {
    return c.messages.slice(-MAX_HISTORY).map((m) => {
      if (m.role === "user" && m.images?.length) {
        if (model.vision) return { role: "user", content: [{ type: "text", text: m.content }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))] };
        return { role: "user", content: `[User attached ${m.images.length} image(s)]\n${m.content}` };
      }
      return { role: m.role, content: m.content };
    });
  }

  async function streamReply(c, model) {
    if (!model) { toast("No model available"); return; }
    const row = addMessageEl({ role: "assistant", content: "" });
    const mdEl = row.querySelector(".md");
    const tools = row.querySelector(".msg-tools"); tools.style.display = "none";
    mdEl.innerHTML = `<span class="thinking"><i></i><i></i><i></i></span>`;
    scrollBottom(true);

    const now = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });
    const p = PROVIDERS[model.provider];
    const payload = {
      model: model.id, stream: true, temperature: Number(settings.temperature),
      messages: [{ role: "system", content: `${settings.systemPrompt}${CODE_RULES}\n\nCurrent date and time: ${now}.` }, ...buildHistory(c, model)],
    };

    controller = new AbortController(); updateSend();
    let full = "", rafPending = false, finished = false, autoOpened = false;
    row._getText = () => full;

    const paint = () => {
      rafPending = false; if (finished) return;
      mdEl.innerHTML = renderMarkdown(full, { artifacts: true, streaming: true });
      mdEl.classList.add("cursor");
      // Live code panel
      const blocks = extractBlocks(full);
      const liveIdx = blocks.findIndex((b) => !b.closed);
      const target = liveIdx >= 0 ? blocks[liveIdx] : null;
      if (target && isArtifact(target)) {
        if (!autoOpened || el.panel.classList.contains("open")) { openPanel(target, { live: true }); autoOpened = true; }
      }
      scrollBottom();
    };

    try {
      const r = await fetch(p.base + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.key() },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      if (!r.ok) {
        let detail = ""; try { const j = await r.json(); detail = (Array.isArray(j) ? j[0] : j).error?.message || ""; } catch {}
        if (r.status === 401 || r.status === 403) throw new Error(`Invalid ${p.name} API key. Update it in Settings.`);
        if (r.status === 429) throw new Error("Free limit reached for now. Wait a minute or switch model. " + detail);
        if (r.status === 413) throw new Error("Message too long for this model. Start a new chat or switch model.");
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
        mdEl.innerHTML = (full ? renderMarkdown(full, { artifacts: true }) : "") + `<p class="error">⚠ ${escapeHtml(err.message)}</p>`;
        tools.style.display = ""; tools.querySelector('[data-act="copy"]').style.display = full ? "" : "none";
        const m = { role: "assistant", content: full, model: model.key };
        if (full) { c.messages.push(m); persistChats(); }
        bindTools(row, m);
        if (el.panel.classList.contains("open")) el.panelStatus.textContent = "";
        return;
      }
    }

    finished = true; controller = null; updateSend();
    mdEl.classList.remove("cursor");
    if (!full) full = "_(stopped)_";
    mdEl.innerHTML = renderMarkdown(full, { artifacts: true });
    const m = { role: "assistant", content: full, model: model.key };
    c.messages.push(m); c.updated = Date.now(); persistChats(); renderChatList();
    row._getText = () => m.content;
    row.querySelector(".model-tag").textContent = model.id;
    tools.style.display = ""; bindTools(row, m);

    // Finalise panel: show the last artifact, switch to preview when possible
    {
      const arts = extractBlocks(full).filter(isArtifact);
      const best = arts.filter(canPreview).pop() || arts.pop();
      if (best && (autoOpened || canPreview(best) || !isMobile())) openPanel(best, { preview: canPreview(best) });
    }
    scrollBottom();
    if (c.messages.length === 2) autoTitle(c, model);
  }

  async function autoTitle(c, model) {
    const tm = models.find((m) => m.key === "groq:llama-3.1-8b-instant") || model;
    const p = PROVIDERS[tm.provider];
    try {
      const r = await fetch(p.base + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.key() },
        body: JSON.stringify({
          model: tm.id, temperature: 0.3, max_tokens: 30,
          messages: [{ role: "user", content: `Write a short title (max 5 words, no quotes, no punctuation at the end) for a chat that starts with:\n\n${(c.messages[0].display || c.messages[0].content).slice(0, 500)}\n\nReply with the title only.` }],
        }),
      });
      if (!r.ok) return;
      const t = (await r.json()).choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/["*#]/g, "").trim();
      if (t && t.length < 60) { c.title = t; persistChats(); renderChatList(); }
    } catch {}
  }

  /* ---------- Settings ---------- */
  function openSettings() {
    el.apiKey.value = settings.apiKey; el.geminiKey.value = settings.geminiKey; el.sys.value = settings.systemPrompt;
    el.temp.value = settings.temperature; el.tempVal.textContent = settings.temperature;
    el.modal.classList.add("open"); closeSidebar();
  }
  $("openSettings").onclick = openSettings;
  $("closeSettings").onclick = () => el.modal.classList.remove("open");
  el.modal.onclick = (e) => { if (e.target === el.modal) el.modal.classList.remove("open"); };
  el.temp.oninput = () => (el.tempVal.textContent = el.temp.value);
  $("saveSettings").onclick = () => {
    const keysChanged = el.apiKey.value.trim() !== settings.apiKey || el.geminiKey.value.trim() !== settings.geminiKey;
    settings.apiKey = el.apiKey.value.trim();
    settings.geminiKey = el.geminiKey.value.trim();
    settings.systemPrompt = el.sys.value.trim() || DEFAULT_SYSTEM;
    settings.temperature = Number(el.temp.value);
    persistSettings(); el.modal.classList.remove("open"); toast("Settings saved");
    if (keysChanged) loadModels();
  };
  $("clearAll").onclick = () => {
    if (!confirm("Delete ALL chats? This cannot be undone.")) return;
    chats = []; persistChats(); newChat(); el.modal.classList.remove("open"); toast("All chats deleted");
  };

  /* ---------- Init ---------- */
  renderChatList(); updateSend(); loadModels();
  if (!settings.apiKey) setTimeout(openSettings, 400);
})();
