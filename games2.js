// Head to Head — more games: Draughts, Chess, Dominoes and Colour Clash (an Uno-style card game).
// Same shape as games.js: init / waiting / move / ai. Loaded after games.js; adds to GAMES.
"use strict";
(function (root) {
  const GAMES = root.GAMES;
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const turnWaiting = (S, seat) => S.turn === seat;

  // ================= DRAUGHTS (English rules) =================
  // Board: 64 squares, row 0 at the top. 0/1 = a man of seat 0/1, 2/3 = a king. Seat 0 starts at the bottom and moves up.
  // A move is a path of squares {p:[from, to, to, ...]}. Captures are compulsory and a capturing piece must keep going.
  const DSEAT = v => v & 1, DKING = v => v >= 2;
  function dInit() {
    const b = Array(64).fill(null);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) { if (r < 3) b[r * 8 + c] = 1; else if (r > 4) b[r * 8 + c] = 0; }
    return b;
  }
  const dDirs = v => DKING(v) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : DSEAT(v) === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
  const onB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  function dJumps(b, sq, v, path, taken, out) {
    const r = sq >> 3, c = sq & 7; let more = false;
    for (const [dr, dc] of dDirs(v)) {
      const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
      if (!onB(tr, tc)) continue;
      const m = mr * 8 + mc, t = tr * 8 + tc;
      if (b[m] == null || DSEAT(b[m]) === DSEAT(v) || taken.includes(m) || (b[t] != null && t !== path[0])) continue;
      more = true;
      const crown = !DKING(v) && (tr === 0 || tr === 7);
      if (crown) out.push(path.concat(t)); // reaching the far row ends the move (English rules)
      else dJumps(b, t, v, path.concat(t), taken.concat(m), out);
    }
    if (!more && path.length > 1) out.push(path);
  }
  function dMoves(b, seat) {
    const caps = [], steps = [];
    for (let sq = 0; sq < 64; sq++) {
      const v = b[sq]; if (v == null || DSEAT(v) !== seat) continue;
      dJumps(b, sq, v, [sq], [], caps);
      const r = sq >> 3, c = sq & 7;
      for (const [dr, dc] of dDirs(v)) { const tr = r + dr, tc = c + dc; if (onB(tr, tc) && b[tr * 8 + tc] == null) steps.push([sq, tr * 8 + tc]); }
    }
    return caps.length ? caps : steps;
  }
  function dApply(b, path) { // returns {b, taken:[...], crowned}
    const nb = b.slice(), v = nb[path[0]], taken = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], z = path[i];
      if (Math.abs((z >> 3) - (a >> 3)) === 2) { const m = ((a >> 3) + (z >> 3)) / 2 * 8 + ((a & 7) + (z & 7)) / 2; taken.push(m); nb[m] = null; }
    }
    nb[path[0]] = null;
    const end = path[path.length - 1], er = end >> 3;
    const crowned = !DKING(v) && ((DSEAT(v) === 0 && er === 0) || (DSEAT(v) === 1 && er === 7));
    nb[end] = crowned ? v + 2 : v;
    return { b: nb, taken, crowned };
  }
  const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function dEval(b, seat) {
    let s = 0;
    for (let sq = 0; sq < 64; sq++) {
      const v = b[sq]; if (v == null) continue;
      const r = sq >> 3, c = sq & 7, adv = DSEAT(v) === 0 ? 7 - r : r;
      let val = DKING(v) ? 175 : 100 + adv * 4;
      if (!DKING(v) && ((DSEAT(v) === 0 && r === 7) || (DSEAT(v) === 1 && r === 0))) val += 6; // back row guard
      if (c > 1 && c < 6 && r > 1 && r < 6) val += 3;
      s += DSEAT(v) === seat ? val : -val;
    }
    return s;
  }
  function dSearch(b, seat, me, depth, a, z) {
    const mv = dMoves(b, seat);
    if (!mv.length) return seat === me ? -10000 - depth : 10000 + depth;
    if (depth <= 0) return dEval(b, me);
    if (seat === me) {
      let best = -Infinity;
      for (const p of mv) { best = Math.max(best, dSearch(dApply(b, p).b, 1 - seat, me, depth - 1, a, z)); a = Math.max(a, best); if (a >= z) break; }
      return best;
    }
    let best = Infinity;
    for (const p of mv) { best = Math.min(best, dSearch(dApply(b, p).b, 1 - seat, me, depth - 1, a, z)); z = Math.min(z, best); if (a >= z) break; }
    return best;
  }
  function draughtsAI(S, seat, level) {
    const b = S.board.sq, mv = dMoves(b, seat);
    if (mv.length === 1) return { p: mv[0] };
    if (level === "easy" && Math.random() < .6) return { p: rnd(mv) };
    const depth = level === "hard" ? 7 : level === "medium" ? 4 : 2;
    let best = -Infinity, pick = [];
    for (const p of shuffle(mv.slice())) {
      const v = dSearch(dApply(b, p).b, 1 - seat, seat, depth - 1, -Infinity, Infinity);
      if (v > best) { best = v; pick = [p]; } else if (v === best) pick.push(p);
    }
    return { p: rnd(pick) };
  }
  GAMES.draughts = {
    id: "draughts", name: "Draughts", local: false,
    init(S) { S.board = { sq: dInit(), quiet: 0, taken: [0, 0], lastPath: null }; S.sec = {}; S.turn = S.starter; S.board.first = S.starter; },
    waiting: turnWaiting,
    moves: (S, seat) => dMoves(S.board.sq, seat),
    move(S, seat, mv) {
      const b = S.board; if (mv && mv.resign) { S.result = { w: 1 - seat, line: [] }; b.why = "Resigned"; return "no"; }
      if (!mv || !Array.isArray(mv.p)) return false;
      const legal = dMoves(b.sq, seat).find(p => samePath(p, mv.p)); if (!legal) return false;
      const r = dApply(b.sq, legal);
      b.sq = r.b; b.lastPath = legal; b.taken[seat] += r.taken.length; S.last = { p: legal, taken: r.taken };
      b.quiet = r.taken.length || r.crowned ? 0 : b.quiet + 1;
      if (!dMoves(b.sq, 1 - seat).length) S.result = { w: seat, line: [] };
      else if (b.quiet >= 80) S.result = { w: "draw", line: [] }; // 40 moves each with no capture or new king
      else S.turn = 1 - seat;
      return r.taken.length ? "hit" : "place";
    },
    ai: draughtsAI,
    aiDelay: (S, level) => 500 + Math.random() * 400,
  };

  // ================= CHESS =================
  // Squares 0..63, row 0 = rank 8 (black's back row). White pieces "PNBRQK", black "pnbrqk", "" empty.
  // The seat that starts the round plays white.
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const PST = { // from white's side, row 0 = rank 8
    p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 22, 22, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    ke: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };
  const isW = p => p && p === p.toUpperCase();
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  function cStart() {
    const back = "rnbqkbnr".split("");
    const sq = Array(64).fill("");
    for (let c = 0; c < 8; c++) { sq[c] = back[c]; sq[8 + c] = "p"; sq[48 + c] = "P"; sq[56 + c] = back[c].toUpperCase(); }
    return { sq, w: true, c: "KQkq", ep: -1, h: 0 };
  }
  function attacked(sq, s, byWhite) { // is square s attacked by the given side?
    const r = s >> 3, c = s & 7;
    const pr = byWhite ? r + 1 : r - 1, pawn = byWhite ? "P" : "p";
    if (pr >= 0 && pr < 8) { if (c > 0 && sq[pr * 8 + c - 1] === pawn) return true; if (c < 7 && sq[pr * 8 + c + 1] === pawn) return true; }
    const N = byWhite ? "N" : "n", K = byWhite ? "K" : "k", B = byWhite ? "B" : "b", R = byWhite ? "R" : "r", Q = byWhite ? "Q" : "q";
    for (const [dr, dc] of KN) { const rr = r + dr, cc = c + dc; if (onB(rr, cc) && sq[rr * 8 + cc] === N) return true; }
    for (const [dr, dc] of KG) { const rr = r + dr, cc = c + dc; if (onB(rr, cc) && sq[rr * 8 + cc] === K) return true; }
    for (const [dr, dc] of DIAG) { let rr = r + dr, cc = c + dc; while (onB(rr, cc)) { const p = sq[rr * 8 + cc]; if (p) { if (p === B || p === Q) return true; break; } rr += dr; cc += dc; } }
    for (const [dr, dc] of ORTH) { let rr = r + dr, cc = c + dc; while (onB(rr, cc)) { const p = sq[rr * 8 + cc]; if (p) { if (p === R || p === Q) return true; break; } rr += dr; cc += dc; } }
    return false;
  }
  const kingSq = (sq, white) => sq.indexOf(white ? "K" : "k");
  const inCheck = (pos, white) => attacked(pos.sq, kingSq(pos.sq, white), !white);
  function pseudo(pos, capsOnly) {
    const out = [], sq = pos.sq, w = pos.w;
    const own = p => p && isW(p) === w, foe = p => p && isW(p) !== w;
    for (let s = 0; s < 64; s++) {
      const p = sq[s]; if (!own(p)) continue;
      const r = s >> 3, c = s & 7, t = p.toLowerCase();
      if (t === "p") {
        const dir = w ? -1 : 1, start = w ? 6 : 1, last = w ? 0 : 7, r1 = r + dir;
        const add = (to, cap) => { if ((to >> 3) === last) for (const q of "qrbn") out.push({ f: s, t: to, p: q, cap }); else out.push({ f: s, t: to, cap }); };
        if (!capsOnly && onB(r1, c) && !sq[r1 * 8 + c]) { add(r1 * 8 + c, ""); if (r === start && !sq[(r + 2 * dir) * 8 + c]) out.push({ f: s, t: (r + 2 * dir) * 8 + c, cap: "", dbl: true }); }
        else if (capsOnly && onB(r1, c) && !sq[r1 * 8 + c] && (r1 === last)) add(r1 * 8 + c, "");
        for (const dc of [-1, 1]) {
          const cc = c + dc; if (!onB(r1, cc)) continue; const to = r1 * 8 + cc;
          if (foe(sq[to])) add(to, sq[to]);
          else if (to === pos.ep) out.push({ f: s, t: to, cap: w ? "p" : "P", ep: true });
        }
      } else if (t === "n" || t === "k") {
        for (const [dr, dc] of (t === "n" ? KN : KG)) { const rr = r + dr, cc = c + dc; if (!onB(rr, cc)) continue; const to = rr * 8 + cc; if (own(sq[to])) continue; if (capsOnly && !sq[to]) continue; out.push({ f: s, t: to, cap: sq[to] }); }
        if (t === "k" && !capsOnly) { // castling
          const home = w ? 60 : 4, rights = pos.c;
          if (s === home && !attacked(sq, s, !w)) {
            if (rights.includes(w ? "K" : "k") && !sq[s + 1] && !sq[s + 2] && sq[s + 3] === (w ? "R" : "r") && !attacked(sq, s + 1, !w) && !attacked(sq, s + 2, !w)) out.push({ f: s, t: s + 2, cap: "", castle: "k" });
            if (rights.includes(w ? "Q" : "q") && !sq[s - 1] && !sq[s - 2] && !sq[s - 3] && sq[s - 4] === (w ? "R" : "r") && !attacked(sq, s - 1, !w) && !attacked(sq, s - 2, !w)) out.push({ f: s, t: s - 2, cap: "", castle: "q" });
          }
        }
      } else {
        const dirs = t === "b" ? DIAG : t === "r" ? ORTH : DIAG.concat(ORTH);
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (onB(rr, cc)) { const to = rr * 8 + cc; if (own(sq[to])) break; if (!capsOnly || sq[to]) out.push({ f: s, t: to, cap: sq[to] }); if (sq[to]) break; rr += dr; cc += dc; }
        }
      }
    }
    return out;
  }
  function cMake(pos, m) {
    const sq = pos.sq.slice(), p = sq[m.f], w = pos.w;
    sq[m.t] = m.p ? (w ? m.p.toUpperCase() : m.p) : p; sq[m.f] = "";
    if (m.ep) sq[m.t + (w ? 8 : -8)] = "";
    if (m.castle === "k") { sq[m.f + 1] = sq[m.f + 3]; sq[m.f + 3] = ""; }
    if (m.castle === "q") { sq[m.f - 1] = sq[m.f - 4]; sq[m.f - 4] = ""; }
    let c = pos.c;
    if (p === "K") c = c.replace("K", "").replace("Q", ""); if (p === "k") c = c.replace("k", "").replace("q", "");
    for (const [s, ch] of [[63, "K"], [56, "Q"], [7, "k"], [0, "q"]]) if (m.f === s || m.t === s) c = c.replace(ch, "");
    const ep = m.dbl ? (m.f + m.t) / 2 : -1;
    const h = p.toLowerCase() === "p" || m.cap ? 0 : pos.h + 1;
    return { sq, w: !w, c, ep, h };
  }
  function cLegal(pos) { return pseudo(pos, false).filter(m => !inCheck(cMake(pos, m), pos.w)); }
  const cKey = pos => pos.sq.map(x => x || ".").join("") + (pos.w ? "w" : "b") + pos.c + pos.ep;
  function insufficient(sq) {
    const left = sq.filter(Boolean).map(p => p.toLowerCase()).filter(p => p !== "k");
    return !left.length || (left.length === 1 && (left[0] === "n" || left[0] === "b"));
  }
  function cEval(pos) { // from white's view
    let s = 0, mat = 0;
    for (const p of pos.sq) if (p && p.toLowerCase() !== "k" && p.toLowerCase() !== "p") mat += VAL[p.toLowerCase()];
    const endgame = mat <= 2600;
    for (let i = 0; i < 64; i++) {
      const p = pos.sq[i]; if (!p) continue;
      const t = p.toLowerCase(), w = isW(p), idx = w ? i : (7 - (i >> 3)) * 8 + (i & 7);
      const v = VAL[t] + (t === "k" && endgame ? PST.ke : PST[t])[idx];
      s += w ? v : -v;
    }
    return s;
  }
  const order = ms => ms.sort((a, b) => ((b.cap ? VAL[b.cap.toLowerCase()] * 10 : 0) + (b.p === "q" ? 800 : 0)) - ((a.cap ? VAL[a.cap.toLowerCase()] * 10 : 0) + (a.p === "q" ? 800 : 0)));
  function quiesce(pos, a, z, depth, ctx) {
    ctx.n++;
    const stand = cEval(pos) * (pos.w ? 1 : -1);
    if (stand >= z) return stand;
    if (stand > a) a = stand;
    if (depth <= 0) return stand;
    for (const m of order(pseudo(pos, true))) {
      const np = cMake(pos, m); if (inCheck(np, pos.w)) continue;
      const v = -quiesce(np, -z, -a, depth - 1, ctx);
      if (v >= z) return v; if (v > a) a = v;
    }
    return a;
  }
  function negamax(pos, depth, a, z, ctx, ply) {
    if (ctx.stop || (ctx.n & 1023) === 0 && Date.now() > ctx.until) { ctx.stop = true; return 0; }
    ctx.n++;
    if (pos.h >= 100) return 0;
    const moves = order(cLegal(pos));
    if (!moves.length) return inCheck(pos, pos.w) ? -100000 + ply : 0;
    if (depth <= 0) return quiesce(pos, a, z, 6, ctx);
    let best = -Infinity;
    for (const m of moves) {
      const v = -negamax(cMake(pos, m), depth - 1, -z, -a, ctx, ply + 1);
      if (ctx.stop) return 0;
      if (v > best) best = v; if (v > a) a = v; if (a >= z) break;
    }
    return best;
  }
  function chessAI(S, seat, level) {
    const pos = S.board.pos, moves = cLegal(pos);
    if (moves.length === 1) return moves[0];
    if (level === "easy" && Math.random() < .35) return rnd(moves);
    const maxDepth = level === "hard" ? 4 : level === "medium" ? 2 : 1;
    const ctx = { n: 0, until: Date.now() + (level === "hard" ? 2200 : 1200), stop: false };
    let bestMoves = moves.slice(), scored = [];
    for (let d = 1; d <= maxDepth; d++) {
      const res = [];
      for (const m of order(bestMoves.slice())) {
        const v = -negamax(cMake(pos, m), d - 1, -Infinity, Infinity, ctx, 1);
        if (ctx.stop) break;
        res.push({ m, v });
      }
      if (ctx.stop && res.length < bestMoves.length) { if (res.length && res[0].v > (scored[0] ? scored[0].v : -Infinity)) scored = res.concat(scored.filter(x => !res.some(y => y.m === x.m))); break; }
      scored = res.sort((x, y) => y.v - x.v); bestMoves = scored.map(x => x.m);
    }
    if (!scored.length) return rnd(moves);
    const slack = level === "easy" ? 120 : level === "medium" ? 25 : 0; // weaker levels pick among near-best moves
    const top = scored.filter(x => x.v >= scored[0].v - slack);
    return rnd(top).m;
  }
  const cSame = (a, b) => a.f === b.f && a.t === b.t && (a.p || "") === (b.p || "");
  function sanOf(pos, m, all) {
    const p = pos.sq[m.f], t = p.toLowerCase(), files = "abcdefgh", sqName = s => files[s & 7] + (8 - (s >> 3));
    if (m.castle) return m.castle === "k" ? "O-O" : "O-O-O";
    let s = "";
    if (t === "p") s = (m.cap ? files[m.f & 7] + "x" : "") + sqName(m.t) + (m.p ? "=" + m.p.toUpperCase() : "");
    else {
      const twin = all.filter(o => o.t === m.t && o.f !== m.f && pos.sq[o.f] === p);
      let dis = ""; if (twin.length) dis = twin.some(o => (o.f & 7) === (m.f & 7)) ? String(8 - (m.f >> 3)) : files[m.f & 7];
      s = t.toUpperCase() + dis + (m.cap ? "x" : "") + sqName(m.t);
    }
    const np = cMake(pos, m), chk = inCheck(np, np.w);
    if (chk) s += cLegal(np).length ? "+" : "#";
    return s;
  }
  GAMES.chess = {
    id: "chess", name: "Chess", local: false,
    init(S) {
      const pos = cStart();
      S.board = { pos, white: S.starter, reps: { [cKey(pos)]: 1 }, lastMove: null, san: [], taken: { w: [], b: [] }, why: "" };
      S.sec = {}; S.turn = S.starter;
    },
    waiting: turnWaiting,
    legal: S => cLegal(S.board.pos),
    inCheck: pos => inCheck(pos, pos.w),
    move(S, seat, mv) {
      const b = S.board, pos = b.pos;
      if (mv && mv.resign) { S.result = { w: 1 - seat, line: [] }; b.why = "Resigned"; return "no"; }
      if (!mv || !Number.isInteger(mv.f) || !Number.isInteger(mv.t)) return false;
      const all = cLegal(pos), m = all.find(x => cSame(x, { f: mv.f, t: mv.t, p: mv.p || (all.some(y => y.f === mv.f && y.t === mv.t && y.p) ? "q" : "") }));
      if (!m) return false;
      b.san.push(sanOf(pos, m, all));
      if (m.cap) b.taken[isW(m.cap) ? "w" : "b"].push(m.cap.toLowerCase());
      const np = cMake(pos, m); b.pos = np; b.lastMove = { f: m.f, t: m.t }; S.last = b.lastMove;
      const k = cKey(np); b.reps[k] = (b.reps[k] || 0) + 1;
      const replies = cLegal(np), check = inCheck(np, np.w);
      if (!replies.length) { S.result = check ? { w: seat, line: [] } : { w: "draw", line: [] }; b.why = check ? "Checkmate" : "Stalemate"; }
      else if (np.h >= 100) { S.result = { w: "draw", line: [] }; b.why = "50 moves with no capture or pawn move"; }
      else if (b.reps[k] >= 3) { S.result = { w: "draw", line: [] }; b.why = "The same position three times"; }
      else if (insufficient(np.sq)) { S.result = { w: "draw", line: [] }; b.why = "Not enough pieces left to checkmate"; }
      else S.turn = 1 - seat;
      return m.cap ? "hit" : "place";
    },
    ai: chessAI,
    aiDelay: () => 350,
  };

  // ================= DOMINOES (double six, draw game) =================
  // Tiles 0..27 → [a, b]. Each player gets 7; the rest is the boneyard. Can't go? Draw until you can, or knock when it's empty.
  // First to play every tile wins. If nobody can go, the lowest number of spots left in hand wins.
  const TILES = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) TILES.push([a, b]);
  const pips = id => TILES[id][0] + TILES[id][1];
  function domFits(b, id) { // which ends this tile can go on: "L", "R", or the first tile
    if (!b.chain.length) return ["L"];
    const [x, y] = TILES[id], out = [];
    if (x === b.ends[0] || y === b.ends[0]) out.push("L");
    if ((x === b.ends[1] || y === b.ends[1]) && !(b.ends[0] === b.ends[1] && out.length)) out.push("R");
    return out;
  }
  const domCanPlay = (b, seat) => b.hands[seat].some(id => domFits(b, id).length);
  function dominoAI(S, seat, level) {
    const b = S.board, hand = b.hands[seat];
    const plays = []; for (const id of hand) for (const e of domFits(b, id)) plays.push({ id, e });
    if (!plays.length) return b.yard.length ? { draw: 1 } : { knock: 1 };
    if (level === "easy") return rnd(plays);
    const count = n => hand.filter(id => TILES[id].includes(n)).length;
    let best = -Infinity, pick = plays[0];
    for (const p of plays) {
      const [x, y] = TILES[p.id], open = !b.chain.length ? null : (p.e === "L" ? b.ends[0] : b.ends[1]);
      const newEnd = open == null ? null : (x === open ? y : x);
      let sc = pips(p.id) * 2 + (x === y ? 6 : 0);
      if (level === "hard" && newEnd != null) sc += count(newEnd) * 4; // keep ends we can follow
      if (sc > best) { best = sc; pick = p; }
    }
    return pick;
  }
  GAMES.dom = {
    id: "dom", name: "Dominoes", local: false,
    init(S) {
      const all = shuffle(TILES.map((_, i) => i));
      S.board = { hands: [all.slice(0, 7), all.slice(7, 14)], yard: all.slice(14), chain: [], ends: [null, null], knocks: 0, lastText: "", spots: null };
      S.sec = {}; S.turn = S.starter;
    },
    waiting: turnWaiting,
    TILES, fits: domFits,
    move(S, seat, mv) {
      const b = S.board, hand = b.hands[seat]; if (!mv) return false;
      if (mv.draw) {
        if (!b.yard.length || domCanPlay(b, seat)) return false;
        hand.push(b.yard.pop()); b.lastText = "drew"; S.last = { draw: 1, seat }; return "pick";
      }
      if (mv.knock) {
        if (b.yard.length || domCanPlay(b, seat)) return false;
        b.knocks++; b.lastText = "knocked"; S.last = { knock: 1, seat };
        if (b.knocks >= 2) { // blocked: fewest spots wins
          const sp = b.hands.map(h => h.reduce((t, id) => t + pips(id), 0)); b.spots = sp;
          S.result = { w: sp[0] === sp[1] ? "draw" : sp[0] < sp[1] ? 0 : 1, line: [] };
        } else S.turn = 1 - seat;
        return "no";
      }
      const id = mv.id, at = hand.indexOf(id); if (at < 0) return false;
      const ends = domFits(b, id); if (!ends.includes(mv.e)) return false;
      const [x, y] = TILES[id];
      if (!b.chain.length) { b.chain.push({ id, a: x, b: y }); b.ends = [x, y]; }
      else if (mv.e === "L") { const o = b.ends[0], t = x === o ? { id, a: y, b: x } : { id, a: x, b: y }; b.chain.unshift(t); b.ends[0] = t.a; }
      else { const o = b.ends[1], t = x === o ? { id, a: x, b: y } : { id, a: y, b: x }; b.chain.push(t); b.ends[1] = t.b; }
      hand.splice(at, 1); b.knocks = 0; b.lastText = ""; S.last = { id, e: mv.e, seat };
      if (!hand.length) { b.spots = b.hands.map(h => h.reduce((t, i) => t + pips(i), 0)); S.result = { w: seat, line: [] }; }
      else S.turn = 1 - seat;
      return "place";
    },
    ai: dominoAI,
    aiDelay: () => 700 + Math.random() * 400,
  };

  // ================= COLOUR CLASH (Uno-style) =================
  // 108 cards. Colours r g b y: one 0, two each of 1-9, Skip, Reverse and +2. Plus 4 Wild and 4 Wild +4.
  // With two players Reverse works like Skip. Can't go? Draw one; play it if it fits, otherwise pass.
  const CC = []; // {c:"r", v:"5"|"skip"|"rev"|"+2"|"wild"|"+4"}
  for (const c of "rgby") { CC.push({ c, v: "0" }); for (const v of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "rev", "+2"]) { CC.push({ c, v }); CC.push({ c, v }); } }
  for (let i = 0; i < 4; i++) { CC.push({ c: "w", v: "wild" }); CC.push({ c: "w", v: "+4" }); }
  const ccFits = (b, id) => { const k = CC[id]; return k.c === "w" || k.c === b.colour || k.v === CC[b.top].v; };
  function ccDraw(b, n) {
    const got = [];
    for (let i = 0; i < n; i++) {
      if (!b.deck.length) { if (!b.pile.length) break; b.deck = shuffle(b.pile); b.pile = []; b.reshuffled = (b.reshuffled || 0) + 1; }
      got.push(b.deck.pop());
    }
    return got;
  }
  function ccBestColour(hand) {
    const n = { r: 0, g: 0, b: 0, y: 0 }; hand.forEach(id => { if (CC[id].c !== "w") n[CC[id].c]++; });
    return Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  }
  function colourAI(S, seat, level) {
    const b = S.board, hand = b.hands[seat], opp = b.hands[1 - seat].length;
    const ok = hand.filter(id => ccFits(b, id));
    if (b.drew != null) { // just drew: play it if it fits
      if (ccFits(b, b.drew) && level !== "easy" || ccFits(b, b.drew) && Math.random() < .7) return { play: b.drew, col: ccBestColour(hand.filter(i => i !== b.drew)) };
      return { pass: 1 };
    }
    if (!ok.length) return { draw: 1 };
    if (level === "easy") { const id = rnd(ok); return { play: id, col: rnd(["r", "g", "b", "y"]) }; }
    const score = id => {
      const k = CC[id]; let s = 0;
      if (k.c === "w") s -= 30; // save wilds
      if (["skip", "rev", "+2"].includes(k.v)) s += opp <= 2 ? 40 : 8;
      if (k.v === "+4") s += opp <= 2 ? 60 : -40;
      if (/^\d$/.test(k.v)) s += Number(k.v);
      if (level === "hard") s += hand.filter(i => CC[i].c === k.c).length * 3; // play the colour we hold most of
      return s;
    };
    const id = ok.sort((a, b2) => score(b2) - score(a))[0];
    return { play: id, col: ccBestColour(hand.filter(i => i !== id)) };
  }
  GAMES.cc = {
    id: "cc", name: "Colour Clash", local: false,
    CARDS: CC,
    init(S) {
      const deck = shuffle(CC.map((_, i) => i));
      const hands = [deck.splice(-7), deck.splice(-7)];
      let top = deck.pop(); while (!/^\d$/.test(CC[top].v)) { deck.unshift(top); top = deck.pop(); }
      S.board = { deck, pile: [], hands, top, colour: CC[top].c, drew: null, said: [false, false], note: "" };
      S.sec = {}; S.turn = S.starter;
    },
    waiting: turnWaiting,
    fits: ccFits,
    move(S, seat, mv) {
      const b = S.board, hand = b.hands[seat]; if (!mv) return false;
      if (mv.draw) {
        if (b.drew != null) return false;
        const got = ccDraw(b, 1); if (!got.length) { b.note = "No cards left to draw"; S.turn = 1 - seat; b.drew = null; return "no"; }
        hand.push(got[0]); b.drew = got[0]; b.said[seat] = false; b.note = ""; S.last = { draw: 1, seat };
        return "pick";
      }
      if (mv.pass) { if (b.drew == null) return false; b.drew = null; b.note = ""; S.last = { pass: 1, seat }; S.turn = 1 - seat; return "no"; }
      const id = mv.play, at = hand.indexOf(id);
      if (at < 0 || !ccFits(b, id) || (b.drew != null && id !== b.drew)) return false;
      const k = CC[id];
      if (k.c === "w" && !["r", "g", "b", "y"].includes(mv.col)) return false;
      hand.splice(at, 1); b.pile.push(b.top); b.top = id; b.colour = k.c === "w" ? mv.col : k.c; b.drew = null;
      S.last = { play: id, seat };
      let next = 1 - seat; b.note = "";
      if (k.v === "skip" || k.v === "rev") { next = seat; b.note = k.v === "skip" ? "skip" : "rev"; }
      if (k.v === "+2" || k.v === "+4") { const n = k.v === "+2" ? 2 : 4; b.hands[1 - seat].push(...ccDraw(b, n)); b.said[1 - seat] = false; next = seat; b.note = k.v; }
      b.said[seat] = hand.length === 1;
      if (!hand.length) { S.result = { w: seat, line: [] }; return "yes"; }
      S.turn = next;
      return k.c === "w" || next === seat ? "hit" : "place";
    },
    ai: colourAI,
    aiDelay: () => 650 + Math.random() * 400,
  };

  // for tests
  root.GAMES2_TEST = { dMoves, dApply, dInit, cStart, cLegal, cMake, inCheck, sanOf, TILES, CC };
})(typeof window !== "undefined" ? window : globalThis);
