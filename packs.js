// Head to Head — picture packs.
// Load a pack file (from the Letter Quest picture page or Pack Builder), keep it on this phone, send it to the other
// phone when a game needs it, and (once, optionally) let Claude add Who Is It? details and Card Clash stats.
"use strict";
(function (root) {
  // Questions Claude answers for every picture (yes/no). Who Is It? offers the ones that split the board.
  const TAGQ = [
    ["animal", "Are they an animal or creature?", "an animal, creature, toy or non-human character"],
    ["child", "Do they look like a child?", "a child or baby (or a young-looking character)"],
    ["headwear", "Are they wearing a hat, crown or something on their head?", "wearing a hat, crown, tiara, hood, helmet, bow or headband"],
    ["glasses", "Are they wearing glasses?", "wearing glasses or goggles"],
    ["facehair", "Do they have a beard or moustache?", "has a beard or moustache"],
    ["longhair", "Do they have long hair?", "has long hair (past the shoulders)"],
    ["blonde", "Do they have blonde or yellow hair?", "has blonde, golden or yellow hair"],
    ["darkhair", "Do they have black or dark brown hair?", "has black or dark brown hair"],
    ["redhair", "Do they have red or ginger hair?", "has red, ginger or orange hair"],
    ["teeth", "Are they showing their teeth?", "smiling or talking with teeth showing"],
    ["ears", "Do they have animal ears?", "has animal ears (cat, mouse, bear, dog ears etc.)"],
    ["blue", "Are they wearing blue?", "wearing clearly blue clothes"],
    ["red", "Are they wearing red?", "wearing clearly red clothes"],
    ["green", "Are they wearing green?", "wearing clearly green clothes"],
    ["yellow", "Are they wearing yellow?", "wearing clearly yellow or gold clothes"],
    ["pink", "Are they wearing pink or purple?", "wearing clearly pink or purple clothes"],
    ["dress", "Are they wearing a dress?", "wearing a dress or gown"],
    ["holding", "Are they holding something?", "holding an object in their hand(s)"],
    ["outside", "Are they outdoors?", "the picture is outdoors (sky, grass, sea, trees)"],
    ["group", "Is there more than one character in the picture?", "more than one person or character is in the picture"],
  ];

  // ---------- storage on this phone (IndexedDB: packs are too big for localStorage) ----------
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("h2h-packs", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("packs", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction("packs", mode), s = t.objectStore("packs"); const q = fn(s); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  const save = p => tx("readwrite", s => s.put(p)).catch(() => { });
  const load = id => tx("readonly", s => s.get(id)).catch(() => null);
  const MEM = {};              // id -> pack in memory
  let LIST = [];               // [{id, name, n}] packs on this phone

  async function refreshList() {
    try { const all = await tx("readonly", s => s.getAll()); LIST = (all || []).map(p => ({ id: p.id, name: p.name, n: p.pics.length, ready: !!p.tags })); all.forEach(p => { MEM[p.id] = p; }); }
    catch (e) { LIST = Object.values(MEM).map(p => ({ id: p.id, name: p.name, n: p.pics.length, ready: !!p.tags })); }
    return LIST;
  }

  // ---------- reading a pack file ----------
  const cap = s => String(s || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, c => c.toUpperCase());
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i += 97) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  function square(src, size = 240) { // centre-crop to a square and shrink, so every game can use it and it's small to send
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => {
        const s = Math.min(im.naturalWidth, im.naturalHeight), c = document.createElement("canvas"); c.width = c.height = size;
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, size, size);
        g.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2.6, s, s, 0, 0, size, size);
        res(c.toDataURL("image/jpeg", .8));
      };
      im.onerror = rej; im.src = src;
    });
  }
  async function fromFile(file, onProgress) {
    const p = JSON.parse(await file.text());
    let name, items;
    if (p && p.type === "letter-quest-pictures" && p.pictures) {
      name = p.theme ? cap(p.theme) + " pictures" : "Picture pack";
      items = Object.entries(p.pictures).map(([w, data]) => ({ name: cap(w), data }));
    } else if (p && p.type === "photo-pack" && Array.isArray(p.photos)) {
      name = p.name || "Photo pack";
      items = p.photos.map((x, i) => ({ name: (x.name || "").trim(), data: x.data }));
    } else if (p && p.type === "h2h-pack" && Array.isArray(p.pics)) {
      return keep(p);
    } else throw new Error("not a pack");
    items = items.filter(x => typeof x.data === "string" && x.data.startsWith("data:image"));
    if (!items.length) throw new Error("no pictures");
    const pics = [], names = [];
    for (let i = 0; i < items.length; i++) {
      try { pics.push(await square(items[i].data)); names.push(items[i].name); } catch (e) { }
      if (onProgress) onProgress(i + 1, items.length);
    }
    if (!pics.length) throw new Error("no pictures");
    // A pack with a key (e.g. George's Disney pack) is the same pack every time it's sent: a newer copy replaces the
    // old one, and Claude's details for pictures that were already there are kept, so only new ones need adding.
    if (p.key) {
      const id = "k" + hash(String(p.key));
      let old = await load(id);
      if (!old) { // first keyed copy: take over an older copy of the same pack loaded before packs had keys
        const all = await tx("readonly", st => st.getAll()).catch(() => []);
        old = (all || []).find(x => x.id[0] === "p" && x.name === name) || null;
        if (old) { await tx("readwrite", st => st.delete(old.id)).catch(() => { }); delete MEM[old.id]; }
      }
      const np = { type: "h2h-pack", id, name, theme: p.theme || "", names, pics, tags: null, deck: null, made: p.made || new Date().toISOString() };
      const prev = old && old.tags && old.deck ? { stats: old.deck.stats, byName: {} } : old && old.prev ? old.prev : null;
      if (old && old.tags && old.deck) old.names.forEach((n, i) => { if (n) prev.byName[n] = { t: old.tags[i], v: old.deck.vals[i] }; });
      if (prev) {
        if (names.every(n => n && prev.byName[n])) { np.tags = names.map(n => prev.byName[n].t); np.deck = { stats: prev.stats, vals: names.map(n => prev.byName[n].v) }; }
        else np.prev = prev;
      }
      return keep(np);
    }
    const id = "p" + hash(name + "|" + names.join("|") + "|" + pics.length + "|" + (p.made || ""));
    const old = await load(id);
    return keep(old || { type: "h2h-pack", id, name, theme: p.theme || "", names, pics, tags: null, deck: null, made: p.made || new Date().toISOString() });
  }
  async function keep(p) { MEM[p.id] = p; await save(p); await refreshList(); return p; }

  // ---------- sharing with the other phone ----------
  // The host sends the pack in small pieces when a guest asks; the guest keeps it, so it's only sent once.
  const CHUNK = 3;
  async function sendTo(send, id, to) {
    const p = MEM[id] || await load(id); if (!p) return;
    const n = Math.ceil(p.pics.length / CHUNK);
    for (let i = 0; i < n; i++) {
      const pics = {}; for (let k = i * CHUNK; k < Math.min(p.pics.length, (i + 1) * CHUNK); k++) pics[k] = p.pics[k];
      const msg = { t: "packpart", to, id, i, n, total: p.pics.length, pics };
      if (i === 0) msg.meta = { name: p.name, theme: p.theme, names: p.names, tags: p.tags, deck: p.deck, made: p.made };
      send(msg);
      await new Promise(r => setTimeout(r, 140));
    }
  }
  const INCOMING = {};
  async function receive(m) { // returns true once the whole pack is here
    if (MEM[m.id] && MEM[m.id].pics.length && !m.meta) return false;
    const box = INCOMING[m.id] || (INCOMING[m.id] = { pics: {}, meta: null, total: m.total });
    if (m.meta) box.meta = m.meta;
    Object.assign(box.pics, m.pics);
    const have = Object.keys(box.pics).length;
    if (!box.meta || have < box.total) return false;
    const pics = Array.from({ length: box.total }, (_, i) => box.pics[i]);
    await keep(Object.assign({ type: "h2h-pack", id: m.id, pics }, box.meta));
    delete INCOMING[m.id];
    return true;
  }
  const progress = id => { const b = INCOMING[id]; return b ? { have: Object.keys(b.pics).length, total: b.total } : null; };

  // ---------- Claude adds the details (once per pack) ----------
  const KEYNAME = "h2h_claude_key";
  const getKey = () => { try { return localStorage.getItem(KEYNAME) || ""; } catch (e) { return ""; } };
  const setKey = k => { try { localStorage.setItem(KEYNAME, k); } catch (e) { } };
  async function claude(key, content, maxTokens) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: maxTokens, messages: [{ role: "user", content }] })
    });
    if (!r.ok) { const t = await r.text(); const e = new Error(r.status === 401 ? "Claude refused that API key." : "Claude couldn't be reached (" + r.status + ")."); e.detail = t; throw e; }
    const j = await r.json();
    return (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  }
  const json = (t, open) => { const close = open === "[" ? "]" : "}", a = t.indexOf(open), z = t.lastIndexOf(close); return JSON.parse(t.slice(a, z + 1)); };
  async function enrich(id, key, onProgress) {
    const p = MEM[id] || await load(id); if (!p) throw new Error("Pack not found.");
    const named = p.names.filter(Boolean).length, prev = p.prev || null;
    // 1. five fun Top Trumps stats that suit this pack (a newer copy of a pack keeps the stats it already had)
    const pick = prev ? JSON.stringify({ stats: prev.stats }) : await claude(key, [{ type: "text", text:
      `I'm making a Top Trumps style card game for a family from a picture pack called "${p.name}"${p.theme ? ` (theme: ${p.theme})` : ""}. ` +
      (named ? `Some of the cards: ${p.names.filter(Boolean).slice(0, 40).join(", ")}. ` : "The pictures are family photos with no names. ") +
      `Choose 5 fun, kid-friendly stats that suit these characters, each scored 1 to 100 where higher is better (e.g. Bravery, Magic, Speed, Kindness, Cheekiness). ` +
      `Reply with JSON only: {"stats":["Stat 1","Stat 2","Stat 3","Stat 4","Stat 5"]}` }], 300);
    let stats = (json(pick, "{").stats || []).slice(0, 5).map(s => String(s).slice(0, 18));
    if (stats.length < 5) stats = ["Bravery", "Magic", "Speed", "Kindness", "Cheekiness"];
    // 2. look at the pictures a few at a time
    const tags = Array(p.pics.length).fill(null), vals = Array(p.pics.length).fill(null), names = p.names.slice();
    const todo = [];   // pictures Claude still needs to look at
    p.pics.forEach((_, i) => { const k = prev && names[i] && prev.byName[names[i]]; if (k) { tags[i] = k.t; vals[i] = k.v; } else todo.push(i); });
    const B = 6;
    for (let s = 0; s < todo.length; s += B) {
      const content = [];
      for (const i of todo.slice(s, s + B)) {
        content.push({ type: "text", text: `Picture ${i}${p.names[i] ? ` (named "${p.names[i]}")` : ""}:` });
        content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.pics[i].split(",")[1] } });
      }
      content.push({ type: "text", text:
        `For each picture above, answer these yes/no questions about the main character shown (1 = yes, 0 = no), in this order:\n` +
        TAGQ.map((q, k) => `${k + 1}. ${q[2]}`).join("\n") +
        `\nAlso give a short display name (keep the given name if there is one, otherwise describe them in 1-3 words, e.g. "Girl in red") ` +
        `and scores 1-100 for these Top Trumps stats, in order: ${stats.join(", ")}. Make the scores fit the character and spread them out so cards differ.\n` +
        `Reply with JSON only: [{"i":<picture number>,"name":"...","a":[${TAGQ.length} numbers],"s":[5 numbers]}]` });
      const out = json(await claude(key, content, 2500), "[");
      for (const o of out) {
        const i = Number(o.i); if (!(i >= 0 && i < p.pics.length)) continue;
        tags[i] = TAGQ.map((_, k) => (o.a && o.a[k]) ? 1 : 0);
        vals[i] = stats.map((_, k) => Math.max(1, Math.min(100, Math.round(Number(o.s && o.s[k]) || 50))));
        if (!names[i] && o.name) names[i] = String(o.name).slice(0, 24);
      }
      if (onProgress) onProgress(Math.min(todo.length, s + B), todo.length);
    }
    for (let i = 0; i < p.pics.length; i++) { if (!tags[i]) tags[i] = TAGQ.map(() => 0); if (!vals[i]) vals[i] = stats.map(() => 50); if (!names[i]) names[i] = "Card " + (i + 1); }
    p.names = names; p.tags = tags; p.deck = { stats, vals }; delete p.prev;
    await keep(p);
    return p;
  }

  root.PACKS = { TAGQ, MEM, list: () => LIST, refreshList, load, fromFile, sendTo, receive, progress, enrich, getKey, setKey,
    get: id => MEM[id] || null, pic: (id, i) => (MEM[id] && MEM[id].pics[i]) || null };
})(typeof window !== "undefined" ? window : globalThis);
