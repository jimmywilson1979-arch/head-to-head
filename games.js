// Head to Head — game rules and computer players.
// See THE GAME LIST at the bottom for the shape every game follows.
"use strict";
(function (root) {
  const rnd = a => a[Math.floor(Math.random() * a.length)];

  // ===== NOUGHTS & CROSSES =====
  const L3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  function tttCheck(b) {
    for (const l of L3) { const [a, c, d] = l; if (b[a] != null && b[a] === b[c] && b[a] === b[d]) return { w: b[a], line: l }; }
    return b.every(x => x != null) ? { w: "draw", line: [] } : null;
  }
  function tttScore(b, me, turn, depth) {
    const r = tttCheck(b);
    if (r) return r.w === "draw" ? 0 : (r.w === me ? 10 - depth : depth - 10);
    let best = turn === me ? -99 : 99;
    for (let i = 0; i < 9; i++) if (b[i] == null) {
      b[i] = turn; const s = tttScore(b, me, 1 - turn, depth + 1); b[i] = null;
      best = turn === me ? Math.max(best, s) : Math.min(best, s);
    }
    return best;
  }
  function tttFinish(b, seat) { // a cell that completes a line for seat, or -1
    for (let i = 0; i < 9; i++) if (b[i] == null) { b[i] = seat; const r = tttCheck(b); b[i] = null; if (r && r.w === seat) return i; }
    return -1;
  }
  function tttAI(b, seat, level) {
    const empty = b.map((v, i) => v == null ? i : -1).filter(i => i >= 0);
    if (level === "easy") {
      const w = tttFinish(b, seat); if (w >= 0 && Math.random() < 0.6) return w;
      return rnd(empty);
    }
    if (level === "medium") {
      const w = tttFinish(b, seat); if (w >= 0) return w;
      const blk = tttFinish(b, 1 - seat); if (blk >= 0 && Math.random() < 0.85) return blk;
      if (b[4] == null && Math.random() < 0.5) return 4;
      return rnd(empty);
    }
    let best = -99, picks = [];
    for (const i of empty) {
      b[i] = seat; const s = tttScore(b, seat, 1 - seat, 1); b[i] = null;
      if (s > best) { best = s; picks = [i]; } else if (s === best) picks.push(i);
    }
    return rnd(picks);
  }

  // ===== CONNECT 4 ===== (7 columns x 6 rows, index = row*7 + col, row 0 is the top)
  const W = 7, H = 6, ORDER = [3, 2, 4, 1, 5, 0, 6];
  const WIN4 = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const er = r + dr * 3, ec = c + dc * 3;
    if (er < 0 || er >= H || ec < 0 || ec >= W) continue;
    WIN4.push([0, 1, 2, 3].map(k => (r + dr * k) * W + c + dc * k));
  }
  function c4Drop(b, col) { if (col < 0 || col >= W) return -1; for (let r = H - 1; r >= 0; r--) if (b[r * W + col] == null) return r * W + col; return -1; }
  function c4Line(b, i) {
    const p = b[i]; if (p == null) return null;
    const r0 = Math.floor(i / W), c0 = i % W;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const line = [i];
      for (const s of [1, -1]) {
        let r = r0 + dr * s, c = c0 + dc * s;
        while (r >= 0 && r < H && c >= 0 && c < W && b[r * W + c] === p) { line.push(r * W + c); r += dr * s; c += dc * s; }
      }
      if (line.length >= 4) return line.sort((a, z) => a - z);
    }
    return null;
  }
  function c4Result(b, i) {
    const line = c4Line(b, i);
    if (line) return { w: b[i], line };
    for (let c = 0; c < W; c++) if (b[c] == null) return null;
    return { w: "draw", line: [] };
  }
  function c4Eval(b, p) {
    let s = 0;
    for (let r = 0; r < H; r++) { const v = b[r * W + 3]; if (v === p) s += 3; else if (v === 1 - p) s -= 3; }
    for (const w of WIN4) {
      let mine = 0, theirs = 0;
      for (const i of w) { const v = b[i]; if (v === p) mine++; else if (v != null) theirs++; }
      if (mine && theirs) continue;
      if (mine === 3) s += 5; else if (mine === 2) s += 2;
      else if (theirs === 3) s -= 4; else if (theirs === 2) s -= 1;
    }
    return s;
  }
  function c4Negamax(b, d, a, beta, p) {
    for (const c of ORDER) { const i = c4Drop(b, c); if (i < 0) continue; b[i] = p; const won = c4Line(b, i); b[i] = null; if (won) return 100000 + d; }
    if (d === 0) return c4Eval(b, p);
    let best = -Infinity, any = false;
    for (const c of ORDER) {
      const i = c4Drop(b, c); if (i < 0) continue; any = true;
      b[i] = p; const v = -c4Negamax(b, d - 1, -beta, -a, 1 - p); b[i] = null;
      if (v > best) best = v; if (best > a) a = best; if (a >= beta) break;
    }
    return any ? best : 0;
  }
  function c4AI(b, seat, level) {
    const legal = ORDER.filter(c => c4Drop(b, c) >= 0);
    // take a win when it's there (easy sometimes misses it)
    for (const c of legal) { const i = c4Drop(b, c); b[i] = seat; const won = c4Line(b, i); b[i] = null; if (won && (level !== "easy" || Math.random() < 0.7)) return c; }
    if (level === "easy" && Math.random() < 0.4) return rnd(legal);
    const depth = level === "easy" ? 2 : level === "medium" ? 4 : 6;
    let best = -Infinity, picks = [];
    for (const c of legal) {
      const i = c4Drop(b, c); b[i] = seat;
      const v = -c4Negamax(b, depth - 1, -Infinity, Infinity, 1 - seat); b[i] = null;
      if (v > best) { best = v; picks = [c]; } else if (v === best) picks.push(c);
    }
    return rnd(picks.length ? picks : legal);
  }

  // ===== DOTS AND BOXES ===== (4 x 4 boxes, 5 x 5 dots)
  const DR = 4, DC = 4, DH = (DR + 1) * DC, DE = DH + DR * (DC + 1);
  const DBOX = [];
  for (let r = 0; r < DR; r++) for (let c = 0; c < DC; c++) DBOX.push([r * DC + c, (r + 1) * DC + c, DH + r * (DC + 1) + c, DH + r * (DC + 1) + c + 1]);
  const EDGE_BOXES = Array.from({ length: DE }, () => []);
  DBOX.forEach((es, bi) => es.forEach(e => EDGE_BOXES[e].push(bi)));
  const dSides = (e, bi) => DBOX[bi].reduce((n, x) => n + (e[x] != null ? 1 : 0), 0);
  function dGiveaway(e, edge) { // how many boxes the other player could then take in a row
    const e2 = e.slice(); e2[edge] = 1; const taken = new Set(); let n = 0, more = true;
    while (more) {
      more = false;
      for (let bi = 0; bi < DBOX.length; bi++) {
        if (taken.has(bi)) continue;
        if (dSides(e2, bi) === 4) { taken.add(bi); continue; }
        if (dSides(e2, bi) === 3) { const x = DBOX[bi].find(k => e2[k] == null); e2[x] = 0; more = true; }
      }
      n = 0; for (let bi = 0; bi < DBOX.length; bi++) if (dSides(e2, bi) === 4 && dSides(e, bi) < 4) n++;
    }
    return n;
  }
  function dotsAI(S, seat, level) {
    const e = S.board.e, free = [];
    for (let i = 0; i < DE; i++) if (e[i] == null) free.push(i);
    const comp = free.filter(x => EDGE_BOXES[x].some(bi => dSides(e, bi) === 3));
    const safe = free.filter(x => EDGE_BOXES[x].every(bi => dSides(e, bi) < 2));
    if (level === "easy") {
      if (comp.length && Math.random() < 0.6) return rnd(comp);
      if (safe.length && Math.random() < 0.5) return rnd(safe);
      return rnd(free);
    }
    if (comp.length) return rnd(comp);
    if (safe.length && (level === "hard" || Math.random() < 0.85)) return rnd(safe);
    if (level === "medium") return rnd(free);
    let best = Infinity, picks = [];
    for (const x of free) { const g = dGiveaway(e, x); if (g < best) { best = g; picks = [x]; } else if (g === best) picks.push(x); }
    return rnd(picks);
  }

  // ===== BATTLESHIPS ===== (8 x 8, fleet 4,3,3,2,2)
  const BN = 8, FLEET = [4, 3, 3, 2, 2];
  function bsRandomFleet() {
    for (;;) {
      const occ = new Set(), ships = []; let ok = true;
      for (const L of FLEET) {
        let placed = false;
        for (let tries = 0; tries < 300 && !placed; tries++) {
          const h = Math.random() < .5;
          const r = Math.floor(Math.random() * (h ? BN : BN - L + 1)), c = Math.floor(Math.random() * (h ? BN - L + 1 : BN));
          const cells = []; for (let k = 0; k < L; k++) cells.push(h ? r * BN + c + k : (r + k) * BN + c);
          if (cells.some(x => occ.has(x))) continue;
          cells.forEach(x => occ.add(x)); ships.push(cells); placed = true;
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) return ships;
    }
  }
  function bsValidFleet(ships) {
    if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
    const lens = ships.map(s => Array.isArray(s) ? s.length : 0).sort((a, z) => z - a);
    if (lens.join() !== FLEET.slice().sort((a, z) => z - a).join()) return false;
    const occ = new Set();
    for (const s of ships) {
      if (!s.every(x => Number.isInteger(x) && x >= 0 && x < BN * BN)) return false;
      const c = s.slice().sort((a, z) => a - z), r0 = Math.floor(c[0] / BN);
      const row = c.every((x, k) => x === c[0] + k && Math.floor(x / BN) === r0);
      const col = c.every((x, k) => x === c[0] + k * BN);
      if (!row && !col) return false;
      for (const x of c) { if (occ.has(x)) return false; occ.add(x); }
    }
    return true;
  }
  function bsAI(S, seat, level) {
    const b = S.board;
    if (b.stage === "place") return { ships: bsRandomFleet() };
    const shots = b.shots[seat], sunkCells = new Set(b.sunk[1 - seat].flat());
    const unknown = [], hits = [];
    for (let i = 0; i < BN * BN; i++) { if (shots[i] == null) unknown.push(i); else if (shots[i] === "h" && !sunkCells.has(i)) hits.push(i); }
    const nb = i => { const r = Math.floor(i / BN), c = i % BN, o = []; if (r > 0) o.push(i - BN); if (r < BN - 1) o.push(i + BN); if (c > 0) o.push(i - 1); if (c < BN - 1) o.push(i + 1); return o; };
    const adj = () => [...new Set(hits.flatMap(nb))].filter(i => shots[i] == null);
    if (level === "easy") { const a = adj(); if (a.length && Math.random() < 0.5) return { fire: rnd(a) }; return { fire: rnd(unknown) }; }
    if (level === "medium") {
      if (hits.length >= 2) { // carry on along the line
        const sorted = hits.slice().sort((a, z) => a - z), sameRow = sorted.every(x => Math.floor(x / BN) === Math.floor(sorted[0] / BN));
        const ends = [];
        if (sameRow) { const lo = sorted[0], hi = sorted[sorted.length - 1]; if (lo % BN > 0) ends.push(lo - 1); if (hi % BN < BN - 1) ends.push(hi + 1); }
        else if (sorted.every(x => x % BN === sorted[0] % BN)) { const lo = sorted[0], hi = sorted[sorted.length - 1]; if (lo >= BN) ends.push(lo - BN); if (hi < BN * (BN - 1)) ends.push(hi + BN); }
        const ok = ends.filter(i => shots[i] == null); if (ok.length) return { fire: rnd(ok) };
      }
      const a = adj(); if (a.length) return { fire: rnd(a) };
      const par = unknown.filter(i => (Math.floor(i / BN) + i % BN) % 2 === 0);
      return { fire: rnd(par.length ? par : unknown) };
    }
    // hard: work out where ships could still be
    const left = FLEET.slice(); b.sunk[1 - seat].forEach(s => { const k = left.indexOf(s.length); if (k >= 0) left.splice(k, 1); });
    const heat = new Array(BN * BN).fill(0), hitSet = new Set(hits);
    for (const L of left) for (let r = 0; r < BN; r++) for (let c = 0; c < BN; c++) for (const h of [true, false]) {
      if (h ? c + L > BN : r + L > BN) continue;
      const cells = []; for (let k = 0; k < L; k++) cells.push(h ? r * BN + c + k : (r + k) * BN + c);
      if (cells.some(x => shots[x] === "m" || sunkCells.has(x))) continue;
      const cover = cells.filter(x => hitSet.has(x)).length;
      const w = hits.length ? (cover ? 1 + cover * 40 : 1) : 1;
      for (const x of cells) if (shots[x] == null) heat[x] += w;
    }
    let best = -1, picks = [];
    for (const i of unknown) { if (heat[i] > best) { best = heat[i]; picks = [i]; } else if (heat[i] === best) picks.push(i); }
    return { fire: rnd(picks.length ? picks : unknown) };
  }

  // ===== ROCK PAPER SCISSORS ===== (first to 3)
  const BEATS = { r: "s", p: "r", s: "p" };
  function rpsAI(S, seat, level) {
    const opts = ["r", "p", "s"], hist = S.board.hist;
    if (level === "easy" || hist.length < 2) return rnd(opts);
    const theirs = hist.map(h => seat === 0 ? h.b : h.a), mine = hist.map(h => seat === 0 ? h.a : h.b);
    if (level === "medium") { const last = mine[mine.length - 1]; return rnd(opts.filter(o => o !== last)); }
    if (Math.random() < 0.2) return rnd(opts);
    const prev = theirs[theirs.length - 1], cnt = { r: 0, p: 0, s: 0 };
    for (let k = 1; k < theirs.length; k++) if (theirs[k - 1] === prev) cnt[theirs[k]] += 2;
    theirs.forEach(x => cnt[x] += 1);
    const guess = opts.reduce((a, z) => cnt[z] > cnt[a] ? z : a, rnd(opts));
    return opts.find(o => BEATS[o] === guess);
  }


  // ===== CARD CLASH (Top Trumps style) =====
  // Each deck: stats (higher always wins) and cards [name, picture, ...values in stat order]. Facts are rough figures for a big adult.
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const art = folder => (i, c) => `img/cards/${folder}/${slug(c[0])}.webp`; // storybook pictures made in Gemini
  const DECKS = {
    animals: {
      id: "animals", name: "Animals", icon: "🦁",
      note: "Rough figures for a big adult. Size is the longest measurement (nose to tail, height or wingspan).",
      stats: [{ l: "Top speed", u: "mph" }, { l: "Weight", u: "kg" }, { l: "Lifespan", u: "yrs" }, { l: "Size", u: "cm" }, { l: "Danger", u: "/10" }],
      cards: [
        ["Cheetah", "🐆", 70, 54, 12, 200, 5], ["Lion", "🦁", 50, 190, 15, 300, 9], ["Tiger", "🐅", 40, 220, 15, 310, 9],
        ["African elephant", "🐘", 25, 6000, 70, 700, 8], ["Blue whale", "🐋", 20, 150000, 90, 2900, 2], ["Great white shark", "🦈", 35, 1100, 70, 480, 9],
        ["Polar bear", "🐻‍❄️", 25, 450, 25, 250, 9], ["Giraffe", "🦒", 35, 1200, 25, 550, 4], ["Hippo", "🦛", 19, 1500, 40, 450, 10],
        ["Gorilla", "🦍", 25, 160, 40, 180, 6], ["Saltwater crocodile", "🐊", 18, 1000, 70, 520, 10], ["Grey wolf", "🐺", 38, 45, 13, 180, 7],
        ["Golden eagle", "🦅", 150, 6, 30, 220, 4], ["Red kangaroo", "🦘", 44, 85, 20, 250, 5], ["Horse", "🐎", 55, 500, 30, 240, 3],
        ["White rhino", "🦏", 34, 2300, 45, 400, 8], ["Giant panda", "🐼", 20, 110, 20, 180, 4], ["Koala", "🐨", 18, 12, 15, 80, 1],
        ["Sloth", "🦥", 0.2, 6, 20, 70, 1], ["Giant tortoise", "🐢", 0.2, 250, 150, 150, 1], ["Giant octopus", "🐙", 25, 15, 4, 400, 2],
        ["Gentoo penguin", "🐧", 22, 8, 15, 80, 1], ["King cobra", "🐍", 12, 6, 20, 400, 9], ["Red fox", "🦊", 30, 7, 5, 120, 2],
        ["Brown hare", "🐇", 45, 4, 5, 70, 1], ["Bottlenose dolphin", "🐬", 22, 300, 45, 350, 2], ["Orca", "🐳", 34, 5500, 60, 800, 6],
        ["Grizzly bear", "🐻", 35, 300, 25, 250, 9], ["Zebra", "🦓", 40, 350, 25, 270, 4], ["Chimpanzee", "🐒", 25, 60, 45, 150, 7],
        ["Hedgehog", "🦔", 6, 1, 4, 25, 1], ["Scarlet macaw", "🦜", 35, 1, 50, 105, 1],
      ],
    },
    dinosaurs: {
      id: "dinosaurs", name: "Dinosaurs", icon: "🦖",
      note: "Scientists' best estimates. They change as new fossils are found.", img: art("dinosaurs"),
      stats: [{ l: "Length", u: "m" }, { l: "Weight", u: "kg" }, { l: "Top speed", u: "mph" }, { l: "Lived", u: "mya" }, { l: "Fierceness", u: "/10" }],
      cards: [
        ["Tyrannosaurus rex", "🦖", 12.3, 8400, 17, 68, 10], ["Spinosaurus", "🦖", 15, 7400, 15, 97, 9], ["Giganotosaurus", "🦖", 13, 8000, 20, 98, 10],
        ["Allosaurus", "🦖", 9.5, 2300, 21, 152, 9], ["Velociraptor", "🦖", 2, 15, 24, 75, 7], ["Utahraptor", "🦖", 7, 500, 22, 126, 9],
        ["Deinonychus", "🦖", 3.4, 80, 25, 115, 8], ["Carnotaurus", "🦖", 8, 1400, 30, 72, 8], ["Dilophosaurus", "🦖", 7, 400, 20, 193, 7],
        ["Baryonyx", "🦖", 9, 1700, 18, 125, 7], ["Compsognathus", "🦖", 1, 3, 40, 150, 3], ["Gallimimus", "🦖", 6, 450, 42, 70, 2],
        ["Microraptor", "🦖", 0.8, 1, 25, 120, 3], ["Triceratops", "🦕", 9, 9000, 20, 67, 6], ["Stegosaurus", "🦕", 9, 5000, 5, 152, 5],
        ["Ankylosaurus", "🦕", 8, 6000, 6, 68, 5], ["Brachiosaurus", "🦕", 26, 40000, 12, 154, 3], ["Diplodocus", "🦕", 26, 15000, 9, 152, 3],
        ["Argentinosaurus", "🦕", 35, 75000, 5, 95, 3], ["Apatosaurus", "🦕", 22, 23000, 10, 152, 3], ["Iguanodon", "🦕", 10, 3500, 15, 126, 4],
        ["Parasaurolophus", "🦕", 9.5, 2500, 25, 76, 2], ["Pachycephalosaurus", "🦕", 4.5, 450, 20, 68, 5], ["Edmontosaurus", "🦕", 12, 6000, 28, 70, 2],
      ],
    },
    space: {
      id: "space", name: "Space", icon: "🪐",
      note: "Temperature is the average at the surface (or cloud tops). Moons orbit at their planet's distance from the Sun. Moon counts as of 2026, and still rising!",
      stats: [{ l: "Width", u: "km" }, { l: "Gravity", u: "m/s²" }, { l: "Temperature", u: "°C" }, { l: "From the Sun", u: "mkm" }, { l: "Moons", u: "" }],
      cards: [
        ["The Sun", "☀️", 1392700, 274, 5500, 0, 0], ["Mercury", "🌑", 4879, 3.7, 167, 58, 0], ["Venus", "🟡", 12104, 8.9, 464, 108, 0],
        ["Earth", "🌍", 12742, 9.8, 15, 150, 1], ["The Moon", "🌕", 3475, 1.6, -20, 150, 0], ["Mars", "🔴", 6779, 3.7, -65, 228, 2],
        ["Jupiter", "🟠", 139820, 24.8, -110, 778, 101], ["Saturn", "🪐", 116460, 10.4, -140, 1430, 285], ["Uranus", "🔵", 50724, 8.9, -195, 2870, 29],
        ["Neptune", "🌀", 49244, 11, -200, 4500, 16], ["Pluto", "🌑", 2377, 0.6, -230, 5900, 5], ["Ceres", "🌑", 939, 0.28, -105, 414, 0],
        ["Eris", "🌑", 2326, 0.82, -240, 10100, 1], ["Haumea", "🥚", 1632, 0.4, -241, 6450, 2], ["Makemake", "🌑", 1430, 0.5, -239, 6850, 1],
        ["Io", "🟡", 3643, 1.8, -130, 778, 0], ["Europa", "🌕", 3122, 1.3, -160, 778, 0], ["Ganymede", "🌖", 5268, 1.4, -160, 778, 0],
        ["Callisto", "🌘", 4821, 1.2, -140, 778, 0], ["Titan", "🟠", 5150, 1.35, -179, 1430, 0], ["Enceladus", "⚪", 504, 0.11, -198, 1430, 0],
        ["Triton", "🌗", 2707, 0.78, -235, 4500, 0], ["Charon", "🌑", 1212, 0.29, -220, 5900, 0], ["Phobos", "🥔", 22, 0.006, -40, 228, 0],
      ],
    },
    countries: {
      id: "countries", name: "Countries", icon: "🌍",
      note: "Rough 2025 figures. Neighbours means countries you can walk into over a land border.",
      img: i => "img/flags/" + ["gb-wls", "gb-eng", "gb-sct", "ie", "fr", "es", "it", "de", "us", "ca", "br", "au", "cn", "in", "jp", "ru", "eg", "za", "mx", "ar", "np", "is", "no", "gr", "ke", "nz", "nl", "ch", "jm", "va"][i] + ".svg", flag: true,
      stats: [{ l: "Population", u: "people" }, { l: "Area", u: "km²" }, { l: "Highest point", u: "m" }, { l: "Neighbours", u: "" }],
      cards: [
        ["Wales", "🏴\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}", 3200000, 20779, 1085, 1], ["England", "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", 57100000, 130279, 978, 2],
        ["Scotland", "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}", 5500000, 77910, 1345, 1], ["Ireland", "🇮🇪", 5400000, 70273, 1039, 1],
        ["France", "🇫🇷", 68000000, 551695, 4806, 8], ["Spain", "🇪🇸", 49000000, 505990, 3715, 5], ["Italy", "🇮🇹", 59000000, 301340, 4748, 6],
        ["Germany", "🇩🇪", 83500000, 357588, 2962, 9], ["USA", "🇺🇸", 341000000, 9833520, 6190, 2], ["Canada", "🇨🇦", 41500000, 9984670, 5959, 1],
        ["Brazil", "🇧🇷", 212000000, 8515767, 2995, 10], ["Australia", "🇦🇺", 27400000, 7692024, 2228, 0], ["China", "🇨🇳", 1408000000, 9596961, 8849, 14],
        ["India", "🇮🇳", 1460000000, 3287263, 8586, 6], ["Japan", "🇯🇵", 123500000, 377975, 3776, 0], ["Russia", "🇷🇺", 144000000, 17098246, 5642, 14],
        ["Egypt", "🇪🇬", 117000000, 1002450, 2629, 4], ["South Africa", "🇿🇦", 64000000, 1221037, 3450, 6], ["Mexico", "🇲🇽", 131000000, 1964375, 5636, 3],
        ["Argentina", "🇦🇷", 46000000, 2780400, 6961, 5], ["Nepal", "🇳🇵", 30000000, 147516, 8849, 2], ["Iceland", "🇮🇸", 390000, 103000, 2110, 0],
        ["Norway", "🇳🇴", 5600000, 385207, 2469, 3], ["Greece", "🇬🇷", 10400000, 131957, 2918, 4], ["Kenya", "🇰🇪", 57000000, 580367, 5199, 5],
        ["New Zealand", "🇳🇿", 5300000, 268021, 3724, 0], ["Netherlands", "🇳🇱", 18000000, 41850, 322, 2], ["Switzerland", "🇨🇭", 9000000, 41285, 4634, 5],
        ["Jamaica", "🇯🇲", 2800000, 10991, 2256, 0], ["Vatican City", "🇻🇦", 800, 0.49, 75, 1],
      ],
    },
    sea: {
      id: "sea", name: "Sea life", icon: "🐙",
      note: "Rough figures for a big adult. Speeds are the fastest commonly quoted. Lots of deep-sea facts are best guesses!",
      stats: [{ l: "Top speed", u: "mph" }, { l: "Weight", u: "kg" }, { l: "Length", u: "cm" }, { l: "Deepest dive", u: "m" }, { l: "Danger", u: "/10" }],
      cards: [
        ["Blue whale", "🐋", 20, 150000, 2900, 500, 2], ["Sperm whale", "🐋", 23, 45000, 1600, 2250, 4], ["Humpback whale", "🐳", 17, 30000, 1600, 240, 2],
        ["Orca", "🐳", 34, 5500, 800, 760, 6], ["Great white shark", "🦈", 35, 1100, 480, 1200, 9], ["Whale shark", "🦈", 3, 19000, 1200, 1900, 1],
        ["Hammerhead shark", "🦈", 25, 450, 600, 300, 5], ["Shortfin mako", "🦈", 45, 570, 400, 900, 7], ["Bottlenose dolphin", "🐬", 22, 300, 350, 300, 2],
        ["Sailfish", "🐟", 68, 90, 300, 200, 2], ["Bluefin tuna", "🐟", 43, 680, 300, 1000, 1], ["Swordfish", "🐟", 60, 650, 455, 550, 3],
        ["Giant squid", "🦑", 5, 275, 1200, 1000, 4], ["Giant octopus", "🐙", 25, 15, 400, 1500, 2], ["Leatherback turtle", "🐢", 22, 700, 200, 1280, 1],
        ["Saltwater crocodile", "🐊", 18, 1000, 520, 20, 10], ["Elephant seal", "🦭", 14, 3000, 600, 2400, 3], ["Lobster", "🦞", 11, 20, 100, 700, 2],
        ["Japanese spider crab", "🦀", 1, 19, 370, 600, 1], ["Clownfish", "🐠", 1, 0.03, 11, 15, 1], ["Pufferfish", "🐡", 2, 2, 30, 200, 8],
        ["Mantis shrimp", "🦐", 3, 0.1, 38, 100, 5], ["Emperor penguin", "🐧", 6, 40, 120, 565, 1], ["Sea otter", "🦦", 6, 45, 150, 100, 1],
      ],
    },
    christmas: {
      id: "christmas", name: "Christmas", icon: "🎄",
      note: "Stats are just for fun. Argue about them over the mince pies!",
      stats: [{ l: "Festive cheer", u: "/100" }, { l: "Sparkle", u: "/100" }, { l: "Speed", u: "/100" }, { l: "Cuddliness", u: "/100" }, { l: "Magic", u: "/100" }],
      cards: [
        ["Father Christmas", "🎅", 100, 80, 95, 85, 100], ["Mrs Claus", "🤶", 95, 75, 30, 95, 90], ["Head elf", "🧝", 90, 70, 60, 70, 80],
        ["Dasher", "🦌", 80, 60, 98, 60, 85], ["Blitzen", "🦌", 75, 70, 96, 55, 85], ["Comet", "🦌", 78, 90, 97, 58, 88],
        ["Snowman", "⛄", 85, 60, 5, 40, 70], ["Gingerbread man", "🍪", 70, 30, 90, 50, 40], ["Christmas tree", "🎄", 95, 100, 0, 20, 30],
        ["Star on top", "⭐", 80, 100, 10, 10, 75], ["Robin", "🐦", 70, 40, 60, 75, 20], ["Polar bear", "🐻‍❄️", 50, 30, 50, 100, 10],
        ["Penguin", "🐧", 60, 20, 30, 90, 10], ["Present", "🎁", 90, 80, 5, 30, 50], ["Cracker", "🎉", 85, 70, 40, 10, 30],
        ["Stocking", "🧦", 85, 40, 0, 60, 60], ["Candy cane", "🍬", 75, 60, 0, 10, 20], ["Mince pie", "🥧", 70, 10, 0, 30, 10],
        ["Christmas pudding", "🍮", 65, 50, 0, 25, 15], ["Turkey", "🦃", 60, 10, 35, 30, 5], ["Brussels sprout", "🥬", 5, 5, 0, 5, 1],
        ["Sleigh", "🛷", 85, 70, 95, 20, 90], ["Snowflake", "❄️", 70, 95, 40, 15, 60], ["Bells", "🔔", 80, 85, 20, 10, 40],
        ["Angel", "👼", 90, 95, 70, 80, 95], ["Candle", "🕯️", 75, 70, 0, 15, 35],
      ],
    },
  };
  const ttVal = (d, id, st) => DECKS[d].cards[id][2 + st];
  function ttAI(S, seat, level) {
    const d = S.board.deck, nStats = DECKS[d].stats.length, top = S.board.top;
    if (level === "easy") return Math.floor(Math.random() * nStats);
    const mine = new Set((S.sec[seat] || []).concat(S.sec.pot || [])), others = DECKS[d].cards.map((_, i) => i).filter(i => !mine.has(i) && i !== top);
    let best = -1, pick = 0;
    for (let st = 0; st < nStats; st++) {
      const v = ttVal(d, top, st); let sc = 0;
      for (const o of others) { const w = ttVal(d, o, st); sc += v > w ? 1 : v === w ? .5 : 0; }
      sc = others.length ? sc / others.length : .5;
      if (sc > best) { best = sc; pick = st; }
    }
    if (level === "medium" && Math.random() < 0.3) return Math.floor(Math.random() * nStats);
    return pick;
  }


  // ===== WHO IS IT? (Guess Who style) =====
  // [name, skin 0-5, hair colour, hair style, eye colour, extras] extras: g glasses, h beanie, c cap, b beard, m moustache, e earrings, s big smile, r rosy cheeks, f freckles
  const PEOPLE = [
    ["Alfie", 1, "brown", "short", "blue", "cs"], ["Bella", 0, "blonde", "long", "blue", "er"], ["Carys", 2, "black", "curly", "brown", "ges"],
    ["Dai", 0, "grey", "short", "green", "bmg"], ["Ella", 3, "black", "bun", "brown", "es"], ["Finn", 0, "ginger", "short", "green", "fs"],
    ["Gwen", 1, "ginger", "long", "blue", "hfr"], ["Hassan", 3, "black", "short", "brown", "b"], ["Isla", 0, "brown", "long", "green", "g"],
    ["Jack", 1, "blonde", "short", "blue", "h"], ["Kemi", 5, "black", "curly", "brown", "es"], ["Leo", 2, "brown", "curly", "brown", "cm"],
    ["Maya", 4, "black", "long", "brown", "he"], ["Nia", 5, "brown", "bun", "green", "gs"], ["Owen", 0, "none", "bald", "blue", "bg"],
    ["Priya", 3, "black", "long", "brown", "eg"], ["Rhys", 1, "black", "short", "blue", "ms"], ["Sophie", 0, "blonde", "bun", "green", "frs"],
    ["Theo", 2, "ginger", "curly", "blue", "fc"], ["Uma", 4, "grey", "bun", "brown", "ge"], ["Vic", 1, "none", "bald", "brown", "mrs"],
    ["Will", 0, "blonde", "curly", "green", "b"], ["Zara", 4, "brown", "long", "blue", "ce"], ["Mo", 5, "grey", "short", "brown", "bmh"],
  ].map(([name, skin, hair, style, eyes, x]) => ({ name, skin, hair, style, eyes, x }));
  const has = (p, k) => p.x.includes(k);
  const QUESTIONS = [
    ["Do they wear glasses?", p => has(p, "g")], ["Are they wearing a hat?", p => has(p, "h") || has(p, "c")],
    ["Do they have a beard?", p => has(p, "b")], ["Do they have a moustache?", p => has(p, "m")],
    ["Are they bald?", p => p.style === "bald"], ["Do they have black hair?", p => p.hair === "black"],
    ["Do they have brown hair?", p => p.hair === "brown"], ["Do they have blonde hair?", p => p.hair === "blonde"],
    ["Do they have ginger hair?", p => p.hair === "ginger"], ["Do they have grey hair?", p => p.hair === "grey"],
    ["Do they have long hair?", p => p.style === "long"], ["Do they have curly hair?", p => p.style === "curly"],
    ["Is their hair in a bun?", p => p.style === "bun"], ["Do they have blue eyes?", p => p.eyes === "blue"],
    ["Do they have brown eyes?", p => p.eyes === "brown"], ["Do they have green eyes?", p => p.eyes === "green"],
    ["Are they wearing earrings?", p => has(p, "e")], ["Are they showing their teeth?", p => has(p, "s")],
    ["Do they have rosy cheeks?", p => has(p, "r")], ["Do they have freckles?", p => has(p, "f")],
  ];
  function wiAI(S, seat, level) {
    const b = S.board;
    if (b.stage === "pick") return { pick: Math.floor(Math.random() * PEOPLE.length) };
    const up = PEOPLE.map((_, i) => i).filter(i => !b.down[seat][i]);
    if (up.length === 1) return { guess: up[0] };
    if (level === "easy" && up.length <= 3 && Math.random() < 0.5) return { guess: rnd(up) };
    const asked = new Set(b.log.filter(l => l.seat === seat && l.q != null).map(l => l.q));
    const split = QUESTIONS.map(([, f], qi) => { const yes = up.filter(i => f(PEOPLE[i])).length; return { qi, yes, no: up.length - yes }; })
      .filter(o => !asked.has(o.qi));
    const useful = split.filter(o => o.yes && o.no);
    if (!useful.length) return { guess: rnd(up) };
    if (level === "easy") return { ask: (Math.random() < 0.3 && split.length ? rnd(split) : rnd(useful)).qi };
    if (level === "medium") return { ask: rnd(useful).qi };
    const best = Math.min(...useful.map(o => Math.abs(o.yes - o.no)));
    return { ask: rnd(useful.filter(o => Math.abs(o.yes - o.no) === best)).qi };
  }


  // ===== MINI GOLF ===== course is 200 x 340 units, tee at the bottom. Only + - * / and sqrt, so every phone gets the same result.
  const GW = 200, GH = 340, BALL_R = 5, CUP_R = 8, MAXV = 9, MAX_STROKES = 6;
  const box = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const HOLES = [
    { name: "Straight Up", par: 2, outline: box(30, 20, 140, 300), blocks: [], sand: [], water: [], tee: [100, 290], cup: [100, 62] },
    { name: "Dog Leg", par: 3, outline: [[20, 320], [90, 320], [90, 110], [180, 110], [180, 20], [20, 20]], blocks: [], sand: [], water: [], tee: [55, 290], cup: [150, 58] },
    { name: "Building Blocks", par: 3, outline: box(20, 20, 160, 300), blocks: [box(36, 190, 56, 18), box(108, 120, 56, 18), box(76, 250, 48, 14)], sand: [], water: [], tee: [100, 296], cup: [100, 50] },
    { name: "Beach Hut", par: 3, outline: box(20, 20, 160, 300), blocks: [], sand: [[110, 80, 70, 44]], water: [[20, 150, 104, 40]], tee: [100, 296], cup: [140, 50] },
    { name: "Mind the Gap", par: 3, outline: box(20, 20, 160, 300), blocks: [box(20, 166, 66, 10), box(114, 166, 66, 10)], sand: [[60, 30, 80, 30]], water: [], tee: [60, 296], cup: [140, 50] },
    { name: "Zig Zag", par: 4, outline: box(20, 20, 160, 300), blocks: [box(20, 232, 122, 12), box(58, 146, 122, 12)], sand: [], water: [[138, 70, 42, 50]], tee: [160, 296], cup: [120, 48] },
  ];
  const segsOf = poly => poly.map((p, i) => [p[0], p[1], poly[(i + 1) % poly.length][0], poly[(i + 1) % poly.length][1]]);
  HOLES.forEach(h => { h.segs = segsOf(h.outline).concat(...h.blocks.map(segsOf)); });
  const inRect = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
  function golfSim(hole, x, y, vx, vy, onStep) {
    const h = HOLES[hole];
    for (let step = 0; step < 4000; step++) {
      const sp = Math.sqrt(vx * vx + vy * vy);
      const sand = h.sand.some(r => inRect(x, y, r));
      const k = sand ? 0.93 : 0.988;
      vx *= k; vy *= k;
      if (sp < 0.05) return { x, y, in: false, water: false };
      const n = Math.ceil(sp / 2);
      for (let s = 0; s < n; s++) {
        x += vx / n; y += vy / n;
        for (const g of h.segs) {
          const ax = g[0], ay = g[1], bx = g[2], by = g[3], ex = bx - ax, ey = by - ay;
          let t = ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey); t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = ax + ex * t, cy = ay + ey * t, dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
          if (d2 < BALL_R * BALL_R && d2 > 1e-9) {
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
            x = cx + nx * BALL_R; y = cy + ny * BALL_R;
            const vn = vx * nx + vy * ny;
            if (vn < 0) { vx -= 1.8 * vn * nx; vy -= 1.8 * vn * ny; }
          }
        }
      }
      const cdx = x - h.cup[0], cdy = y - h.cup[1];
      if (cdx * cdx + cdy * cdy < CUP_R * CUP_R && sp < 2.8) { if (onStep) onStep(h.cup[0], h.cup[1]); return { x: h.cup[0], y: h.cup[1], in: true, water: false }; }
      if (h.water.some(r => inRect(x, y, r))) { if (onStep) onStep(x, y); return { x, y, in: false, water: true }; }
      if (onStep) onStep(x, y);
    }
    return { x, y, in: false, water: false };
  }
  function golfAI(S, seat, level) {
    const b = S.board, ball = b.balls[seat], h = HOLES[b.hole];
    const N = level === "hard" ? 260 : level === "medium" ? 90 : 30;
    const base = Math.atan2(h.cup[1] - ball.y, h.cup[0] - ball.x);
    const score = (vx, vy) => { const r = golfSim(b.hole, ball.x, ball.y, vx, vy); if (r.in) return -1000 + Math.sqrt(vx * vx + vy * vy); if (r.water) return 500; const dx = r.x - h.cup[0], dy = r.y - h.cup[1]; return Math.sqrt(dx * dx + dy * dy); };
    let best = null;
    const tryShot = (a, p) => { const vx = Math.cos(a) * p, vy = Math.sin(a) * p, sc = score(vx, vy); if (!best || sc < best.sc) best = { a, p, sc }; };
    for (let i = 0; i < N; i++) {
      const a = Math.random() < 0.5 ? base + (Math.random() - 0.5) * 0.9 : Math.random() * Math.PI * 2;
      tryShot(a, 0.8 + Math.random() * (MAXV - 0.8));
    }
    if (level === "hard") for (let i = 0; i < 80; i++) tryShot(best.a + (Math.random() - 0.5) * 0.08, Math.min(MAXV, Math.max(0.6, best.p * (0.92 + Math.random() * 0.16))));
    const wob = level === "hard" ? 0.012 : level === "medium" ? 0.05 : 0.12, pw = level === "hard" ? 0.04 : level === "medium" ? 0.1 : 0.22;
    const a = best.a + (Math.random() - 0.5) * 2 * wob, p = Math.min(MAXV, best.p * (1 + (Math.random() - 0.5) * 2 * pw));
    return { vx: Math.round(Math.cos(a) * p * 1000) / 1000, vy: Math.round(Math.sin(a) * p * 1000) / 1000 };
  }


  // ===== AIR HOCKEY ===== table 100 wide x 320 long. Seat 0 defends the bottom goal (y = 320), seat 1 the top (y = 0).
  const HK = { W: 100, L: 320, GOAL: 38, PR: 5, MR: 9, TARGET: 7, MAXP: 430, PADV: 520 };
  function hkNewPuck(seat) { return { x: HK.W / 2, y: seat === 0 ? HK.L * 0.7 : HK.L * 0.3, vx: 0, vy: 0 }; }
  function hkClampPad(seat, x, y) {
    const r = HK.MR, half = HK.L / 2;
    x = Math.max(r, Math.min(HK.W - r, x));
    y = seat === 0 ? Math.max(half + r, Math.min(HK.L - r, y)) : Math.max(r, Math.min(half - r, y));
    return [x, y];
  }
  // one physics step. Returns the seat that scored, or -1. ev collects sounds: "h" hit, "w" wall
  function hkStep(st, dt, ev) {
    for (let i = 0; i < 2; i++) {
      const m = st.pad[i], [tx, ty] = hkClampPad(i, m.tx, m.ty), dx = tx - m.x, dy = ty - m.y, d = Math.sqrt(dx * dx + dy * dy);
      const mv = Math.min(d, (m.max || HK.PADV) * dt);
      const nx = d > 1e-6 ? dx / d * mv : 0, ny = d > 1e-6 ? dy / d * mv : 0;
      m.x += nx; m.y += ny; m.vx = nx / dt; m.vy = ny / dt;
    }
    const p = st.puck;
    if (st.frozen) return -1;
    p.vx *= 0.9985; p.vy *= 0.9985;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const r = HK.PR;
    hkWalls(p, ev);
    if (p.y < -r * 2) return 0;          // in the top goal: seat 0 scores
    if (p.y > HK.L + r * 2) return 1;    // in the bottom goal: seat 1 scores
    for (let i = 0; i < 2; i++) {
      const m = st.pad[i], dx = p.x - m.x, dy = p.y - m.y, d2 = dx * dx + dy * dy, rr = r + HK.MR;
      if (d2 < rr * rr && d2 > 1e-9) {
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        p.x = m.x + nx * rr; p.y = m.y + ny * rr;
        const rvx = p.vx - m.vx, rvy = p.vy - m.vy, vn = rvx * nx + rvy * ny;
        if (vn < 0) { p.vx -= 1.9 * vn * nx; p.vy -= 1.9 * vn * ny; ev && ev.push("h"); }
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (sp > HK.MAXP) { p.vx *= HK.MAXP / sp; p.vy *= HK.MAXP / sp; }
        hkWalls(p, null); // a paddle can't shove the puck through the boards
      }
    }
    return -1;
  }
  // boards with rounded corners (like a real table), and an opening for each goal
  const CR = 18;
  function hkWalls(p, ev) {
    const r = HK.PR, inGoal = Math.abs(p.x - HK.W / 2) < HK.GOAL / 2 - r * .3;
    if (p.x < r) { p.x = r; if (p.vx < 0) { p.vx = -p.vx * .9; ev && ev.push("w"); } }
    if (p.x > HK.W - r) { p.x = HK.W - r; if (p.vx > 0) { p.vx = -p.vx * .9; ev && ev.push("w"); } }
    if (!inGoal) {
      if (p.y < r) { p.y = r; if (p.vy < 0) { p.vy = -p.vy * .9; ev && ev.push("w"); } }
      if (p.y > HK.L - r) { p.y = HK.L - r; if (p.vy > 0) { p.vy = -p.vy * .9; ev && ev.push("w"); } }
    }
    const cx = p.x < CR ? CR : p.x > HK.W - CR ? HK.W - CR : null, cy = p.y < CR ? CR : p.y > HK.L - CR ? HK.L - CR : null;
    if (cx != null && cy != null) {
      const dx = p.x - cx, dy = p.y - cy, d = Math.sqrt(dx * dx + dy * dy), lim = CR - r;
      if (d > lim && d > 1e-9) {
        const nx = dx / d, ny = dy / d; p.x = cx + nx * lim; p.y = cy + ny * lim;
        const vn = p.vx * nx + p.vy * ny; if (vn > 0) { p.vx -= 1.9 * vn * nx; p.vy -= 1.9 * vn * ny; ev && ev.push("w"); }
      }
    }
  }
  // where the computer wants its paddle
  function hkAI(st, seat, level) {
    const p = st.puck, half = HK.L / 2, mine = seat === 0 ? p.y > half : p.y < half;
    const homeY = seat === 0 ? HK.L - 24 : 24, goalY = seat === 0 ? 0 : HK.L;
    const lag = level === "easy" ? 0.35 : level === "medium" ? 0.15 : 0.05;
    const px = p.x + p.vx * lag, py = p.y + p.vy * lag;
    const comingAtMe = seat === 0 ? p.vy > 30 : p.vy < -30;
    const mem = st.ai || (st.ai = [{ slow: 0, side: 1 }, { slow: 0, side: 1 }]), me = mem[seat];
    const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    me.slow = mine && spd < 25 ? me.slow + 1 : 0;
    if (me.slow > 0 && me.slow % 90 === 0) me.side = -me.side; // stuck for a while: come at it from the other side
    if (mine && !(comingAtMe && Math.abs(py - homeY) > 60 && level !== "hard")) {
      const nearWall = px < 16 || px > HK.W - 16 || (seat === 0 ? py > HK.L - 18 : py < 18);
      let ax = HK.W / 2 + (level === "hard" ? (Math.random() - .5) * 30 : 0), ay = goalY;
      if (nearWall || me.slow > 90) { ax = HK.W / 2 + me.side * 20; ay = half; }
      const a = Math.atan2(ay - py, ax - px), dx = Math.cos(a), dy = Math.sin(a), rr = HK.PR + HK.MR;
      const m = st.pad[seat], rel = (m.x - px) * dx + (m.y - py) * dy;
      if (rel < -rr * 0.6) return [px + dx * 30, py + dy * 30];          // behind it: strike through
      const side = me.slow > 60 ? me.side : (m.x - px) * -dy + (m.y - py) * dx > 0 ? 1 : -1; // in front: go round it
      return [px - dx * (rr + 8) - dy * side * rr, py - dy * (rr + 8) + dx * side * rr];
    }
    const track = level === "easy" ? .4 : level === "medium" ? .65 : .85;
    return [HK.W / 2 + (px - HK.W / 2) * track, homeY];
  }

  // ===== THE GAME LIST =====
  // init(S): set S.board (everyone sees), S.sec (host only), S.turn (seat, or -1 when both act at once)
  // waiting(S, seat): does this seat need to act now?
  // move(S, seat, mv): false if not allowed, otherwise a sound name; sets S.last / S.turn / S.result
  // ai(S, seat, level): the computer's move. local: guests can show their own move before the host confirms.
  const turnWaiting = (S, seat) => S.turn === seat;
  const GAMES = {
    ttt: {
      id: "ttt", name: "Noughts & Crosses", local: true,
      init(S) { S.board = Array(9).fill(null); S.sec = {}; S.turn = S.starter; },
      waiting: turnWaiting,
      move(S, seat, mv) {
        if (!Number.isInteger(mv) || mv < 0 || mv > 8 || S.board[mv] != null) return false;
        S.board[mv] = seat; S.last = mv;
        const r = tttCheck(S.board); if (r) S.result = r; else S.turn = 1 - seat;
        return "place";
      },
      ai: (S, seat, level) => tttAI(S.board.slice(), seat, level),
    },
    c4: {
      id: "c4", name: "Connect 4", local: true, cols: W, rows: H,
      init(S) { S.board = Array(W * H).fill(null); S.sec = {}; S.turn = S.starter; },
      waiting: turnWaiting,
      move(S, seat, mv) {
        const i = Number.isInteger(mv) ? c4Drop(S.board, mv) : -1; if (i < 0) return false;
        S.board[i] = seat; S.last = i;
        const r = c4Result(S.board, i); if (r) S.result = r; else S.turn = 1 - seat;
        return "drop";
      },
      ai: (S, seat, level) => c4AI(S.board.slice(), seat, level),
    },
    dots: {
      id: "dots", name: "Dots & Boxes", local: true, R: DR, C: DC, H: DH, E: DE,
      init(S) { S.board = { e: Array(DE).fill(null), box: Array(DR * DC).fill(null), score: [0, 0] }; S.sec = {}; S.turn = S.starter; },
      waiting: turnWaiting,
      move(S, seat, mv) {
        const b = S.board; if (!Number.isInteger(mv) || mv < 0 || mv >= DE || b.e[mv] != null) return false;
        b.e[mv] = seat; S.last = mv; let k = 0;
        for (const bi of EDGE_BOXES[mv]) if (b.box[bi] == null && dSides(b.e, bi) === 4) { b.box[bi] = seat; b.score[seat]++; k++; }
        if (b.box.every(x => x != null)) S.result = { w: b.score[0] === b.score[1] ? "draw" : b.score[0] > b.score[1] ? 0 : 1, line: [] };
        else if (!k) S.turn = 1 - seat;
        return k ? "box" : "line";
      },
      ai: dotsAI,
    },
    bs: {
      id: "bs", name: "Battleships", local: false, N: BN, FLEET,
      init(S) { S.board = { stage: "place", ready: [false, false], shots: [Array(BN * BN).fill(null), Array(BN * BN).fill(null)], sunk: [[], []], reveal: null }; S.sec = { 0: null, 1: null }; S.turn = -1; },
      waiting: (S, seat) => S.board.stage === "place" ? !S.board.ready[seat] : S.turn === seat,
      move(S, seat, mv) {
        const b = S.board; if (!mv || typeof mv !== "object") return false;
        if (mv.ships) {
          if (b.stage !== "place" || b.ready[seat] || !bsValidFleet(mv.ships)) return false;
          S.sec[seat] = mv.ships; b.ready[seat] = true; S.last = null;
          if (b.ready[0] && b.ready[1]) { b.stage = "fire"; S.turn = S.starter; }
          return "ready";
        }
        const cell = mv.fire;
        if (b.stage !== "fire" || S.turn !== seat || !Number.isInteger(cell) || cell < 0 || cell >= BN * BN || b.shots[seat][cell] != null) return false;
        const ship = S.sec[1 - seat].find(s => s.includes(cell));
        b.shots[seat][cell] = ship ? "h" : "m";
        let sunk = false;
        if (ship && ship.every(x => b.shots[seat][x] === "h")) { b.sunk[1 - seat].push(ship); sunk = true; }
        S.last = { seat, cell, hit: !!ship, sunk };
        if (b.sunk[1 - seat].length === FLEET.length) { S.result = { w: seat, line: [] }; b.reveal = { 0: S.sec[0], 1: S.sec[1] }; }
        else S.turn = 1 - seat;
        return sunk ? "sunk" : ship ? "hit" : "miss";
      },
      ai: bsAI,
      randomFleet: bsRandomFleet,
    },
    tt: {
      id: "tt", name: "Card Clash", local: false, MAX_ROUNDS: 30,
      init(S) {
        const deck = (S.opts && DECKS[S.opts.deck]) ? S.opts.deck : "animals";
        const ids = DECKS[deck].cards.map((_, i) => i);
        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
        const half = Math.floor(ids.length / 2);
        S.sec = { 0: ids.slice(0, half), 1: ids.slice(half, half * 2), pot: [] };
        S.turn = S.starter;
        // top: the chooser's card. peek: the other player's own card, so they can see it while they wait
        S.board = { deck, count: [half, half], pot: 0, top: S.sec[S.starter][0], peek: S.sec[1 - S.starter][0], last: null, rounds: 0 };
      },
      waiting: turnWaiting,
      move(S, seat, mv) {
        const b = S.board, d = DECKS[b.deck];
        if (!Number.isInteger(mv) || mv < 0 || mv >= d.stats.length) return false;
        const a = S.sec[seat].shift(), z = S.sec[1 - seat].shift();
        const va = ttVal(b.deck, a, mv), vz = ttVal(b.deck, z, mv);
        const w = va > vz ? seat : vz > va ? 1 - seat : "draw";
        const cards = seat === 0 ? [a, z] : [z, a];
        if (w === "draw") S.sec.pot.push(a, z);
        else { const won = w === seat ? [a, z] : [z, a]; S.sec[w].push(...won, ...S.sec.pot); S.sec.pot = []; }
        b.rounds++;
        b.last = { cards, stat: mv, w, by: seat, n: b.rounds };
        b.count = [S.sec[0].length, S.sec[1].length]; b.pot = S.sec.pot.length;
        if (w !== "draw") S.turn = w;
        const out0 = !b.count[0], out1 = !b.count[1];
        if (out0 || out1) S.result = { w: out0 && out1 ? "draw" : out0 ? 1 : 0, line: [] };
        else if (b.rounds >= this.MAX_ROUNDS) S.result = { w: b.count[0] === b.count[1] ? "draw" : b.count[0] > b.count[1] ? 0 : 1, line: [] };
        b.top = S.result ? null : S.sec[S.turn][0];
        b.peek = S.result ? null : S.sec[1 - S.turn][0];
        return "tt";
      },
      ai: ttAI,
      DECKS,
    },
    wi: {
      id: "wi", name: "Who Is It?", local: false, PEOPLE, QUESTIONS,
      init(S) {
        S.board = { stage: "pick", ready: [false, false], down: [Array(PEOPLE.length).fill(false), Array(PEOPLE.length).fill(false)], log: [], reveal: null };
        S.sec = { 0: null, 1: null }; S.turn = -1;
      },
      waiting: (S, seat) => S.board.stage === "pick" ? !S.board.ready[seat] : S.turn === seat,
      move(S, seat, mv) {
        const b = S.board; if (!mv || typeof mv !== "object") return false;
        if (b.stage === "pick") {
          if (b.ready[seat] || !Number.isInteger(mv.pick) || mv.pick < 0 || mv.pick >= PEOPLE.length) return false;
          S.sec[seat] = mv.pick; b.ready[seat] = true; S.last = null;
          if (b.ready[0] && b.ready[1]) { b.stage = "play"; S.turn = S.starter; }
          return "ready";
        }
        if (S.turn !== seat) return false;
        const target = PEOPLE[S.sec[1 - seat]];
        if (Number.isInteger(mv.ask) && QUESTIONS[mv.ask]) {
          const a = !!QUESTIONS[mv.ask][1](target);
          PEOPLE.forEach((p, i) => { if (!!QUESTIONS[mv.ask][1](p) !== a) b.down[seat][i] = true; });
          b.log.push({ seat, q: mv.ask, a }); S.last = b.log.length; S.turn = 1 - seat;
          return a ? "yes" : "no";
        }
        if (Number.isInteger(mv.guess) && mv.guess >= 0 && mv.guess < PEOPLE.length && !b.down[seat][mv.guess]) {
          const ok = mv.guess === S.sec[1 - seat];
          b.log.push({ seat, guess: mv.guess, ok }); S.last = b.log.length;
          if (ok) { S.result = { w: seat, line: [] }; b.reveal = { 0: S.sec[0], 1: S.sec[1] }; }
          else { b.down[seat][mv.guess] = true; S.turn = 1 - seat; }
          return ok ? "right" : "wrong";
        }
        return false;
      },
      ai: wiAI,
    },
    golf: {
      id: "golf", name: "Mini Golf", local: false, HOLES, GW, GH, BALL_R, CUP_R, MAXV, MAX_STROKES, sim: golfSim,
      init(S) {
        const t = HOLES[0].tee;
        S.board = { hole: 0, balls: [0, 1].map(() => ({ x: t[0], y: t[1], in: false, strokes: 0 })), scores: [[], []], shots: 0 };
        S.sec = {}; S.turn = S.starter;
      },
      waiting: turnWaiting,
      move(S, seat, mv) {
        const b = S.board;
        if (!mv || typeof mv.vx !== "number" || typeof mv.vy !== "number" || !isFinite(mv.vx) || !isFinite(mv.vy)) return false;
        const vx = Math.round(mv.vx * 1000) / 1000, vy = Math.round(mv.vy * 1000) / 1000;
        if (Math.sqrt(vx * vx + vy * vy) > MAXV + 0.01 || (vx === 0 && vy === 0)) return false;
        const ball = b.balls[seat], from = [ball.x, ball.y], hole = b.hole;
        const r = golfSim(hole, ball.x, ball.y, vx, vy);
        ball.strokes++;
        if (r.water) ball.strokes++; else { ball.x = r.x; ball.y = r.y; }
        if (r.in) ball.in = true;
        else if (ball.strokes >= MAX_STROKES) { ball.in = true; ball.strokes = MAX_STROKES + 1; ball.gaveUp = true; }
        b.shots++;
        S.last = { seat, hole, from, vx, vy, n: b.shots, water: r.water, sunk: r.in };
        let fx = r.in ? "sunk" : r.water ? "splash" : "putt";
        const other = b.balls[1 - seat];
        if (!other.in) S.turn = 1 - seat;
        else if (!ball.in) S.turn = seat;
        else { // hole finished
          b.scores[0].push(b.balls[0].strokes); b.scores[1].push(b.balls[1].strokes);
          const sc0 = b.balls[0].strokes, sc1 = b.balls[1].strokes;
          if (b.hole === HOLES.length - 1) {
            const t0 = b.scores[0].reduce((a, z) => a + z, 0), t1 = b.scores[1].reduce((a, z) => a + z, 0);
            S.result = { w: t0 === t1 ? "draw" : t0 < t1 ? 0 : 1, line: [] };
          } else {
            b.hole++; const t = HOLES[b.hole].tee;
            b.balls = [0, 1].map(() => ({ x: t[0], y: t[1], in: false, strokes: 0 }));
            S.turn = sc0 === sc1 ? 1 - S.turn : sc0 < sc1 ? 0 : 1; // best score last hole goes first
          }
        }
        return fx;
      },
      ai: golfAI,
    },
    hockey: {
      id: "hockey", name: "Air Hockey", local: false, realtime: true, HK, CR, newPuck: hkNewPuck, step: hkStep, aiTarget: hkAI, clampPad: hkClampPad,
      init(S) { S.board = { score: [0, 0], target: HK.TARGET, serve: S.starter }; S.sec = {}; S.turn = -1; },
      waiting: () => false,
      move: () => false,
      ai: () => null,
    },
    rps: {
      id: "rps", name: "Rock Paper Scissors", local: false, TARGET: 3,
      init(S) { S.board = { pick: [false, false], hist: [], score: [0, 0] }; S.sec = { 0: null, 1: null }; S.turn = -1; },
      waiting: (S, seat) => !S.board.pick[seat],
      move(S, seat, mv) {
        const b = S.board; if (!BEATS[mv] || b.pick[seat]) return false;
        S.sec[seat] = mv; b.pick[seat] = true;
        if (!(b.pick[0] && b.pick[1])) return "pick";
        const a = S.sec[0], z = S.sec[1], w = a === z ? "draw" : BEATS[a] === z ? 0 : 1;
        b.hist.push({ a, b: z, w }); if (w !== "draw") b.score[w]++;
        b.pick = [false, false]; S.sec = { 0: null, 1: null }; S.last = b.hist.length;
        if (w !== "draw" && b.score[w] >= 3) S.result = { w, line: [] };
        return "reveal";
      },
      ai: rpsAI,
    },
  };
  root.GAMES = GAMES;
  if (typeof module !== "undefined") module.exports = GAMES;
})(typeof window !== "undefined" ? window : globalThis);
