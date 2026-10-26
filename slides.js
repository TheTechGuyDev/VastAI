/* VastAI slide engine: one layout model rendered to both a real .pptx (PptxGenJS) and an identical HTML preview */
(() => {
  const W = 13.333, H = 7.5, FONT = "Segoe UI";
  const arr = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
  const str = (v) => (v == null ? "" : typeof v === "object" ? (v.text || v.title || v.label || JSON.stringify(v)) : String(v));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hex = (c, d) => { const v = String(c || "").replace("#", ""); return /^[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : d; };
  const mix = (a, b, t) => [0, 2, 4].map((i) => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, "0")).join("").toUpperCase();

  // Pick the largest font size (pt) that fits text in a w x h inch box
  function fit(text, w, h, max, min = 10, lh = 1.22) {
    const paras = String(text || "").split("\n");
    for (let s = max; s > min; s -= 1) {
      const cpl = Math.max(1, (w * 72) / (s * 0.53));
      const lines = paras.reduce((n, p) => n + Math.max(1, Math.ceil(p.length / cpl)), 0);
      if ((lines * s * lh) / 72 <= h) return s;
    }
    return min;
  }

  // Normalise list items: strings, {title, description}, {text}
  function items(s) {
    const raw = arr(s.bullets || s.points || s.items || s.content || s.steps);
    return raw.map((b) => {
      if (b && typeof b === "object") return { title: str(b.title || b.heading || b.label || ""), desc: str(b.description || b.desc || b.text || b.detail || "") };
      const t = str(b), k = t.indexOf(": ");
      return k > 0 && k < 40 ? { title: t.slice(0, k), desc: t.slice(k + 2) } : { title: "", desc: t };
    });
  }
  const itemText = (it) => (it.title ? it.title + (it.desc ? ": " + it.desc : "") : it.desc);

  /* ---------- Layout: deck spec -> slides of shapes ---------- */
  function layoutDeck(spec) {
    const t = spec.theme || {};
    const C = { p: hex(t.primary, "10B981"), dark: hex(t.dark, "0F172A"), text: hex(t.text, "1E293B"), muted: hex(t.muted, "64748B") };
    C.pl = mix(C.p, "FFFFFF", 0.86); C.pm = mix(C.p, "FFFFFF", 0.4); C.card = "F8FAFC"; C.line = "E2E8F0";
    const deckTitle = str(spec.title);
    const slides = arr(spec.slides).filter((s) => s && typeof s === "object");
    let sectionNo = 0;

    return slides.map((s, i) => {
      const L = String(s.layout || (i === 0 ? "title" : "bullets")).toLowerCase().replace(/_/g, "-");
      const sh = [];
      const rect = (x, y, w, h, fill, o = {}) => sh.push({ k: "rect", x, y, w, h, fill, ...o });
      const oval = (x, y, w, h, fill, o = {}) => sh.push({ k: "oval", x, y, w, h, fill, ...o });
      const text = (x, y, w, h, value, o = {}) => sh.push({ k: "text", x, y, w, h, text: value, size: 16, color: C.text, ...o });
      const title = str(s.title);

      if (L === "title" || L === "closing") {
        const center = L === "closing";
        oval(8.4, -2.4, 7.8, 7.8, C.p, { alpha: 82 });
        oval(10.8, 3.8, 4.8, 4.8, C.p, { alpha: 62 });
        oval(9.3, 5.7, 1.1, 1.1, "FFFFFF", { alpha: 88 });
        if (center) oval(-1.6, -1.8, 4.2, 4.2, C.p, { alpha: 85 });
        const kick = str(s.kicker || (i === 0 ? spec.kicker || spec.date : ""));
        if (kick && !center) {
          const kw = Math.min(6, kick.length * 0.105 + 0.6);
          rect(0.9, 1.75, kw, 0.44, C.p, { radius: 0.22 });
          text(0.9, 1.75, kw, 0.44, kick.toUpperCase(), { size: 11, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
        }
        const tx = center ? 1.2 : 0.9, tw = center ? W - 2.4 : 8.2;
        text(tx, center ? 2.3 : 2.35, tw, 2.2, title, { size: fit(title, tw, 2.2, 54, 30, 1.1), bold: true, color: "FFFFFF", valign: "bottom", align: center ? "center" : "left" });
        rect(center ? W / 2 - 0.7 : 0.9, 4.75, 1.4, 0.09, C.p);
        if (s.subtitle) text(tx, 5.0, tw, 1.1, str(s.subtitle), { size: fit(str(s.subtitle), tw, 1.1, 20, 13), color: "CBD5E1", align: center ? "center" : "left" });
        return { bg: C.dark, shapes: sh, notes: str(s.notes) };
      }

      if (L === "section") {
        sectionNo++;
        oval(9.4, 1.0, 6, 6, "FFFFFF", { alpha: 88 });
        oval(11.2, -1.2, 2.6, 2.6, "FFFFFF", { alpha: 82 });
        text(0.9, 1.0, 4, 2.3, String(sectionNo).padStart(2, "0"), { size: 110, bold: true, color: C.pm, valign: "bottom" });
        text(0.9, 3.55, 9.5, 1.4, title, { size: fit(title, 9.5, 1.4, 44, 28, 1.1), bold: true, color: "FFFFFF", valign: "top" });
        if (s.subtitle) text(0.9, 5.05, 9.5, 0.9, str(s.subtitle), { size: 18, color: mix(C.p, "FFFFFF", 0.78) });
        return { bg: C.p, shapes: sh, notes: str(s.notes) };
      }

      // ----- Content slides: shared frame -----
      oval(11.4, -1.1, 2.6, 2.6, C.pl);
      oval(12.5, 0.9, 0.7, 0.7, C.p, { alpha: 70 });
      const kick = str(s.kicker || deckTitle);
      if (kick) text(0.7, 0.45, 9.5, 0.32, kick.toUpperCase(), { size: 11, bold: true, color: C.p });
      text(0.7, 0.78, 10.4, 0.95, title, { size: fit(title, 10.4, 0.95, 32, 20, 1.1), bold: true, color: C.dark, valign: "middle" });
      rect(0.7, 6.98, 0.14, 0.14, C.p, { radius: 0.03 });
      if (deckTitle) text(0.95, 6.9, 8, 0.3, deckTitle, { size: 10, color: C.muted, valign: "middle" });
      text(W - 1.3, 6.9, 0.6, 0.3, String(i + 1), { size: 10, color: C.muted, align: "right", valign: "middle" });
      const X = 0.7, BW = W - 1.4;
      let top = 1.95; const bottom = 6.65;
      if (s.text && L !== "quote") {
        const ih = 0.7;
        text(X, top, BW, ih, str(s.text), { size: fit(str(s.text), BW, ih, 17, 12), color: C.muted, valign: "top" });
        top += ih + 0.15;
      }
      const bodyH = bottom - top;
      const list = items(s);

      if (L === "stats" || L === "metrics") {
        const st = arr(s.stats || s.metrics).slice(0, 8);
        const per = Math.min(4, st.length || 1), rows = Math.ceil(st.length / per), gap = 0.3;
        const cw = (BW - gap * (per - 1)) / per, ch = Math.min(2.5, (bodyH - gap * (rows - 1)) / rows);
        st.forEach((x, k) => {
          const cx = X + (k % per) * (cw + gap), cy = top + 0.1 + Math.floor(k / per) * (ch + gap);
          const val = str(x && x.value != null ? x.value : x), lab = str(x && x.label), desc = str(x && (x.description || x.desc));
          rect(cx, cy, cw, ch, C.card, { radius: 0.16, line: C.line });
          rect(cx, cy, cw, 0.09, C.p);
          text(cx + 0.3, cy + 0.35, cw - 0.6, ch * 0.42, val, { size: fit(val, cw - 0.6, ch * 0.42, 38, 16, 1.05), bold: true, color: C.p, valign: "bottom" });
          text(cx + 0.3, cy + 0.4 + ch * 0.42, cw - 0.6, 0.4, lab, { size: 14, bold: true, color: C.dark });
          if (desc) text(cx + 0.3, cy + 0.85 + ch * 0.42, cw - 0.6, ch * 0.58 - 1.0, desc, { size: 12, color: C.muted, valign: "top" });
        });
      } else if (L === "table") {
        const cols = arr(s.columns).map(str), rows = arr(s.rows).map((r) => arr(r).map(str));
        sh.push({ k: "table", x: X, y: top, w: BW, cols, rows, size: rows.length > 9 ? 11 : 13, C });
      } else if (L === "two-column" || L === "comparison") {
        const gap = 0.4, cw = (BW - gap) / 2;
        [["leftTitle", "left"], ["rightTitle", "right"]].forEach(([tk, lk], k) => {
          const cx = X + k * (cw + gap);
          rect(cx, top, cw, bodyH, k ? C.card : C.pl, { radius: 0.16, line: k ? C.line : undefined });
          let y = top + 0.35;
          if (s[tk]) { text(cx + 0.4, y, cw - 0.8, 0.5, str(s[tk]), { size: 20, bold: true, color: k ? C.dark : C.p }); y += 0.7; }
          const its = items({ bullets: s[lk] }).slice(0, 7);
          const rh = Math.min(0.75, (top + bodyH - 0.25 - y) / Math.max(1, its.length));
          its.forEach((it, j) => {
            oval(cx + 0.42, y + j * rh + 0.12, 0.13, 0.13, C.p);
            text(cx + 0.7, y + j * rh, cw - 1.1, rh, itemText(it), { size: fit(itemText(it), cw - 1.1, rh, 16, 10), color: C.text, valign: "top" });
          });
        });
      } else if (L === "timeline" || L === "process" || L === "steps") {
        const st = list.slice(0, 6), n = st.length || 1, seg = BW / n, ly = top + 1.2;
        rect(X + seg / 2, ly - 0.025, BW - seg, 0.05, C.pm);
        st.forEach((it, k) => {
          const cx = X + seg * k + seg / 2;
          oval(cx - 0.32, ly - 0.32, 0.64, 0.64, C.p);
          text(cx - 0.32, ly - 0.32, 0.64, 0.64, String(k + 1), { size: 16, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
          const head = it.title || it.desc, body = it.title ? it.desc : "";
          text(cx - seg / 2 + 0.1, ly + 0.55, seg - 0.2, 0.7, head, { size: fit(head, seg - 0.2, 0.7, 17, 11), bold: true, color: C.dark, align: "center", valign: "top" });
          if (body) text(cx - seg / 2 + 0.1, ly + 1.3, seg - 0.2, bottom - ly - 1.4, body, { size: fit(body, seg - 0.2, bottom - ly - 1.4, 14, 10), color: C.muted, align: "center", valign: "top" });
        });
      } else if (L === "quote") {
        text(0.9, 1.2, 1.5, 1.6, "“", { size: 140, bold: true, color: C.p, valign: "top" });
        const q = str(s.quote || s.text);
        text(1.9, 2.1, 9.6, 2.9, q, { size: fit(q, 9.6, 2.9, 32, 18, 1.3), italic: true, color: C.dark, valign: "middle" });
        if (s.author) text(1.9, 5.15, 9.6, 0.5, "— " + str(s.author), { size: 16, bold: true, color: C.muted });
      } else if (list.length && list.length <= 4 && list.every((it) => itemText(it).length <= 160)) {
        // Card grid
        const n = list.length, gap = 0.3, cw = (BW - gap * (n - 1)) / n, ch = Math.min(bodyH - 0.1, 3.1);
        list.forEach((it, k) => {
          const cx = X + k * (cw + gap), cy = top + 0.1;
          rect(cx, cy, cw, ch, C.card, { radius: 0.18, line: C.line });
          oval(cx + 0.35, cy + 0.35, 0.62, 0.62, C.p);
          text(cx + 0.35, cy + 0.35, 0.62, 0.62, String(k + 1).padStart(2, "0"), { size: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
          let y = cy + 1.2;
          if (it.title) { text(cx + 0.35, y, cw - 0.7, 0.75, it.title, { size: fit(it.title, cw - 0.7, 0.75, 19, 12, 1.1), bold: true, color: C.dark, valign: "top" }); y += 0.8; }
          const body = it.desc;
          text(cx + 0.35, y, cw - 0.7, cy + ch - y - 0.3, body, { size: fit(body, cw - 0.7, cy + ch - y - 0.3, it.title ? 15 : 18, 10), color: it.title ? C.muted : C.text, valign: "top" });
        });
      } else {
        // Numbered list, 1 or 2 columns
        const its = list.slice(0, 10), cols = its.length > 5 ? 2 : 1, per = Math.ceil(its.length / cols);
        const gap = 0.5, cw = (BW - gap * (cols - 1)) / cols, rh = Math.min(1.05, bodyH / Math.max(1, per));
        its.forEach((it, k) => {
          const cx = X + Math.floor(k / per) * (cw + gap), cy = top + (k % per) * rh;
          oval(cx, cy + 0.04, 0.46, 0.46, C.pl);
          text(cx, cy + 0.04, 0.46, 0.46, String(k + 1), { size: 13, bold: true, color: C.p, align: "center", valign: "middle" });
          const runs = it.title ? [{ text: it.title + (it.desc ? ": " : ""), bold: true, color: C.dark }, { text: it.desc, color: C.text }] : null;
          text(cx + 0.65, cy, cw - 0.7, rh - 0.1, itemText(it), { runs, size: fit(itemText(it), cw - 0.7, rh - 0.1, 18, 10), color: C.text, valign: "top" });
        });
      }
      return { bg: "FFFFFF", shapes: sh, notes: str(s.notes) };
    });
  }

  /* ---------- Render: PowerPoint ---------- */
  async function toPptx(spec) {
    const deck = layoutDeck(spec);
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = str(spec.title) || "Presentation";
    pptx.company = "VastAI";
    deck.forEach((d) => {
      const slide = pptx.addSlide();
      slide.background = { color: d.bg };
      if (d.notes) slide.addNotes(d.notes);
      d.shapes.forEach((s) => {
        if (s.k === "rect" || s.k === "oval") {
          const type = s.k === "oval" ? pptx.ShapeType.ellipse : s.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
          const opt = { x: s.x, y: s.y, w: s.w, h: s.h, fill: { color: s.fill, transparency: s.alpha || 0 },
            line: s.line ? { color: s.line, width: 1 } : { color: s.fill, width: 0, transparency: 100 } };
          if (s.radius) opt.rectRadius = s.radius;
          slide.addShape(type, opt);
        } else if (s.k === "text") {
          const base = { x: s.x, y: s.y, w: s.w, h: s.h, fontFace: FONT, fontSize: s.size, color: s.color, bold: !!s.bold, italic: !!s.italic,
            align: s.align || "left", valign: s.valign || "top", margin: 0, lineSpacingMultiple: 1.1 };
          const val = s.runs ? s.runs.map((r) => ({ text: r.text, options: { bold: !!r.bold, color: r.color || s.color } })) : String(s.text);
          slide.addText(val, base);
        } else if (s.k === "table") {
          const C = s.C, data = [];
          if (s.cols.length) data.push(s.cols.map((c) => ({ text: c, options: { bold: true, color: "FFFFFF", fill: { color: C.p } } })));
          s.rows.forEach((r, ri) => data.push((s.cols.length ? s.cols : r).map((_, ci) => ({ text: r[ci] ?? "", options: { color: C.text, fill: { color: ri % 2 ? C.card : "FFFFFF" } } }))));
          if (data.length) slide.addTable(data, { x: s.x, y: s.y, w: s.w, fontFace: FONT, fontSize: s.size, border: { type: "solid", color: C.line, pt: 1 },
            valign: "middle", margin: 0.08, autoPage: true, autoPageRepeatHeader: true, newSlideStartY: 0.6 });
        }
      });
    });
    return pptx.write({ outputType: "blob" });
  }

  /* ---------- Render: HTML preview (same coordinates) ---------- */
  const u = (inch) => `${((inch / W) * 100).toFixed(3)}cqw`;
  const pt = (p) => u(p / 72);
  const rgba = (h, alpha) => `rgba(${parseInt(h.substr(0, 2), 16)},${parseInt(h.substr(2, 2), 16)},${parseInt(h.substr(4, 2), 16)},${(1 - (alpha || 0) / 100).toFixed(2)})`;

  function toHtml(spec) {
    const deck = layoutDeck(spec);
    const slides = deck.map((d, i) => {
      const inner = d.shapes.map((s) => {
        const box = `left:${u(s.x)};top:${u(s.y)};width:${u(s.w)};${s.h ? `height:${u(s.h)};` : ""}`;
        if (s.k === "rect" || s.k === "oval") {
          const r = s.k === "oval" ? "50%" : s.radius ? u(s.radius) : "0";
          return `<div class="sh" style="${box}background:${rgba(s.fill, s.alpha)};border-radius:${r};${s.line ? `border:1px solid #${s.line};` : ""}"></div>`;
        }
        if (s.k === "text") {
          const jc = { top: "flex-start", middle: "center", bottom: "flex-end" }[s.valign || "top"];
          const content = s.runs ? s.runs.map((r) => `<span style="${r.bold ? "font-weight:700;" : ""}color:#${r.color || s.color}">${esc(r.text)}</span>`).join("") : esc(s.text);
          return `<div class="sh tx" style="${box}justify-content:${jc};text-align:${s.align || "left"};font-size:${pt(s.size)};color:#${s.color};${s.bold ? "font-weight:700;" : ""}${s.italic ? "font-style:italic;" : ""}"><div>${content}</div></div>`;
        }
        if (s.k === "table") {
          const C = s.C;
          return `<table class="sh" style="${box}font-size:${pt(s.size)}"><thead><tr>${s.cols.map((c) => `<th style="background:#${C.p}">${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
            s.rows.map((r, ri) => `<tr style="background:${ri % 2 ? "#" + C.card : "#fff"}">${(s.cols.length ? s.cols : r).map((_, ci) => `<td>${esc(r[ci] ?? "")}</td>`).join("")}</tr>`).join("") + `</tbody></table>`;
        }
        return "";
      }).join("");
      return `<div class="slide" style="background:#${d.bg}">${inner}</div><div class="cap">Slide ${i + 1} of ${deck.length}</div>`;
    }).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box} body{margin:0;background:#1f2937;font-family:"Segoe UI",system-ui,-apple-system,sans-serif}
      .wrap{max-width:1000px;margin:0 auto;padding:18px 14px 30px}
      .slide{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.35);container-type:inline-size}
      .sh{position:absolute} .tx{display:flex;flex-direction:column;line-height:1.18;white-space:pre-wrap;word-wrap:break-word;overflow:hidden}
      table.sh{border-collapse:collapse;color:#1e293b} table.sh th{color:#fff;text-align:left;font-weight:700} table.sh th,table.sh td{border:1px solid #e2e8f0;padding:${u(0.08)} ${u(0.1)}}
      .cap{color:#9ca3af;font-size:12px;text-align:center;margin:8px 0 20px}
    </style></head><body><div class="wrap">${slides || '<p style="color:#fff">No slides found.</p>'}</div></body></html>`;
  }

  window.VastSlides = { layoutDeck, toPptx, toHtml };
})();
