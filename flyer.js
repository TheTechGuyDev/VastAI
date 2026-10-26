/* VastAI flyer engine: turns a JSON flyer spec into a polished, print-ready HTML design (rendered to PNG by app.js) */
(() => {
  const SIZES = { portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920], landscape: [1920, 1080], banner: [1500, 500] };

  // Lucide-style stroke icons (24x24)
  const ICONS = {
    phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    location: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    call: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
    chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    grad: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    play: '<path d="m6 3 14 9-14 9V3z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.05 0 5.5-2.45 5.5-5.5C21.5 6.01 17.5 2 12 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    whatsapp: '<path d="M3 21l1.65-4.5A9 9 0 1 1 8 19.8L3 21z"/><path d="M9 10c0 3 2 5 5 5l1.5-1.5-2-1-1 .8c-1-.4-1.9-1.3-2.3-2.3l.8-1-1-2L9 10z"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    sparkles: '<path d="m12 3-1.9 5.8L4.3 10.7l5.8 1.9L12 18.4l1.9-5.8 5.8-1.9-5.8-1.9L12 3z"/><path d="M5 3v4M3 5h4M19 17v4M17 19h4"/>',
  };
  const ALIAS = { smartphone: "phone", mobile: "phone", app: "phone", design: "palette", backend: "database", data: "database", server: "database", login: "lock", auth: "lock",
    authentication: "lock", deploy: "rocket", launch: "rocket", date: "calendar", time: "clock", duration: "clock", venue: "location", map: "location", pin: "location",
    price: "money", fee: "money", naira: "money", cash: "money", contact: "call", tel: "call", telephone: "call", certificate: "trophy", award: "trophy", learn: "book",
    training: "grad", class: "grad", school: "grad", community: "users", team: "users", support: "chat", web: "globe", website: "globe", fast: "zap", free: "gift",
    secure: "shield", security: "shield", analytics: "chart", growth: "chart", email: "mail", build: "code", coding: "code", computer: "laptop", shop: "cart", ai: "sparkles" };
  function icon(name, size, color, sw = 2) {
    const k = String(name || "").toLowerCase().trim();
    const key = ICONS[k] ? k : ALIAS[k] || Object.keys(ICONS).find((i) => k.includes(i)) || Object.keys(ALIAS).find((a) => k.includes(a)) && ALIAS[Object.keys(ALIAS).find((a) => k.includes(a))] || "check";
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`;
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const arr = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
  const str = (v) => (v == null ? "" : typeof v === "object" ? v.text || v.label || v.title || "" : String(v));
  const hex = (c, d) => { const v = String(c || "").replace("#", ""); return /^[0-9a-fA-F]{6}$/.test(v) ? "#" + v.toUpperCase() : d; };
  const mix = (a, b, t) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, "0")).join("");
  const rgba = (h, a) => `rgba(${parseInt(h.substr(1, 2), 16)},${parseInt(h.substr(3, 2), 16)},${parseInt(h.substr(5, 2), 16)},${a})`;
  const initials = (n) => { const w = String(n || "").split(/\s+/).filter((x) => /^[A-Za-z0-9]/.test(x)); return ((w[0] || "V")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase(); };

  function sizeOf(spec) {
    const k = String(spec.size || "portrait").toLowerCase();
    if (SIZES[k]) return { w: SIZES[k][0], h: SIZES[k][1] };
    const m = k.match(/(\d{3,4})\s*x\s*(\d{3,4})/);
    return m ? { w: +m[1], h: +m[2] } : { w: 1080, h: 1350 };
  }

  // Fit a headline: shrink font as text gets longer
  const fitSize = (text, base, perChar, min) => Math.max(min, base - Math.max(0, String(text).length - perChar) * (base / perChar) * 0.55);

  const BRUSH = "M10 32 C 70 6, 190 18, 300 10 S 520 4, 594 24 L 584 60 L 598 96 C 470 116, 310 104, 170 114 S 34 112, 4 98 L 16 64 Z";

  function brand(spec, u, C, dark) {
    const b = spec.brand || {};
    if (!b.name && !b.logo) return "";
    const logo = b.logo ? `<img src="${esc(b.logo)}" style="height:${64 * u}px;width:auto;object-fit:contain">` :
      `<div style="width:${64 * u}px;height:${64 * u}px;border-radius:${16 * u}px;background:linear-gradient(135deg,${C.p},${C.pd});color:#fff;display:grid;place-items:center;font-weight:900;font-size:${26 * u}px;letter-spacing:-.02em;box-shadow:0 ${8 * u}px ${18 * u}px ${rgba(C.p, 0.35)}">${esc(initials(b.name))}</div>`;
    return `<div style="display:flex;align-items:center;gap:${16 * u}px">${logo}<div style="line-height:1.1"><div style="font-weight:800;font-size:${25 * u}px;color:${dark ? "#fff" : C.ink}">${esc(b.name || "")}</div>` +
      (b.tagline ? `<div style="font-size:${13 * u}px;letter-spacing:.22em;text-transform:uppercase;color:${dark ? rgba("#FFFFFF", 0.7) : C.muted};margin-top:${6 * u}px;font-weight:600">${esc(b.tagline)}</div>` : "") + `</div></div>`;
  }

  function personImg(photo, u, mode, box) {
    if (!photo) return "";
    if (photo.cut) {
      return `<img src="${esc(photo.src)}" style="position:absolute;${box};object-fit:contain;object-position:bottom center;filter:drop-shadow(0 ${24 * u}px ${30 * u}px rgba(15,23,42,.28))">`;
    }
    // Not a cut-out: blend white backgrounds away on light designs, frame it on dark ones
    if (mode === "light") return `<img src="${esc(photo.src)}" style="position:absolute;${box};object-fit:contain;object-position:bottom center;mix-blend-mode:multiply">`;
    return `<img src="${esc(photo.src)}" style="position:absolute;${box};object-fit:cover;object-position:top center;border-radius:${300 * u}px ${300 * u}px ${24 * u}px ${24 * u}px;border:${8 * u}px solid rgba(255,255,255,.15)">`;
  }

  /* ---------- Template: split (light, person on the right) ---------- */
  function split(spec, S, C, photo) {
    const { w: W, h: H } = S;
    const u = Math.min(W / 1080, H / 1350) * (W > H * 1.2 ? 1.05 : 1);
    const wide = W > H * 1.2;
    const colW = wide ? W * 0.52 : W * 0.56;
    const feats = arr(spec.features).slice(0, 4), info = arr(spec.info).slice(0, 4), pills = arr(spec.pills).slice(0, 4);
    const sections = 3 + (pills.length ? 1 : 0) + (feats.length ? 1 : 0) + (info.length ? 1 : 0) + (spec.audience ? 1 : 0);
    const k = H / W < 1.05 && !wide ? (sections > 6 ? 0.74 : 0.82) : sections > 7 ? 0.86 : sections > 6 ? 0.93 : 1;
    const head = str(spec.headline), hi = str(spec.highlight);
    const hs = fitSize(head.length > hi.length ? head : hi, 104, 11, 58) * u * k;

    const pillBar = pills.length ? `<div style="display:inline-flex;align-items:center;gap:${14 * u * k}px;background:linear-gradient(135deg,${C.p},${C.pd});color:#fff;border-radius:${60 * u}px;padding:${13 * u * k}px ${30 * u * k}px;font-weight:700;font-size:${23 * u * k}px;align-self:flex-start;box-shadow:0 ${10 * u}px ${24 * u}px ${rgba(C.p, 0.3)}">` +
      pills.map((x, i) => (i ? `<span style="width:${7 * u}px;height:${7 * u}px;border-radius:50%;background:${C.a}"></span>` : "") + `<span>${esc(str(x))}</span>`).join("") + `</div>` : "";

    const featRow = feats.length ? `<div style="display:grid;grid-template-columns:repeat(${feats.length},1fr);background:#fff;border-radius:${22 * u}px;padding:${20 * u * k}px ${10 * u}px;box-shadow:0 ${12 * u}px ${30 * u}px rgba(15,23,42,.08);border:1px solid ${rgba(C.p, 0.12)}">` +
      feats.map((f, i) => `<div style="display:flex;flex-direction:column;align-items:center;gap:${10 * u * k}px;text-align:center;padding:0 ${6 * u}px;${i ? `border-left:2px solid ${rgba(C.p, 0.12)};` : ""}">` +
        `<div style="width:${58 * u * k}px;height:${58 * u * k}px;border-radius:${16 * u}px;background:${rgba(C.p, 0.1)};display:grid;place-items:center">${icon(f.icon || str(f), 32 * u * k, C.p, 2)}</div>` +
        `<div style="font-weight:700;font-size:${17 * u * k}px;line-height:1.2;color:${C.ink}">${esc(f.label || str(f))}</div></div>`).join("") + `</div>` : "";

    const infoRow = info.length ? `<div style="display:flex;flex-wrap:wrap;gap:${12 * u * k}px">` + info.map((x) =>
      `<div style="display:flex;align-items:center;gap:${10 * u}px;background:#fff;border:1px solid ${rgba(C.p, 0.15)};border-radius:${14 * u}px;padding:${11 * u * k}px ${16 * u}px;font-weight:700;font-size:${20 * u * k}px;color:${C.ink};box-shadow:0 ${6 * u}px ${16 * u}px rgba(15,23,42,.06)">` +
      `${icon(x.icon || "check", 24 * u * k, C.p, 2.2)}<span>${esc(x.text || str(x))}</span></div>`).join("") + `</div>` : "";

    const audience = spec.audience ? `<div style="position:relative;padding:${22 * u * k}px ${34 * u}px ${22 * u * k}px ${30 * u}px;display:flex;align-items:center;gap:${18 * u}px;max-width:${colW - 20 * u}px">` +
      `<svg viewBox="0 0 600 120" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%"><path d="${BRUSH}" fill="${C.d}"/></svg>` +
      `<div style="position:relative;width:${48 * u * k}px;height:${48 * u * k}px;border-radius:50%;background:${C.a};display:grid;place-items:center;flex-shrink:0">${icon("grad", 28 * u * k, C.d, 2.2)}</div>` +
      `<div style="position:relative;color:#fff;font-weight:600;font-size:${20 * u * k}px;line-height:1.35">${esc(spec.audience)}</div></div>` : "";

    const cta = spec.cta ? `<div style="display:flex;flex-direction:column;gap:${12 * u * k}px;align-items:flex-start">` +
      `<div style="display:inline-flex;align-items:center;gap:${16 * u}px;background:linear-gradient(135deg,${C.p},${C.pd});color:#fff;border-radius:${60 * u}px;padding:${14 * u * k}px ${36 * u}px ${14 * u * k}px ${14 * u}px;font-weight:800;font-size:${31 * u * k}px;box-shadow:0 ${14 * u}px ${30 * u}px ${rgba(C.p, 0.4)}">` +
      `<span style="width:${56 * u * k}px;height:${56 * u * k}px;border-radius:50%;background:#fff;display:grid;place-items:center">${icon("hand", 30 * u * k, C.p, 2.2)}</span>${esc(spec.cta)}</div>` +
      (spec.contact ? `<div style="display:flex;align-items:center;gap:${10 * u}px;font-weight:700;font-size:${22 * u * k}px;color:${C.ink};padding-left:${12 * u}px">${icon(/@/.test(spec.contact) ? "mail" : "call", 24 * u * k, C.p, 2.2)}${esc(spec.contact)}</div>` : "") + `</div>` : "";

    const left = `<div style="position:absolute;left:${64 * u}px;top:${60 * u}px;bottom:${60 * u}px;width:${colW}px;display:flex;flex-direction:column;justify-content:space-between;gap:${18 * u}px;z-index:3">` +
      brand(spec, u, C, false) +
      `<div>` + (spec.kicker ? `<div style="display:inline-block;background:${C.a};color:${C.d};font-weight:800;font-size:${18 * u * k}px;letter-spacing:.12em;text-transform:uppercase;border-radius:${10 * u}px;padding:${8 * u}px ${16 * u}px;margin-bottom:${16 * u * k}px">${esc(spec.kicker)}</div>` : "") +
      `<div style="font-weight:900;font-size:${hs}px;line-height:.98;letter-spacing:-.03em;color:${C.ink}">${esc(head)}</div>` +
      (hi ? `<div style="position:relative;display:inline-block;font-weight:900;font-size:${hs * 1.02}px;line-height:1.05;letter-spacing:-.03em;color:${C.p}">${esc(hi)}<svg viewBox="0 0 300 24" preserveAspectRatio="none" style="position:absolute;left:0;bottom:${-12 * u}px;width:70%;height:${18 * u}px"><path d="M4 18 Q 150 0 296 12" stroke="${C.a}" stroke-width="7" fill="none" stroke-linecap="round"/></svg></div>` : "") +
      (spec.sub ? `<div style="margin-top:${26 * u * k}px;font-size:${29 * u * k}px;font-weight:500;line-height:1.32;color:${C.body};max-width:${colW * 0.95}px">${esc(spec.sub)}</div>` : "") + `</div>` +
      pillBar + featRow + infoRow + audience + cta + `</div>`;

    // Right side: glow, person, script text, phone mockup
    const px = wide ? W * 0.5 : W * 0.44;
    const glow = `<div style="position:absolute;left:${px - 40 * u}px;top:${H * 0.16}px;width:${W - px + 120 * u}px;height:${W - px + 120 * u}px;border-radius:50%;background:radial-gradient(circle,${rgba(C.p, 0.32)} 0%,${rgba(C.p, 0.12)} 45%,transparent 70%)"></div>` +
      `<div style="position:absolute;right:${-160 * u}px;bottom:${-160 * u}px;width:${700 * u}px;height:${700 * u}px;border-radius:50%;border:${3 * u}px solid ${rgba(C.p, 0.18)}"></div>`;
    const person = personImg(photo, u, "light", `right:${wide ? W * 0.02 : -W * 0.03}px;bottom:0;height:${H * (wide ? 0.95 : 0.8)}px;width:${W - px}px`);
    const script = spec.script ? `<div style="position:absolute;right:${48 * u}px;top:${wide ? 50 * u : 70 * u}px;transform:rotate(-8deg);font-family:'Kaushan Script',cursive;font-size:${42 * u}px;line-height:1.05;color:${C.pd};text-align:right;z-index:4;max-width:${300 * u}px">${esc(spec.script)}</div>` : "";
    let phone = "";
    if (spec.phone) {
      const ph = spec.phone, items = arr(ph.items).slice(0, 4), pw = 240 * u, phh = 470 * u;
      phone = `<div style="position:absolute;right:${36 * u}px;bottom:${70 * u}px;width:${pw}px;height:${phh}px;background:#0f172a;border-radius:${38 * u}px;padding:${10 * u}px;z-index:5;box-shadow:0 ${30 * u}px ${50 * u}px rgba(15,23,42,.35);transform:rotate(4deg)">` +
        `<div style="width:100%;height:100%;background:#fff;border-radius:${30 * u}px;padding:${22 * u}px ${18 * u}px;display:flex;flex-direction:column;gap:${12 * u}px;overflow:hidden">` +
        `<div style="display:flex;align-items:center;gap:${8 * u}px"><div style="width:${28 * u}px;height:${28 * u}px;border-radius:${8 * u}px;background:${C.p};color:#fff;font-weight:900;font-size:${12 * u}px;display:grid;place-items:center">${esc(initials((spec.brand || {}).name))}</div><div style="flex:1"></div><div style="width:${18 * u}px;height:${3 * u}px;background:${C.ink};border-radius:3px;box-shadow:0 ${6 * u}px 0 ${C.ink},0 ${-6 * u}px 0 ${C.ink}"></div></div>` +
        `<div style="font-weight:800;font-size:${19 * u}px;line-height:1.15;color:${C.ink}">${esc(ph.title || "Get started")}</div>` +
        items.map((it) => `<div style="display:flex;align-items:center;gap:${10 * u}px;background:${rgba(C.p, 0.07)};border-radius:${10 * u}px;padding:${9 * u}px ${10 * u}px;font-size:${14 * u}px;font-weight:600;color:${C.ink}">` +
          `<span style="width:${26 * u}px;height:${26 * u}px;border-radius:50%;background:#fff;display:grid;place-items:center">${icon(it.icon || str(it), 15 * u, C.p, 2.2)}</span>${esc(it.label || str(it))}</div>`).join("") +
        `<div style="margin-top:auto;background:${C.p};color:#fff;font-weight:700;font-size:${14 * u}px;text-align:center;border-radius:${30 * u}px;padding:${11 * u}px">${esc(ph.button || spec.cta || "Start now")}</div></div></div>`;
    }
    const bg = `background:linear-gradient(160deg,#ffffff 0%,${mix(C.p, "#FFFFFF", 0.93)} 40%,${mix(C.p, "#FFFFFF", 0.78)} 100%)`;
    const dots = `<div style="position:absolute;left:0;top:0;width:${420 * u}px;height:${420 * u}px;background-image:radial-gradient(${rgba(C.p, 0.16)} ${2 * u}px,transparent ${2.4 * u}px);background-size:${26 * u}px ${26 * u}px;-webkit-mask-image:linear-gradient(135deg,#000,transparent 70%);mask-image:linear-gradient(135deg,#000,transparent 70%)"></div>`;
    const footer = `<div style="position:absolute;left:0;right:0;bottom:0;height:${14 * u}px;background:linear-gradient(90deg,${C.p},${C.a})"></div>`;
    return `<div id="design" style="width:${W}px;height:${H}px;position:relative;overflow:hidden;${bg};font-family:'Poppins',sans-serif">${dots}${glow}${person}${script}${phone}${left}${footer}</div>`;
  }

  /* ---------- Template: spotlight (dark, centered, person bottom) ---------- */
  function spotlight(spec, S, C, photo) {
    const { w: W, h: H } = S;
    const u = Math.min(W / 1080, H / 1350);
    const tall = H / W > 1.5;
    const feats = arr(spec.features).slice(0, 4), info = arr(spec.info).slice(0, 4), pills = arr(spec.pills).slice(0, 4);
    const head = str(spec.headline), hi = str(spec.highlight);
    const hs = fitSize(head.length > hi.length ? head : hi, 112, 12, 60) * u;
    const top = `<div style="position:absolute;left:${60 * u}px;right:${60 * u}px;top:${(tall ? 90 : 56) * u}px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:${16 * u}px;z-index:3">` +
      brand(spec, u, C, true) +
      (spec.kicker ? `<div style="margin-top:${10 * u}px;background:${rgba(C.a, 0.16)};border:1px solid ${rgba(C.a, 0.6)};color:${C.a};font-weight:800;font-size:${18 * u}px;letter-spacing:.16em;text-transform:uppercase;border-radius:${40 * u}px;padding:${9 * u}px ${22 * u}px">${esc(spec.kicker)}</div>` : "") +
      `<div style="font-weight:900;font-size:${hs}px;line-height:.95;letter-spacing:-.03em;color:#fff;text-shadow:0 ${8 * u}px ${30 * u}px rgba(0,0,0,.35)">${esc(head)}` +
      (hi ? `<br><span style="color:${C.a}">${esc(hi)}</span>` : "") + `</div>` +
      (spec.sub ? `<div style="font-size:${28 * u}px;font-weight:500;line-height:1.35;color:${rgba("#FFFFFF", 0.82)};max-width:${780 * u}px">${esc(spec.sub)}</div>` : "") +
      (pills.length ? `<div style="display:flex;gap:${10 * u}px;flex-wrap:nowrap;justify-content:center;white-space:nowrap">` + pills.map((x) => `<span style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#fff;font-weight:600;font-size:${20 * u}px;border-radius:${30 * u}px;padding:${8 * u}px ${18 * u}px">${esc(str(x))}</span>`).join("") + `</div>` : "") + `</div>`;
    const ringTop = H * (tall ? 0.42 : 0.4);
    const ring = `<div style="position:absolute;left:50%;top:${ringTop}px;width:${760 * u}px;height:${760 * u}px;margin-left:${-380 * u}px;border-radius:50%;background:radial-gradient(circle,${rgba(C.p, 0.75)} 0%,${rgba(C.p, 0.25)} 45%,transparent 70%)"></div>` +
      `<div style="position:absolute;left:50%;top:${ringTop + 60 * u}px;width:${640 * u}px;height:${640 * u}px;margin-left:${-320 * u}px;border-radius:50%;border:${3 * u}px solid ${rgba(C.a, 0.5)}"></div>`;
    const person = personImg(photo, u, "dark", `left:50%;transform:translateX(-50%);bottom:${(tall ? 330 : 215) * u}px;height:${H * (tall ? 0.44 : 0.44)}px;width:${W * 0.7}px`);
    const cards = feats.map((f, i) => {
      const side = i % 2 ? `right:${44 * u}px` : `left:${44 * u}px`, y = ringTop + (80 + Math.floor(i / 2) * 130) * u;
      return `<div style="position:absolute;${side};top:${y}px;display:flex;align-items:center;gap:${12 * u}px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:${18 * u}px;padding:${14 * u}px ${18 * u}px;z-index:4;max-width:${280 * u}px;box-shadow:0 ${10 * u}px ${30 * u}px rgba(0,0,0,.25)">` +
        `<span style="width:${44 * u}px;height:${44 * u}px;border-radius:${12 * u}px;background:${C.a};display:grid;place-items:center;flex-shrink:0">${icon(f.icon || str(f), 24 * u, C.d, 2.2)}</span>` +
        `<span style="color:#fff;font-weight:700;font-size:${19 * u}px;line-height:1.2">${esc(f.label || str(f))}</span></div>`;
    }).join("");
    const bottom = `<div style="position:absolute;left:0;right:0;bottom:0;height:${(tall ? 600 : 430) * u}px;background:linear-gradient(${rgba(C.d, 0)},${rgba(C.d, 0.92)} 40%,${C.d} 60%);z-index:4"></div>` +
      `<div style="position:absolute;left:${50 * u}px;right:${50 * u}px;bottom:${(tall ? 90 : 50) * u}px;display:flex;flex-direction:column;align-items:center;gap:${16 * u}px;z-index:5">` +
      (info.length ? `<div style="display:flex;gap:${12 * u}px;flex-wrap:nowrap;white-space:nowrap;justify-content:center">` + info.map((x) => `<div style="display:flex;align-items:center;gap:${9 * u}px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:${14 * u}px;padding:${10 * u}px ${16 * u}px;color:#fff;font-weight:700;font-size:${20 * u}px">${icon(x.icon || "check", 22 * u, C.a, 2.2)}${esc(x.text || str(x))}</div>`).join("") + `</div>` : "") +
      (spec.audience ? `<div style="color:${rgba("#FFFFFF", 0.8)};font-size:${19 * u}px;line-height:1.35;text-align:center;max-width:${760 * u}px">${esc(spec.audience)}</div>` : "") +
      (spec.cta ? `<div style="display:inline-flex;align-items:center;gap:${14 * u}px;background:${C.a};color:${C.d};border-radius:${60 * u}px;padding:${20 * u}px ${44 * u}px;font-weight:900;font-size:${32 * u}px;box-shadow:0 ${14 * u}px ${36 * u}px ${rgba(C.a, 0.45)}">${esc(spec.cta)}${icon("arrow", 30 * u, C.d, 2.6)}</div>` : "") +
      (spec.contact ? `<div style="display:flex;align-items:center;gap:${10 * u}px;color:#fff;font-weight:700;font-size:${22 * u}px">${icon(/@/.test(spec.contact) ? "mail" : "call", 24 * u, C.a, 2.2)}${esc(spec.contact)}</div>` : "") + `</div>`;
    const script = spec.script ? `<div style="position:absolute;right:${50 * u}px;top:${ringTop - 20 * u}px;transform:rotate(-8deg);font-family:'Kaushan Script',cursive;font-size:${38 * u}px;color:${C.a};z-index:4;max-width:${280 * u}px;text-align:right;line-height:1.05">${esc(spec.script)}</div>` : "";
    const bg = `background:radial-gradient(ellipse at 50% 30%,${mix(C.p, C.d, 0.35)} 0%,${C.d} 65%)`;
    const grid = `<div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:${60 * u}px ${60 * u}px;-webkit-mask-image:radial-gradient(ellipse at 50% 40%,#000,transparent 75%);mask-image:radial-gradient(ellipse at 50% 40%,#000,transparent 75%)"></div>`;
    return `<div id="design" style="width:${W}px;height:${H}px;position:relative;overflow:hidden;${bg};font-family:'Poppins',sans-serif">${grid}${ring}${person}${cards}${script}${top}${bottom}</div>`;
  }

  function theme(spec) {
    const t = spec.theme || {};
    const p = hex(t.primary, "#2D5BFF");
    const C = { p, a: hex(t.accent, "#FFB020"), d: hex(t.dark, "#0B1B4D") };
    C.pd = mix(C.p, "#000000", 0.25); C.ink = mix(C.d, "#000000", 0.1); C.body = mix(C.d, "#FFFFFF", 0.25); C.muted = mix(C.d, "#FFFFFF", 0.45);
    return C;
  }

  // photo: { src, cut } or null
  function render(spec, photo) {
    const S = sizeOf(spec);
    const C = theme(spec);
    let tpl = String(spec.template || "").toLowerCase();
    if (!["split", "spotlight"].includes(tpl)) tpl = S.h / S.w > 1.5 ? "spotlight" : "split";
    if (tpl === "split" && S.h / S.w > 1.6) tpl = "spotlight";
    const body = tpl === "spotlight" ? spotlight(spec, S, C, photo) : split(spec, S, C, photo);
    const title = [str(spec.headline), str(spec.highlight)].filter(Boolean).join(" ") || "Flyer";
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
      `<link rel="preconnect" href="https://fonts.googleapis.com"><link crossorigin="anonymous" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Kaushan+Script&display=swap" rel="stylesheet">` +
      `<style>*{box-sizing:border-box}body{margin:0}</style></head><body>${body}</body></html>`;
  }

  // Prompt for an AI-generated person when the user gave no photo
  function personPrompt(spec) {
    const p = typeof spec.photo === "object" && spec.photo ? spec.photo.prompt : typeof spec.photo === "string" && spec.photo !== "user" && spec.photo !== "none" ? spec.photo : "";
    return p || "";
  }

  const RULES =
    "\n\nFlyers: for a flyer, poster, social media post, ad or promo graphic, reply with one short line then ONE ```flyer block containing ONLY JSON (VastAI renders it with pro templates, real fonts and icons):\n" +
    '{"template":"split (light, person on right) or spotlight (dark, centered)","size":"portrait|square|story|landscape","theme":{"primary":"2D5BFF","accent":"FFB020","dark":"0B1B4D"},' +
    '"brand":{"name":"Business name","tagline":"Short | Tag | Line"},"kicker":"FREE MASTERCLASS","headline":"FlutterFlow","highlight":"Masterclass",' +
    '"sub":"One-line benefit","pills":["Learn","Build","Launch"],"features":[{"icon":"phone","label":"Design Apps"}],' +
    '"info":[{"icon":"calendar","text":"3 Weeks"},{"icon":"location","text":"Ikeja, Lagos"},{"icon":"money","text":"Free"}],' +
    '"audience":"Perfect for beginners, creatives and entrepreneurs","cta":"Join Free Masterclass","contact":"0801 234 5678","script":"Turn Your Ideas Into Real Apps",' +
    '"photo":"user" or {"prompt":"studio photo of a smiling young Nigerian man in a red sweater sitting on a stool, full body, isolated on a pure white background"} or "none",' +
    '"phone":{"title":"Your App Journey Starts Here","items":[{"icon":"palette","label":"Design"}],"button":"Join Now"}}\n' +
    "Icons: phone, database, user, users, rocket, calendar, location, money, call, clock, check, star, code, laptop, chart, shield, book, grad, globe, zap, gift, heart, chat, cart, home, lock, layers, palette, mail, trophy, sparkles. " +
    "Keep headline and highlight short (1-2 words each), max 4 features, 4 info items, 4 pills; use the user's real details; omit fields you have no content for; choose colours that suit the brand. " +
    'Use "photo":"user" only when the user attached their own photo. For edits, output the full updated JSON.';

  window.VastFlyer = { render, sizeOf, personPrompt, RULES };
})();
