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
