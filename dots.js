// Head to Head — Dots & Boxes with board shapes, sizes and rule twists. Loaded after games.js; fills in GAMES.dots.
//
// Every board is a list of cells (squares, triangles or hexagons). Each cell is a ring of edges; draw the last edge
// of a cell and it's yours. The board itself is just a layout name (e.g. "sq-m", "tri-l", "heart"), so both phones
// build exactly the same picture from it and only the lines drawn travel between phones.
//
// Options (S.opts.dots): shape sq|tri|hex|heart|tree|donut|cross, size s|m|l|xl, bonus (gold + bomb boxes),
// noext (finishing a box doesn't give another go), rstart (some lines already drawn), timer (seconds a go, 0 = off).
"use strict";
(function (root) {
  const GAMES = root.GAMES;
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const turnWaiting = (S, seat) => S.turn === seat;

  // ===== LAYOUTS =====
  const SIZES = {
    sq: { s: [3, 3], m: [4, 4], l: [5, 5], xl: [8, 8] },     // [columns, rows] of boxes
    tri: { s: [3, 4], m: [4, 5], l: [5, 6], xl: [6, 8] },    // [columns, rows]; 2 triangles per column per row
    hex: { s: [3, 3], m: [4, 4], l: [5, 5], xl: [5, 7] },
  };
  const MASKS = { // square boxes cut into shapes (X = a box)
    heart: [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
    tree: ["...X...", "..XXX..", ".XXXXX.", "..XXX..", ".XXXXX.", "XXXXXXX", "...X..."],
    donut: ["XXXXXX", "XXXXXX", "XX..XX", "XX..XX", "XXXXXX", "XXXXXX"],
    cross: ["..XXX..", "..XXX..", "XXXXXXX", "XXXXXXX", "XXXXXXX", "..XXX..", "..XXX.."],
  };
  const SHAPES = [
    { id: "sq", name: "Squares", icon: "⬛" }, { id: "tri", name: "Triangles", icon: "🔺" }, { id: "hex", name: "Hexagons", icon: "🐝" },
    { id: "heart", name: "Heart", icon: "❤️" }, { id: "tree", name: "Tree", icon: "🎄" }, { id: "donut", name: "Donut", icon: "🍩" }, { id: "cross", name: "Cross", icon: "➕" },
  ];
  const SIZE_NAMES = { s: "Quick", m: "Normal", l: "Big", xl: "Marathon" };
  const DEFAULTS = { shape: "sq", size: "m", bonus: false, noext: false, rstart: false, timer: 0 };
  const layKey = o => SIZES[o.shape] ? o.shape + "-" + (SIZES[o.shape][o.size] ? o.size : "m") : MASKS[o.shape] ? o.shape : "sq-m";
  const H3 = Math.sqrt(3) / 2;

  function polysFor(key) {
    const [shape, size] = key.split("-"), P = [];
    if (MASKS[shape]) {
      MASKS[shape].forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "X") P.push([[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]]); }));
    } else if (shape === "sq") {
      const [C, R] = SIZES.sq[size];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) P.push([[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]]);
    } else if (shape === "tri") {
      const [C, R] = SIZES.tri[size];
      for (let r = 0; r < R; r++) {
        const y0 = r * H3, y1 = (r + 1) * H3;
        for (let c = 0; c < C; c++) {
          if (r % 2 === 0) { P.push([[c, y0], [c + 1, y0], [c + .5, y1]]); P.push([[c + 1, y0], [c + 1.5, y1], [c + .5, y1]]); }
          else { P.push([[c + .5, y0], [c + 1, y1], [c, y1]]); P.push([[c + .5, y0], [c + 1.5, y0], [c + 1, y1]]); }
        }
      }
    } else if (shape === "hex") {
      const [C, R] = SIZES.hex[size], w = 2 * H3;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const cx = c * w + (r % 2) * H3, cy = r * 1.5;
        P.push(Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 180 * (60 * k - 90); return [cx + Math.cos(a), cy + Math.sin(a)]; }));
      }
    }
    return P;
  }

  const GEO = {};
  function geo(key) { // points, edges [p, q], cells {e: edge ids, p: point ids, cx, cy}, ec: edge -> cell ids
    if (GEO[key]) return GEO[key];
    const polys = polysFor(key);
    let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
    polys.flat().forEach(([x, y]) => { mx = Math.min(mx, x); my = Math.min(my, y); Mx = Math.max(Mx, x); My = Math.max(My, y); });
    const pts = [], pIdx = {}, ed = [], eIdx = {}, cells = [];
    const pid = (x, y) => { x -= mx; y -= my; const k = Math.round(x * 1000) + "," + Math.round(y * 1000); if (pIdx[k] == null) { pIdx[k] = pts.length; pts.push([x, y]); } return pIdx[k]; };
    for (const poly of polys) {
      const p = poly.map(([x, y]) => pid(x, y)), e = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], k = Math.min(a, b) + "-" + Math.max(a, b);
        if (eIdx[k] == null) { eIdx[k] = ed.length; ed.push([a, b]); }
        e.push(eIdx[k]);
      }
      const cx = p.reduce((s, i) => s + pts[i][0], 0) / p.length, cy = p.reduce((s, i) => s + pts[i][1], 0) / p.length;
      cells.push({ e, p, cx, cy });
    }
    const ec = ed.map(() => []);
    cells.forEach((c, ci) => c.e.forEach(x => ec[x].push(ci)));
    const c0 = cells[0], [a0, b0] = ed[c0.e[0]];
    const inr = Math.hypot((pts[a0][0] + pts[b0][0]) / 2 - c0.cx, (pts[a0][1] + pts[b0][1]) / 2 - c0.cy); // centre to the middle of a side
    return (GEO[key] = { key, pts, ed, cells, ec, w: Mx - mx, h: My - my, inr });
  }
  const nameOf = key => { const [sh, sz] = key.split("-"); const s = SHAPES.find(x => x.id === sh); return (s ? s.name : "Squares") + (sz ? " · " + SIZE_NAMES[sz] : ""); };

  // ===== RULES =====
  const sides = (g, e, ci) => g.cells[ci].e.reduce((n, x) => n + (e[x] != null ? 1 : 0), 0);
  const freeOf = (g, e, ci) => g.cells[ci].e.length - sides(g, e, ci);

  function init(S) {
    const o = Object.assign({}, DEFAULTS, (S.opts && S.opts.dots) || {});
    const key = layKey(o), g = geo(key), N = g.cells.length;
    const b = { lay: key, e: Array(g.ed.length).fill(null), box: Array(N).fill(null), val: Array(N).fill(1), score: [0, 0],
      bonus: !!o.bonus, noext: !!o.noext, tl: [0, 10, 20].includes(+o.timer) ? +o.timer : 0, got: null };
    if (o.bonus) { // gold boxes are worth 3, bombs cost you 1
      const ids = shuffle([...Array(N).keys()]), ng = Math.max(1, Math.round(N / 8)), nb = Math.max(1, Math.round(N / 10));
      ids.slice(0, ng).forEach(i => b.val[i] = 3); ids.slice(ng, ng + nb).forEach(i => b.val[i] = -1);
    }
    if (o.rstart) { // about a quarter of the lines drawn already, never leaving a box one line from finished
      const want = Math.round(g.ed.length * .25); let n = 0;
      for (const x of shuffle([...g.ed.keys()])) {
        if (n >= want) break;
        if (g.ec[x].every(ci => freeOf(g, b.e, ci) > 2)) { b.e[x] = 2; n++; }
      }
    }
    S.board = b; S.sec = {}; S.turn = S.starter;
  }

  function move(S, seat, mv) {
    const b = S.board, g = geo(b.lay);
    if (!Number.isInteger(mv) || mv < 0 || mv >= g.ed.length || b.e[mv] != null) return false;
    b.e[mv] = seat; S.last = mv; let k = 0, got = 0, gold = 0, bomb = 0;
    for (const ci of g.ec[mv]) if (b.box[ci] == null && freeOf(g, b.e, ci) === 0) {
      b.box[ci] = seat; b.score[seat] += b.val[ci]; got += b.val[ci]; k++;
      if (b.val[ci] > 1) gold++; if (b.val[ci] < 0) bomb++;
    }
    b.got = { k, v: got, gold, bomb }; // what the last line won, for the status line
    if (b.box.every(x => x != null)) S.result = { w: b.score[0] === b.score[1] ? "draw" : b.score[0] > b.score[1] ? 0 : 1, line: [] };
    else if (!k || b.noext) S.turn = 1 - seat;
    return k ? "box" : "line";
  }

  // ===== COMPUTER PLAYER =====
  function freeEdges(e) { const f = []; for (let i = 0; i < e.length; i++) if (e[i] == null) f.push(i); return f; }
  // what drawing this edge would capture straight away (value), or null if nothing
  function captureVal(g, b, e, x) { let v = null; for (const ci of g.ec[x]) if (b.box[ci] == null && freeOf(g, e, ci) === 1) v = (v || 0) + b.val[ci]; return v; }
  const isSafe = (g, e, x) => g.ec[x].every(ci => freeOf(g, e, ci) >= 3);
  // the value the other player could then take in a row (or with no extra goes, what's left one line from finished)
  function giveaway(g, b, e, x) {
    const e2 = e.slice(); e2[x] = 1;
    if (b.noext) { let v = 0; for (let ci = 0; ci < g.cells.length; ci++) if (b.box[ci] == null && freeOf(g, e2, ci) === 1) v += Math.max(b.val[ci], .5); return v; }
    const taken = new Set(); let more = true;
    while (more) {
      more = false;
      for (let ci = 0; ci < g.cells.length; ci++) {
        if (b.box[ci] != null || taken.has(ci)) continue;
        const f = freeOf(g, e2, ci);
        if (f === 0) { taken.add(ci); continue; }
        if (f === 1) { const y = g.cells[ci].e.find(k => e2[k] == null); e2[y] = 0; more = true; }
      }
    }
    let v = 0; for (const ci of taken) if (b.box[ci] == null) v += Math.max(b.val[ci], .5); // count bombs as small, not free
    return v;
  }
  function leastGiveaway(g, b, e, free) {
    let best = Infinity, picks = [];
    for (const x of free) { const v = giveaway(g, b, e, x); if (v < best - 1e-9) { best = v; picks = [x]; } else if (Math.abs(v - best) < 1e-9) picks.push(x); }
    return rnd(picks);
  }

  // --- endgame: once every unfinished box has exactly 2 lines left, the board is chains and loops ---
  function components(g, b, e, skip) { // null unless the position is all chains and loops
    const open = [], seen = new Set(), out = [];
    for (let ci = 0; ci < g.cells.length; ci++) {
      if (b.box[ci] != null || (skip && skip.has(ci))) continue;
      if (freeOf(g, e, ci) !== 2) return null;
      open.push(ci);
    }
    for (const s of open) {
      if (seen.has(s)) continue;
      const stack = [s], list = []; seen.add(s); let ground = 0;
      while (stack.length) {
        const ci = stack.pop(); list.push(ci);
        for (const x of g.cells[ci].e) {
          if (e[x] != null) continue;
          const nb = g.ec[x].find(o => o !== ci);
          if (nb == null || b.box[nb] != null || (skip && skip.has(nb))) { ground++; continue; }
          if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
        }
      }
      out.push({ t: ground ? "c" : "l", n: list.length, v: list.reduce((s, ci) => s + b.val[ci], 0), cells: list });
    }
    return out;
  }
  // best net score (mine minus theirs) for the player who has to open one of these chains or loops
  function solveV(comps) {
    const memo = new Map(); let work = 0;
    const key = cs => cs.map(c => c.t + c.n + ":" + c.v).sort().join("|");
    function ctrl(c, Vr) { // what the player given this chain/loop ends up with, from here on
      const take = c.v + Vr;
      if (c.t === "c" && c.n >= 3) { const g2 = 2 * c.v / c.n; return Math.max(take, c.v - 2 * g2 - Vr); }
      if (c.t === "l" && c.n >= 4) { const g4 = 4 * c.v / c.n; return Math.max(take, c.v - 2 * g4 - Vr); }
      return take;
    }
    function V(cs) {
      if (!cs.length) return 0;
      const k = key(cs); if (memo.has(k)) return memo.get(k);
      if (++work > 60000) throw new Error("too big");
      let best = -Infinity; const tried = new Set();
      cs.forEach((c, i) => {
        const ck = c.t + c.n + ":" + c.v; if (tried.has(ck)) return; tried.add(ck);
        const rest = cs.slice(0, i).concat(cs.slice(i + 1));
        best = Math.max(best, -ctrl(c, V(rest)));
      });
      memo.set(k, best); return best;
    }
    return { V, ctrl };
  }
  function openingEdge(g, b, e, comp) { // how to give a chain or loop away
    const inC = new Set(comp.cells), edges = new Set();
    comp.cells.forEach(ci => g.cells[ci].e.forEach(x => { if (e[x] == null) edges.add(x); }));
    const list = [...edges];
    if (comp.t === "c" && comp.n === 2) { const mid = list.find(x => g.ec[x].length === 2 && g.ec[x].every(ci => inC.has(ci))); if (mid != null) return mid; } // split it so they can't hand it back
    if (comp.t === "c") { const end = list.filter(x => g.ec[x].filter(ci => inC.has(ci)).length === 1); if (end.length) return rnd(end); }
    return rnd(list);
  }
  // the cells the other player has just opened up for us: capturable ones plus the chain they lead into
  function openRegion(g, b, e) {
    const reg = new Set(), stack = [];
    for (let ci = 0; ci < g.cells.length; ci++) if (b.box[ci] == null && freeOf(g, e, ci) === 1) { reg.add(ci); stack.push(ci); }
    while (stack.length) {
      const ci = stack.pop();
      for (const x of g.cells[ci].e) {
        if (e[x] != null) continue;
        const nb = g.ec[x].find(o => o !== ci);
        if (nb == null || reg.has(nb) || b.box[nb] != null) continue;
        if (freeOf(g, e, nb) <= 2) { reg.add(nb); stack.push(nb); }
      }
    }
    return reg;
  }
  function doubleDeal(g, b, e, reg) { // the line that hands the last 2 (chain) or 4 (loop) boxes back, or null
    const cells = [...reg], cap = cells.filter(ci => freeOf(g, e, ci) === 1);
    const shared = (a, z) => g.cells[a].e.find(x => e[x] == null && g.ec[x].includes(z));
    if (cells.length === 2 && cap.length === 1) {
      const A = cap[0], B = cells.find(ci => ci !== A);
      if (freeOf(g, e, B) !== 2 || shared(A, B) == null) return null;
      const x = g.cells[B].e.find(k => e[k] == null && !g.ec[k].includes(A));
      if (x == null) return null;
      const other = g.ec[x].find(ci => ci !== B);
      return other == null || b.box[other] != null ? x : null; // only at the very end of a chain
    }
    if (cells.length === 4 && cap.length === 2) {
      const [A, D] = cap, mids = cells.filter(ci => ci !== A && ci !== D);
      const B = mids.find(m => shared(A, m) != null), C = mids.find(m => m !== B);
      if (B == null || C == null || shared(D, C) == null) return null;
      const bc = shared(B, C); return bc == null ? null : bc;
    }
    return null;
  }

  function dotsAI(S, seat, level) {
    const b = S.board, g = geo(b.lay), e = b.e, free = freeEdges(e);
    const comp = free.filter(x => captureVal(g, b, e, x) != null);
    const good = comp.filter(x => captureVal(g, b, e, x) >= 0);
    const safe = free.filter(x => isSafe(g, e, x));
    if (level === "easy") {
      if (comp.length && Math.random() < 0.6) return rnd(comp);
      if (safe.length && Math.random() < 0.5) return rnd(safe);
      return rnd(free);
    }
    if (level === "medium") {
      if (good.length) return rnd(good);
      if (safe.length && Math.random() < 0.85) return rnd(safe);
      if (comp.length) return rnd(comp);
      return Math.random() < 0.5 ? rnd(free) : leastGiveaway(g, b, e, free);
    }
    // hard
    if (b.noext) {
      if (good.length) return good.reduce((a, x) => captureVal(g, b, e, x) > captureVal(g, b, e, a) ? x : a, good[0]);
      if (safe.length) return rnd(safe);
      return leastGiveaway(g, b, e, free);
    }
    if (comp.length) {
      const reg = openRegion(g, b, e), dd = doubleDeal(g, b, e, reg);
      if (dd != null) {
        const rest = components(g, b, e, reg);
        if (rest && rest.length) {
          try {
            const Vr = solveV(rest).V(rest), k = [...reg].reduce((s, ci) => s + b.val[ci], 0);
            if (-k - Vr > k + Vr) return dd; // hand them 2 (or 4) and keep control of what's left
          } catch (err) { }
        }
      }
      if (good.length) return good.reduce((a, x) => captureVal(g, b, e, x) > captureVal(g, b, e, a) ? x : a, good[0]);
      if (safe.length) return rnd(safe); // leave the bomb for them
      return rnd(comp);
    }
    if (safe.length) return rnd(safe);
    const comps = components(g, b, e, null);
    if (comps && comps.length) {
      try {
        const { V, ctrl } = solveV(comps);
        let best = Infinity, pick = null;
        comps.forEach((c, i) => {
          const rest = comps.slice(0, i).concat(comps.slice(i + 1)), cv = ctrl(c, V(rest));
          if (cv < best - 1e-9 || (Math.abs(cv - best) < 1e-9 && c.n < pick.n)) { best = cv; pick = c; }
        });
        if (pick) return openingEdge(g, b, e, pick);
      } catch (err) { }
    }
    return leastGiveaway(g, b, e, free);
  }

  Object.assign(GAMES.dots, {
    id: "dots", name: "Dots & Boxes", local: true,
    init, waiting: turnWaiting, move, ai: dotsAI,
    geo, layKey, layName: nameOf, SHAPES, SIZES, SIZE_NAMES, DEFAULTS, MASKS,
  });
  root.DOTS_TEST = { geo, components, solveV, dotsAI, openRegion, doubleDeal };
})(typeof window !== "undefined" ? window : globalThis);
