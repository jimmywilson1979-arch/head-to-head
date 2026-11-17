// Head to Head — screens for Draughts, Chess, Dominoes and Colour Clash. Loaded after app.js.
"use strict";
(function () {
  ONE_SCREEN.push("draughts", "chess"); // nothing hidden, one player at a time: fine to pass one phone round

  // what's selected on this phone (cleared whenever the game moves on)
  const UI2 = { k: "", path: [], sel: -1, promo: null, dom: null, wild: null };
  function ui() {
    const k = S.sid + ":" + S.round + ":" + S.moves + ":" + S.phase;
    if (UI2.k !== k) { UI2.k = k; UI2.path = []; UI2.sel = -1; UI2.promo = null; UI2.dom = null; UI2.wild = null; }
    return UI2;
  }
  const solo = () => S.pass;
  const who = seat => isMe(S.seats[seat]) ? "You" : esc(nameOf(S.seats[seat]));

  // ---------- DRAUGHTS ----------
  function boardDraughts(c) {
    const b = S.board, u = ui(), me = c.me;
    const flip = !solo() && me === 1;
    const legal = c.myTurn ? GAMES.draughts.moves(S, me) : [];
    const starts = new Set(legal.map(p => p[0]));
    const live = legal.filter(p => u.path.every((x, i) => p[i] === x));
    const next = new Set(u.path.length ? live.map(p => p[u.path.length]).filter(x => x != null) : []);
    const last = new Set(b.lastPath || []);
    const taken = new Set(S.last && S.last.taken || []);
    let cells = "";
    for (let d = 0; d < 64; d++) {
      const sq = flip ? 63 - d : d, r = sq >> 3, col = sq & 7, dark = (r + col) % 2 === 1;
      const v = b.sq[sq], onPath = u.path.includes(sq);
      let inner = "";
      if (v != null) inner = `<i class="dpc p${v & 1} ${v >= 2 ? "king" : ""} ${onPath && u.path[0] === sq ? "sel" : ""}">${v >= 2 ? "♛︎" : ""}</i>`;
      else if (taken.has(sq) && c.animate) inner = `<i class="dpc ghost"></i>`;
      if (onPath && u.path[0] !== sq) inner += `<i class="dstep"></i>`;
      const tap = c.myTurn && dark && (starts.has(sq) || next.has(sq));
      cells += `<button class="${dark ? "dk" : "lt"} ${last.has(sq) ? "last" : ""} ${next.has(sq) ? "tgt" : ""} ${!u.path.length && starts.has(sq) ? "can" : ""}" ${tap ? `data-g2="d:${sq}"` : ""}>${inner}</button>`;
    }
    const resign = c.myTurn && !solo() ? `<div class="g2row"><button class="iconbtn" data-g2="resign">🏳️ Give up</button></div>` : "";
    return `<div class="dboard">${cells}</div>${resign}`;
  }
  function tapDraughts(sq) {
    const u = ui(), me = mySeat(), legal = GAMES.draughts.moves(S, me);
    const live = legal.filter(p => u.path.every((x, i) => p[i] === x));
    if (u.path.length && live.some(p => p[u.path.length] === sq)) {
      u.path.push(sq);
      const done = legal.find(p => p.length === u.path.length && p.every((x, i) => x === u.path[i]));
      if (done) { const p = u.path.slice(); u.path = []; return myMove({ p }); }
      return render();
    }
    u.path = legal.some(p => p[0] === sq) && u.path[0] !== sq ? [sq] : [];
    render();
  }

  // ---------- CHESS ----------
  const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  const piece = p => `<i class="cpc ${p === p.toUpperCase() ? "w" : "b"}">${GLYPH[p.toLowerCase()]}︎</i>`;
  function boardChess(c) {
    const b = S.board, pos = b.pos, u = ui(), me = c.me;
    const myWhite = solo() ? pos.w : me === b.white;
    const flip = !solo() && me >= 0 && !myWhite;
    const legal = c.myTurn ? GAMES.chess.legal(S) : [];
    const from = new Set(legal.map(m => m.f));
    const targets = new Set(u.sel >= 0 ? legal.filter(m => m.f === u.sel).map(m => m.t) : []);
    const lm = b.lastMove || {};
    const checkSq = GAMES.chess.inCheck(pos) ? pos.sq.indexOf(pos.w ? "K" : "k") : -1;
    let cells = "";
    for (let d = 0; d < 64; d++) {
      const sq = flip ? 63 - d : d, r = sq >> 3, col = sq & 7, light = (r + col) % 2 === 0;
      const p = pos.sq[sq];
      const rank = (flip ? col === 7 : col === 0) ? `<em class="rk">${8 - r}</em>` : "";
      const file = (flip ? r === 0 : r === 7) ? `<em class="fl">${"abcdefgh"[col]}</em>` : "";
      const tap = c.myTurn && (from.has(sq) || targets.has(sq));
      cells += `<button class="${light ? "lt" : "dk"} ${sq === lm.f || sq === lm.t ? "last" : ""} ${sq === u.sel ? "sel" : ""} ${targets.has(sq) ? (p ? "tgt cap" : "tgt") : ""} ${sq === checkSq ? "chk" : ""}" ${tap ? `data-g2="c:${sq}"` : ""}>${rank}${file}${p ? piece(p) : ""}</button>`;
    }
    let promo = "";
    if (u.promo) {
      const w = pos.w;
      promo = `<div class="promo"><p>Turn your pawn into…</p><div>${"qrbn".split("").map(t => `<button data-g2="promo:${t}">${piece(w ? t.toUpperCase() : t)}</button>`).join("")}</div></div>`;
    }
    const lost = side => b.taken[side].sort((x, y) => "pnbrq".indexOf(x) - "pnbrq".indexOf(y)).map(t => GLYPH[t] + "︎").join("");
    const topSide = flip ? "w" : "b"; // pieces lost by the side at the top / bottom
    const moves = b.san.length ? b.san.map((m, i) => (i % 2 === 0 ? `<b>${i / 2 + 1}.</b>` : "") + m).slice(-8).join(" ") : "";
    const resign = c.myTurn && !solo() ? `<button class="iconbtn" data-g2="resign">🏳️ Give up</button>` : "";
    return `<div class="ctaken ${topSide}">${lost(topSide)}&nbsp;</div><div class="cwrap"><div class="cboard">${cells}</div>${promo}</div><div class="ctaken ${topSide === "w" ? "b" : "w"}">${lost(topSide === "w" ? "b" : "w")}&nbsp;</div>
      <div class="g2row"><span class="cmoves">${moves}</span>${resign}</div>`;
  }
  function tapChess(sq) {
    const u = ui(), legal = GAMES.chess.legal(S);
    if (u.sel >= 0) {
      const ms = legal.filter(m => m.f === u.sel && m.t === sq);
      if (ms.length) {
        if (ms.some(m => m.p)) { u.promo = { f: u.sel, t: sq }; return render(); }
        const f = u.sel; u.sel = -1; return myMove({ f, t: sq });
      }
    }
    u.promo = null;
    u.sel = legal.some(m => m.f === sq) && u.sel !== sq ? sq : -1;
    render();
  }

  // ---------- DOMINOES ----------
  const PIPS = { 0: [], 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.27, .5], [.27, .75], [.73, .25], [.73, .5], [.73, .75]] };
  function half(n, x, y, s, vertical) {
    return PIPS[n].map(([a, b]) => { const px = vertical ? a : b, py = vertical ? b : a; return `<circle cx="${x + px * s}" cy="${y + py * s}" r="${s * .1}"/>`; }).join("");
  }
  function domSVG(a, b, vertical, cls = "", attrs = "") {
    const s = 40, w = vertical ? s : 2 * s, h = vertical ? 2 * s : s;
    const line = vertical ? `<line x1="6" y1="${s}" x2="${s - 6}" y2="${s}"/>` : `<line x1="${s}" y1="6" x2="${s}" y2="${s - 6}"/>`;
    return `<svg class="dom ${vertical ? "v" : "h"} ${cls}" viewBox="0 0 ${w} ${h}" ${attrs}><rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="7"/>${line}<g>${half(a, 0, 0, s, vertical)}${vertical ? half(b, 0, s, s, true) : half(b, s, 0, s, false)}</g></svg>`;
  }
  const domBack = () => `<i class="domback"></i>`;
  function boardDom(c) {
    const b = S.board, u = ui(), me = c.me, T = GAMES.dom.TILES;
    const lastId = S.last && S.last.id != null ? S.last.id : -1;
    const fitsSel = u.dom != null ? GAMES.dom.fits(b, u.dom) : [];
    const end = (e, n) => b.chain.length ? `<button class="dend ${fitsSel.includes(e) ? "go" : ""}" ${fitsSel.includes(e) ? `data-g2="de:${e}"` : ""}>${e === "L" ? "◀ " : ""}${n}${e === "R" ? " ▶" : ""}</button>` : "";
    const chain = b.chain.length
      ? b.chain.map(t => domSVG(t.a, t.b, t.a === t.b, t.id === lastId && c.animate ? "new" : t.id === lastId ? "lastt" : "")).join("")
      : `<p class="mut small center" style="width:100%">${c.myTurn ? "Play any tile to start" : "No tiles down yet"}</p>`;
    const opp = me >= 0 ? 1 - me : 1;
    const theirs = `<div class="ohand"><span>${who(opp)}: ${b.hands[opp].length}</span>${b.hands[opp].map(domBack).join("")}</div>`;
    let mine = "", acts = "";
    if (me >= 0) {
      const hand = b.hands[me].slice().sort((x, y) => (T[x][0] + T[x][1]) - (T[y][0] + T[y][1]));
      mine = `<div class="dhand">${hand.map(id => {
        const ok = c.myTurn && GAMES.dom.fits(b, id).length;
        return domSVG(T[id][0], T[id][1], true, `${ok ? "ok" : c.myTurn ? "no" : ""} ${u.dom === id ? "sel" : ""}`, ok ? `data-g2="dt:${id}"` : "");
      }).join("")}</div>`;
      if (c.myTurn) {
        const canPlay = b.hands[me].some(id => GAMES.dom.fits(b, id).length);
        if (!canPlay) acts = b.yard.length ? `<button class="btn" data-g2="ddraw">Pick up a tile (${b.yard.length} left)</button>` : `<button class="btn" data-g2="dknock">✊ Knock (can't go)</button>`;
        else if (u.dom != null && fitsSel.length > 1) acts = `<p class="center small mut">Tap the end to put it on</p>`;
      }
    }
    return `${theirs}<div class="dtable"><div class="dchain">${end("L", b.ends[0])}${chain}${end("R", b.ends[1])}</div><div class="center small mut">Pile: ${b.yard.length} tile${b.yard.length === 1 ? "" : "s"}</div></div>${acts}${mine}`;
  }
  function tapDom(id) {
    const u = ui(), fits = GAMES.dom.fits(S.board, id);
    if (fits.length === 1) { u.dom = null; return myMove({ id, e: fits[0] }); }
    u.dom = u.dom === id ? null : id; render();
  }

  // ---------- COLOUR CLASH ----------
  const CNAME = { r: "red", g: "green", b: "blue", y: "yellow" };
  const ccFace = v => v === "skip" ? "⊘" : v === "rev" ? "⇄" : v === "wild" ? "★" : v;
  function ccCard(id, cls = "", attrs = "") {
    const k = GAMES.cc.CARDS[id];
    return `<button class="ccard c-${k.c} ${cls}" ${attrs}><span class="cc1">${ccFace(k.v)}</span><span class="ccm">${ccFace(k.v)}</span><span class="cc2">${ccFace(k.v)}</span></button>`;
  }
  function boardCC(c) {
    const b = S.board, u = ui(), me = c.me;
    const opp = me >= 0 ? 1 - me : 1;
    const theirs = `<div class="ohand"><span>${who(opp)}: ${b.hands[opp].length}${b.said[opp] ? " · last card!" : ""}</span><div class="ccbacks">${b.hands[opp].slice(0, 14).map(() => `<i class="ccback"></i>`).join("")}</div></div>`;
    const top = GAMES.cc.CARDS[b.top];
    const middle = `<div class="cctable"><div class="ccpile">${ccCard(b.top, "top " + (c.animate && S.last && S.last.play != null ? "new" : ""))}<span class="cccol c-${b.colour}">${top.c === "w" ? "Colour: " + CNAME[b.colour] : ""}</span></div>
      <button class="ccdeck" ${c.myTurn && b.drew == null ? `data-g2="ccdraw"` : ""}><i class="ccback big"></i><span>${c.myTurn && b.drew == null ? "Pick up" : b.deck.length + " left"}</span></button></div>`;
    let mine = "", acts = "";
    if (me >= 0) {
      const hand = b.hands[me].slice().sort((x, y) => { const A = GAMES.cc.CARDS[x], B = GAMES.cc.CARDS[y]; return "rgbyw".indexOf(A.c) - "rgbyw".indexOf(B.c) || String(A.v).localeCompare(String(B.v), "en", { numeric: true }); });
      mine = `<div class="cchand">${hand.map(id => {
        const ok = c.myTurn && GAMES.cc.fits(b, id) && (b.drew == null || b.drew === id);
        return ccCard(id, `${ok ? "ok" : c.myTurn ? "no" : ""} ${u.wild === id ? "sel" : ""} ${b.drew === id ? "drawn" : ""}`, ok ? `data-g2="cc:${id}"` : "");
      }).join("")}</div>`;
      if (u.wild != null) acts = `<div class="ccpick"><p>Choose the colour</p><div>${"rgby".split("").map(k => `<button class="c-${k}" data-g2="col:${k}">${CNAME[k]}</button>`).join("")}</div></div>`;
      else if (c.myTurn && b.drew != null) acts = `<div class="g2row center">${GAMES.cc.fits(b, b.drew) ? `<span class="small mut">Play the card you picked up, or</span>` : `<span class="small mut">It doesn't go.</span>`}<button class="btn" data-g2="ccpass">Keep it and pass</button></div>`;
      else if (c.myTurn && !b.hands[me].some(id => GAMES.cc.fits(b, id))) acts = `<div class="g2row center"><span class="small mut">Nothing goes. Pick up a card.</span></div>`;
    }
    return `${theirs}${middle}${acts}${mine}`;
  }
  function tapCC(id) {
    const k = GAMES.cc.CARDS[id];
    if (k.c === "w") { ui().wild = ui().wild === id ? null : id; return render(); }
    myMove({ play: id });
  }

  // ---------- plug into the app ----------
  window.BOARDS2 = { draughts: boardDraughts, chess: boardChess, dom: boardDom, cc: boardCC };

  // the line under the status ("Check!", "They picked up 2", …)
  window.g2Sub = function (me, over, myTurn) {
    const g = S.game, b = S.board; if (!b || !BOARDS2[g]) return null;
    const lastSeat = S.last && S.last.seat != null ? S.last.seat : S.lastBy;
    const them = lastSeat >= 0 && lastSeat !== me;
    if (over) {
      if (b.why === "Resigned" || b.why === "resigned") return `${who(1 - S.result.w)} gave up`;
      if (g === "chess") return b.why;
      if (g === "draughts") return b.quiet >= 80 ? "40 moves each with nothing taken" : `${who(1 - S.result.w)} can't move`;
      if (g === "dom") return b.hands.every(h => h.length) ? `Nobody can go. Spots left: ${b.spots[0]} – ${b.spots[1]} (lowest wins)` : "Played every tile!";
      if (g === "cc") return "Played every card!";
      return null;
    }
    if (g === "chess") { if (GAMES.chess.inCheck(b.pos)) return myTurn ? "Check! Get your king safe" : "Check!"; return myTurn && b.san.length ? `They played ${b.san[b.san.length - 1]}` : ""; }
    if (g === "draughts") { const m = myTurn ? GAMES.draughts.moves(S, me) : []; return m.length && m[0].length > 2 ? "You have to jump" : ""; }
    if (g === "dom") {
      if (S.last && S.last.draw && them) return `${who(lastSeat)} picked up a tile`;
      if (S.last && S.last.knock && them) return `${who(lastSeat)} knocked`;
      return "";
    }
    if (g === "cc") {
      if (!S.last) return "";
      const n = b.note;
      if (them && (n === "+2" || n === "+4")) return `${who(lastSeat)} made you pick up ${n.slice(1)}!`;
      if (!them && lastSeat >= 0 && (n === "+2" || n === "+4") && myTurn) return `They picked up ${n.slice(1)}. Go again`;
      if (them && (n === "skip" || n === "rev")) return "They skipped you";
      if (!them && lastSeat >= 0 && (n === "skip" || n === "rev") && myTurn) return "Skipped them. Go again";
      if (them && S.last.draw) return `${who(lastSeat)} picked up a card`;
      if (them && S.last.pass) return `${who(lastSeat)} passed`;
      if (S.last.play != null && GAMES.cc.CARDS[S.last.play].c === "w") return `Colour is now ${CNAME[b.colour]}`;
      return "";
    }
    return null;
  };
  window.g2Chip = function (seat) {
    const g = S.game, b = S.board; if (!b || !BOARDS2[g]) return null;
    if (g === "draughts") { const n = b.sq.filter(v => v != null && (v & 1) === seat).length; return `${n} piece${n === 1 ? "" : "s"}`; }
    if (g === "chess") return seat === b.white ? "White" : "Black";
    if (g === "dom") { const n = b.hands[seat].length; return `${n} tile${n === 1 ? "" : "s"}`; }
    if (g === "cc") { const n = b.hands[seat].length; return n === 1 ? "Last card!" : `${n} cards`; }
    return null;
  };
  window.MARK2 = {
    chess: seat => `<span class="cmark ${S && S.board && S.board.white === seat ? "w" : "b"}">♚︎</span>`,
    dom: () => `<svg viewBox="0 0 100 100"><rect x="28" y="6" width="44" height="88" rx="9" fill="#f6f1e4" stroke="var(--c)" stroke-width="6"/><line x1="34" y1="50" x2="66" y2="50" stroke="#1b2140" stroke-width="4"/><circle cx="50" cy="28" r="6" fill="#1b2140"/><circle cx="40" cy="64" r="5" fill="#1b2140"/><circle cx="60" cy="78" r="5" fill="#1b2140"/></svg>`,
    cc: () => `<svg viewBox="0 0 100 100"><rect x="22" y="8" width="56" height="84" rx="9" fill="var(--c)"/><ellipse cx="50" cy="50" rx="20" ry="30" fill="rgba(255,255,255,.85)" transform="rotate(25 50 50)"/></svg>`,
  };

  Object.assign(GAME_ICON, {
    draughts: `<svg viewBox="0 0 120 104"><rect x="8" y="4" width="104" height="96" rx="10" fill="#e9cf9f"/>${[0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => (r + c) % 2 ? `<rect x="${8 + c * 26}" y="${4 + r * 24}" width="26" height="24" fill="#8a5a35"/>` : "").join("")).join("")}<circle cx="47" cy="16" r="9" fill="#ffd23f" stroke="#0005" stroke-width="2"/><circle cx="99" cy="16" r="9" fill="#ffd23f" stroke="#0005" stroke-width="2"/><circle cx="73" cy="40" r="9" fill="#ffd23f" stroke="#0005" stroke-width="2"/><circle cx="21" cy="88" r="9" fill="#ff5d73" stroke="#0005" stroke-width="2"/><circle cx="73" cy="88" r="9" fill="#ff5d73" stroke="#0005" stroke-width="2"/><circle cx="47" cy="64" r="9" fill="#ff5d73" stroke="#0005" stroke-width="2"/><text x="47" y="69" text-anchor="middle" font-size="12" fill="#7a1020">♛︎</text></svg>`,
    chess: `<svg viewBox="0 0 120 104"><rect x="8" y="4" width="104" height="96" rx="10" fill="#f0d9b5"/>${[0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => (r + c) % 2 ? `<rect x="${8 + c * 26}" y="${4 + r * 24}" width="26" height="24" fill="#b58863"/>` : "").join("")).join("")}<text x="44" y="78" text-anchor="middle" font-size="60" fill="#fff" stroke="#1b2140" stroke-width="2.5">♞︎</text><text x="86" y="66" text-anchor="middle" font-size="44" fill="#1b2140" stroke="#fff" stroke-width="1">♛︎</text></svg>`,
    dom: `<svg viewBox="0 0 120 104"><g transform="rotate(-14 40 52)">${domSVG(5, 2, true).replace("<svg", `<svg x="20" y="10" width="40" height="80"`)}</g><g transform="rotate(12 82 52)">${domSVG(6, 6, true).replace("<svg", `<svg x="62" y="12" width="40" height="80"`)}</g></svg>`,
    cc: `<svg viewBox="0 0 120 104"><g transform="rotate(-22 60 96)"><rect x="34" y="10" width="44" height="66" rx="7" fill="#2f7ae0" stroke="#fff" stroke-width="3"/></g><g transform="rotate(-7 60 96)"><rect x="38" y="8" width="44" height="66" rx="7" fill="#38b25a" stroke="#fff" stroke-width="3"/></g><g transform="rotate(8 60 96)"><rect x="42" y="8" width="44" height="66" rx="7" fill="#f5c400" stroke="#fff" stroke-width="3"/></g><g transform="rotate(23 60 96)"><rect x="46" y="10" width="44" height="66" rx="7" fill="#e8423f" stroke="#fff" stroke-width="3"/><ellipse cx="68" cy="43" rx="13" ry="21" fill="#fff" transform="rotate(25 68 43)"/><text x="68" y="52" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="24" fill="#e8423f">+2</text></g></svg>`,
  });

  app.addEventListener("click", e => {
    const el = e.target.closest("[data-g2]"); if (!el || !S) return;
    const [k, v] = el.dataset.g2.split(":");
    if (k === "resign") { if (confirm("Give up this game?")) myMove({ resign: 1 }); return; }
    if (k === "d") return tapDraughts(Number(v));
    if (k === "c") return tapChess(Number(v));
    if (k === "promo") { const p = ui().promo; ui().promo = null; ui().sel = -1; return myMove({ f: p.f, t: p.t, p: v }); }
    if (k === "dt") return tapDom(Number(v));
    if (k === "de") { const id = ui().dom; ui().dom = null; return myMove({ id, e: v }); }
    if (k === "ddraw") return myMove({ draw: 1 });
    if (k === "dknock") return myMove({ knock: 1 });
    if (k === "cc") return tapCC(Number(v));
    if (k === "col") { const id = ui().wild; ui().wild = null; return myMove({ play: id, col: v }); }
    if (k === "ccdraw") return myMove({ draw: 1 });
    if (k === "ccpass") return myMove({ pass: 1 });
  });
})();
