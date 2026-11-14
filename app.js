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
const PREF = Object.assign({ game: "ttt", level: "medium", sound: true }, ls.get("h2h_pref", {}));
const savePref = () => ls.set("h2h_pref", PREF);

// ===== APP STATE =====
let MODE = "home";          // home | join | host | guest | cpu | ended
let S = null;               // the game (host & cpu: the real one; guest: copy from the host)
let T = null;               // live connection
let conn = "off";           // off | connecting | ok | lost
let lastSeen = 0, joinedAt = 0, pending = null, cpuTimer = null, animKey = "", showQR = false, leaveArm = 0, endedMsg = "";
let qrCache = { url: null, img: null };

// ===== SOUND & BUZZ =====
const Snd = {
  ctx: null,
  init() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  tone(f, d = .12, type = "sine", v = .14, when = 0) {
    const c = this.ctx; if (!c || !PREF.sound) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0008, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + .03);
  },
  place(seat) { this.tone(seat ? 620 : 420, .09, "triangle", .16); this.tone(seat ? 930 : 630, .06, "sine", .06, .02); },
  drop(rows) { const d = .18 + rows * .055; this.tone(220, .08, "triangle", .18, d); this.tone(160, .1, "sine", .12, d + .01); },
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
    if (MODE === "host" && S) T.send({ t: "state", s: S });
  }
  if (was !== s) render();
}
function sendHello() { if (T) T.send({ t: "hello", pid: ME.id, name: ME.name || "Player" }); }

// ===== GAME ENGINE (host and computer games) =====
function newState(game, room) {
  return { sid: uid(), v: 0, room, game, host: ME.id, players: [], seats: [null, null], queue: [], phase: "lobby",
    board: null, turn: 0, starter: 0, result: null, last: -1, moves: 0, round: 0, draws: 0, level: PREF.level };
}
const pl = id => S && S.players.find(p => p.id === id);
const nameOf = id => (pl(id) || {}).name || "Player";
const mySeat = () => S ? S.seats.indexOf(ME.id) : -1;

function startRound() {
  const g = GAMES[S.game];
  S.board = g.blank(); S.turn = S.starter; S.result = null; S.last = -1; S.moves = 0; S.round++; S.phase = "play";
}
function startFromLobby() {
  const ids = S.players.map(p => p.id);
  S.seats = [ids[0], ids[1]]; S.queue = ids.slice(2); S.starter = 0; startRound();
}
function applyMove(pid, mv, n) {
  if (!S || S.phase !== "play" || S.seats[S.turn] !== pid) return false;
  if (n != null && n !== S.moves) return false;
  const g = GAMES[S.game], i = g.place(S.board, mv);
  if (i < 0) return false;
  S.board[i] = S.turn; S.last = i; S.moves++;
  const r = g.result(S.board, i);
  if (r) {
    S.result = r; S.phase = "over";
    if (r.w === "draw") S.draws++; else { const p = pl(S.seats[r.w]); if (p) p.wins++; }
  } else S.turn = 1 - S.turn;
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
  if (MODE === "host") { ls.set("h2h_host", { S, t: Date.now() }); if (T) T.send({ t: "state", s: S }); }
  if (MODE === "cpu") ls.set("h2h_cpu", { S, t: Date.now() });
  render();
  maybeCPU();
}
function maybeCPU() {
  if (MODE !== "cpu" || !S || S.phase !== "play" || S.seats[S.turn] !== "cpu" || cpuTimer) return;
  cpuTimer = setTimeout(() => {
    cpuTimer = null;
    if (MODE !== "cpu" || S.phase !== "play" || S.seats[S.turn] !== "cpu") return;
    const mv = GAMES[S.game].ai(S.board.slice(), S.turn, S.level);
    const before = S.phase;
    if (applyMove("cpu", mv, S.moves)) { moveSound(); if (S.phase === "over" && before !== "over") resultFx(); commit(); }
  }, 520 + Math.random() * 380);
}

// ===== FEEDBACK =====
function moveSound() {
  if (!S || S.last < 0) return;
  if (S.game === "c4") Snd.drop(Math.floor(S.last / 7) + 1); else Snd.place(S.board[S.last]);
}
function resultFx() {
  const r = S.result; if (!r) return;
  if (r.w === "draw") { Snd.draw(); return; }
  const me = mySeat();
  if (me < 0 || r.w === me) { Snd.win(); confetti(); buzz([60, 40, 60]); } else { Snd.lose(); buzz(200); }
}

// ===== HOST =====
function startHosting(existing) {
  MODE = "host"; showQR = false;
  if (existing) S = existing;
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
    const before = S.phase;
    if (applyMove(m.pid, m.mv, m.n)) {
      moveSound(); if (S.phase === "over" && before !== "over") resultFx(); else if (S.seats[S.turn] === ME.id) buzz(35);
      commit();
    } else T.send({ t: "state", s: S });
    return;
  }
  if (m.t === "again") { if (S.phase === "over" && S.seats.includes(m.pid)) { nextRound(); commit(); } return; }
  if (m.t === "bye") { const p = pl(m.pid); if (p) { toast(p.name + " left"); removePlayer(m.pid); commit(); } }
}

// ===== GUEST =====
function startJoining(code) {
  MODE = "guest"; S = null; lastSeen = 0; joinedAt = Date.now(); pending = null;
  ME.name = cleanName(ME.name) || "Player"; ls.set("h2h_name", ME.name);
  joinCode = code;
  conn = "connecting"; T = connect(code, guestMsg, setConn);
  keepAwake(); render();
}
let joinCode = "";
function guestMsg(m) {
  if (!m) return;
  if (m.t === "state") {
    const s = m.s, prev = S;
    lastSeen = Date.now();
    if (prev && s.sid === prev.sid && s.v < prev.v) return;
    if (pending) {
      if (s.moves !== pending.n || s.round !== pending.round || s.phase !== "play") pending = null;
      else if (Date.now() - pending.first < 6000) return; // host hasn't got my move yet; keep showing it
      else pending = null;
    }
    S = s;
    if (!prev || prev.sid !== s.sid) { render(); return; }
    const newMove = s.round === prev.round ? s.moves > prev.moves : s.moves > 0;
    if (newMove && s.last >= 0) { moveSound(); if (s.phase === "play" && s.seats[s.turn] === ME.id) buzz(35); }
    if (s.phase === "over" && (prev.phase !== "over" || prev.round !== s.round)) resultFx();
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

// ===== COMPUTER GAME =====
function startCPU() {
  MODE = "cpu";
  S = newState(PREF.game, "CPU");
  S.players = [{ id: ME.id, name: ME.name || "You", wins: 0 }, { id: "cpu", name: "Computer", wins: 0, cpu: true }];
  S.level = PREF.level; startFromLobby(); keepAwake(); commit();
}

// ===== MY ACTIONS =====
function myMove(mv) {
  if (!S || S.phase !== "play" || S.seats[S.turn] !== ME.id) return;
  const g = GAMES[S.game];
  if (g.place(S.board, mv) < 0) return;
  if (MODE === "guest") {
    if (pending) return;
    pending = { mv, n: S.moves, round: S.round, t: Date.now(), first: Date.now() };
    T.send({ t: "move", pid: ME.id, mv, n: S.moves });
    applyMove(ME.id, mv, S.moves); // show it straight away; the host's copy confirms it
    moveSound(); if (S.phase === "over") resultFx(); render();
    return;
  }
  const before = S.phase;
  if (applyMove(ME.id, mv, S.moves)) { moveSound(); if (S.phase === "over" && before !== "over") resultFx(); commit(); }
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
  if (MODE === "cpu") ls.del("h2h_cpu");
  clearTimeout(cpuTimer); cpuTimer = null;
  setTimeout(() => { if (T) T.close(); T = null; }, 300);
  S = null; MODE = "home"; conn = "off"; showQR = false;
  if (location.search) history.replaceState(null, "", location.pathname + (LOCAL ? "?local" : ""));
  render();
}

// ===== TIMERS =====
setInterval(() => {
  if (MODE === "host" && T && S) T.send({ t: "state", s: S });
}, 4000);
setInterval(() => {
  if (MODE === "guest" && T) {
    if (conn === "ok" && Date.now() - lastSeen > 6000) sendHello();
    if (pending && Date.now() - pending.t > 2500 && conn === "ok") { pending.t = Date.now(); T.send({ t: "move", pid: ME.id, mv: pending.mv, n: pending.n }); }
    if (!S || Date.now() - lastSeen > 9000) render();
  }
  if ((MODE === "host" || MODE === "guest") && T && conn === "lost") T.revive();
}, 1500);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  keepAwake();
  if ((MODE === "host" || MODE === "guest") && T) {
    if (conn !== "ok") T.revive();
    if (MODE === "guest") sendHello(); else if (S) T.send({ t: "state", s: S });
  }
});

// ===== DRAWING =====
const svgX = (cls = "") => `<svg class="mark ${cls}" viewBox="0 0 100 100"><line x1="18" y1="18" x2="82" y2="82" stroke="var(--c)"/><line x1="82" y1="18" x2="18" y2="82" stroke="var(--c)"/></svg>`;
const svgO = (cls = "") => `<svg class="mark ${cls}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="33" stroke="var(--c)"/></svg>`;
const disc = () => `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="var(--c)"/><circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="6"/></svg>`;
function markFor(game, seat) { return game === "c4" ? disc() : seat === 0 ? svgX() : svgO(); }
const GAME_ICON = {
  ttt: `<svg viewBox="0 0 120 120"><g stroke="#3a4680" stroke-width="6" stroke-linecap="round"><line x1="43" y1="12" x2="43" y2="108"/><line x1="77" y1="12" x2="77" y2="108"/><line x1="12" y1="43" x2="108" y2="43"/><line x1="12" y1="77" x2="108" y2="77"/></g><g stroke="#ff5d73" stroke-width="8" stroke-linecap="round"><line x1="16" y1="16" x2="36" y2="36"/><line x1="36" y1="16" x2="16" y2="36"/><line x1="84" y1="84" x2="104" y2="104"/><line x1="104" y1="84" x2="84" y2="104"/></g><circle cx="60" cy="60" r="11" fill="none" stroke="#ffd23f" stroke-width="8"/><circle cx="94" cy="26" r="11" fill="none" stroke="#ffd23f" stroke-width="8"/></svg>`,
  c4: `<svg viewBox="0 0 120 104"><rect x="4" y="4" width="112" height="96" rx="14" fill="#2449d8"/>${[0, 1, 2, 3].map(r => [0, 1, 2, 3, 4].map(c => { const f = ({ "3,1": "#ff5d73", "3,2": "#ffd23f", "3,3": "#ff5d73", "2,2": "#ff5d73", "2,3": "#ffd23f", "1,3": "#ffd23f", "2,1": "#ffd23f" })[r + "," + c] || "#0b1230"; return `<circle cx="${20 + c * 20}" cy="${21 + r * 21}" r="8" fill="${f}"/>`; }).join("")).join("")}</svg>`,
};

function joinURL(room) {
  return location.origin + location.pathname + "?join=" + room + (LOCAL ? "&local" : "");
}
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
  const resume = saved && saved.S && Date.now() - saved.t < 3 * 3600e3 && saved.S.players.length > 1 ? saved : null;
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
  <div class="top"><span class="t">${esc(GAMES[S.game].name)}</span>${soundBtn()}</div>
  ${connBanner()}
  ${host ? inviteBlock() : `<div class="card center" style="padding:24px 16px"><div style="font-size:42px" class="wait">✅</div><h2 style="margin:8px 0 4px">You're in!</h2><p class="mut">Waiting for ${esc(nameOf(S.host))} to start the game.</p></div>`}
  <div class="card">
    <p class="label">Players (${n})</p>
    ${playerList(host)}
    ${n > 2 ? `<p class="small mut" style="margin:10px 0 0">Winner stays on. Everyone else waits their turn.</p>` : ""}
  </div>
  ${host ? `
    <div class="card"><p class="label">Game</p>${gamePicker(S.game, "data-setgame")}</div>
    <button class="btn green" data-act="start" ${n < 2 ? "disabled" : ""}>${n < 2 ? `<span class="wait">⏳</span> Waiting for someone to join` : "▶ Start the game"}</button>` : ""}
  <div class="foot"><button class="iconbtn" data-act="leave">Leave</button></div>`;
}

function renderGame() {
  const g = GAMES[S.game], me = mySeat(), over = S.phase === "over";
  const myTurn = S.phase === "play" && S.seats[S.turn] === ME.id;
  const key = S.sid + ":" + S.round + ":" + S.moves;
  const animate = key !== animKey && S.last >= 0; animKey = key;
  const winLine = over && S.result.w !== "draw" ? S.result.line : [];

  const chip = (seat, side) => {
    const id = S.seats[seat], p = pl(id) || { name: "?" };
    const isTurn = S.phase === "play" && S.turn === seat;
    const label = id === ME.id ? "You" : esc(p.name);
    const sub = S.phase === "play" ? (isTurn ? (id === "cpu" ? "thinking…" : "to play") : "") : over && S.result.w === seat ? "wins!" : "";
    return `<div class="chip p${seat} ${side} ${isTurn ? "turn" : ""}"><span class="mk">${markFor(S.game, seat)}</span><span class="nm"><b>${label}</b><span>${sub}&nbsp;</span></span></div>`;
  };
  const w0 = (pl(S.seats[0]) || {}).wins || 0, w1 = (pl(S.seats[1]) || {}).wins || 0;

  let status = "", cls = "";
  if (S.phase === "play") {
    if (myTurn) { status = "Your turn"; cls = "me"; }
    else if (S.seats[S.turn] === "cpu") status = "Computer is thinking…";
    else status = `${esc(nameOf(S.seats[S.turn]))}'s turn`;
    if (me < 0) status += `<span class="sub">You're watching${S.queue.indexOf(ME.id) === 0 ? ". You're next up!" : ""}</span>`;
  } else if (over) {
    if (S.result.w === "draw") status = "It's a draw! 🤝";
    else if (S.seats[S.result.w] === ME.id) { status = "You win! 🎉"; cls = "me"; }
    else status = `${esc(nameOf(S.seats[S.result.w]))} wins!`;
  }

  let board = "";
  if (S.game === "ttt") {
    board = `<div class="ttt">${S.board.map((v, i) => {
      const can = myTurn && v == null;
      const inner = v == null ? "" : (v === 0 ? svgX(animate && i === S.last ? "draw" : "") : svgO(animate && i === S.last ? "draw" : ""));
      return `<button class="${v != null ? "p" + v : ""} ${can ? "can" : ""} ${winLine.includes(i) ? "win" : ""}" ${can ? `data-mv="${i}"` : ""} aria-label="Square ${i + 1}">${inner}</button>`;
    }).join("")}</div>`;
  } else {
    const W = g.cols, H = g.rows; let cells = "";
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = r * W + c, v = S.board[i];
      const can = myTurn && S.board[c] == null;
      cells += `<button ${can ? `data-mv="${c}"` : ""} aria-label="Column ${c + 1}">${v != null ? `<i class="pc p${v} ${animate && i === S.last ? "drop" : ""} ${winLine.includes(i) ? "win" : ""}" style="--f:${r + 1}"></i>` : ""}</button>`;
    }
    const arrows = myTurn ? Array.from({ length: W }, (_, c) => `<i>${S.board[c] == null ? "▼" : ""}</i>`).join("") : "";
    board = `<div class="c4wrap"><div class="c4arrows p${S.turn}">${arrows}</div><div class="c4 ${myTurn ? "can" : ""}">${cells}</div></div>`;
  }

  let after = "";
  if (over) {
    const inGame = me >= 0, host = MODE === "host" || MODE === "cpu";
    let nextNote = "";
    if (S.queue.length) {
      const off = S.result.w === "draw" ? S.starter : 1 - S.result.w;
      nextNote = `<p class="center small mut" style="margin:0 0 12px">Next: ${esc(nameOf(S.seats[1 - off]))} vs ${esc(nameOf(S.queue[0]))}</p>`;
    }
    after = `<div class="after">${nextNote}
      ${inGame || host ? `<button class="btn green" data-act="again">🔁 Play again</button>` : `<p class="center mut">Waiting for the next game…</p>`}
      ${host ? `<div class="card"><p class="label">Switch game</p>${gamePicker(S.game, "data-setgame")}${MODE === "cpu" ? `<div class="gap"></div><p class="label">Computer level</p>${levelSeg(S.level, "data-setlevel")}` : ""}</div>` : ""}
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
  <div class="status ${cls}">${status}</div>
  ${board}
  ${after}
  ${queue}
  <div class="foot">${MODE === "guest" ? `<span class="small mut" style="align-self:center">Game ${esc(S.room)}</span>` : ""}<button class="iconbtn" data-act="leave">Leave</button></div>`;
}

// ===== TAPS =====
app.addEventListener("click", e => {
  const el = e.target.closest("[data-act],[data-mv],[data-pickgame],[data-setgame],[data-level],[data-setlevel],[data-kick]");
  if (!el) return;
  const d = el.dataset;
  if (d.mv != null) return myMove(Number(d.mv));
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
    case "resume": { const s = ls.get("h2h_host", null); if (s && s.S) startHosting(s.S); return; }
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
    if (saved && saved.S && saved.S.room === j && Date.now() - saved.t < 3 * 3600e3) { startHosting(saved.S); return; } // the host scanned their own code
    MODE = ME.name ? "guest" : "join";
    if (MODE === "guest") return startJoining(j);
  }
  render();
})();
