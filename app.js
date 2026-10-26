/* VastAI - personal AI chat (static, runs fully in the browser) */
(() => {
  const PROVIDERS = {
    groq: { name: "Groq", base: "https://api.groq.com/openai/v1", key: () => settings.apiKey },
    gemini: { name: "Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", key: () => settings.geminiKey },
  };
  const STORE = { chats: "vastai_chats", settings: "vastai_settings", theme: "vastai_theme", memory: "vastai_memory", projects: "vastai_projects" };
  const PREFERRED = ["groq:llama-3.3-70b-versatile", "groq:openai/gpt-oss-120b", "groq:llama-3.1-8b-instant"];
  const GROQ_EXCLUDE = /whisper|tts|guard|playai|orpheus|distil|compound|allam/i;
  const GROQ_VISION = /vision|llama-4|scout|maverick|llava/i;
  const GEMINI_EXCLUDE = /embed|tts|image|live|aqa|imagen|veo|audio|native|learnlm|gemma|thinking-exp|computer|robotics/i;
  const MAX_HISTORY = 24;
  const MAX_FILE_CHARS = 60000;
  const ARTIFACT_MIN_LINES = 12;
  const PREVIEW_LANGS = ["html", "htm", "svg", "jsx", "tsx", "react", "design"];
  const DEFAULT_SYSTEM =
    "You are VastAI, a helpful, knowledgeable and friendly AI assistant. " +
    "Give clear, accurate, well-structured answers. Use markdown when it helps (lists, tables, code blocks with language tags). " +
    "Be concise unless the user asks for detail. If you are not sure about something, say so.";
  const CODE_RULES =
    "\n\nCode: for a website, page, UI or web app reply with one intro line, then ONE self-contained ```html block (CSS in <style>, JS in <script>, CDNs ok, polished modern design, real content), then a short summary. " +
    "If React is requested use ONE ```jsx block exporting a default App component, no local imports. Other languages: normal fenced blocks with the right tag.";
  const IMAGE_RULES =
    "\n\nImages: you CAN create images. For photos, art, illustrations, scenery or icon-style logos WITHOUT words, reply with one short line then a ```image block containing only JSON " +
    '{"prompt":"detailed English description: subject, style, colours, lighting, composition, no text","width":1024,"height":1024} (1344x768 landscape, 768x1344 portrait, max 4 blocks). ' +
    "Image models cannot write readable text.";
  const DESIGN_RULES =
    "\n\nDesigns: for anything with words on it (flyer, poster, banner, social media post, ad, business card, invitation, certificate, menu, thumbnail, logo with a name) reply with one short line then ONE ```design block: " +
    'a complete HTML document whose body holds a single <div id="design"> with fixed pixel size (flyer/poster 1080x1350, square post 1080x1080, story 1080x1920, banner 1500x500, business card 1050x600). ' +
    "Make it look like a professional graphic designer made it: strong hierarchy, big bold headline, Google Fonts (link in head), rich gradients, shapes, icons (emoji or inline SVG), good contrast, all real text from the request (dates, prices, phone, CTA). " +
    "For photos use <img> with src https://image.pollinations.ai/prompt/URL_ENCODED_PROMPT?width=W&height=H&nologo=true (describe the photo only, never text in it) and object-fit:cover. No external JS. Then a one-line summary.";
  const MEMORY_RULES =
    '\n\nMemory: if the user shares a lasting personal fact or preference or says "remember", end your reply with a ```memory block {"save":["fact in third person"]} ' +
    '(or {"forget":["fact"]}). Never mention this block. Skip trivial or temporary things.';
  const INTENT = {
    code: /\b(website|web ?site|web ?page|landing|html|css|javascript|react|component|code|script|function|program|api|bug|debug|fix|python|flutter|dart|sql|app)\b/i,
    files: /\b(power ?point|pptx|slides?|deck|presentation|word|docx|excel|xlsx|spreadsheet|sheet|pdf|document|report|download|file)\b/i,
    visual: /\b(image|picture|photo|pic|draw|logo|flyer|flier|poster|banner|design|illustration|art|artwork|wallpaper|thumbnail|card|invitation|invite|certificate|advert|ad|graphic|generate|post|menu|brochure)\b/i,
  };

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
  let settings = Object.assign({ apiKey: "", geminiKey: "", model: "", systemPrompt: DEFAULT_SYSTEM, temperature: 0.7, autoSpeak: false, project: null }, load(STORE.settings, {}));
  let memory = Object.assign({ enabled: true, items: [] }, load(STORE.memory, {}));
  let projects = load(STORE.projects, []);
  let activeTool = null; // "search" | "image"
  if (settings.model && !settings.model.includes(":")) settings.model = "groq:" + settings.model;
  let models = [];
  let currentId = null;
  let controller = null;
  let pendingFiles = [];   // {name, text}
  let pendingImages = [];  // {name, dataUrl}

  const persistChats = () => save(STORE.chats, chats);
  const persistSettings = () => save(STORE.settings, settings);
  const persistMemory = () => save(STORE.memory, memory);
  const persistProjects = () => save(STORE.projects, projects);
  const activeProject = () => projects.find((p) => p.id === settings.project) || null;
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
  const isDesign = (b) => !!b && b.lang === "design";
  const isFile = (b) => !!b && VastFiles.FILE_LANGS.includes(b.lang);
  const isArtifact = (b) => isFile(b) || PREVIEW_LANGS.includes(b.lang) || b.code.split("\n").length >= ARTIFACT_MIN_LINES;
  const canPreview = (b) => isFile(b) || PREVIEW_LANGS.includes(b.lang);
  const specOf = (b) => { try { return VastFiles.parseSpec(b.code); } catch { return null; } };

  function fileNameFor(b, text) {
    if (isFile(b)) { const sp = b.closed && specOf(b); return sp ? VastFiles.fileName(b.lang, sp) : VastFiles.LABEL[b.lang]; }
    if (isDesign(b)) {
      const t = (b.code.match(/<title>([^<]{1,60})<\/title>/i) || [])[1];
      return t ? t.trim() : "Design";
    }
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
      if (block && block.lang === "memory") {
        const pill = document.createElement("div");
        pill.className = "mem-pill"; pill.textContent = block.closed ? "🧠 Memory updated" : "🧠 Updating memory...";
        pre.replaceWith(pill);
        return;
      }
      if (block && block.lang === "image") {
        pre.replaceWith(imageCard(block, opts.streaming && !block.closed));
        return;
      }
      if (block && isFile(block)) {
        const card = document.createElement("div");
        card.className = "artifact-card file-card";
        card.dataset.block = idx;
        const live = opts.streaming && !block.closed;
        const sp = !live && specOf(block);
        const sub = live ? `Creating ${VastFiles.LABEL[block.lang]}...` : sp ? `${VastFiles.LABEL[block.lang]} · ${VastFiles.summary(block.lang, sp)} · click to preview` : "Could not build this file. Try Regenerate.";
        card.innerHTML = `<div class="art-ic file-ic" style="background:${VastFiles.ICON_BG[block.lang]}">${VastFiles.ICON[block.lang]}</div>` +
          `<div class="art-text"><div class="art-name">${escapeHtml(sp ? VastFiles.fileName(block.lang, sp) : VastFiles.LABEL[block.lang])}</div><div class="art-sub ${live ? "live" : ""}">${escapeHtml(sub)}</div></div>` +
          (sp ? `<button class="dl-file" title="Download">⤓ Download</button>` : "");
        pre.replaceWith(card);
        return;
      }
      if (block && isDesign(block)) {
        const card = document.createElement("div");
        card.className = "artifact-card file-card";
        card.dataset.block = idx;
        const live = opts.streaming && !block.closed;
        card.innerHTML = `<div class="art-ic file-ic" style="background:linear-gradient(135deg,#f59e0b,#ec4899)">🎨</div>` +
          `<div class="art-text"><div class="art-name">${escapeHtml(fileNameFor(block))}</div><div class="art-sub ${live ? "live" : ""}">${live ? "Designing... " + block.code.split("\n").length + " lines" : "Design · click to preview"}</div></div>` +
          (live ? "" : `<button class="dl-file" data-png="1" title="Download PNG">⤓ PNG</button>`);
        pre.replaceWith(card);
        return;
      }
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

  /* ---------- Image generation (Pollinations, free, no key) ---------- */
  const hashSeed = (t) => { let h = 7; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 1000000; };
  function imageSpec(block) {
    let sp; try { sp = VastFiles.parseSpec(block.code); } catch { sp = { prompt: block.code }; }
    const prompt = String(sp.prompt || sp.description || block.code).slice(0, 900);
    const w = Math.min(1536, Math.max(256, Number(sp.width) || 1024)), h = Math.min(1536, Math.max(256, Number(sp.height) || 1024));
    return { prompt, w, h, seed: Number(sp.seed) || hashSeed(prompt) };
  }
  const imageUrl = (sp, bust) => `https://image.pollinations.ai/prompt/${encodeURIComponent(sp.prompt)}?width=${sp.w}&height=${sp.h}&seed=${sp.seed}&nologo=true&model=flux${bust ? "&r=" + bust : ""}`;

  function imageCard(block, live) {
    const box = document.createElement("div");
    box.className = "gen-image";
    if (live) { box.innerHTML = `<div class="frame"><div class="loading"><span class="spin-big"></span>🎨 Writing image prompt...</div></div>`; return box; }
    const sp = imageSpec(block);
    box.dataset.prompt = sp.prompt; box.dataset.w = sp.w; box.dataset.h = sp.h; box.dataset.seed = sp.seed;
    box.innerHTML = `<div class="frame" style="aspect-ratio:${sp.w}/${sp.h}"><div class="loading">🎨 Creating image...<small>Free service, can take 10-30 seconds</small></div></div>` +
      `<div class="actions"><button data-img="download">⤓ Download</button><button data-img="open">↗ Open</button><button data-img="retry">↻ New version</button></div>` +
      `<div class="cap"></div>`;
    box.querySelector(".cap").textContent = sp.prompt.length > 140 ? sp.prompt.slice(0, 140) + "..." : sp.prompt;
    return box;
  }

  // Load images after markdown is inserted into the DOM
  function hydrateImages(root) {
    root.querySelectorAll(".gen-image[data-prompt]:not([data-loaded])").forEach((box) => {
      box.dataset.loaded = "1";
      loadGenImage(box, 0);
    });
  }
  function loadGenImage(box, attempt) {
    const sp = { prompt: box.dataset.prompt, w: box.dataset.w, h: box.dataset.h, seed: box.dataset.seed };
    const img = new Image();
    img.alt = sp.prompt;
    img.onload = () => { const f = box.querySelector(".frame"); f.innerHTML = ""; f.appendChild(img); box.dataset.src = img.src; };
    img.onerror = () => {
      if (attempt < 3) { setTimeout(() => loadGenImage(box, attempt + 1), 8000 * (attempt + 1)); box.querySelector(".loading").firstChild.textContent = "⏳ Image service busy, retrying... "; return; }
      box.querySelector(".frame").innerHTML = `<div class="loading">⚠ Could not create the image right now.<small>Click "New version" to try again.</small></div>`;
    };
    img.src = imageUrl(sp, attempt ? Date.now() : 0);
  }

  async function imageAction(box, act) {
    if (act === "retry") {
      box.dataset.seed = Math.floor(Math.random() * 1000000);
      box.querySelector(".frame").innerHTML = `<div class="loading">🎨 Creating a new version...<small>Free service, can take 10-30 seconds</small></div>`;
      loadGenImage(box, 0); return;
    }
    const src = box.dataset.src;
    if (!src) { toast("Image is still loading"); return; }
    if (act === "open") { window.open(src, "_blank"); return; }
    try {
      const blob = await (await fetch(src)).blob();
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = (box.dataset.prompt.slice(0, 40).replace(/[^\w\s-]/g, "").trim() || "vastai-image") + ".jpg"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch { window.open(src, "_blank"); }
  }

  el.messages.addEventListener("click", (e) => {
    const imgBtn = e.target.closest("[data-img]");
    if (imgBtn) { imageAction(imgBtn.closest(".gen-image"), imgBtn.dataset.img); return; }
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
      if (block && e.target.closest(".dl-file")) {
        if (isDesign(block)) { openPanel(block, { preview: true }); exportDesign(e.target.closest(".dl-file")); return; }
        downloadFile(block, e.target.closest(".dl-file")); return;
      }
      if (block) openPanel(block, { preview: canPreview(block) && block.closed });
    }
  });

  /* ---------- Panel ---------- */
  let panelBlock = null;

  async function downloadFile(b, btn) {
    const sp = specOf(b);
    if (!sp) { toast("This file data is broken. Try Regenerate."); return; }
    const label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Building..."; }
    try { await VastFiles.download(b.lang, sp); toast("Downloaded " + VastFiles.fileName(b.lang, sp)); }
    catch (err) { toast(err.message || "Could not build file"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }

  const DESIGN_HELPER = `<style>html,body{margin:0!important;background:#e5e7eb!important;overflow-x:hidden}#__wrap{position:relative;margin:16px auto}#__wrap>#design,#__wrap>*{position:absolute!important;left:0;top:0}</style>
<script>
(function(){
  function target(){ return document.getElementById('design') || document.body.firstElementChild; }
  function fit(){
    var d = target(); if (!d) return;
    if (!document.getElementById('__wrap')) { var w = document.createElement('div'); w.id='__wrap'; d.parentNode.insertBefore(w, d); w.appendChild(d); }
    var wrap = document.getElementById('__wrap');
    d.style.transform = 'none'; d.style.flexShrink = '0';
    var W = d.offsetWidth, H = d.offsetHeight, s = Math.min(1, (window.innerWidth - 32) / W);
    d.style.transformOrigin = 'top left'; d.style.transform = 'scale(' + s + ')';
    wrap.style.height = (H * s) + 'px'; wrap.style.width = (W * s) + 'px';
  }
  window.addEventListener('load', fit); window.addEventListener('resize', fit); setTimeout(fit, 50);
  function lib(){ return new Promise(function(res, rej){ if (window.htmlToImage) return res();
    var s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js'; s.onload = res; s.onerror = function(){ rej(new Error('Could not load image exporter')); }; document.head.appendChild(s); }); }
  window.addEventListener('message', function(e){
    if (e.data !== 'vast-export') return;
    var d = target(); var prev = d.style.transform; d.style.transform = 'none';
    lib().then(function(){ return document.fonts ? document.fonts.ready : null; }).then(function(){
      return htmlToImage.toPng(d, { pixelRatio: 2, width: d.offsetWidth, height: d.offsetHeight, cacheBust: false,
        imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' });
    }).then(function(url){ parent.postMessage({ type: 'vast-png', url: url }, '*'); })
      .catch(function(err){ parent.postMessage({ type: 'vast-png', error: String(err && err.message || err) }, '*'); })
      .then(function(){ d.style.transform = prev; fit(); });
  });
})();
<\/script>`;

  function designDoc(code) {
    let html = /<html[\s>]/i.test(code) ? code : `<!doctype html><html><head><meta charset="utf-8"></head><body>${code}</body></html>`;
    if (!/<meta[^>]+viewport/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + '<meta name="viewport" content="width=device-width,initial-scale=1">');
    return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, DESIGN_HELPER + "</body>") : html + DESIGN_HELPER;
  }

  let exportWaiter = null;
  window.addEventListener("message", (e) => {
    if (!e.data || e.data.type !== "vast-png" || !exportWaiter) return;
    const w = exportWaiter; exportWaiter = null; w(e.data);
  });
  async function exportDesign(btn) {
    if (!panelBlock || !isDesign(panelBlock)) return;
    const label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Rendering..."; }
    toast("Rendering PNG...");
    try {
      if (!el.panel.classList.contains("show-preview")) setTab("preview");
      await new Promise((res) => { if (el.panelFrame.contentDocument === null || el.panelFrame.dataset.ready === "1") return setTimeout(res, 600); el.panelFrame.addEventListener("load", () => setTimeout(res, 800), { once: true }); setTimeout(res, 4000); });
      const result = await new Promise((res) => { exportWaiter = res; el.panelFrame.contentWindow.postMessage("vast-export", "*"); setTimeout(() => { if (exportWaiter === res) { exportWaiter = null; res({ error: "Timed out" }); } }, 45000); });
      if (result.error) throw new Error(result.error);
      const a = document.createElement("a");
      a.href = result.url; a.download = fileNameFor(panelBlock).replace(/[\\/:*?"<>|]+/g, "") + ".png"; a.click();
      toast("PNG downloaded");
    } catch (err) { toast("PNG export failed: " + err.message + ". Try Open ↗ and screenshot."); }
    finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }

  function buildPreviewDoc(b) {
    if (isDesign(b)) return designDoc(b.code);
    if (isFile(b)) { const sp = specOf(b); return sp ? VastFiles.previewHtml(b.lang, sp) : "<p style='font-family:sans-serif;padding:20px'>Could not read this file data.</p>"; }
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
    if (tab === "preview" && panelBlock) {
      el.panelFrame.dataset.ready = "0";
      el.panelFrame.onload = () => (el.panelFrame.dataset.ready = "1");
      el.panelFrame.srcdoc = buildPreviewDoc(panelBlock);
    }
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
    if (isFile(panelBlock)) return downloadFile(panelBlock, null);
    if (isDesign(panelBlock)) return exportDesign(null);
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
    const pid = settings.project;
    const list = chats
      .filter((c) => !pid || c.projectId === pid)
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
      row.innerHTML = `<div class="avatar">V</div><div class="body"><div class="md"></div><div class="msg-tools"><button data-act="copy">Copy</button><button data-act="speak">🔊 Read</button><button data-act="regen">Regenerate</button><span class="model-tag"></span></div></div>`;
      row._getText = () => m.content;
      row.querySelector(".md").innerHTML = renderMarkdown(m.content, { artifacts: true });
      hydrateImages(row);
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
      if (act === "speak") speak(m.content, e.target);
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

  const searchModel = () => {
    const cur = findModel(settings.model);
    if (cur && /gpt-oss/i.test(cur.id) && cur.provider === "groq") return cur;
    return models.find((m) => m.key === "groq:openai/gpt-oss-120b") || models.find((m) => m.provider === "groq" && /gpt-oss/i.test(m.id) && !/safeguard/i.test(m.id));
  };

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
  document.querySelectorAll("#attachMenu button").forEach((b) => (b.onclick = () => {
    el.attachWrap.classList.remove("open");
    if (b.dataset.tool) { setTool(activeTool === b.dataset.tool ? null : b.dataset.tool); el.input.focus(); return; }
    inputs[b.dataset.kind].click();
  }));
  document.addEventListener("click", (e) => {
    if (!el.attachWrap.contains(e.target)) el.attachWrap.classList.remove("open");
    if (!el.picker.contains(e.target)) el.picker.classList.remove("open");
    if (!$("exportWrap").contains(e.target)) $("exportWrap").classList.remove("open");
  });

  function setTool(t) {
    activeTool = t;
    const chips = $("toolChips"); chips.innerHTML = "";
    document.querySelectorAll("#attachMenu [data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
    if (!t) { el.input.placeholder = "Message VastAI"; return; }
    const label = t === "search" ? "🌐 Web search" : "🎨 Create image";
    el.input.placeholder = t === "search" ? "Search the web for..." : "Describe the image you want...";
    const chip = document.createElement("span"); chip.className = "tool-chip";
    chip.innerHTML = `${label} <b title="Remove">✕</b>`;
    chip.querySelector("b").onclick = () => setTool(null);
    chips.appendChild(chip);
  }

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
      c = { id: uid(), title: (text || pendingImages[0]?.name || pendingFiles[0].name).slice(0, 48), messages: [], created: Date.now(), updated: Date.now(), projectId: settings.project || null };
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
    const tool = activeTool;
    if (tool === "image") setTool(null);
    if (tool === "search") {
      const sm = searchModel();
      if (!sm) { toast("Web search needs a gpt-oss model on Groq"); streamReply(c, useModel); return; }
      streamReply(c, sm, { search: true });
      return;
    }
    streamReply(c, useModel, { imageMode: tool === "image" });
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

  // Which rule sets this turn needs: from the latest user text plus what the previous reply produced
  function intents(c, opts) {
    const lastUser = [...c.messages].reverse().find((m) => m.role === "user");
    const text = lastUser ? (lastUser.display || lastUser.content).slice(0, 2000) : "";
    const prev = [...c.messages].reverse().find((m) => m.role === "assistant");
    const prevLangs = prev ? extractBlocks(prev.content).map((b) => b.lang) : [];
    const has = (langs) => prevLangs.some((l) => langs.includes(l));
    return {
      code: INTENT.code.test(text) || has(["html", "htm", "jsx", "tsx", "react", "svg", "css", "javascript", "js", "python", "dart"]),
      files: INTENT.files.test(text) || has(VastFiles.FILE_LANGS),
      visual: !!opts.imageMode || INTENT.visual.test(text) || has(["image", "design"]),
    };
  }

  function buildSystem(c, opts = {}) {
    const now = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });
    const need = intents(c, opts);
    let sys = settings.systemPrompt;
    if (need.code) sys += CODE_RULES;
    if (need.files) sys += VastFiles.RULES;
    if (need.visual) sys += IMAGE_RULES + DESIGN_RULES;
    if (!need.code && !need.files && !need.visual) sys += "\n\nYou can also build websites, create images and designs, and make PowerPoint, Word, Excel and PDF files when asked.";
    if (memory.enabled) {
      sys += MEMORY_RULES;
      const items = opts.compact ? memory.items.slice(-15) : memory.items.slice(-60);
      if (items.length) sys += "\n\nWhat you remember about the user:\n" + items.map((m) => "- " + m.text).join("\n");
    }
    const proj = projects.find((p) => p.id === c.projectId);
    if (proj) {
      sys += `\n\nThis chat is part of the project "${proj.name}".`;
      if (proj.instructions) sys += `\nProject instructions:\n${proj.instructions}`;
      if (proj.files?.length) sys += "\n\nProject files:\n" + proj.files.map((f) => `<file name="${f.name}">\n${f.text}\n</file>`).join("\n").slice(0, opts.compact ? 6000 : 30000);
    }
    if (opts.imageMode) sys += "\n\nThe user picked the Create image tool: reply with an image block, or a design block if the request has text on it.";
    if (opts.search) sys += "\n\nThe user turned on web search: search the web, then answer with up-to-date facts. Mention dates where relevant.";
    return sys + `\n\nCurrent date and time: ${now}.`;
  }

  // Rough input budget in characters (about 4 chars per token), sized for Groq free-tier limits
  function charBudget(model, compact) {
    let b = 36000;
    if (model.provider === "gemini") b = 300000;
    else if (/8b|7b|9b|mini|small|instant|gemma/i.test(model.id)) b = 20000;
    return compact ? Math.floor(b / 2) : b;
  }

  function collectSources(tools) {
    const out = [], seen = new Set();
    const walk = (o) => {
      if (!o || out.length >= 8) return;
      if (typeof o === "string") {
        if (/^\s*[\[{]/.test(o)) { try { walk(JSON.parse(o)); } catch {} }
        (o.match(/https?:\/\/[^\s"'<>)\]]+/g) || []).forEach((u) => add(u, ""));
        return;
      }
      if (Array.isArray(o)) return o.forEach(walk);
      if (typeof o === "object") {
        if (typeof o.url === "string") add(o.url, o.title || o.name || "");
        Object.values(o).forEach(walk);
      }
    };
    const add = (url, title) => {
      url = url.replace(/[.,;]+$/, "");
      if (seen.has(url) || out.length >= 8) return;
      seen.add(url);
      let host = url; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
      out.push({ url, title: String(title || host).slice(0, 70) });
    };
    walk(tools);
    return out;
  }

  // Apply memory blocks from a finished reply
  function applyMemory(text) {
    if (!memory.enabled) return;
    extractBlocks(text).filter((b) => b.lang === "memory" && b.closed).forEach((b) => {
      let sp; try { sp = VastFiles.parseSpec(b.code); } catch { return; }
      [].concat(sp.save || []).forEach((t) => {
        t = String(t).trim();
        if (t && !memory.items.some((m) => m.text.toLowerCase() === t.toLowerCase())) memory.items.push({ id: uid(), text: t, created: Date.now() });
      });
      [].concat(sp.forget || []).forEach((t) => {
        const q = String(t).toLowerCase();
        memory.items = memory.items.filter((m) => !(m.text.toLowerCase().includes(q) || q.includes(m.text.toLowerCase())));
      });
    });
    persistMemory();
  }

  // Strip markdown / code for speech
  function plainText(md) {
    return String(md).replace(/```[\s\S]*?```/g, " (code omitted) ").replace(/`([^`]+)`/g, "$1").replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*_>|~-]{1,3}/g, " ").replace(/\s+/g, " ").trim();
  }

  const shrinkOld = (t) => String(t)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (m, l, code) => (code.length > 1500 ? "```" + l + "\n" + code.slice(0, 600) + "\n... [rest of earlier code omitted]\n```" : m))
    .replace(/<file name="([^"]+)">\n([\s\S]*?)\n<\/file>/g, (m, n, body) => (body.length > 3000 ? `<file name="${n}">\n${body.slice(0, 3000)}\n... [rest of file omitted]\n</file>` : m))
    .replace(/<div class="sources">[\s\S]*?<\/div>/g, "");
  const cutMiddle = (t, max) => (t.length <= max ? t : t.slice(0, Math.floor(max * 0.7)) + "\n\n... [trimmed to fit] ...\n\n" + t.slice(-Math.floor(max * 0.25)));

  function buildHistory(c, model, budget) {
    const msgs = c.messages.slice(-MAX_HISTORY);
    const out = [];
    let used = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      const recent = i >= msgs.length - 2;
      let text = recent ? m.content : shrinkOld(m.content);
      const left = budget - used;
      if (text.length > left) {
        if (i === msgs.length - 1) text = cutMiddle(text, Math.max(2000, left));
        else break;
      }
      used += text.length;
      if (m.role === "user" && m.images?.length) {
        if (model.vision && recent) out.unshift({ role: "user", content: [{ type: "text", text }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))] });
        else out.unshift({ role: "user", content: `[User attached ${m.images.length} image(s)]\n${text}` });
      } else out.unshift({ role: m.role, content: text });
    }
    while (out.length && out[0].role === "assistant") out.shift();
    return out;
  }

  const isLengthError = (status, detail) => status === 413 || (status === 400 && /reduce the length|context|too long|too large|maximum|tokens/i.test(detail || ""));
  const bigModel = () => models.find((m) => m.key === "groq:openai/gpt-oss-120b") || models.find((m) => m.key === "groq:llama-3.3-70b-versatile") ||
    models.find((m) => m.provider === "gemini" && /flash/i.test(m.id)) || null;

  async function streamReply(c, model, opts = {}) {
    if (!model) { toast("No model available"); return; }
    const row = addMessageEl({ role: "assistant", content: "" });
    const mdEl = row.querySelector(".md");
    const tools = row.querySelector(".msg-tools"); tools.style.display = "none";
    mdEl.innerHTML = `<span class="thinking"><i></i><i></i><i></i></span>`;
    scrollBottom(true);

    const p = PROVIDERS[model.provider];
    const sysText = buildSystem(c, opts);
    const payload = {
      model: model.id, stream: true, temperature: Number(settings.temperature),
      messages: [{ role: "system", content: sysText }, ...buildHistory(c, model, Math.max(4000, charBudget(model, opts.compact) - sysText.length))],
    };
    // Automatic retry with a trimmed request (and a larger model if needed) when a request is too long
    const retryShorter = () => {
      finished = true; controller = null; row.remove();
      const next = opts.compact ? null : (charBudget(model) < 30000 ? bigModel() || model : model);
      if (!next) return false;
      toast(next === model ? "Message was too long, trimming and retrying..." : "Too long for " + model.id + ", retrying with " + next.id);
      streamReply(c, next, { ...opts, compact: true });
      return true;
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
      if (target && isArtifact(target) && !isFile(target)) {
        if (!autoOpened || el.panel.classList.contains("open")) { openPanel(target, { live: true }); autoOpened = true; }
      }
      scrollBottom();
    };

    try {
      if (opts.search) {
        mdEl.innerHTML = `<span class="status-line"><span class="spin"></span>Searching the web...</span>`;
        const body = { ...payload, stream: false, tools: [{ type: "browser_search" }], tool_choice: "required", reasoning_effort: "low",
          messages: payload.messages.map((m) => (Array.isArray(m.content) ? { role: m.role, content: m.content[0].text } : m)) };
        const r = await fetch(p.base + "/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.key() },
          body: JSON.stringify(body), signal: controller.signal,
        });
        if (!r.ok) {
          let detail = ""; try { detail = (await r.json()).error?.message || ""; } catch {}
          if (isLengthError(r.status, detail) && !opts.compact && retryShorter()) return;
          if (r.status === 429) throw new Error("Search limit reached for now. Wait a minute and try again. " + detail);
          throw new Error(`Search error ${r.status}: ${detail}`);
        }
        const j = await r.json();
        const msg = j.choices?.[0]?.message || {};
        full = String(msg.content || "").replace(/【[^】]*】/g, "").trim();
        const srcs = collectSources(msg.executed_tools);
        if (srcs.length) full += "\n\n<div class=\"sources\">" + srcs.map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">🔗 ${escapeHtml(s.title)}</a>`).join("") + "</div>";
      } else {
      const r = await fetch(p.base + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.key() },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      if (!r.ok) {
        let detail = ""; try { const j = await r.json(); detail = (Array.isArray(j) ? j[0] : j).error?.message || ""; } catch {}
        if (isLengthError(r.status, detail) && !opts.compact && retryShorter()) return;
        if (r.status === 401 || r.status === 403) throw new Error(`Invalid ${p.name} API key. Update it in Settings.`);
        if (r.status === 429) throw new Error("Free limit reached for now. Wait a minute or switch model. " + detail);
        if (isLengthError(r.status, detail)) throw new Error("This chat is too long for the free model. Start a new chat (your files can be re-attached).");
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
    hydrateImages(row);
    applyMemory(full);
    const m = { role: "assistant", content: full, model: model.key };
    c.messages.push(m); c.updated = Date.now(); persistChats(); renderChatList();
    if (settings.autoSpeak && full !== "_(stopped)_") speak(full);
    row._getText = () => m.content;
    row.querySelector(".model-tag").textContent = model.id;
    tools.style.display = ""; bindTools(row, m);

    // Finalise panel: show the last artifact, switch to preview when possible
    {
      const arts = extractBlocks(full).filter(isArtifact);
      const best = arts.filter(isFile).pop() || arts.filter(canPreview).pop() || arts.pop();
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
    $("autoSpeak").checked = !!settings.autoSpeak;
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
    settings.autoSpeak = $("autoSpeak").checked;
    persistSettings(); el.modal.classList.remove("open"); toast("Settings saved");
    if (keysChanged) loadModels();
  };
  $("clearAll").onclick = () => {
    if (!confirm("Delete ALL chats? This cannot be undone.")) return;
    chats = []; persistChats(); newChat(); el.modal.classList.remove("open"); toast("All chats deleted");
  };


  /* ---------- Voice: read aloud ---------- */
  let speakingBtn = null;
  function speak(text, btn) {
    if (!("speechSynthesis" in window)) { toast("Read aloud is not supported in this browser"); return; }
    const wasThis = speakingBtn && speakingBtn === btn;
    speechSynthesis.cancel();
    if (speakingBtn) speakingBtn.textContent = "🔊 Read";
    speakingBtn = null;
    if (wasThis) return;
    const u = new SpeechSynthesisUtterance(plainText(text).slice(0, 6000));
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find((v) => /en-(GB|NG|US)/i.test(v.lang) && /natural|google|online/i.test(v.name)) || voices.find((v) => /^en/i.test(v.lang)) || null;
    u.rate = 1.03;
    if (btn) { speakingBtn = btn; btn.textContent = "⏹ Stop"; }
    u.onend = u.onerror = () => { if (btn) btn.textContent = "🔊 Read"; if (speakingBtn === btn) speakingBtn = null; };
    speechSynthesis.speak(u);
  }
  if ("speechSynthesis" in window) speechSynthesis.getVoices();

  /* ---------- Voice: speech to text (Groq Whisper) ---------- */
  let recorder = null, chunks = [];
  const micBtn = $("micBtn");
  micBtn.onclick = async () => {
    if (recorder && recorder.state === "recording") { recorder.stop(); return; }
    if (!settings.apiKey) { openSettings(); toast("Add your Groq key to use voice"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
      recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        micBtn.classList.remove("rec"); micBtn.classList.add("busy"); micBtn.textContent = "⏳";
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (blob.size < 2000) throw new Error("Recording too short");
          const ext = (recorder.mimeType || "").includes("mp4") ? "m4a" : (recorder.mimeType || "").includes("ogg") ? "ogg" : "webm";
          const fd = new FormData();
          fd.append("file", blob, "voice." + ext);
          fd.append("model", "whisper-large-v3-turbo");
          fd.append("response_format", "json");
          const r = await fetch(PROVIDERS.groq.base + "/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + settings.apiKey }, body: fd });
          if (!r.ok) throw new Error("Transcription failed (" + r.status + ")");
          const text = ((await r.json()).text || "").trim();
          if (text) { el.input.value = (el.input.value ? el.input.value + " " : "") + text; autoGrow(); updateSend(); el.input.focus(); }
          else toast("Didn't catch that, try again");
        } catch (err) { toast(err.message); }
        micBtn.classList.remove("busy"); micBtn.textContent = "🎤";
      };
      recorder.start();
      micBtn.classList.add("rec"); micBtn.textContent = "⏹"; micBtn.title = "Stop recording";
      toast("Listening... tap again to stop");
    } catch { toast("Microphone permission denied"); }
  };

  /* ---------- Export chat ---------- */
  $("exportBtn").onclick = (e) => { e.stopPropagation(); $("exportWrap").classList.toggle("open"); };
  document.querySelectorAll("#exportMenu [data-fmt]").forEach((b) => (b.onclick = () => { $("exportWrap").classList.remove("open"); exportChat(b.dataset.fmt); }));

  const cleanForExport = (t) => String(t || "").replace(/<div class="sources">[\s\S]*?<\/div>/g, "").replace(/```memory[\s\S]*?```/g, "").trim();
  async function exportChat(fmt) {
    const c = current();
    if (!c || !c.messages.length) { toast("Open a chat to export"); return; }
    const date = new Date(c.created || Date.now()).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    if (fmt === "md") {
      const md = `# ${c.title}\n\n_Exported from VastAI · ${date}_\n\n` + c.messages.map((m) =>
        `## ${m.role === "user" ? "You" : "VastAI"}\n\n${m.role === "user" ? (m.display || m.content) : cleanForExport(m.content)}`).join("\n\n---\n\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
      a.download = c.title.replace(/[\\/:*?"<>|]+/g, "") + ".md"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      return;
    }
    const spec = {
      filename: c.title, title: c.title, subtitle: `Exported from VastAI · ${date}`,
      sections: c.messages.map((m) => ({
        heading: m.role === "user" ? "You" : "VastAI",
        paragraphs: plainExport(m.role === "user" ? (m.display || m.content) : cleanForExport(m.content)),
      })),
    };
    toast("Building " + (fmt === "pdf" ? "PDF" : "Word file") + "...");
    try { await VastFiles.download(fmt, spec); } catch (err) { toast(err.message || "Export failed"); }
  }
  function plainExport(t) {
    return String(t).replace(/```(\w+)?\n([\s\S]*?)```/g, (_, l, code) => `[${l || "code"}]\n${code}`)
      .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/^#+\s*/gm, "")
      .split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  }

  /* ---------- Memory UI ---------- */
  function renderMemory() {
    $("memoryEnabled").checked = memory.enabled;
    const list = $("memoryList"); list.innerHTML = "";
    if (!memory.items.length) list.innerHTML = `<small class="muted">Nothing saved yet. Try telling VastAI "Remember that I'm based in Lagos".</small>`;
    memory.items.slice().reverse().forEach((m) => {
      const row = document.createElement("div"); row.className = "mem-item";
      row.innerHTML = `<span></span><button title="Forget">🗑</button>`;
      row.querySelector("span").textContent = m.text;
      row.querySelector("button").onclick = () => { memory.items = memory.items.filter((x) => x.id !== m.id); persistMemory(); renderMemory(); };
      list.appendChild(row);
    });
  }
  $("openMemory").onclick = () => { renderMemory(); $("memoryModal").classList.add("open"); closeSidebar(); };
  $("closeMemory").onclick = () => $("memoryModal").classList.remove("open");
  $("memoryModal").onclick = (e) => { if (e.target.id === "memoryModal") $("memoryModal").classList.remove("open"); };
  $("memoryEnabled").onchange = (e) => { memory.enabled = e.target.checked; persistMemory(); toast(memory.enabled ? "Memory on" : "Memory off"); };
  const addMemory = () => {
    const t = $("memoryInput").value.trim(); if (!t) return;
    memory.items.push({ id: uid(), text: t, created: Date.now() }); persistMemory();
    $("memoryInput").value = ""; renderMemory();
  };
  $("memoryAdd").onclick = addMemory;
  $("memoryInput").onkeydown = (e) => { if (e.key === "Enter") addMemory(); };

  /* ---------- Projects ---------- */
  let editingProject = null, projectDraftFiles = [];
  function renderProjects() {
    const box = $("projectList"); box.innerHTML = "";
    const mk = (id, name, icon) => {
      const b = document.createElement("button");
      b.className = "project-item" + ((settings.project || null) === id ? " active" : "");
      b.innerHTML = `<span>${icon}</span><span class="title"></span>${id ? '<span class="edit" title="Edit">✎</span>' : ""}`;
      b.querySelector(".title").textContent = name;
      b.onclick = (e) => {
        if (e.target.classList.contains("edit")) { openProject(projects.find((p) => p.id === id)); return; }
        settings.project = id; persistSettings(); renderProjects(); newChat();
      };
      box.appendChild(b);
    };
    mk(null, "All chats", "💬");
    projects.forEach((p) => mk(p.id, p.name, "📁"));
    const ap = activeProject();
    $("projectChip").hidden = !ap;
    if (ap) $("projectChip").textContent = "📁 " + ap.name;
  }
  function openProject(p) {
    editingProject = p || null;
    projectDraftFiles = p ? [...(p.files || [])] : [];
    $("projectModalTitle").textContent = p ? "Edit project" : "New project";
    $("projectName").value = p ? p.name : "";
    $("projectInstructions").value = p ? p.instructions || "" : "";
    $("projectDelete").style.visibility = p ? "visible" : "hidden";
    renderProjectFiles();
    $("projectModal").classList.add("open"); closeSidebar();
  }
  function renderProjectFiles() {
    const box = $("projectFiles"); box.innerHTML = "";
    projectDraftFiles.forEach((f, i) => {
      const row = document.createElement("div"); row.className = "file-chip";
      row.innerHTML = `<span></span><b title="Remove">✕</b>`;
      row.querySelector("span").textContent = "📄 " + f.name;
      row.querySelector("b").onclick = () => { projectDraftFiles.splice(i, 1); renderProjectFiles(); };
      box.appendChild(row);
    });
  }
  $("newProjectBtn").onclick = () => openProject(null);
  $("closeProject").onclick = () => $("projectModal").classList.remove("open");
  $("projectModal").onclick = (e) => { if (e.target.id === "projectModal") $("projectModal").classList.remove("open"); };
  $("projectAddFile").onclick = () => $("projectFileInput").click();
  $("projectFileInput").onchange = async (e) => {
    for (const f of e.target.files) {
      try {
        let text = f.name.toLowerCase().endsWith(".pdf") ? await readPdf(f) : await f.text();
        projectDraftFiles.push({ name: f.name, text: text.slice(0, 30000) });
      } catch { toast("Could not read " + f.name); }
    }
    e.target.value = ""; renderProjectFiles();
  };
  $("projectSave").onclick = () => {
    const name = $("projectName").value.trim();
    if (!name) { toast("Give the project a name"); return; }
    const data = { name, instructions: $("projectInstructions").value.trim(), files: projectDraftFiles };
    if (editingProject) Object.assign(editingProject, data);
    else { const p = { id: uid(), created: Date.now(), ...data }; projects.push(p); settings.project = p.id; persistSettings(); }
    persistProjects(); $("projectModal").classList.remove("open"); renderProjects();
    if (!editingProject) newChat(); else renderChatList();
    toast("Project saved");
  };
  $("projectDelete").onclick = () => {
    if (!editingProject || !confirm(`Delete project "${editingProject.name}"? Its chats move to All chats.`)) return;
    chats.forEach((c) => { if (c.projectId === editingProject.id) c.projectId = null; });
    projects = projects.filter((p) => p.id !== editingProject.id);
    if (settings.project === editingProject.id) settings.project = null;
    persistProjects(); persistChats(); persistSettings();
    $("projectModal").classList.remove("open"); renderProjects(); newChat();
  };

  /* ---------- Install as app (PWA) ---------- */
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("installBtn").hidden = false; });
  $("installBtn").onclick = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice; installEvt = null; $("installBtn").hidden = true;
  };
  window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; toast("VastAI installed"); });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

  /* ---------- Init ---------- */
  if (settings.project && !activeProject()) settings.project = null;
  renderProjects(); renderChatList(); updateSend(); loadModels();
  if (!settings.apiKey) setTimeout(openSettings, 400);
})();
