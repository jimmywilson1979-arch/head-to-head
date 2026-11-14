// Head to Head — phone vs phone games.
// The phone that starts a game is the "host": it holds the real game state and sends it to everyone.
// Other phones scan the QR code, join the same live channel, and send their moves to the host.
"use strict";

// ===== CONFIG ===== (same live connection as Buzz In)
const SUPA_URL = "https://uqwlmegbelyqtbegxqlz.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxd2xtZWdiZWx5cXRiZWd4cWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NTYzNzAsImV4cCI6MjEwNzMzMjM3MH0.bSeF8_kwKqSrEj3n8Ku2OeSU8E5nMqJj0hcfgXb8cW0";
const MAX_PLAYERS = 8;

const P = new URLSearchParams(location.search);
const LOCAL = P.has("local"); // ?local = test on one device with two tabs (no internet needed)
const $ = s => document.querySelector(s);
const app = $("#app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STORE = (() => { try { return LOCAL ? sessionStorage : localStorage; } catch (e) { return null; } })(); // ?local tabs each act as a separate phone
const ls = {
  get(k, d) { try { const v = STORE.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { STORE.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { STORE.removeItem(k); } catch (e) { } },
};
const uid = () => Math.random().toString(36).slice(2, 10);
const roomCode = () => Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
const cleanName = s => String(s || "").replace(/\s+/g, " ").trim().slice(0, 16);
const LEVELS = { easy: "Easy", medium: "Medium", hard: "Hard" };

// ===== WHO AM I =====
const ME = { id: ls.get("h2h_pid", null), name: ls.get("h2h_name", "") };
if (!ME.id) { ME.id = uid(); ls.set("h2h_pid", ME.id); }
const PREF = Object.assign({ game: "ttt", level: "medium", sound: true, deck: "animals" }, ls.get("h2h_pref", {}));
const savePref = () => ls.set("h2h_pref", PREF);


// ===== APP STATE =====
let MODE = "home";          // home | join | host | guest | cpu | ended
let S = null;               // the game (host & cpu: the real one; guest: the host's copy, minus secrets)
let T = null;               // live connection
let conn = "off";           // off | connecting | ok | lost
let lastSeen = 0, joinedAt = 0, pending = null, cpuTimer = null, animKey = "", showQR = false, leaveArm = 0, endedMsg = "";
let qrCache = { url: null, img: null };
let DRAFT = { k: "", ships: null };   // Battleships: fleet being placed
let MYPICK = { k: "", v: null };      // Rock Paper Scissors: what a guest picked
let REVEAL = { k: "", until: 0 };     // Rock Paper Scissors: hands shaking
let TTSEEN = "";                      // Card Clash: last round result this phone has dismissed

// ===== SOUND & BUZZ =====
const Snd = {
  ctx: null,
  init() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  tone(f, d = .12, type = "sine", v = .14, when = 0, f2) {
    const c = this.ctx; if (!c || !PREF.sound) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0008, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + .03);
  },
  noise(d = .4, v = .2, when = 0, freq = 800) {
    const c = this.ctx; if (!c || !PREF.sound) return;
    const n = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + when;
    f.type = "lowpass"; f.frequency.value = freq; g.gain.value = v;
    src.buffer = buf; src.connect(f).connect(g).connect(c.destination); src.start(t);
  },
  place(seat) { this.tone(seat ? 620 : 420, .09, "triangle", .16); this.tone(seat ? 930 : 630, .06, "sine", .06, .02); },
  drop(rows) { const d = .18 + rows * .055; this.tone(220, .08, "triangle", .18, d); this.tone(160, .1, "sine", .12, d + .01); },
  line() { this.tone(700, .05, "triangle", .12); },
  box() { this.tone(660, .09, "triangle", .14); this.tone(990, .14, "triangle", .12, .08); },
  miss() { this.noise(.45, .18, 0, 600); this.tone(300, .25, "sine", .05, 0, 120); },
  hit() { this.noise(.6, .35, 0, 1400); this.tone(90, .35, "sine", .25, 0, 40); },
  sunk() { this.hit(); [392, 330, 262, 196].forEach((f, i) => this.tone(f, .2, "square", .05, .25 + i * .12)); },
  pick() { this.tone(520, .05, "square", .06); },
  flip() { this.noise(.12, .12, 0, 3000); },
  ready() { this.tone(523, .08, "triangle", .1); this.tone(784, .12, "triangle", .1, .08); },
  shake() { [0, .33, .66].forEach(w => this.tone(140, .08, "sine", .2, w)); this.tone(880, .12, "triangle", .12, 1.0); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .2, "triangle", .14, i * .11)); },
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, .22, "sine", .12, i * .15)); },
  draw() { this.tone(440, .14, "sine", .12); this.tone(440, .14, "sine", .12, .18); },
  join() { this.tone(880, .08, "sine", .1); this.tone(1175, .12, "sine", .1, .08); },
};
document.addEventListener("pointerdown", () => Snd.init(), { capture: true });
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };
let wake = null;
async function keepAwake() { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => wake = null); } } catch (e) { } }

function toast(msg) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function confetti() {
  const box = document.createElement("div"); box.className = "confetti";
  const cols = ["#ff5d73", "#ffd23f", "#6c8cff", "#51e08a", "#c792ff", "#3ee6d6"];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "vw"; p.style.background = cols[i % cols.length];
    p.style.animationDuration = (1.6 + Math.random() * 1.6) + "s"; p.style.animationDelay = (Math.random() * .4) + "s";
    p.style.transform = `rotate(${Math.random() * 360}deg)`; box.appendChild(p);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 3800);
}

// ===== LIVE CONNECTION =====
function connect(room, onMsg, onStatus) {
  if (LOCAL) {
    const bc = new BroadcastChannel("h2h-" + room);
    bc.onmessage = e => onMsg(e.data);
    setTimeout(() => onStatus("ok"), 50);
    return { send: m => bc.postMessage(m), revive() { }, close() { bc.close(); } };
  }
  if (!window.supabase) { setTimeout(() => onStatus("lost"), 50); return { send() { }, revive() { }, close() { } }; }
  const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, { realtime: { params: { eventsPerSecond: 20 } } });
  let ch = null, closed = false;
  function sub() {
    const mine = sb.channel("h2h-" + room, { config: { broadcast: { self: false } } });
    ch = mine;
    mine.on("broadcast", { event: "m" }, ({ payload }) => { if (ch === mine) onMsg(payload); });
    mine.subscribe(st => {
      if (ch !== mine || closed) return;
      if (st === "SUBSCRIBED") onStatus("ok");
      else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") onStatus("lost");
    });
  }
  sub();
  return {
    send: m => { if (ch) ch.send({ type: "broadcast", event: "m", payload: m }).catch(() => { }); },
    revive() { if (closed) return; const old = ch; ch = null; try { sb.removeChannel(old); } catch (e) { } sub(); },
    close() { closed = true; try { sb.removeChannel(ch); } catch (e) { } ch = null; },
  };
}
function setConn(s) {
  const was = conn; conn = s;
  if (s === "ok") {
    if (MODE === "guest") sendHello();
    if (MODE === "host" && S) sendState();
  }
  if (was !== s) render();
}
function sendHello() { if (T) T.send({ t: "hello", pid: ME.id, name: ME.name || "Player" }); }
// Everyone gets the board, never the secrets (ships, picks): those stay on the host's phone.
function pub(s) { const o = Object.assign({}, s); delete o.sec; return o; }
function sendState() { if (T && S) T.send({ t: "state", s: pub(S) }); }

// ===== GAME ENGINE (host and computer games) =====
function newState(game, room) {
  return { sid: uid(), v: 0, room, game, host: ME.id, players: [], seats: [null, null], queue: [], phase: "lobby",
    board: null, sec: {}, turn: 0, starter: 0, result: null, last: null, lastBy: -1, fx: null, moves: 0, round: 0, draws: 0,
    level: PREF.level, acks: {}, opts: { deck: PREF.deck } };
}
const pl = id => S && S.players.find(p => p.id === id);
const nameOf = id => (pl(id) || {}).name || "Player";
const mySeat = () => S ? S.seats.indexOf(ME.id) : -1;
const G = () => GAMES[S.game];
const waiting = seat => !!S && S.phase === "play" && seat >= 0 && G().waiting(S, seat);
const secKey = () => S.sid + ":" + S.round;

function startRound() {
  S.result = null; S.last = null; S.lastBy = -1; S.fx = null; S.moves = 0; S.round++; S.phase = "play";
  G().init(S);
}
function startFromLobby() {
  const ids = S.players.map(p => p.id);
  S.seats = [ids[0], ids[1]]; S.queue = ids.slice(2); S.starter = 0; startRound();
}
function applyMove(pid, mv, n) {
  if (!S || S.phase !== "play") return false;
  const seat = S.seats.indexOf(pid);
  if (seat < 0 || !G().waiting(S, seat)) return false;
  if (n != null && S.turn >= 0 && n !== S.moves) return false;
  const fx = G().move(S, seat, mv);
  if (!fx) return false;
  S.moves++; S.fx = fx; S.lastBy = seat;
  if (S.result) {
    S.phase = "over";
    if (S.result.w === "draw") S.draws++; else { const p = pl(S.seats[S.result.w]); if (p) p.wins++; }
  }
  return true;
}
function nextRound() {
  if (S.result && S.queue.length) { // winner stays on, the next person in the queue takes the loser's seat and starts
    const off = S.result.w === "draw" ? S.starter : 1 - S.result.w;
    S.queue.push(S.seats[off]); S.seats[off] = S.queue.shift(); S.starter = off;
  } else S.starter = 1 - S.starter;
  startRound();
}
function removePlayer(id) {
  S.players = S.players.filter(p => p.id !== id);
  S.queue = S.queue.filter(x => x !== id);
  const si = S.seats.indexOf(id);
  if (si >= 0 && S.phase !== "lobby") {
    if (S.queue.length) { S.seats[si] = S.queue.shift(); S.starter = si; startRound(); }
    else { S.seats = [null, null]; S.queue = []; S.phase = "lobby"; }
  }
}
function commit() {
  S.v++;
  if (MODE === "host") { ls.set("h2h_host", { S, t: Date.now() }); sendState(); }
  render();
  maybeCPU();
}
function maybeCPU() {
  if (MODE !== "cpu" || !S || S.phase !== "play" || cpuTimer) return;
  const cs = S.seats.indexOf("cpu");
  if (cs < 0 || !G().waiting(S, cs) || ttRevealPending()) return;
  const placing = S.game === "bs" && S.board.stage === "place";
  const extra = S.game === "rps" && REVEAL.until > Date.now() ? REVEAL.until - Date.now() : 0;
  cpuTimer = setTimeout(() => {
    cpuTimer = null;
    if (MODE !== "cpu" || !S || S.phase !== "play" || !G().waiting(S, cs) || ttRevealPending()) return;
    const mv = G().ai(S, cs, S.level);
    if (applyMove("cpu", mv, S.turn >= 0 ? S.moves : null)) { afterMove(); commit(); }
  }, (placing ? 250 : S.game === "dots" ? 420 + Math.random() * 300 : 520 + Math.random() * 380) + extra);
}

// ===== FEEDBACK =====
function playFx(s) {
  switch (s.fx) {
    case "place": Snd.place(s.lastBy); break;
    case "drop": Snd.drop(Math.floor(s.last / 7) + 1); break;
    case "line": Snd.line(); break;
    case "box": Snd.box(); break;
    case "miss": Snd.miss(); break;
    case "hit": Snd.hit(); buzz(60); break;
    case "sunk": Snd.sunk(); buzz([80, 50, 120]); break;
    case "pick": Snd.pick(); break;
    case "ready": Snd.ready(); break;
    case "tt": {
      const w = s.board.last.w, me = s.seats.indexOf(ME.id);
      Snd.flip();
      if (w === "draw") Snd.tone(440, .12, "sine", .1, .25);
      else if (me < 0 || w === me) { Snd.tone(660, .1, "triangle", .13, .25); Snd.tone(990, .16, "triangle", .12, .33); }
      else Snd.tone(300, .2, "sine", .12, .25, 200);
      break;
    }
    case "reveal": {
      REVEAL = { k: s.sid + ":" + s.round + ":" + s.board.hist.length, until: Date.now() + 1100 };
      Snd.shake(); setTimeout(() => { if (MODE !== "home") render(); }, 1150); break;
    }
  }
}
function resultFx() {
  const r = S.result; if (!r) return;
  const run = () => {
    if (!S || !S.result) return;
    if (r.w === "draw") { Snd.draw(); return; }
    const me = mySeat();
    if (me < 0 || r.w === me) { Snd.win(); confetti(); buzz([60, 40, 60]); } else { Snd.lose(); buzz(200); }
  };
  if (S.fx === "reveal" || S.fx === "sunk" || S.fx === "tt") setTimeout(run, S.fx === "reveal" ? 1150 : 700); else run();
}
function afterMove() { // sounds for the host and computer games
  playFx(S);
  if (S.phase === "over") resultFx();
  else if (S.lastBy !== mySeat() && waiting(mySeat())) buzz(35);
}

// ===== HOST =====
function startHosting(existing) {
  MODE = "host"; showQR = false;
  if (existing) { S = existing; S.acks = S.acks || {}; S.sec = S.sec || {}; }
  else {
    S = newState(PREF.game, roomCode());
    S.players.push({ id: ME.id, name: ME.name || "Player 1", wins: 0 });
  }
  conn = "connecting"; T = connect(S.room, hostMsg, setConn);
  keepAwake(); commit();
}
function hostMsg(m) {
  if (!m || !S) return;
  if (m.t === "hello") {
    let p = pl(m.pid);
    if (!p) {
      if (S.players.length >= MAX_PLAYERS) { T.send({ t: "full", pid: m.pid }); return; }
      p = { id: m.pid, name: cleanName(m.name) || "Player " + (S.players.length + 1), wins: 0 };
      S.players.push(p); if (S.phase !== "lobby") S.queue.push(p.id);
      Snd.join(); toast(p.name + " joined");
    } else if (cleanName(m.name)) p.name = cleanName(m.name);
    return commit();
  }
  if (m.t === "move") {
    if (m.mid && S.acks[m.pid] === m.mid) { sendState(); return; } // already done (a resend)
    const ok = applyMove(m.pid, m.mv, m.n);
    if (m.mid) S.acks[m.pid] = m.mid;
    if (ok) afterMove();
    commit();
    return;
  }
  if (m.t === "again") { if (S.phase === "over" && S.seats.includes(m.pid)) { nextRound(); commit(); } return; }
  if (m.t === "bye") { const p = pl(m.pid); if (p) { toast(p.name + " left"); removePlayer(m.pid); commit(); } }
}

// ===== GUEST =====
let joinCode = "";
function startJoining(code) {
  MODE = "guest"; S = null; lastSeen = 0; joinedAt = Date.now(); pending = null;
  ME.name = cleanName(ME.name) || "Player"; ls.set("h2h_name", ME.name);
  joinCode = code;
  conn = "connecting"; T = connect(code, guestMsg, setConn);
  keepAwake(); render();
}
function guestMsg(m) {
  if (!m) return;
  if (m.t === "state") {
    const s = m.s, prev = S;
    lastSeen = Date.now();
    if (prev && s.sid === prev.sid && s.v < prev.v) return;
    if (pending) {
      if (s.acks && s.acks[ME.id] === pending.mid) pending = null;
      else if (prev && GAMES[prev.game].local && s.sid === prev.sid && Date.now() - pending.first < 6000) return; // keep showing my move until the host has it
    }
    S = s;
    if (!prev || prev.sid !== s.sid) { render(); return; }
    const me = s.seats.indexOf(ME.id);
    const newMove = s.round === prev.round && s.moves > prev.moves;
    if (newMove && !(s.lastBy === me && GAMES[s.game].local)) playFx(s);
    if (s.phase === "over" && (prev.phase !== "over" || prev.round !== s.round)) resultFx();
    else if (s.phase === "play" && waiting(me) && !(prev.phase === "play" && prev.round === s.round && GAMES[prev.game].waiting(prev, me))) buzz(35);
    if (!s.players.some(p => p.id === ME.id) && prev.players.some(p => p.id === ME.id)) { endGuest("The host removed you from the game."); return; }
    render();
    return;
  }
  if (m.t === "full" && m.pid === ME.id) { endGuest("That game is full (" + MAX_PLAYERS + " players)."); return; }
  if (m.t === "ended") endGuest("The host has ended the game.");
}
function endGuest(msg) {
  if (T) T.close(); T = null; S = null; MODE = "ended"; endedMsg = msg; render();
}
function sendMove(mv, n) {
  pending = { mid: uid(), mv, n, t: Date.now(), first: Date.now() };
  T.send({ t: "move", pid: ME.id, mv, n, mid: pending.mid });
}

// ===== COMPUTER GAME =====
function startCPU() {
  MODE = "cpu";
  S = newState(PREF.game, "CPU");
  S.players = [{ id: ME.id, name: ME.name || "You", wins: 0 }, { id: "cpu", name: "Computer", wins: 0, cpu: true }];
  S.level = PREF.level; startFromLobby(); keepAwake(); commit();
}

// ===== MY ACTIONS =====
function myMove(mv) {
  if (!S || S.phase !== "play") return;
  const me = mySeat(), g = G();
  if (me < 0 || !g.waiting(S, me)) return;
  const n = S.turn >= 0 ? S.moves : null;
  if (MODE === "guest") {
    if (pending) return;
    if (g.local) { // show it straight away; the host's copy confirms it
      if (!applyMove(ME.id, mv, n)) return;
      sendMove(mv, n); playFx(S); if (S.phase === "over") resultFx();
      render(); return;
    }
    if (mv && mv.ships) ls.set("h2h_mysec", { k: secKey(), ships: mv.ships });
    if (typeof mv === "string") MYPICK = { k: secKey() + ":" + S.board.hist.length, v: mv };
    sendMove(mv, n); Snd.pick(); render(); return;
  }
  if (applyMove(ME.id, mv, n)) { afterMove(); commit(); }
}
function playAgain() {
  if (!S || S.phase !== "over") return;
  if (MODE === "guest") { T.send({ t: "again", pid: ME.id }); toast("Asking for a rematch…"); return; }
  nextRound(); commit();
}
function leave() {
  if (Date.now() - leaveArm > 3000 && MODE !== "cpu" && S && S.players.length > 1) { leaveArm = Date.now(); toast(MODE === "host" ? "Tap Leave again to end the game for everyone" : "Tap Leave again to leave"); return; }
  if (MODE === "host") { if (T) T.send({ t: "ended" }); ls.del("h2h_host"); }
  if (MODE === "guest" && T) T.send({ t: "bye", pid: ME.id });
  clearTimeout(cpuTimer); cpuTimer = null;
  const t = T; setTimeout(() => { if (t) t.close(); }, 300); T = null;
  S = null; MODE = "home"; conn = "off"; showQR = false; pending = null;
  if (location.search) history.replaceState(null, "", location.pathname + (LOCAL ? "?local" : ""));
  render();
}
// secrets this phone knows about itself
function myFleet() {
  const me = mySeat(); if (me < 0) return null;
  if (MODE !== "guest") return S.sec && S.sec[me];
  const v = ls.get("h2h_mysec", null);
  if (v && v.k === secKey()) return v.ships;
  return S.board.reveal ? S.board.reveal[me] : null;
}
function myPick() {
  const me = mySeat(); if (me < 0) return null;
  if (MODE !== "guest") return S.sec && S.sec[me];
  return MYPICK.k === secKey() + ":" + S.board.hist.length ? MYPICK.v : null;
}
function ttKey() { return S && S.game === "tt" && S.board && S.board.last ? S.sid + ":" + S.round + ":" + S.board.last.n : ""; }
function ttRevealPending() { const k = ttKey(); return !!k && S.phase === "play" && TTSEEN !== k; }
function draftFleet() {
  if (DRAFT.k !== secKey() || !DRAFT.ships) DRAFT = { k: secKey(), ships: GAMES.bs.randomFleet() };
  return DRAFT.ships;
}

// ===== TIMERS =====
setInterval(() => { if (MODE === "host") sendState(); }, 4000);
setInterval(() => {
  if (MODE === "guest" && T) {
    if (conn === "ok" && Date.now() - lastSeen > 6000) sendHello();
    if (pending && Date.now() - pending.first > 12000) { pending = null; render(); }
    else if (pending && Date.now() - pending.t > 2500 && conn === "ok") { pending.t = Date.now(); T.send({ t: "move", pid: ME.id, mv: pending.mv, n: pending.n, mid: pending.mid }); }
    if (!S || Date.now() - lastSeen > 9000) render();
  }
  if ((MODE === "host" || MODE === "guest") && T && conn === "lost") T.revive();
}, 1500);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  keepAwake();
  if ((MODE === "host" || MODE === "guest") && T) {
    if (conn !== "ok") T.revive();
    if (MODE === "guest") sendHello(); else sendState();
  }
});

// ===== DRAWING =====
const svgX = (cls = "") => `<svg class="mark ${cls}" viewBox="0 0 100 100"><line x1="18" y1="18" x2="82" y2="82" stroke="var(--c)"/><line x1="82" y1="18" x2="18" y2="82" stroke="var(--c)"/></svg>`;
const svgO = (cls = "") => `<svg class="mark ${cls}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="33" stroke="var(--c)"/></svg>`;
const disc = () => `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="var(--c)"/><circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="6"/></svg>`;
const HAND = { r: "✊", p: "✋", s: "✌️" }, HAND_NAME = { r: "Rock", p: "Paper", s: "Scissors" };
const BEAT_TEXT = { rs: "Rock blunts scissors", pr: "Paper wraps rock", sp: "Scissors cut paper" };
function markFor(game, seat) {
  if (game === "ttt") return seat === 0 ? svgX() : svgO();
  if (game === "dots") return `<svg viewBox="0 0 100 100"><rect x="14" y="14" width="72" height="72" rx="8" fill="var(--c)" opacity=".85"/></svg>`;
  if (game === "bs") return `<svg viewBox="0 0 100 100"><path d="M10 58h80l-12 18H22z" fill="var(--c)"/><rect x="34" y="40" width="30" height="16" rx="3" fill="var(--c)"/><rect x="46" y="26" width="6" height="16" fill="var(--c)"/></svg>`;
  if (game === "rps") return `<span style="font-size:24px;line-height:1">${seat ? "✋" : "✊"}</span>`;
  if (game === "tt") return `<svg viewBox="0 0 100 100"><rect x="22" y="10" width="56" height="80" rx="9" fill="var(--c)"/><rect x="30" y="20" width="40" height="28" rx="5" fill="rgba(0,0,0,.25)"/><g fill="rgba(0,0,0,.25)"><rect x="30" y="56" width="40" height="5" rx="2"/><rect x="30" y="66" width="40" height="5" rx="2"/><rect x="30" y="76" width="28" height="5" rx="2"/></g></svg>`;
  return disc();
}
const GAME_ICON = {
  ttt: `<svg viewBox="0 0 120 120"><g stroke="#3a4680" stroke-width="6" stroke-linecap="round"><line x1="43" y1="12" x2="43" y2="108"/><line x1="77" y1="12" x2="77" y2="108"/><line x1="12" y1="43" x2="108" y2="43"/><line x1="12" y1="77" x2="108" y2="77"/></g><g stroke="#ff5d73" stroke-width="8" stroke-linecap="round"><line x1="16" y1="16" x2="36" y2="36"/><line x1="36" y1="16" x2="16" y2="36"/><line x1="84" y1="84" x2="104" y2="104"/><line x1="104" y1="84" x2="84" y2="104"/></g><circle cx="60" cy="60" r="11" fill="none" stroke="#ffd23f" stroke-width="8"/><circle cx="94" cy="26" r="11" fill="none" stroke="#ffd23f" stroke-width="8"/></svg>`,
  c4: `<svg viewBox="0 0 120 104"><rect x="4" y="4" width="112" height="96" rx="14" fill="#2449d8"/>${[0, 1, 2, 3].map(r => [0, 1, 2, 3, 4].map(c => { const f = ({ "3,1": "#ff5d73", "3,2": "#ffd23f", "3,3": "#ff5d73", "2,2": "#ff5d73", "2,3": "#ffd23f", "1,3": "#ffd23f", "2,1": "#ffd23f" })[r + "," + c] || "#0b1230"; return `<circle cx="${20 + c * 20}" cy="${21 + r * 21}" r="8" fill="${f}"/>`; }).join("")).join("")}</svg>`,
  dots: `<svg viewBox="0 0 120 120"><rect x="16" y="16" width="44" height="44" fill="#ff5d73" opacity=".35"/><rect x="60" y="60" width="44" height="44" fill="#ffd23f" opacity=".35"/><g stroke-width="6" stroke-linecap="round"><path d="M16 16H60V60H16Z" stroke="#ff5d73" fill="none"/><path d="M60 60H104V104H60Z" stroke="#ffd23f" fill="none"/><path d="M60 16H104" stroke="#ff5d73"/><path d="M16 60V104" stroke="#ffd23f"/></g>${[16, 60, 104].map(y => [16, 60, 104].map(x => `<circle cx="${x}" cy="${y}" r="7" fill="#eef2ff"/>`).join("")).join("")}</svg>`,
  bs: `<svg viewBox="0 0 120 120"><rect x="6" y="6" width="108" height="108" rx="12" fill="#12306b"/><g stroke="#2a4f9a" stroke-width="2">${[1, 2, 3, 4].map(k => `<line x1="${6 + k * 21.6}" y1="6" x2="${6 + k * 21.6}" y2="114"/><line x1="6" y1="${6 + k * 21.6}" x2="114" y2="${6 + k * 21.6}"/>`).join("")}</g><rect x="12" y="34" width="62" height="16" rx="8" fill="#9aa6c8"/><rect x="77" y="56" width="16" height="40" rx="8" fill="#9aa6c8"/><circle cx="41" cy="42" r="9" fill="#ff5d73"/><circle cx="60" cy="85" r="4" fill="#eef2ff"/><circle cx="25" cy="98" r="4" fill="#eef2ff"/></svg>`,
  rps: `<div style="font-size:30px;line-height:54px;letter-spacing:-2px">✊✋✌️</div>`,
  tt: `<div class="ttico"><i>🦁</i><i>🐘</i></div>`,
};

function joinURL(room) { return location.origin + location.pathname + "?join=" + room + (LOCAL ? "&local" : ""); }
function qrImg(url) {
  if (qrCache.url === url) return qrCache.img;
  let out = "";
  try {
    const box = document.createElement("div");
    new QRCode(box, { text: url, width: 480, height: 480, correctLevel: QRCode.CorrectLevel.M, colorDark: "#0b1020", colorLight: "#ffffff" });
    const cv = box.querySelector("canvas");
    out = cv ? `<img alt="QR code to join" src="${cv.toDataURL("image/png")}">` : box.innerHTML;
  } catch (e) { out = `<div style="color:#0b1020;padding:20px;text-align:center;font-weight:800">QR code didn't load.<br>Use the code below.</div>`; }
  qrCache = { url, img: out };
  return out;
}
async function shareInvite() {
  const url = joinURL(S.room), text = `Play me at ${GAMES[S.game].name}! Join game ${S.room}:`;
  try { if (navigator.share) { await navigator.share({ title: "Head to Head", text, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text + " " + url); toast("Invite link copied"); } catch (e) { toast(url); }
}

// ===== SCREENS =====
function render() {
  const f = document.activeElement;
  if (f && f.id && MODE === "home" && app.querySelector("#" + f.id)) return; // don't wipe what they're typing
  if (MODE === "home") return renderHome();
  if (MODE === "join") return renderJoin();
  if (MODE === "ended") return renderEnded();
  if (MODE === "guest" && !S) return renderFinding();
  if (S.phase === "lobby") return renderLobby();
  return renderGame();
}

function gamePicker(sel, attr = "data-pickgame") {
  return `<div class="games">${Object.values(GAMES).map(g => `<button class="gpick ${sel === g.id ? "on" : ""}" ${attr}="${g.id}"><div class="ic">${GAME_ICON[g.id]}</div><b>${g.name}</b></button>`).join("")}</div>`;
}
function levelSeg(sel, attr = "data-level") {
  return `<div class="seg">${Object.entries(LEVELS).map(([k, v]) => `<button class="${sel === k ? "on" : ""}" ${attr}="${k}">${v}</button>`).join("")}</div>`;
}
const soundBtn = () => `<button class="iconbtn" data-act="sound">${PREF.sound ? "🔊" : "🔇"}</button>`;

function renderHome() {
  const saved = ls.get("h2h_host", null);
  const resume = saved && saved.S && GAMES[saved.S.game] && Date.now() - saved.t < 3 * 3600e3 && saved.S.players.length > 1 ? saved : null;
  if (!GAMES[PREF.game]) PREF.game = "ttt";
  app.innerHTML = `
  <div class="top"><span></span>${soundBtn()}</div>
  <div class="logo"><h1><span class="a">Head</span><span class="vs">to</span><span class="b">Head</span></h1><p>Phone vs phone. Scan, join, play.</p></div>
  ${resume ? `<div class="card resume"><div class="row"><div><b>Game ${esc(resume.S.room)} is still open</b><div class="small mut">${esc(GAMES[resume.S.game].name)} · ${resume.S.players.map(p => esc(p.name)).join(", ")}</div></div><button class="btn green" style="flex:none;width:auto;padding:12px 18px" data-act="resume">Resume</button></div></div>` : ""}
  <div class="card">
    <p class="label">Your name</p>
    <input id="nm" class="field" maxlength="16" placeholder="Your name" value="${esc(ME.name)}" autocomplete="off" enterkeyhint="done">
  </div>
  <div class="card">
    <p class="label">Pick a game</p>
    ${gamePicker(PREF.game)}
    ${PREF.game === "tt" ? `<div class="gap"></div><p class="label">Card Clash theme</p>${deckPicker(PREF.deck, "data-deck")}` : ""}
  </div>
  <button class="btn" data-act="host">📱 Play a friend<span class="sub">Get a QR code for them to scan</span></button>
  <div class="card" style="margin-top:22px">
    <p class="label">Play the computer</p>
    ${levelSeg(PREF.level)}
    <div class="gap"></div>
    <button class="btn alt" data-act="cpu">🤖 Play the computer</button>
  </div>
  <div class="card">
    <p class="label">Got a code from a friend?</p>
    <div class="row"><input id="jc" class="field code" maxlength="4" placeholder="ABCD" autocomplete="off" autocapitalize="characters" enterkeyhint="go"><button class="btn green" style="flex:none;width:auto;padding:14px 22px" data-act="joincode">Join</button></div>
  </div>
  <p class="center small mut">More games coming soon</p>`;
}

function renderJoin() {
  app.innerHTML = `
  <div class="logo"><h1><span class="a">Head</span><span class="vs">to</span><span class="b">Head</span></h1><p>You've been invited to game <b style="color:var(--ink)">${esc(joinCode)}</b></p></div>
  <div class="card">
    <p class="label">Your name</p>
    <input id="nm" class="field" maxlength="16" placeholder="Your name" value="${esc(ME.name)}" autocomplete="off" enterkeyhint="go">
    <div class="gap"></div>
    <button class="btn green" data-act="join">Join the game</button>
  </div>
  <div class="center"><button class="link" data-act="home">No thanks, take me to the start</button></div>`;
  const nm = $("#nm"); if (nm && !ME.name) setTimeout(() => nm.focus(), 50);
}

function renderFinding() {
  const slow = Date.now() - joinedAt > 10000;
  app.innerHTML = `
  <div class="top"><span class="t">Game ${esc(joinCode)}</span>${soundBtn()}</div>
  <div class="card center" style="padding:30px 16px">
    <div style="font-size:46px" class="wait">📡</div>
    <h2 style="margin:10px 0 6px">${conn === "lost" ? "Reconnecting…" : "Finding the game…"}</h2>
    <p class="mut">${slow ? `Can't find game <b>${esc(joinCode)}</b> yet. Check the code, and that the other phone has the game open with its screen on.` : "Hang on a second."}</p>
  </div>
  <div class="center"><button class="link" data-act="leave">Cancel</button></div>`;
}

function renderEnded() {
  app.innerHTML = `
  <div class="card center" style="padding:30px 16px;margin-top:40px">
    <div style="font-size:46px">👋</div>
    <h2 style="margin:10px 0 6px">Game over</h2>
    <p class="mut">${esc(endedMsg)}</p>
    <div class="gap"></div>
    <button class="btn" data-act="home">Back to the start</button>
  </div>`;
}

function playerList(editable) {
  return `<ul class="plist">${S.players.map((p, i) => {
    const seat = S.seats.indexOf(p.id), qpos = S.queue.indexOf(p.id);
    const tag = p.id === S.host ? "Host" : "";
    const status = S.phase === "lobby" ? (i < 2 ? "Playing" : "Waiting") : seat >= 0 ? "Playing" : qpos >= 0 ? (qpos === 0 ? "Next up" : `In line #${qpos + 1}`) : "";
    const col = i % 2 ? "var(--p1)" : "var(--p0)";
    return `<li><span class="dot" style="background:${col}">${esc((p.name || "?")[0].toUpperCase())}</span><span class="nm">${esc(p.name)}${p.id === ME.id ? ` <span class="mut small">(you)</span>` : ""}${p.wins ? ` <span class="mut small">· ${p.wins} win${p.wins > 1 ? "s" : ""}</span>` : ""}</span>${tag ? `<span class="tag">${tag}</span>` : ""}${status ? `<span class="tag">${status}</span>` : ""}${editable && p.id !== ME.id ? `<button class="x" data-kick="${esc(p.id)}" aria-label="Remove">×</button>` : ""}</li>`;
  }).join("")}</ul>`;
}
function connBanner() {
  if (MODE === "cpu" || conn === "ok") return "";
  if (MODE === "guest" && S && Date.now() - lastSeen > 9000) return `<div class="conn">Waiting for ${esc(nameOf(S.host))}'s phone… ask them to keep the game open.</div>`;
  return `<div class="conn">${conn === "connecting" ? "Connecting…" : "Connection lost. Reconnecting…"}</div>`;
}
function inviteBlock() {
  return `<div class="card center">
    <p class="label">Scan to join</p>
    <div class="qrwrap">${qrImg(joinURL(S.room))}</div>
    <div class="small mut">or enter code</div>
    <div class="roomcode">${esc(S.room)}</div>
    <div class="gap"></div>
    <button class="btn alt" data-act="share">📤 Send the invite link</button>
  </div>`;
}

function renderLobby() {
  const host = MODE === "host", n = S.players.length;
  app.innerHTML = `
  <div class="top"><span class="t">${esc(G().name)}</span>${soundBtn()}</div>
  ${connBanner()}
  ${host ? inviteBlock() : `<div class="card center" style="padding:24px 16px"><div style="font-size:42px" class="wait">✅</div><h2 style="margin:8px 0 4px">You're in!</h2><p class="mut">Waiting for ${esc(nameOf(S.host))} to start the game.</p></div>`}
  <div class="card">
    <p class="label">Players (${n})</p>
    ${playerList(host)}
    ${n > 2 ? `<p class="small mut" style="margin:10px 0 0">Winner stays on. Everyone else waits their turn.</p>` : ""}
  </div>
  ${host ? `
    <div class="card"><p class="label">Game</p>${gamePicker(S.game, "data-setgame")}${S.game === "tt" ? `<div class="gap"></div><p class="label">Theme</p>${deckPicker(S.opts && S.opts.deck, "data-setdeck")}` : ""}</div>
    <button class="btn green" data-act="start" ${n < 2 ? "disabled" : ""}>${n < 2 ? `<span class="wait">⏳</span> Waiting for someone to join` : "▶ Start the game"}</button>` : ""}
  <div class="foot"><button class="iconbtn" data-act="leave">Leave</button></div>`;
}

// ----- boards -----
function boardTTT(c) {
  return `<div class="ttt">${S.board.map((v, i) => {
    const can = c.myTurn && v == null;
    const inner = v == null ? "" : (v === 0 ? svgX(c.animate && i === S.last ? "draw" : "") : svgO(c.animate && i === S.last ? "draw" : ""));
    return `<button class="${v != null ? "p" + v : ""} ${can ? "can" : ""} ${c.winLine.includes(i) ? "win" : ""}" ${can ? `data-mv="${i}"` : ""} aria-label="Square ${i + 1}">${inner}</button>`;
  }).join("")}</div>`;
}
function boardC4(c) {
  const g = GAMES.c4, W = g.cols, H = g.rows; let cells = "";
  for (let r = 0; r < H; r++) for (let col = 0; col < W; col++) {
    const i = r * W + col, v = S.board[i], can = c.myTurn && S.board[col] == null;
    cells += `<button ${can ? `data-mv="${col}"` : ""} aria-label="Column ${col + 1}">${v != null ? `<i class="pc p${v} ${c.animate && i === S.last ? "drop" : ""} ${c.winLine.includes(i) ? "win" : ""}" style="--f:${r + 1}"></i>` : ""}</button>`;
  }
  const arrows = c.myTurn ? Array.from({ length: W }, (_, col) => `<i>${S.board[col] == null ? "▼" : ""}</i>`).join("") : "";
  return `<div class="c4wrap"><div class="c4arrows p${S.turn}">${arrows}</div><div class="c4 ${c.myTurn ? "can" : ""}">${cells}</div></div>`;
}
function boardDots(c) {
  const g = GAMES.dots, b = S.board, R = g.R, C = g.C, sp = 80, m = 22, Wd = C * sp + 2 * m, Ht = R * sp + 2 * m;
  let boxes = "", lines = "", hits = "", dots = "";
  b.box.forEach((v, bi) => {
    if (v == null) return;
    const r = Math.floor(bi / C), col = bi % C, x = m + col * sp, y = m + r * sp;
    const who = nameOf(S.seats[v]);
    boxes += `<g class="p${v}"><rect x="${x + 5}" y="${y + 5}" width="${sp - 10}" height="${sp - 10}" rx="8" style="fill:var(--c)" opacity=".3"/><text x="${x + sp / 2}" y="${y + sp / 2 + 11}" text-anchor="middle" class="bxl" style="fill:var(--c)">${esc((who || "?")[0].toUpperCase())}</text></g>`;
  });
  for (let e = 0; e < g.E; e++) {
    let x1, y1, x2, y2;
    if (e < g.H) { const r = Math.floor(e / C), col = e % C; x1 = m + col * sp; y1 = m + r * sp; x2 = x1 + sp; y2 = y1; }
    else { const k = e - g.H, r = Math.floor(k / (C + 1)), col = k % (C + 1); x1 = m + col * sp; y1 = m + r * sp; x2 = x1; y2 = y1 + sp; }
    const v = b.e[e];
    if (v != null) lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ed p${v} ${c.animate && e === S.last ? "ednew" : ""}" style="stroke:var(--c)"/>`;
    else {
      lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edfree ${c.myTurn ? "on" : ""}"/>`;
      if (c.myTurn) { const v = x1 === x2, s = 14, t = 19; hits += v ? `<rect data-mv="${e}" class="edhit" x="${x1 - t}" y="${y1 + s}" width="${2 * t}" height="${sp - 2 * s}" rx="10"/>` : `<rect data-mv="${e}" class="edhit" x="${x1 + s}" y="${y1 - t}" width="${sp - 2 * s}" height="${2 * t}" rx="10"/>`; }
    }
  }
  for (let r = 0; r <= R; r++) for (let col = 0; col <= C; col++) dots += `<circle cx="${m + col * sp}" cy="${m + r * sp}" r="7.5" class="dt"/>`;
  return `<div class="dotswrap"><svg class="dots" viewBox="0 0 ${Wd} ${Ht}">${boxes}${lines}${dots}${hits}</svg></div>`;
}
function bsGrid(cellFn, cls = "") {
  const N = GAMES.bs.N; let h = "";
  for (let i = 0; i < N * N; i++) { const x = cellFn(i); h += `<button class="${x.c || ""}" ${x.mv != null ? `data-fire="${x.mv}"` : ""}>${x.t || ""}</button>`; }
  return `<div class="bsg ${cls}">${h}</div>`;
}
function fleetLine(seat) { // ships left for a seat
  const sunk = S.board.sunk[seat].map(s => s.length), left = sunk.slice();
  return `<span class="fleet">${GAMES.bs.FLEET.map(L => { const k = left.indexOf(L); const dead = k >= 0; if (dead) left.splice(k, 1); return `<i class="${dead ? "dead" : ""}">${"▮".repeat(L)}</i>`; }).join("")}</span>`;
}
function boardBS(c) {
  const b = S.board, me = c.me, opp = 1 - me;
  const newCell = (seat, i) => c.animate && S.last && S.last.seat === seat && S.last.cell === i;
  const targetGrid = (shooter, clickable) => {
    const shots = b.shots[shooter], sunk = new Set(b.sunk[1 - shooter].flat());
    const shown = b.reveal ? new Set((b.reveal[1 - shooter] || []).flat()) : new Set();
    const aim = pending && pending.mv && pending.mv.fire;
    return bsGrid(i => {
      const v = shots[i], nw = newCell(shooter, i) ? " new" : "";
      if (v === "h") return { c: "hit" + (sunk.has(i) ? " sunk" : "") + nw, t: sunk.has(i) ? "✖" : "💥" };
      if (v === "m") return { c: "miss" + nw, t: "•" };
      return { c: "sea" + (shown.has(i) ? " ship ghost" : "") + (aim === i ? " aim" : "") + (clickable ? " can" : ""), mv: clickable ? i : null };
    });
  };
  const ownGrid = (seat, ships, mini, draft) => {
    const own = new Set((ships || []).flat()), shots = b.shots[1 - seat], sunk = new Set(b.sunk[seat].flat());
    return bsGrid(i => {
      const v = shots[i], nw = newCell(1 - seat, i) ? " new" : "";
      if (v === "h") return { c: "hit" + (sunk.has(i) ? " sunk" : "") + nw, t: sunk.has(i) ? "✖" : "💥" };
      if (v === "m") return { c: "miss" + nw, t: "•" };
      return { c: own.has(i) ? "ship" + (draft ? " draft" : "") : "sea" };
    }, mini ? "mini" : "");
  };
  if (me < 0) { // watching: both sides, no secrets
    const a = S.seats[0], z = S.seats[1];
    return `<div class="bslab">${esc(nameOf(a))} firing at ${esc(nameOf(z))} ${fleetLine(1)}</div>${targetGrid(0, false)}
      <div class="bslab" style="margin-top:14px">${esc(nameOf(z))} firing at ${esc(nameOf(a))} ${fleetLine(0)}</div>${targetGrid(1, false)}`;
  }
  if (b.stage === "place") {
    if (!b.ready[me] && !(pending && pending.mv && pending.mv.ships)) {
      return `${ownGrid(me, draftFleet(), false, true)}
        <p class="center small mut" style="margin:10px 0">Ships: ${GAMES.bs.FLEET.join(", ")} squares long. Shuffle until you're happy.</p>
        <div class="row"><button class="btn alt" data-act="shuffle">🔀 Shuffle</button><button class="btn green" data-act="ready">✅ Ready</button></div>`;
    }
    return `${ownGrid(me, myFleet() || (pending && pending.mv.ships), false)}<p class="center mut" style="margin-top:12px">Your fleet is ready.</p>`;
  }
  return `<div class="bslab">${S.phase === "over" ? "Their waters" : c.myTurn ? "Tap to fire 🎯" : "Their waters"} ${fleetLine(opp)}</div>
    ${targetGrid(me, c.myTurn && !pending)}
    <div class="bslab" style="margin-top:14px">Your fleet ${fleetLine(me)}</div>
    ${ownGrid(me, myFleet(), true)}`;
}
function revealing() { return S.game === "rps" && REVEAL.k === S.sid + ":" + S.round + ":" + S.board.hist.length && Date.now() < REVEAL.until; }
function boardRPS(c) {
  const b = S.board, me = c.me, left = me < 0 ? 0 : me, right = 1 - left, last = b.hist[b.hist.length - 1];
  const shaking = revealing();
  let arena = "";
  if (last || shaking) {
    const lh = shaking ? "✊" : HAND[left === 0 ? last.a : last.b], rh = shaking ? "✊" : HAND[left === 0 ? last.b : last.a];
    let line = "";
    if (!shaking && last) {
      const lm = left === 0 ? last.a : last.b, rm = left === 0 ? last.b : last.a;
      if (last.w === "draw") line = `Both ${HAND_NAME[lm]}. Again!`;
      else {
        const wm = last.w === 0 ? last.a : last.b, lsm = last.w === 0 ? last.b : last.a;
        const who = S.seats[last.w] === ME.id ? "you win the round!" : `${esc(nameOf(S.seats[last.w]))} wins the round`;
        line = `${BEAT_TEXT[wm + lsm]}, ${who}`;
      }
    }
    arena = `<div class="arena ${shaking ? "shaking" : "shown"}"><div class="hand l p${left}">${lh}</div><div class="hand r p${right}">${rh}</div></div>
      <p class="center rline">${shaking ? "Rock… paper… scissors…" : line}</p>`;
  } else arena = `<div class="arena idle"><div class="hand l">✊</div><div class="hand r">✋</div></div><p class="center rline mut">Pick at the same time. First to 3 wins</p>`;
  let picker = "";
  if (S.phase === "play" && me >= 0) {
    if (waiting(me) && !pending) picker = `<div class="rps">${["r", "p", "s"].map(k => `<button data-rps="${k}"><span>${HAND[k]}</span><b>${HAND_NAME[k]}</b></button>`).join("")}</div>`;
    else { const mp = myPick() || (pending && pending.mv); picker = `<p class="center mut" style="margin-top:14px">${mp && HAND[mp] ? `You picked ${HAND[mp]} ` : ""}Waiting for ${esc(nameOf(S.seats[1 - me]))}…</p>`; }
  }
  const strip = b.hist.length ? `<div class="hist">${b.hist.map(h => `<span class="${h.w === "draw" ? "" : "p" + h.w}">${HAND[h.a]}${HAND[h.b]}</span>`).join("")}</div>` : "";
  const sc = `<div class="rscore"><b class="p${left}">${b.score[left]}</b><span>first to 3</span><b class="p${right}">${b.score[right]}</b></div>`;
  return arena + sc + picker + strip;
}

function fmtStat(v, u) {
  if (u === "kg") return v < 1 ? Math.round(v * 1000) + " g" : v.toLocaleString("en-GB") + " kg";
  if (u === "/10") return v + "/10";
  return v.toLocaleString("en-GB") + " " + u;
}
function ttCard(d, id, o = {}) {
  const c = d.cards[id], tag = o.pick ? "button" : "div";
  return `<div class="ttcard p${o.seat} ${o.mini ? "mini" : ""} ${o.win ? "won" : ""} ${o.lost ? "lost" : ""} ${o.flip ? "flip" : ""}">
    <div class="ttpic">${c[1]}</div><div class="ttname">${esc(c[0])}</div>
    <div class="ttstats">${d.stats.map((st, i) => `<${tag} class="ttrow ${o.hl === i ? "hl" : ""}" ${o.pick ? `data-tt="${i}"` : ""}><span>${st.l}</span><b>${fmtStat(c[2 + i], st.u)}</b></${tag}>`).join("")}</div>
  </div>`;
}
const ttBack = (seat, label) => `<div class="ttcard back p${seat}"><div class="ttbackin"><span>?</span></div><div class="ttname">${label}</div></div>`;
function boardTT(c) {
  const b = S.board, me = c.me, d = GAMES.tt.DECKS[b.deck], left = me < 0 ? 0 : me, right = 1 - left;
  const nm = seat => S.seats[seat] === ME.id ? "Your" : esc(nameOf(S.seats[seat])) + "'s";
  let h = "";
  if (b.last && (ttRevealPending() || S.phase === "over")) {
    const L = b.last, st = d.stats[L.stat];
    h = `<div class="ttpair">${ttCard(d, L.cards[left], { seat: left, hl: L.stat, mini: true, win: L.w === left, lost: L.w === right })}${ttCard(d, L.cards[right], { seat: right, hl: L.stat, mini: true, win: L.w === right, lost: L.w === left, flip: c.animate })}</div>
      <p class="center rline">${st.l}: ${fmtStat(d.cards[L.cards[left]][2 + L.stat], st.u)} vs ${fmtStat(d.cards[L.cards[right]][2 + L.stat], st.u)}</p>
      ${S.phase === "play" ? `<button class="btn" data-act="ttnext">Next card ▶</button>` : ""}`;
  } else if (me >= 0 && S.turn === me) {
    h = `${ttCard(d, b.top, { seat: me, pick: !pending })}<p class="center small mut" style="margin:10px 0 0">Tap the stat you think beats their card</p>`;
  } else if (me >= 0) {
    h = `<div class="ttpair">${ttBack(me, "Your card")}${ttBack(1 - me, nm(1 - me) + " card")}</div><p class="center mut" style="margin-top:12px">Both cards stay face down until they pick.</p>`;
  } else {
    h = `<div class="ttpair">${ttCard(d, b.top, { seat: S.turn, mini: true })}${ttBack(1 - S.turn, nm(1 - S.turn) + " card")}</div>`;
  }
  const info = [b.pot ? `${b.pot} card${b.pot > 1 ? "s" : ""} in the middle` : "", S.phase === "play" ? `Round ${b.rounds + (ttRevealPending() ? 0 : 1)} of ${GAMES.tt.MAX_ROUNDS}` : ""].filter(Boolean).join(" · ");
  return h + `<div class="ttinfo">${info}</div><p class="center small mut" style="margin-top:6px">${d.icon} ${esc(d.name)}: ${esc(d.note)}</p>`;
}
function deckPicker(sel, attr) {
  return `<div class="seg decks">${Object.values(GAMES.tt.DECKS).map(d => `<button class="${sel === d.id ? "on" : ""}" ${attr}="${d.id}">${d.icon} ${esc(d.name)}</button>`).join("")}<button disabled>More themes soon</button></div>`;
}

function renderGame() {
  const g = G(), me = mySeat(), shaking = revealing(), over = S.phase === "over" && !shaking;
  const myTurn = S.phase === "play" && waiting(me);
  const key = S.sid + ":" + S.round + ":" + S.moves;
  const animate = key !== animKey && S.moves > 0; animKey = key;
  const winLine = over && S.result.w !== "draw" ? (S.result.line || []) : [];
  const c = { me, myTurn, animate, winLine };

  const chip = (seat, side) => {
    const id = S.seats[seat], p = pl(id) || { name: "?" };
    const w = S.phase === "play" && g.waiting(S, seat), simul = S.turn < 0;
    const label = id === ME.id ? "You" : esc(p.name);
    let sub = "";
    if (S.phase === "play") sub = w ? (simul ? "choosing…" : id === "cpu" ? "thinking…" : "to play") : simul ? "ready ✓" : "";
    else if (over && S.result.w === seat) sub = "wins!";
    if (S.game === "dots" && !(over && S.result.w === seat)) sub = `${S.board.score[seat]} box${S.board.score[seat] === 1 ? "" : "es"}`;
    if (S.game === "tt" && !(over && S.result.w === seat)) sub = `${S.board.count[seat]} card${S.board.count[seat] === 1 ? "" : "s"}`;
    return `<div class="chip p${seat} ${side} ${w && !simul ? "turn" : ""}"><span class="mk">${markFor(S.game, seat)}</span><span class="nm"><b>${label}</b><span>${sub}&nbsp;</span></span></div>`;
  };
  const w0 = (pl(S.seats[0]) || {}).wins || 0, w1 = (pl(S.seats[1]) || {}).wins || 0;

  let status = "", cls = "", sub = "";
  if (S.phase === "play" || shaking) {
    const bsPlace = S.game === "bs" && S.board.stage === "place";
    if (shaking) status = "3… 2… 1…";
    else if (S.game === "tt" && ttRevealPending()) {
      const L = S.board.last;
      if (L.w === "draw") status = "Draw! Both cards go in the middle";
      else if (S.seats[L.w] === ME.id) { status = "You win the round!"; cls = "me"; }
      else status = `${esc(nameOf(S.seats[L.w]))} wins the round`;
      if (L.w === "draw") sub = "Whoever wins the next round takes them all";
    }
    else if (myTurn) {
      cls = "me";
      status = bsPlace ? "Place your fleet" : S.game === "rps" ? "Pick your move" : S.game === "tt" ? "Pick a stat" : "Your turn";
      if (S.game === "dots" && S.lastBy === me && S.fx === "box") sub = "Box! Go again";
      if (S.game === "bs" && S.last && S.last.seat !== me) sub = S.last.sunk ? "They sank your ship!" : S.last.hit ? "They hit you!" : "They missed";
    } else if (S.turn < 0) {
      const wait = [0, 1].filter(s => g.waiting(S, s) && s !== me).map(s => S.seats[s] === "cpu" ? "the computer" : esc(nameOf(S.seats[s])));
      status = wait.length ? `Waiting for ${wait.join(" and ")}…` : "…";
      if (bsPlace && me >= 0) sub = "They're placing their ships";
    } else if (S.seats[S.turn] === "cpu") status = "Computer is thinking…";
    else status = S.game === "tt" ? `${esc(nameOf(S.seats[S.turn]))} is choosing…` : `${esc(nameOf(S.seats[S.turn]))}'s turn`;
    if (!myTurn && S.game === "bs" && S.last && S.last.seat === me) sub = S.last.sunk ? "You sank a ship! 🚢" : S.last.hit ? "Hit! 💥" : "Miss";
    if (S.game === "dots" && !myTurn && S.lastBy >= 0 && S.lastBy !== me && S.fx === "box" && me >= 0) sub = "They got a box and go again";
    if (pending && MODE === "guest" && !g.local) sub = "Sending…";
    if (me < 0) sub = `You're watching${S.queue.indexOf(ME.id) === 0 ? ". You're next up!" : ""}`;
  } else if (over) {
    if (S.result.w === "draw") status = "It's a draw! 🤝";
    else if (S.seats[S.result.w] === ME.id) { status = "You win! 🎉"; cls = "me"; }
    else status = `${esc(nameOf(S.seats[S.result.w]))} wins!`;
    if (S.game === "dots") sub = `Boxes ${S.board.score[0]} – ${S.board.score[1]}`;
    if (S.game === "rps") sub = `${S.board.score[0]} – ${S.board.score[1]}`;
    if (S.game === "bs") sub = "Every ship sunk";
    if (S.game === "tt") sub = S.board.count[0] && S.board.count[1] ? `Most cards after ${GAMES.tt.MAX_ROUNDS} rounds: ${S.board.count[0]} – ${S.board.count[1]}` : "Won every card";
  }

  const board = { ttt: boardTTT, c4: boardC4, dots: boardDots, bs: boardBS, rps: boardRPS, tt: boardTT }[S.game](c);

  let after = "";
  if (over) {
    const host = MODE === "host" || MODE === "cpu";
    let nextNote = "";
    if (S.queue.length) {
      const off = S.result.w === "draw" ? S.starter : 1 - S.result.w;
      nextNote = `<p class="center small mut" style="margin:0 0 12px">Next: ${esc(nameOf(S.seats[1 - off]))} vs ${esc(nameOf(S.queue[0]))}</p>`;
    }
    after = `<div class="after">${nextNote}
      ${me >= 0 || host ? `<button class="btn green" data-act="again">🔁 Play again</button>` : `<p class="center mut">Waiting for the next game…</p>`}
      ${host ? `<div class="card"><p class="label">Switch game</p>${gamePicker(S.game, "data-setgame")}${S.game === "tt" ? `<div class="gap"></div><p class="label">Card Clash theme</p>${deckPicker(S.opts && S.opts.deck, "data-setdeck")}` : ""}${MODE === "cpu" ? `<div class="gap"></div><p class="label">Computer level</p>${levelSeg(S.level, "data-setlevel")}` : ""}</div>` : ""}
    </div>`;
  }

  const queue = S.queue.length && !over ? `<div class="queue">Waiting to play: ${S.queue.map(id => esc(nameOf(id))).join(", ")}</div>` : "";
  const draws = S.draws ? `<div class="center small mut" style="margin-top:-4px;margin-bottom:8px">${S.draws} draw${S.draws > 1 ? "s" : ""}</div>` : "";

  app.innerHTML = `
  <div class="top"><span class="t">${esc(g.name)}${MODE === "cpu" ? ` <span class="small mut">· ${LEVELS[S.level]}</span>` : ""}</span><span class="row" style="flex:none;gap:6px">${MODE === "host" ? `<button class="iconbtn" data-act="qr">${showQR ? "Hide QR" : "➕ Invite"}</button>` : ""}${soundBtn()}</span></div>
  ${connBanner()}
  ${MODE === "host" && showQR ? inviteBlock() : ""}
  <div class="bar">${chip(0, "")}<div class="score"><span><b>${w0}</b> – <b>${w1}</b></span></div>${chip(1, "r")}</div>
  ${draws}
  <div class="status ${cls}">${status}${sub ? `<span class="sub">${sub}</span>` : ""}</div>
  ${board}
  ${after}
  ${queue}
  <div class="foot">${MODE === "guest" ? `<span class="small mut" style="align-self:center">Game ${esc(S.room)}</span>` : ""}<button class="iconbtn" data-act="leave">Leave</button></div>`;
}

// ===== TAPS =====
app.addEventListener("click", e => {
  const el = e.target.closest("[data-act],[data-mv],[data-fire],[data-rps],[data-tt],[data-deck],[data-setdeck],[data-pickgame],[data-setgame],[data-level],[data-setlevel],[data-kick]");
  if (!el) return;
  const d = el.dataset;
  if (d.mv != null) return myMove(Number(d.mv));
  if (d.fire != null) return myMove({ fire: Number(d.fire) });
  if (d.rps) return myMove(d.rps);
  if (d.tt != null) return myMove(Number(d.tt));
  if (d.deck) { PREF.deck = d.deck; savePref(); return renderHome(); }
  if (d.setdeck) { if (MODE === "host" || MODE === "cpu") { PREF.deck = d.setdeck; savePref(); S.opts = Object.assign({}, S.opts, { deck: d.setdeck }); commit(); } return; }
  if (d.pickgame) { PREF.game = d.pickgame; savePref(); return renderHome(); }
  if (d.level) { PREF.level = d.level; savePref(); return renderHome(); }
  if (d.setgame) {
    if (MODE === "host" || MODE === "cpu") {
      PREF.game = d.setgame; savePref();
      if (S.game !== d.setgame) { S.game = d.setgame; if (S.phase === "over") nextRound(); commit(); }
    }
    return;
  }
  if (d.setlevel) { PREF.level = d.setlevel; savePref(); S.level = d.setlevel; return commit(); }
  if (d.kick) { if (MODE === "host") { removePlayer(d.kick); commit(); } return; }
  const nameField = $("#nm");
  if (nameField) { ME.name = cleanName(nameField.value); ls.set("h2h_name", ME.name); }
  switch (d.act) {
    case "host": return startHosting();
    case "cpu": return startCPU();
    case "resume": { const s = ls.get("h2h_host", null); if (s && s.S && GAMES[s.S.game]) startHosting(s.S); return; }
    case "joincode": {
      const c = ($("#jc").value || "").toUpperCase().replace(/[^A-Z]/g, "");
      if (c.length !== 4) { toast("Codes are 4 letters"); return; }
      return startJoining(c);
    }
    case "join": return startJoining(joinCode);
    case "home": MODE = "home"; if (location.search) history.replaceState(null, "", location.pathname + (LOCAL ? "?local" : "")); return render();
    case "start": if (MODE === "host" && S.players.length >= 2) { startFromLobby(); commit(); } return;
    case "again": return playAgain();
    case "leave": return leave();
    case "share": return shareInvite();
    case "qr": showQR = !showQR; return render();
    case "sound": PREF.sound = !PREF.sound; savePref(); Snd.init(); return render();
    case "shuffle": DRAFT = { k: secKey(), ships: GAMES.bs.randomFleet() }; Snd.pick(); return render();
    case "ready": return myMove({ ships: draftFleet() });
    case "ttnext": TTSEEN = ttKey(); render(); return maybeCPU();
  }
});
app.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.id === "jc") { e.target.blur(); app.querySelector('[data-act="joincode"]').click(); }
  else if (e.target.id === "nm") { e.target.blur(); if (MODE === "join") app.querySelector('[data-act="join"]').click(); }
});
app.addEventListener("input", e => {
  if (e.target.id === "nm") { ME.name = cleanName(e.target.value); ls.set("h2h_name", ME.name); }
  if (e.target.id === "jc") e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
});

// ===== START =====
(function boot() {
  const j = (P.get("join") || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (j.length === 4) {
    joinCode = j;
    const saved = ls.get("h2h_host", null);
    if (saved && saved.S && saved.S.room === j && GAMES[saved.S.game] && Date.now() - saved.t < 3 * 3600e3) { startHosting(saved.S); return; } // the host scanned their own code
    MODE = ME.name ? "guest" : "join";
    if (MODE === "guest") return startJoining(j);
  }
  render();
})();
