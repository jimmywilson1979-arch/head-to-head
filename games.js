// Head to Head — game rules and computer players.
// Each game: blank() board, place(board, move) -> cell index or -1, result(board, cell) -> null | {w: seat|"draw", line: [cells]}, ai(board, seat, level) -> move.
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

  const GAMES = {
    ttt: {
      id: "ttt", name: "Noughts & Crosses", players: 2,
      blank: () => Array(9).fill(null),
      place: (b, mv) => (Number.isInteger(mv) && mv >= 0 && mv < 9 && b[mv] == null) ? mv : -1,
      result: b => tttCheck(b),
      ai: tttAI,
    },
    c4: {
      id: "c4", name: "Connect 4", players: 2, cols: W, rows: H,
      blank: () => Array(W * H).fill(null),
      place: (b, mv) => Number.isInteger(mv) ? c4Drop(b, mv) : -1,
      result: c4Result,
      ai: c4AI,
    },
  };
  root.GAMES = GAMES;
  if (typeof module !== "undefined") module.exports = GAMES;
})(typeof window !== "undefined" ? window : globalThis);
