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
      note: "Scientists' best estimates. They change as new fossils are found. 🦖 meat-eaters, 🦕 plant-eaters.",
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
        // only the chooser's top card is shown: the other player can't act on it, and their own card stays hidden until the reveal
        S.board = { deck, count: [half, half], pot: 0, top: S.sec[S.starter][0], last: null, rounds: 0 };
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
