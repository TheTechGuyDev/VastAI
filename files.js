/* VastAI file builder: turns JSON specs from the AI into real PowerPoint, Word, Excel and PDF files */
(() => {
  const LIBS = {
    pptx: ["https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"],
    docx: ["https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js"],
    xlsx: ["https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"],
    pdf: ["https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js", "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"],
  };
  const LABEL = { pptx: "PowerPoint", docx: "Word document", xlsx: "Excel spreadsheet", pdf: "PDF document" };
  const ICON = { pptx: "P", docx: "W", xlsx: "X", pdf: "PDF" };
  const ICON_BG = { pptx: "#d24726", docx: "#2b579a", xlsx: "#217346", pdf: "#e5252a" };
  const FILE_LANGS = Object.keys(LIBS);

  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = src; s.onload = res;
      s.onerror = () => { delete loaded[src]; rej(new Error("Could not load file library. Check your internet.")); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  const loadLibs = async (lang) => { for (const src of LIBS[lang]) await loadScript(src); };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hex = (c, d) => (String(c || d).replace("#", "").match(/^[0-9a-fA-F]{6}$/) ? String(c || d).replace("#", "") : d).toUpperCase();
  const arr = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
  const str = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

  function parseSpec(text) {
    let t = String(text || "").trim();
    try { return JSON.parse(t); } catch {}
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    t = t.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"');
    return JSON.parse(t);
  }

  function safeName(s, ext) {
    const base = String(s || "VastAI file").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "VastAI file";
    return base.toLowerCase().endsWith("." + ext) ? base : `${base}.${ext}`;
  }
  const fileName = (lang, spec) => safeName(spec.filename || spec.title || (spec.sheets && spec.sheets[0]?.name), lang);

  function theme(spec) {
    const t = spec.theme || {};
    return { primary: hex(t.primary, "10B981"), dark: hex(t.dark, "0F172A"), light: hex(t.light, "F8FAFC"), text: hex(t.text, "1E293B"), muted: hex(t.muted, "64748B") };
  }

  /* ---------------- PowerPoint ---------------- */
  async function buildPptx(spec) {
    await loadLibs("pptx");
    return VastSlides.toPptx(spec);
  }

  /* ---------------- Word ---------------- */
  async function buildDocx(spec) {
    await loadLibs("docx");
    const T = theme(spec);
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType } = window.docx;
    const children = [];
    if (spec.title) children.push(new Paragraph({ heading: HeadingLevel.TITLE, border: { bottom: { color: T.primary, space: 6, style: "single", size: 18 } }, spacing: { after: 160 }, children: [new TextRun({ text: str(spec.title), bold: true, color: T.dark, size: 52 })] }));
    if (spec.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: str(spec.subtitle), color: T.muted, size: 26 })], spacing: { after: 300 } }));
    arr(spec.sections).forEach((sec) => {
      if (sec.heading) children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 }, children: [new TextRun({ text: str(sec.heading), color: T.primary, bold: true })] }));
      arr(sec.paragraphs).forEach((p) => children.push(new Paragraph({ children: [new TextRun({ text: str(p), size: 23 })], spacing: { after: 160 } })));
      arr(sec.bullets).forEach((b) => children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: str(b), size: 23 })] })));
      if (sec.table && arr(sec.table.columns).length) {
        const cols = arr(sec.table.columns).map(str);
        const cell = (t, head, zebra) => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: head, color: head ? "FFFFFF" : T.text, size: 20 })] })],
          shading: head ? { type: ShadingType.CLEAR, fill: T.primary, color: "auto" } : zebra ? { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" } : undefined,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
        });
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ tableHeader: true, children: cols.map((c) => cell(c, true)) }),
            ...arr(sec.table.rows).map((r, ri) => new TableRow({ children: cols.map((_, ci) => cell(str(arr(r)[ci]), false, ri % 2)) }))],
        }));
        children.push(new Paragraph({ text: "" }));
      }
    });
    const doc = new Document({ creator: "VastAI", title: str(spec.title), styles: { default: { document: { run: { font: "Calibri" } } } }, sections: [{ children }] });
    return Packer.toBlob(doc);
  }

  /* ---------------- Excel ---------------- */
  async function buildXlsx(spec) {
    await loadLibs("xlsx");
    const wb = XLSX.utils.book_new();
    arr(spec.sheets).forEach((sh, i) => {
      const cols = arr(sh.columns);
      const rows = arr(sh.rows).map((r) => arr(r).map((v) => (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, "")) && v.length < 16 ? Number(v.replace(/,/g, "")) : v)));
      const aoa = cols.length ? [cols, ...rows] : rows;
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const width = Math.max(cols.length, ...rows.map((r) => r.length), 1);
      ws["!cols"] = Array.from({ length: width }, (_, c) => ({ wch: Math.min(50, Math.max(10, ...aoa.map((r) => str(r[c]).length + 2))) }));
      XLSX.utils.book_append_sheet(wb, ws, String(sh.name || "Sheet " + (i + 1)).replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Sheet " + (i + 1));
    });
    if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["No data"]]), "Sheet 1");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* ---------------- PDF ---------------- */
  async function buildPdf(spec) {
    await loadLibs("pdf");
    const T = theme(spec);
    const rgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const M = 18, PW = 210, PH = 297, CW = PW - M * 2;
    let y = M;
    const ensure = (h) => { if (y + h > PH - M) { doc.addPage(); y = M; } };
    const write = (text, size, opts = {}) => {
      doc.setFont("helvetica", opts.bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...rgb(opts.color || T.text));
      const lines = doc.splitTextToSize(text, opts.width || CW);
      const lh = size * 0.42;
      lines.forEach((ln) => { ensure(lh); doc.text(ln, opts.x || M, y + lh * 0.8); y += lh; });
      y += opts.after ?? 2;
    };
    // Header band
    const bandH = spec.subtitle ? 46 : 38;
    doc.setFillColor(...rgb(T.dark)); doc.rect(0, 0, PW, bandH, "F");
    doc.setFillColor(...rgb(T.primary)); doc.circle(PW - 18, 6, 26, "F"); doc.rect(0, bandH, PW, 2, "F");
    doc.setFillColor(...rgb(T.dark)); doc.circle(PW - 18, 6, 17, "F");
    y = 14;
    if (spec.title) write(str(spec.title), 22, { bold: true, color: "FFFFFF", width: CW - 30, after: 2 });
    if (spec.subtitle) write(str(spec.subtitle), 11.5, { color: "CBD5E1", width: CW - 30, after: 2 });
    y = bandH + 10;
    arr(spec.sections).forEach((sec) => {
      if (sec.heading) {
        y += 3; ensure(14);
        doc.setFillColor(...rgb(T.primary)); doc.roundedRect(M, y + 1.2, 1.6, 6, 0.8, 0.8, "F");
        write(str(sec.heading), 15, { bold: true, color: T.dark, x: M + 4.5, width: CW - 4.5, after: 2 });
      }
      arr(sec.paragraphs).forEach((p) => write(str(p), 11, { after: 3 }));
      arr(sec.bullets).forEach((b) => {
        ensure(5); doc.setFillColor(...rgb(T.primary)); doc.circle(M + 1.5, y + 2.6, 0.8, "F");
        write(str(b), 11, { x: M + 5, width: CW - 5, after: 1.5 });
      });
      if (sec.table && arr(sec.table.columns).length) {
        doc.autoTable({ startY: y + 2, margin: { left: M, right: M }, head: [arr(sec.table.columns).map(str)], body: arr(sec.table.rows).map((r) => arr(r).map(str)),
          headStyles: { fillColor: rgb(T.primary), textColor: 255 }, alternateRowStyles: { fillColor: [241, 245, 249] }, styles: { fontSize: 9.5, cellPadding: 2.5 } });
        y = doc.lastAutoTable.finalY + 6;
      }
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(9); doc.setTextColor(...rgb(T.muted)); doc.text(`${i} / ${pages}`, PW - M, PH - 8, { align: "right" }); }
    return doc.output("blob");
  }

  const BUILDERS = { pptx: buildPptx, docx: buildDocx, xlsx: buildXlsx, pdf: buildPdf };

  async function download(lang, spec) {
    const blob = await BUILDERS[lang](spec);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = fileName(lang, spec); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------------- HTML previews ---------------- */
  function previewHtml(lang, spec) {
    try { return lang === "pptx" ? VastSlides.toHtml(spec) : docPreview(lang, spec); }
    catch (err) { console.error(err); return `<!doctype html><body style="font-family:sans-serif;padding:24px;color:#b91c1c">Preview error: ${esc(err.message)}<br><br>The download may still work.</body>`; }
  }

  function docPreview(lang, spec) {
    const T = theme(spec);
    const base = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box} body{margin:0;font-family:Calibri,Segoe UI,system-ui,sans-serif;background:#e5e7eb;color:#${T.text}}
      .wrap{max-width:900px;margin:0 auto;padding:20px 14px}
      .slide{position:relative;aspect-ratio:16/9;background:#fff;border-radius:8px;margin:0 0 18px;box-shadow:0 4px 18px rgba(0,0,0,.12);overflow:hidden;container-type:inline-size}
      .slide .in{position:absolute;inset:0;padding:5cqw 4.5cqw 5cqw}
      .slide.dark{background:#${T.dark};color:#fff} .slide.sec{background:#${T.primary};color:#fff}
      .slide .bar{position:absolute;left:0;top:0;width:1.9cqw;height:100%;background:#${T.primary}}
      .slide .topbar{position:absolute;left:0;top:0;right:0;height:.9cqw;background:#${T.primary}}
      .slide h1{font-size:5.4cqw;margin:15cqw 0 1.5cqw 2.5cqw;line-height:1.1} .slide .sub{font-size:2.4cqw;margin-left:2.5cqw;color:#cbd5e1} .sec .sub{color:#fff}
      .slide .acc{width:10cqw;height:.45cqw;background:#${T.primary};margin:0 0 1.5cqw 2.5cqw}
      .slide h2{font-size:3.4cqw;margin:0 0 2.4cqw;color:#${T.dark}}
      .slide ul{margin:0;padding-left:2.4cqw;font-size:2.05cqw;line-height:1.5} .slide li{margin-bottom:.7cqw}
      .slide .num{position:absolute;right:3cqw;bottom:2.4cqw;font-size:1.2cqw;color:#${T.muted}}
      .slide table{width:100%;border-collapse:collapse;font-size:1.6cqw} .slide th{background:#${T.primary};color:#fff;text-align:left}
      .slide th,.slide td{padding:.8cqw 1cqw;border:1px solid #e2e8f0} .slide tr:nth-child(even) td{background:#f1f5f9}
      .stats{display:grid;gap:2cqw} .stat{background:#${T.light};border:1px solid #e2e8f0;border-left:.7cqw solid #${T.primary};border-radius:1cqw;padding:2cqw}
      .stat b{display:block;font-size:3.3cqw;color:#${T.primary}} .stat span{font-size:1.6cqw;color:#${T.muted}}
      .cols{display:grid;grid-template-columns:1fr 1fr;gap:4cqw} .cols h3{color:#${T.primary};font-size:2.3cqw;margin:0 0 1cqw}
      .quote{font-size:3.4cqw;font-style:italic;text-align:center;margin-top:11cqw} .author{text-align:center;color:#${T.muted};font-size:1.8cqw;margin-top:2cqw}
      .page{background:#fff;border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,.12);padding:48px 52px;border-top:6px solid #${T.primary}}
      .page h1{margin:0 0 6px;color:#${T.dark}} .page .sub{color:#${T.muted};margin-bottom:22px} .page h2{color:#${T.primary};margin:26px 0 8px;font-size:20px}
      .page p,.page li{line-height:1.6;font-size:15px} table.t{width:100%;border-collapse:collapse;font-size:14px;margin:10px 0}
      table.t th{background:#${T.primary};color:#fff;text-align:left} table.t th,table.t td{padding:8px 10px;border:1px solid #e2e8f0} table.t tr:nth-child(even) td{background:#f1f5f9}
      .sheet{background:#fff;border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,.12);overflow:auto;margin-bottom:18px} .sheet h3{margin:0;padding:10px 14px;background:#217346;color:#fff;font-size:14px}
      .sheet table{border-collapse:collapse;font-size:13px;min-width:100%} .sheet th{background:#f3f4f6;font-weight:600} .sheet th,.sheet td{border:1px solid #e5e7eb;padding:6px 10px;white-space:nowrap}
    </style></head><body><div class="wrap">`;
    const tbl = (cols, rows, cls = "t") => `<table class="${cls}"><thead><tr>${arr(cols).map((c) => `<th>${esc(str(c))}</th>`).join("")}</tr></thead><tbody>${arr(rows).map((r) => `<tr>${arr(r).map((c) => `<td>${esc(str(c))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    let body = "";
    if (lang === "xlsx") {
      body = arr(spec.sheets).map((sh) => `<div class="sheet"><h3>${esc(sh.name || "Sheet")}</h3>${tbl(sh.columns, sh.rows, "")}</div>`).join("");
    } else {
      body = `<div class="page">${spec.title ? `<h1>${esc(spec.title)}</h1>` : ""}${spec.subtitle ? `<div class="sub">${esc(spec.subtitle)}</div>` : ""}` +
        arr(spec.sections).map((sec) => `${sec.heading ? `<h2>${esc(sec.heading)}</h2>` : ""}${arr(sec.paragraphs).map((p) => `<p>${esc(str(p))}</p>`).join("")}` +
          `${arr(sec.bullets).length ? `<ul>${arr(sec.bullets).map((b) => `<li>${esc(str(b))}</li>`).join("")}</ul>` : ""}${sec.table ? tbl(sec.table.columns, sec.table.rows) : ""}`).join("") + `</div>`;
    }
    return base + body + "</div></body></html>";
  }

  function summary(lang, spec) {
    if (lang === "pptx") return `${arr(spec.slides).length} slides`;
    if (lang === "xlsx") return `${arr(spec.sheets).length} sheet(s)`;
    return `${arr(spec.sections).length} sections`;
  }

  const RULES =
    "\n\nFile rules: You CAN create real downloadable files. When the user asks for a PowerPoint/slides/presentation, Word document, Excel/spreadsheet, or PDF, " +
    "NEVER output base64, binary, XML or code that builds the file. Instead output ONE fenced block with the language tag pptx, docx, xlsx or pdf containing ONLY valid JSON (double quotes, no comments). " +
    "VastAI turns it into the real file with a download button. Add one short sentence before the block and a short summary after.\n" +
    'pptx JSON: {"filename":"Name","title":"Deck title","theme":{"primary":"2563EB","dark":"0F172A"},"slides":[' +
    '{"layout":"title","kicker":"short tag e.g. date or company","title":"...","subtitle":"..."},' +
    '{"layout":"bullets","title":"...","text":"optional one-line intro","bullets":["Short title: one sentence detail"],"notes":"speaker notes"},' +
    '{"layout":"stats","title":"...","stats":[{"value":"NGN 131,500","label":"Total paid","description":"optional"}]},' +
    '{"layout":"timeline","title":"...","bullets":["Step title: detail"]},{"layout":"table","title":"...","columns":["A","B"],"rows":[["1","2"]]},' +
    '{"layout":"two-column","title":"...","leftTitle":"...","left":["..."],"rightTitle":"...","right":["..."]},{"layout":"section","title":"...","subtitle":"..."},' +
    '{"layout":"quote","quote":"...","author":"..."},{"layout":"closing","title":"Thank you","subtitle":"..."}]}. ' +
    "Design rules: 7-12 slides, start with title and end with closing, mix layouts (use stats for numbers, timeline for processes, table for lists of records, bullets with 3-4 items show as cards), " +
    "max 6 bullets per slide, keep each bullet under 20 words, write bullets as 'Short title: detail', and pick theme colours that suit the topic (strong primary, very dark navy/charcoal dark).\n" +
    'docx and pdf JSON: {"filename":"Name","title":"...","subtitle":"...","theme":{"primary":"2B579A"},"sections":[{"heading":"...","paragraphs":["..."],"bullets":["..."],"table":{"columns":["..."],"rows":[["..."]]}}]}\n' +
    'xlsx JSON: {"filename":"Name","sheets":[{"name":"Sheet1","columns":["..."],"rows":[["text",123]]}]} (use numbers for numeric cells).\n' +
    "Use the real data from the conversation and any attached files.";

  window.VastFiles = { FILE_LANGS, LABEL, ICON, ICON_BG, parseSpec, fileName, previewHtml, download, summary, RULES };
})();
