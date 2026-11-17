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
const PREF = Object.assign({ game: "ttt", level: "medium", sound: true, deck: "animals", kids: false, screens: "two", p2: "", pack: null, usePack: false }, ls.get("h2h_pref", {}));
// One screen: two people take turns on this phone or tablet. Only games with nothing to hide and one player at a time.
const ONE_SCREEN = ["ttt", "c4", "dots", "golf", "hm", "cw"];
const savePref = () => ls.set("h2h_pref", PREF);


// ===== APP STATE =====
let MODE = "home";          // home | join | host | guest | cpu | ended
let S = null;               // the game (host & cpu: the real one; guest: the host's copy, minus secrets)
let T = null;               // live connection
let conn = "off";           // off | connecting | ok | lost
let lastHeard = 0, lastRevive = 0; // host: when a guest last spoke; both: last forced reconnect
let lastSeen = 0, joinedAt = 0, pending = null, cpuTimer = null, animKey = "", showQR = false, leaveArm = 0, endedMsg = "";
let qrCache = { url: null, img: null };
let SUGGEST = false, gamesArm = 0;   // guest's "suggest a game" panel; host's tap-twice to leave a game
let DRAFT = { k: "", ships: null };   // Battleships: fleet being placed
let MYPICK = { k: "", v: null };      // Rock Paper Scissors: what a guest picked
let REVEAL = { k: "", until: 0 };     // Rock Paper Scissors: hands shaking
let TTSEEN = "";                      // Card Clash: last round result this phone has dismissed
let WI = { k: "", pick: null, guessing: false, qOpen: false }; // Who Is It?: my draft pick, guess mode
let GOLF = { anim: null, seen: "", aim: null, aimKey: "", drag: null, held: false, card: null, msg: null };   // Mini Golf: ball animation, my aim while dragging
let HKR = null;                                                  // Air Hockey: the live table on this phone
const FAST = { pcs: {}, dcs: {} };                               // direct phone-to-phone links (WebRTC)

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
  const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, { realtime: { params: { eventsPerSecond: 40 } } });
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
    // hard = also restart the socket: after a phone sleeps the old one can look alive but be dead
    revive(hard) { if (closed) return; const old = ch; ch = null; try { sb.removeChannel(old); } catch (e) { } if (hard) { try { sb.realtime.disconnect(); } catch (e) { } } setTimeout(() => { if (!closed) sub(); }, hard ? 150 : 0); },
    close() { closed = true; try { sb.removeChannel(ch); } catch (e) { } ch = null; },
  };
}
function setConn(s) {
  const was = conn; conn = s;
  if (s === "ok") { lastHeard = Date.now(); if (MODE === "guest") lastSeen = Math.max(lastSeen, Date.now() - 5000); }
  if (s === "ok") {
    if (MODE === "guest") sendHello();
    if (MODE === "host" && S) sendState();
  }
  if (was !== s) render();
}
function sendHello() { if (T) T.send({ t: "hello", pid: ME.id, name: ME.name || "Player" }); }
// Everyone gets the board, never the secrets (ships, picks): those stay on the host's phone.
function pub(s) {
  const o = Object.assign({}, s); delete o.sec;
  // Card Clash: the waiting player's own card goes out so their phone can show it. When the waiting player is the host
  // (whose phone already knows it) it's left out, so a guest who is choosing never receives it.
  if (o.game === "tt" && o.board && o.phase === "play" && o.seats[1 - o.turn] === o.host) o.board = Object.assign({}, o.board, { peek: null });
  return o;
}
function sendState() { if (T && S) T.send({ t: "state", s: pub(S) }); }

// ===== GAME ENGINE (host and computer games) =====
function newState(game, room) {
  return { sid: uid(), v: 0, room, game, host: ME.id, players: [], seats: [null, null], queue: [], phase: "lobby",
    board: null, sec: {}, turn: 0, starter: 0, result: null, last: null, lastBy: -1, fx: null, moves: 0, round: 0, draws: 0,
    level: PREF.level, acks: {}, opts: packOpts({ deck: PREF.deck, kids: !!PREF.kids }) };
}
// picture pack choices that go into a game's options (the pictures themselves stay in packs.js)
function packOpts(o) { const pk = PREF.pack && PACKS.get(PREF.pack); return Object.assign(o, { pack: pk ? pk.id : null, usePack: !!(pk && PREF.usePack) }); }
const pl = id => S && S.players.find(p => p.id === id);
// Same name on a new phone = your old place back (wins, seat and turn). Renames the old id everywhere in the game.
function rebindId(root, a, b) {
  const seen = new Set();
  (function walk(o) {
    if (!o || typeof o !== "object" || seen.has(o)) return; seen.add(o);
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) { if (o[i] === a) o[i] = b; else walk(o[i]); } return; }
    const pr = Object.getPrototypeOf(o); if (pr !== Object.prototype && pr !== null) return;
    for (const k of Object.keys(o)) { const v = o[k]; if (v === a) o[k] = b; else walk(v); if (k === a) { o[b] = o[a]; delete o[a]; } }
  })(root);
}
const nameOf = id => (pl(id) || {}).name || "Player";
const mySeat = () => !S ? -1 : S.pass ? (S.phase === "play" ? [0, 1].find(s => GAMES[S.game].waiting(S, s)) ?? -1 : -1) : S.seats.indexOf(ME.id);
const isMe = id => id === ME.id && !(S && S.pass);   // "You" only makes sense with one person per phone
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
let cpuFor = null;
function maybeCPU() {
  if (MODE !== "cpu" || !S || S.phase !== "play") return;
  if (cpuTimer) { if (G().aiKey && cpuFor !== G().aiKey(S)) { clearTimeout(cpuTimer); cpuTimer = null; } else return; }
  const cs = S.seats.indexOf("cpu");
  if (cs < 0 || !G().waiting(S, cs) || ttRevealPending() || GOLF.anim) return;
  if (S.game === "golf" && GOLF.card && Date.now() < GOLF.card.until) { setTimeout(maybeCPU, Math.min(1500, GOLF.card.until - Date.now() + 60)); return; }
  const placing = S.game === "bs" && S.board.stage === "place";
  const extra = S.game === "rps" && REVEAL.until > Date.now() ? REVEAL.until - Date.now() : 0;
  cpuFor = G().aiKey ? G().aiKey(S) : null;
  cpuTimer = setTimeout(() => {
    cpuTimer = null;
    if (MODE !== "cpu" || !S || S.phase !== "play" || !G().waiting(S, cs) || ttRevealPending()) return;
    const mv = G().ai(S, cs, S.level);
    if (applyMove("cpu", mv, S.turn >= 0 ? S.moves : null)) { afterMove(); commit(); }
  }, (G().aiDelay ? G().aiDelay(S, S.level) : placing ? 250 : S.game === "dots" ? 420 + Math.random() * 300 : 520 + Math.random() * 380) + extra);
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
    case "yes": Snd.tone(660, .1, "triangle", .12); Snd.tone(880, .14, "triangle", .12, .09); break;
    case "no": Snd.tone(330, .12, "triangle", .12); Snd.tone(260, .16, "triangle", .12, .1); break;
    case "wrong": Snd.lose(); break;
    case "putt": case "sunk": case "splash": golfStartAnim(s); break;
    case "goal": {
      const me = s.seats.indexOf(ME.id);
      if (HKR) HKR.flash = { seat: s.lastBy, until: performance.now() + 1300 };
      if (me < 0 || s.lastBy === me) { [523, 659, 784].forEach((f, i) => Snd.tone(f, .15, "triangle", .14, i * .08)); buzz([40, 30, 40]); }
      else { Snd.tone(220, .3, "sawtooth", .07); Snd.tone(165, .35, "sawtooth", .07, .12); buzz(160); }
      break;
    }
    case "right": break;
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
  if (S.game === "golf") setTimeout(run, golfAnimLeft() + 300);
  else if (S.fx === "reveal" || S.fx === "sunk" || S.fx === "tt") setTimeout(run, S.fx === "reveal" ? 1150 : 700); else run();
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
  lastHeard = Date.now();
  if (m.t === "hp") return hkPadIn(m);
  if (m.t === "rtc") return rtcOnMsg(m);
  if (m.pid) { const sp = pl(m.pid); if (sp) sp.seen = Date.now(); }
  if (m.t === "hello") {
    let p = pl(m.pid);
    if (!p && cleanName(m.name)) { // dropped out and back on another phone? same name, offline 15s+ (never the host)
      const n = cleanName(m.name).toLowerCase(), old = S.players.find(q => q.id !== ME.id && q.name.toLowerCase() === n && Date.now() - (q.seen || 0) > 15000);
      if (old) { rebindId(S, old.id, m.pid); p = pl(m.pid); p.seen = Date.now(); toast(p.name + " is back"); }
    }
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
  if (m.t === "suggest") {
    const p = pl(m.pid); if (!p || !GAMES[m.game]) return;
    S.suggest = { pid: m.pid, game: m.game }; Snd.join(); toast(`${p.name} wants to play ${GAMES[m.game].name}`);
    return commit();
  }
  if (m.t === "again") { if (S.phase === "over" && S.seats.includes(m.pid)) { nextRound(); commit(); } return; }
  if (m.t === "packreq") { if (m.id && PACKS.get(m.id) && !PKSEND[m.id + m.pid]) { PKSEND[m.id + m.pid] = 1; PACKS.sendTo(x => T && T.send(x), m.id, m.pid).finally(() => setTimeout(() => delete PKSEND[m.id + m.pid], 3000)); } return; }
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
  if (m.t === "hk") return hkFrameIn(m);
  if (m.t === "rtc") return rtcOnMsg(m);
  if (m.t === "hp") return;
  if (m.t === "state") {
    const s = m.s, prev = S;
    lastSeen = Date.now();
    if (prev && s.sid === prev.sid && s.v < prev.v) return;
    if (pending) {
      if (s.acks && s.acks[ME.id] === pending.mid) pending = null;
      else if (prev && GAMES[prev.game].local && s.sid === prev.sid && Date.now() - pending.first < 6000) return; // keep showing my move until the host has it
    }
    if (prev && prev.sid === s.sid && prev.v === s.v && !pending) { S = s; return; }
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
  if (m.t === "packpart") { if (m.to === ME.id) PACKS.receive(m).then(done => { if (done) toast("Pictures ready 🖼️"); render(); }); return; }
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

function startPass() {
  MODE = "cpu";
  S = newState(PREF.game, "ONE"); S.pass = true;
  S.players = [{ id: ME.id, name: (ME.name || "Player 1").trim(), wins: 0 }, { id: "p2", name: (PREF.p2 || "Player 2").trim(), wins: 0 }];
  startFromLobby(); keepAwake(); commit();
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
    if (mv && mv.pick != null) ls.set("h2h_mysec", { k: secKey(), pick: mv.pick });
    if (typeof mv === "string") MYPICK = { k: secKey() + ":" + S.board.hist.length, v: mv };
    sendMove(mv, n); Snd.pick(); render(); return;
  }
  if (applyMove(S.pass ? S.seats[me] : ME.id, mv, n)) { afterMove(); commit(); }
}
function toLobby() { // everyone stays connected and goes back to choosing a game
  if (MODE !== "host" || !S) return;
  S.phase = "lobby"; S.seats = [null, null]; S.queue = []; S.result = null; S.suggest = null;
  commit();
}
function takeSuggestion() {
  if (MODE !== "host" || !S || !S.suggest) return;
  PREF.game = S.game = S.suggest.game; savePref(); S.suggest = null;
  if (S.phase === "lobby") { if (S.players.length >= 2) startFromLobby(); }
  else if (S.phase === "over") nextRound();
  else startRound();
  commit();
}
function suggestBanner() {
  if (MODE !== "host" || !S || !S.suggest || !GAMES[S.suggest.game]) return "";
  return `<div class="suggest"><span>💡 <b>${esc(nameOf(S.suggest.pid))}</b> wants to play <b>${esc(GAMES[S.suggest.game].name)}</b></span><button class="btn green" data-act="takesuggest">Play it</button><button class="x" data-act="nosuggest" aria-label="No thanks">×</button></div>`;
}
function suggestPanel() {
  if (!SUGGEST || MODE !== "guest" || !S) return "";
  return `<div class="overlay"><div class="card"><p class="label">Suggest a game to ${esc(nameOf(S.host))}</p>${gamePicker(S.game, "data-suggest")}<div class="gap"></div><button class="btn alt" data-act="closesuggest">Cancel</button></div></div>`;
}
const gamesBtn = () => MODE === "cpu" ? `<button class="iconbtn" data-act="cpugames">🎮 Games</button>` : `<button class="iconbtn" data-act="games">🎮 Games</button>`;
function playAgain() {
  if (!S || S.phase !== "over") return;
  if (MODE === "guest") { T.send({ t: "again", pid: ME.id }); toast("Asking for a rematch…"); return; }
  nextRound(); commit();
}
function leave() {
  if (Date.now() - leaveArm > 3000 && MODE !== "cpu" && S && S.players.length > 1) { leaveArm = Date.now(); toast(MODE === "host" ? "Tap Leave again to end the game for everyone" : "Tap Leave again to leave"); return; }
  if (MODE === "host") { if (T) T.send({ t: "ended" }); ls.del("h2h_host"); }
  if (MODE === "guest" && T) T.send({ t: "bye", pid: ME.id });
  clearTimeout(cpuTimer); cpuTimer = null; hkStop(); rtcCloseAll();
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
function heal(force) { // reconnect from scratch, at most every 8 seconds unless asked
  if (!T || (!force && Date.now() - lastRevive < 8000)) return;
  lastRevive = Date.now(); conn = "connecting"; T.revive(true); render();
}
setInterval(() => {
  const now = Date.now();
  if (MODE === "guest" && T) {
    if (conn === "ok" && now - lastSeen > 4000) sendHello();
    if (S && now - lastSeen > 9000 && now - joinedAt > 9000) heal(); // heard nothing from the host: the link has probably died
  }
  if (MODE === "host" && T && S && S.players.length > 1 && lastHeard && now - lastHeard > 12000 && now - lastRevive > 45000) heal(); // guests ping every few seconds
  if (MODE === "guest" && T) {
    if (pending && Date.now() - pending.first > 12000) { pending = null; render(); }
    else if (pending && Date.now() - pending.t > 2500 && conn === "ok") { pending.t = Date.now(); T.send({ t: "move", pid: ME.id, mv: pending.mv, n: pending.n, mid: pending.mid }); }
    if (!S || Date.now() - lastSeen > 9000) render();
  }
  if ((MODE === "host" || MODE === "guest") && T && conn === "lost") heal();
}, 1500);
setInterval(() => { if (MODE === "guest" && T && conn === "ok") sendHello(); }, 4000); // "still here" ping for the host
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  keepAwake();
  if ((MODE === "host" || MODE === "guest") && T) { heal(true); lastHeard = Date.now(); }
});

// ===== DRAWING =====
const SKIN = ["#f6d7c3", "#eec1a0", "#d9a07a", "#b67a52", "#8d5a3b", "#5f3b27"];
const HAIR = { black: "#2b2b2b", brown: "#7a4a26", blonde: "#ecc75e", ginger: "#d9652b", grey: "#bdbdbd", none: "#7a4a26" };
const EYE = { blue: "#3d8be0", brown: "#6b3d1e", green: "#3faa55" };
const SHIRT = ["#6c8cff", "#ff8a5c", "#51e08a", "#c792ff", "#ffd23f", "#3ee6d6", "#ff7ac0", "#a5b4cc"];
const svgX = (cls = "") => `<svg class="mark ${cls}" viewBox="0 0 100 100"><line x1="18" y1="18" x2="82" y2="82" stroke="var(--c)"/><line x1="82" y1="18" x2="18" y2="82" stroke="var(--c)"/></svg>`;
const svgO = (cls = "") => `<svg class="mark ${cls}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="33" stroke="var(--c)"/></svg>`;
const disc = () => `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="var(--c)"/><circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="6"/></svg>`;
const HAND = { r: "✊", p: "✋", s: "✌️" }, HAND_NAME = { r: "Rock", p: "Paper", s: "Scissors" };
const BEAT_TEXT = { rs: "Rock blunts scissors", pr: "Paper wraps rock", sp: "Scissors cut paper" };
function markFor(game, seat) {
  if (typeof MARK2 === "object" && MARK2[game]) return MARK2[game](seat);
  if (game === "ttt") return seat === 0 ? svgX() : svgO();
  if (game === "dots") return `<svg viewBox="0 0 100 100"><rect x="14" y="14" width="72" height="72" rx="8" fill="var(--c)" opacity=".85"/></svg>`;
  if (game === "bs") return `<svg viewBox="0 0 100 100"><path d="M10 58h80l-12 18H22z" fill="var(--c)"/><rect x="34" y="40" width="30" height="16" rx="3" fill="var(--c)"/><rect x="46" y="26" width="6" height="16" fill="var(--c)"/></svg>`;
  if (game === "rps") return `<span style="font-size:24px;line-height:1">${seat ? "✋" : "✊"}</span>`;
  if (game === "hockey") return `<svg viewBox="0 0 100 100"><circle cx="50" cy="54" r="38" fill="rgba(0,0,0,.3)"/><circle cx="50" cy="50" r="38" fill="var(--c)"/><circle cx="50" cy="50" r="20" fill="rgba(255,255,255,.4)"/><circle cx="50" cy="50" r="11" fill="var(--c)"/></svg>`;
  if (game === "golf") return `<svg viewBox="0 0 100 100"><circle cx="50" cy="56" r="30" fill="#fff" stroke="var(--c)" stroke-width="10"/><g fill="#d5d9e6"><circle cx="42" cy="48" r="4"/><circle cx="56" cy="46" r="4"/><circle cx="50" cy="60" r="4"/><circle cx="62" cy="60" r="4"/><circle cx="38" cy="62" r="4"/></g></svg>`;
  if (game === "wi") return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="var(--c)"/><text x="50" y="68" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="52" fill="#0b1020">?</text></svg>`;
  if (game === "tt") return `<svg viewBox="0 0 100 100"><rect x="22" y="10" width="56" height="80" rx="9" fill="var(--c)"/><rect x="30" y="20" width="40" height="28" rx="5" fill="rgba(0,0,0,.25)"/><g fill="rgba(0,0,0,.25)"><rect x="30" y="56" width="40" height="5" rx="2"/><rect x="30" y="66" width="40" height="5" rx="2"/><rect x="30" y="76" width="28" height="5" rx="2"/></g></svg>`;
  return disc();
}
const GAME_ICON = {
  ttt: `<svg viewBox="0 0 120 120"><g stroke="#3a4680" stroke-width="6" stroke-linecap="round"><line x1="43" y1="12" x2="43" y2="108"/><line x1="77" y1="12" x2="77" y2="108"/><line x1="12" y1="43" x2="108" y2="43"/><line x1="12" y1="77" x2="108" y2="77"/></g><g stroke="#ff5d73" stroke-width="8" stroke-linecap="round"><line x1="16" y1="16" x2="36" y2="36"/><line x1="36" y1="16" x2="16" y2="36"/><line x1="84" y1="84" x2="104" y2="104"/><line x1="104" y1="84" x2="84" y2="104"/></g><circle cx="60" cy="60" r="11" fill="none" stroke="#ffd23f" stroke-width="8"/><circle cx="94" cy="26" r="11" fill="none" stroke="#ffd23f" stroke-width="8"/></svg>`,
  c4: `<svg viewBox="0 0 120 104"><rect x="4" y="4" width="112" height="96" rx="14" fill="#2449d8"/>${[0, 1, 2, 3].map(r => [0, 1, 2, 3, 4].map(c => { const f = ({ "3,1": "#ff5d73", "3,2": "#ffd23f", "3,3": "#ff5d73", "2,2": "#ff5d73", "2,3": "#ffd23f", "1,3": "#ffd23f", "2,1": "#ffd23f" })[r + "," + c] || "#0b1230"; return `<circle cx="${20 + c * 20}" cy="${21 + r * 21}" r="8" fill="${f}"/>`; }).join("")).join("")}</svg>`,
  dots: `<svg viewBox="0 0 120 120"><rect x="16" y="16" width="44" height="44" fill="#ff5d73" opacity=".35"/><rect x="60" y="60" width="44" height="44" fill="#ffd23f" opacity=".35"/><g stroke-width="6" stroke-linecap="round"><path d="M16 16H60V60H16Z" stroke="#ff5d73" fill="none"/><path d="M60 60H104V104H60Z" stroke="#ffd23f" fill="none"/><path d="M60 16H104" stroke="#ff5d73"/><path d="M16 60V104" stroke="#ffd23f"/></g>${[16, 60, 104].map(y => [16, 60, 104].map(x => `<circle cx="${x}" cy="${y}" r="7" fill="#eef2ff"/>`).join("")).join("")}</svg>`,
  bs: `<svg viewBox="0 0 120 120"><rect x="6" y="6" width="108" height="108" rx="12" fill="#12306b"/><g stroke="#2a4f9a" stroke-width="2">${[1, 2, 3, 4].map(k => `<line x1="${6 + k * 21.6}" y1="6" x2="${6 + k * 21.6}" y2="114"/><line x1="6" y1="${6 + k * 21.6}" x2="114" y2="${6 + k * 21.6}"/>`).join("")}</g><rect x="12" y="34" width="62" height="16" rx="8" fill="#9aa6c8"/><rect x="77" y="56" width="16" height="40" rx="8" fill="#9aa6c8"/><circle cx="41" cy="42" r="9" fill="#ff5d73"/><circle cx="60" cy="85" r="4" fill="#eef2ff"/><circle cx="25" cy="98" r="4" fill="#eef2ff"/></svg>`,
  rps: `<div style="font-size:30px;line-height:54px;letter-spacing:-2px">✊✋✌️</div>`,
  hockey: `<svg viewBox="0 0 120 104"><rect x="22" y="4" width="76" height="96" rx="16" fill="#123a8a" stroke="#c7d2fe" stroke-width="4"/><line x1="24" y1="52" x2="96" y2="52" stroke="#ff5d73" stroke-width="2.5" stroke-dasharray="5 4"/><rect x="46" y="2" width="28" height="5" fill="#050914"/><rect x="46" y="97" width="28" height="5" fill="#050914"/><circle cx="60" cy="24" r="9" fill="#ffd23f"/><circle cx="52" cy="80" r="9" fill="#ff5d73"/><circle cx="70" cy="58" r="5" fill="#f1f5ff"/></svg>`,
  golf: `<svg viewBox="0 0 120 104"><rect x="6" y="6" width="108" height="92" rx="14" fill="#46ad5f" stroke="#a46a3c" stroke-width="6"/><circle cx="84" cy="34" r="8" fill="#0d1a10"/><line x1="84" y1="34" x2="84" y2="8" stroke="#eee" stroke-width="2.5"/><path d="M84 8 L100 13 L84 18Z" fill="#ff5d73"/><circle cx="36" cy="76" r="7" fill="#fff" stroke="#ff5d73" stroke-width="2"/><path d="M40 70 Q60 50 78 40" stroke="#fff" stroke-width="2" stroke-dasharray="3 4" fill="none"/></svg>`,
  flag: `<svg viewBox="0 0 120 104"><rect x="20" y="10" width="5" height="88" rx="2.5" fill="#c7cde8"/><path d="M25 14 Q55 4 80 14 T112 14 V62 Q85 52 60 62 T25 62Z" fill="#fff"/><path d="M25 14 Q40 9 52 10 V58 Q40 58 25 62Z" fill="#2f9e57"/><path d="M80 14 Q96 20 112 14 V62 Q96 66 80 58Z" fill="#e23b3b"/><circle cx="96" cy="80" r="16" fill="#ffd23f"/><text x="96" y="87" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="20" fill="#0b1020">?</text></svg>`,
  snap: `<svg viewBox="0 0 120 104"><circle cx="42" cy="54" r="36" fill="#fdfaf2" stroke="#ff5d73" stroke-width="4"/><circle cx="80" cy="50" r="36" fill="#fdfaf2" stroke="#ffd23f" stroke-width="4"/><g font-size="19" text-anchor="middle" dominant-baseline="central"><text x="28" y="40">🍕</text><text x="30" y="72">🚀</text><text x="61" y="52">🐸</text><text x="94" y="34">⭐</text><text x="98" y="66">🎈</text></g><circle cx="61" cy="52" r="15" fill="none" stroke="#51e08a" stroke-width="3.5"/></svg>`,
  spot: `<svg viewBox="0 0 120 104"><rect x="4" y="18" width="54" height="68" rx="8" fill="#7cc8f5"/><rect x="62" y="18" width="54" height="68" rx="8" fill="#7cc8f5"/><rect x="4" y="60" width="54" height="26" fill="#63bf5b"/><rect x="62" y="60" width="54" height="26" fill="#63bf5b"/><circle cx="20" cy="34" r="7" fill="#ffd23f"/><g font-size="17" text-anchor="middle" dominant-baseline="central"><text x="40" y="66">🌷</text><text x="98" y="66">🌻</text></g><circle cx="98" cy="66" r="13" fill="none" stroke="#ff5d73" stroke-width="3.5"/></svg>`,
  wi: `<div class="wiico">${[3, 14, 18].map(i => `<i>${faceSVG(i)}</i>`).join("")}</div>`,
  hm: `<svg viewBox="0 0 120 104"><path d="M14 96H70M30 96V10H84V22M30 30L48 10" stroke="#c7d2fe" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="84" cy="34" r="10" fill="none" stroke="#ffd23f" stroke-width="5"/><path d="M84 44V66M84 50L72 60M84 50L96 60" stroke="#ffd23f" stroke-width="5" stroke-linecap="round" fill="none"/><g font-family="Fredoka" font-weight="700" font-size="17" fill="#ff5d73"><text x="56" y="92">A</text><text x="98" y="92">E</text></g><path d="M74 96H90M100 96" stroke="#eef2ff" stroke-width="3"/></svg>`,
  ws: `<svg viewBox="0 0 120 104"><rect x="8" y="4" width="104" height="96" rx="12" fill="#f4f1e8"/><rect x="16" y="15" width="88" height="20" rx="10" fill="#ff5d73" opacity=".45"/><path d="M28 50L92 92" stroke="#ffd23f" stroke-width="18" stroke-linecap="round" opacity=".55"/><g font-family="Fredoka" font-weight="700" font-size="15" fill="#1b2140" text-anchor="middle">${["CATZ", "QOLD", "MKNE", "BUSG"].map((r, y) => [...r].map((ch, x) => `<text x="${28 + x * 21}" y="${31 + y * 21}">${ch}</text>`).join("")).join("")}</g></svg>`,
  cw: `<svg viewBox="0 0 120 104">${[[0,1],[1,1],[2,1],[3,1],[4,1],[2,0],[2,2],[2,3],[4,2],[4,3],[0,3],[1,3],[3,3]].map(([x,y]) => `<rect x="${8 + x * 21}" y="${8 + y * 21}" width="20" height="20" fill="#f4f1e8" rx="2"/>`).join("")}<g font-family="Fredoka" font-weight="700" font-size="14" fill="#1b2140" text-anchor="middle"><text x="18" y="44">C</text><text x="39" y="44">A</text><text x="60" y="44">T</text></g><rect x="50" y="8" width="20" height="20" fill="#ffd23f" rx="2"/><text x="60" y="23" font-family="Fredoka" font-weight="700" font-size="14" text-anchor="middle" fill="#1b2140">S</text></svg>`,
  tt: `<div class="ttico"><i style="background-image:url(img/cards/nature/lion.webp)"></i><i style="background-image:url(img/cards/dinosaurs/tyrannosaurus-rex.webp)"></i></div>`,
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
  if (GOLF.drag && S && S.game === "golf") { GOLF.held = true; return; } // don't swap the course out from under a finger mid-aim; catch up on release
  const f = document.activeElement;
  if (f && f.id && MODE === "home" && app.querySelector("#" + f.id)) return; // don't wipe what they're typing
  if (MODE !== "host" && MODE !== "guest" && MODE !== "cpu") { app.dataset.hk = ""; hkStop(); }
  if (MODE === "home" && PREF.game === "tt") preloadDeck(PREF.deck || "animals");
  if (PREF.game === "wi") preloadFaces();
  if (S && S.game === "tt") preloadDeck((S.board && S.board.deck) || (S.opts && S.opts.deck) || "animals");
  if (MODE === "home") return renderHome();
  if (MODE === "join") return renderJoin();
  if (MODE === "ended") return renderEnded();
  if (MODE === "guest" && !S) return renderFinding();
  if (S.phase === "lobby") { app.dataset.hk = ""; return renderLobby(); }
  if (S.game === "hockey" && S.phase === "play") { renderHockey(); return hkEnsure(); }
  app.dataset.hk = ""; hkEnsure();
  renderGame();
  const np = guestNeedsPack(); // the other phone's pictures are still on their way
  if (np) app.insertAdjacentHTML("afterbegin", `<div class="pkload">🖼️ Getting the pictures from ${esc(nameOf(S.host))}… ${np.total ? np.have + " of " + np.total : ""}</div>`);
}

function gamePicker(sel, attr = "data-pickgame", only = null) { // only: the games allowed right now; the rest are greyed out
  return `<div class="games">${Object.values(GAMES).map(g => `<button class="gpick ${sel === g.id ? "on" : ""} ${only && !only.includes(g.id) ? "off" : ""}" ${attr}="${g.id}"${only && !only.includes(g.id) ? " disabled" : ""}><div class="ic">${GAME_ICON[g.id]}</div><b>${g.name}</b></button>`).join("")}</div>`;
}
function levelSeg(sel, attr = "data-level") {
  return `<div class="seg">${Object.entries(LEVELS).map(([k, v]) => `<button class="${sel === k ? "on" : ""}" ${attr}="${k}">${v}</button>`).join("")}</div>`;
}
const soundBtn = () => `<button class="iconbtn" data-act="sound">${PREF.sound ? "🔊" : "🔇"}</button>`;

function renderHome() {
  if (PREF.game === "tt") preloadDeck(PREF.deck || "animals");
  if (PREF.game === "wi") preloadFaces();
  const saved = ls.get("h2h_host", null);
  const resume = saved && saved.S && GAMES[saved.S.game] && Date.now() - saved.t < 3 * 3600e3 && saved.S.players.length > 1 ? saved : null;
  if (!GAMES[PREF.game]) PREF.game = "ttt";
  const one = PREF.screens === "one";
  if (one && !ONE_SCREEN.includes(PREF.game)) PREF.game = "ttt";
  const howSeg = `<div class="seg"><button class="${one ? "" : "on"}" data-act="screens2">📱📱 Two phones</button><button class="${one ? "on" : ""}" data-act="screens1">👥 One screen</button></div>`;
  if (one) {
    app.innerHTML = `
  <div class="top"><span></span>${soundBtn()}</div>
  <div class="logo"><h1><span class="a">Head</span><span class="vs">to</span><span class="b">Head</span></h1><p>Two players, one screen. Take turns.</p></div>
  <div class="card">${howSeg}</div>
  <div class="card">
    <p class="label">Who's playing?</p>
    <input id="nm" class="field" maxlength="16" placeholder="Player 1" value="${esc(ME.name)}" autocomplete="off" enterkeyhint="next">
    <div class="gap"></div>
    <input id="nm2" class="field" maxlength="16" placeholder="Player 2" value="${esc(PREF.p2 || "")}" autocomplete="off" enterkeyhint="done">
  </div>
  <div class="card">
    <p class="label">Pick a game</p>
    ${gamePicker(PREF.game, "data-pickgame", ONE_SCREEN)}
    ${KIDSG.includes(PREF.game) ? `<div class="gap"></div><p class="label">${kidsLabel(PREF.game)}</p>${kidsSeg(PREF.kids, "data-kids")}` : ""}
    <p class="small mut" style="margin:10px 2px 0">Greyed-out games keep things secret from the other player, or need you both playing at once, so they need two phones.</p>
  </div>
  <button class="btn" data-act="pass">👥 Start<span class="sub">Pass the phone or tablet between turns</span></button>`;
    return;
  }
  app.innerHTML = `
  <div class="top"><span></span>${soundBtn()}</div>
  <div class="logo"><h1><span class="a">Head</span><span class="vs">to</span><span class="b">Head</span></h1><p>Phone vs phone. Scan, join, play.</p></div>
  ${resume ? `<div class="card resume"><div class="row"><div><b>Game ${esc(resume.S.room)} is still open</b><div class="small mut">${esc(GAMES[resume.S.game].name)} · ${resume.S.players.map(p => esc(p.name)).join(", ")}</div></div><button class="btn green" style="flex:none;width:auto;padding:12px 18px" data-act="resume">Resume</button></div></div>` : ""}
  <div class="card">${howSeg}</div>
  <div class="card">
    <p class="label">Your name</p>
    <input id="nm" class="field" maxlength="16" placeholder="Your name" value="${esc(ME.name)}" autocomplete="off" enterkeyhint="done">
  </div>
  <div class="card">
    <p class="label">Pick a game</p>
    ${gamePicker(PREF.game)}
    ${PREF.game === "tt" ? `<div class="gap"></div><p class="label">Card Clash theme</p>${deckPicker(PREF.deck, "data-deck")}` : ""}
    ${KIDSG.includes(PREF.game) ? `<div class="gap"></div><p class="label">${kidsLabel(PREF.game)}</p>${kidsSeg(PREF.kids, "data-kids")}` : ""}
    ${packRow(PREF.game)}
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
  if (MODE === "cpu") return "";
  const btn = `<button class="connbtn" data-act="reconnect">Tap to reconnect</button>`;
  if (MODE === "guest" && S && Date.now() - lastSeen > 9000) return `<div class="conn">Can't hear ${esc(nameOf(S.host))}'s phone. Keep the game open on it. ${btn}</div>`;
  if (conn === "ok") return "";
  return `<div class="conn">${conn === "connecting" ? "Connecting…" : "Connection lost. Reconnecting…"} ${btn}</div>`;
}
function inviteBlock() {
  return `<div class="card center">
    <p class="label">Scan to join</p>
    <div class="qrwrap">${qrImg(joinURL(S.room))}</div>
    <div class="small mut">or enter code</div>
    <div class="roomcode">${esc(S.room)}</div>
    <div class="small mut">Dropped out? Join again with the same name to get your place back.</div>
    <div class="gap"></div>
    <button class="btn alt" data-act="share">📤 Send the invite link</button>
  </div>`;
}

function renderLobby() {
  if (S.game === "tt") preloadDeck((S.opts && S.opts.deck) || "animals");
  if (S.game === "wi") preloadFaces();
  const host = MODE === "host", n = S.players.length;
  app.innerHTML = `
  <div class="top"><span class="t">${esc(G().name)}</span>${soundBtn()}</div>
  ${connBanner()}
  ${suggestBanner()}
  ${host ? inviteBlock() : `<div class="card center" style="padding:24px 16px"><div style="font-size:42px" class="wait">✅</div><h2 style="margin:8px 0 4px">You're in!</h2><p class="mut">Waiting for ${esc(nameOf(S.host))} to pick a game: <b style="color:var(--ink)">${esc(G().name)}</b> so far.</p></div>
    <div class="card"><p class="label">Fancy something else? Suggest a game</p>${gamePicker(S.game, "data-suggest")}</div>`}
  <div class="card">
    <p class="label">Players (${n})</p>
    ${playerList(host)}
    ${n > 2 ? `<p class="small mut" style="margin:10px 0 0">Winner stays on. Everyone else waits their turn.</p>` : ""}
  </div>
  ${host ? `
    <div class="card"><p class="label">Game</p>${gamePicker(S.game, "data-setgame")}${S.game === "tt" ? `<div class="gap"></div><p class="label">Theme</p>${deckPicker(S.opts && S.opts.deck, "data-setdeck")}` : ""}${KIDSG.includes(S.game) ? `<div class="gap"></div><p class="label">${kidsLabel(S.game)}</p>${kidsSeg(S.opts && S.opts.kids, "data-setkids")}` : ""}${packRow(S.game)}</div>
    <button class="btn green" data-act="start" ${n < 2 ? "disabled" : ""}>${n < 2 ? `<span class="wait">⏳</span> Waiting for someone to join` : "▶ Start the game"}</button>` : ""}
  <div class="foot"><button class="iconbtn" data-act="leave">Leave</button></div>`;
}

// ----- picture packs -----
const PKSEND = {};       // host: packs being sent right now (pack + guest)
let pkAsked = 0;
function packInUse() { // the pack the current game is using, if any
  const b = S && S.board; if (!b) return null;
  return b.pack || (b.wp && b.wp.pack) || (b.pdeck && b.pdeck.pack) || null;
}
function guestNeedsPack() { // guest: ask the host for the pictures this game uses (repeats until they've all arrived)
  if (MODE !== "guest" || !T) return null;
  const id = packInUse(); if (!id || PACKS.get(id)) return null;
  if (Date.now() - pkAsked > 6000) { pkAsked = Date.now(); T.send({ t: "packreq", pid: ME.id, id }); }
  return PACKS.progress(id) || { have: 0, total: 0 };
}
const pkPic = (id, i) => PACKS.pic(id, i);
const PACKG = ["snap", "wi", "tt"];
function packRow(game) {
  if (!PACKG.includes(game)) return "";
  const pk = PREF.pack && PACKS.get(PREF.pack), list = PACKS.list();
  const needsDetails = game !== "snap" && pk && !pk.tags;
  let h = `<div class="gap"></div><p class="label">Picture pack</p>`;
  if (list.length > 1) h += `<div class="seg decks">${list.map(x => `<button class="${pk && pk.id === x.id ? "on" : ""}" data-pickpack="${x.id}">🖼️ ${esc(x.name)}</button>`).join("")}</div><div class="gap"></div>`;
  if (pk && game !== "tt") h += `<div class="seg"><button class="${PREF.usePack ? "" : "on"}" data-usepack="0">Standard</button><button class="${PREF.usePack ? "on" : ""}" data-usepack="1">🖼️ ${esc(pk.name)}</button></div>`;
  if (pk && game === "tt") h += `<p class="small mut" style="margin:2px 2px 0">${pk.deck ? "Pick 🖼️ " + esc(pk.name) + " as the theme above." : "Add details with Claude to make a Card Clash deck from your pictures."}</p>`;
  if (pk && game === "snap") h += `<p class="small mut" style="margin:6px 2px 0">${pk.pics.length} pictures${pk.pics.length < (PREF.kids ? 31 : 57) ? `. A deck needs ${PREF.kids ? 31 : 57}, so emoji fill the gaps` : ""}.</p>`;
  if (needsDetails && game === "wi") h += `<p class="small" style="margin:6px 2px 0;color:var(--gold, #ffd23f)">⚠️ Not ready for Who Is It? yet: tap <b>✨ Add details with Claude</b> below so it knows who wears a hat, has long hair and so on. Until then you'll get the standard faces.</p>`;
  if (pk && pk.tags && game !== "snap") h += `<p class="small" style="margin:6px 2px 0;color:var(--good, #51e08a)">✓ Claude has added the details, so ${game === "wi" ? "Who Is It?" : "Card Clash"} can use these pictures.</p>`;
  h += `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="iconbtn" data-act="packload">📥 ${pk ? "Load another pack" : "Load a picture pack"}</button>${needsDetails ? `<button class="iconbtn" data-act="packai">✨ Add details with Claude</button>` : ""}${pk ? `<button class="iconbtn" data-act="packshare">📤 Share this pack</button>` : ""}</div>`;
  return h;
}
function packOverlay(html) {
  let ov = document.getElementById("pkov");
  if (!html) { if (ov) ov.remove(); return; }
  if (!ov) { ov = document.createElement("div"); ov.id = "pkov"; document.body.append(ov); ov.addEventListener("click", packOverlayClick); }
  ov.innerHTML = `<div class="pkbox">${html}</div>`;
}
let pkBusy = false;
async function packOverlayClick(e) {
  const a = e.target.closest("[data-pk]"); if (!a) return;
  if (a.dataset.pk === "close") { if (!pkBusy) packOverlay(null); return; }
  if (a.dataset.pk === "go") {
    const key = (document.getElementById("pkkey").value || "").trim();
    if (!/^sk-ant-/.test(key)) { document.getElementById("pkmsg").textContent = "That doesn't look like a Claude API key (it starts sk-ant-)."; return; }
    PACKS.setKey(key); pkBusy = true;
    const say = t => { const m = document.getElementById("pkmsg"); if (m) m.textContent = t; };
    a.disabled = true; say("Choosing the Card Clash stats…");
    try {
      await PACKS.enrich(PREF.pack, key, (n, t) => say(`Looking at the pictures: ${n} of ${t}…`));
      pkBusy = false; packOverlay(`<h2>All done ✨</h2><p>Claude has looked at every picture. Who Is It? and Card Clash can now use this pack.</p><button class="btn green" data-pk="close">Brilliant</button>`);
      if (S && (MODE === "host" || MODE === "cpu")) {
        S.opts = packOpts(Object.assign({}, S.opts));
        // a Who Is It? game that hasn't really started yet switches to the pictures straight away
        if (S.game === "wi" && S.phase === "play" && S.board && !S.board.wp && S.board.stage === "pick" && !S.board.ready.some((r, i) => r && S.seats[i] !== "cpu")) { clearTimeout(cpuTimer); cpuTimer = null; startRound(); }
        commit();
      } else render();
    } catch (err) { pkBusy = false; a.disabled = false; say((err && err.message) || "Something went wrong. Try again."); }
  }
}
function packAI() {
  const pk = PREF.pack && PACKS.get(PREF.pack); if (!pk) return;
  packOverlay(`<h2>✨ Add details with Claude</h2>
    <p>Claude looks at each of the ${pk.pics.length} pictures in <b>${esc(pk.name)}</b> once. It notes things like hats, hair and colours for Who Is It?, and makes up fun stats for Card Clash. It's saved on this phone afterwards.</p>
    <p class="small mut">Uses your Claude API key (from platform.claude.com). It costs a few pence and takes about a minute.</p>
    <input id="pkkey" class="field" type="password" placeholder="sk-ant-…" value="${esc(PACKS.getKey())}" autocomplete="off">
    <p id="pkmsg" class="small" style="min-height:1.3em;margin:8px 0"></p>
    <div class="row" style="gap:8px"><button class="btn alt" data-pk="close">Not now</button><button class="btn green" data-pk="go">Start</button></div>`);
}
async function packShare() { // the whole pack, details and all, so someone else can load it without needing Claude
  const pk = PREF.pack && PACKS.get(PREF.pack); if (!pk) return;
  const file = new File([JSON.stringify(Object.assign({}, pk, { type: "h2h-pack" }))], (slug(pk.name) || "picture-pack") + "-head-to-head.json", { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: pk.name + " for Head to Head" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast("Saved " + file.name + " to your Downloads");
}
const pkFile = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
pkFile.addEventListener("change", () => { const f = pkFile.files && pkFile.files[0]; pkFile.value = ""; if (f) loadPackFile(f); });
async function loadPackFile(f) {
  packOverlay(`<h2>📥 Loading pictures</h2><p id="pkmsg">Opening the pack…</p>`);
  try {
    const pk = await PACKS.fromFile(f, (n, t) => { const m = document.getElementById("pkmsg"); if (m) m.textContent = `Getting the pictures ready: ${n} of ${t}…`; });
    PREF.pack = pk.id; PREF.usePack = true; savePref();
    packOverlay(`<h2>🖼️ ${esc(pk.name)}</h2><p>${pk.pics.length} pictures are ready on this phone.${pk.tags ? "" : " Symbol Snap can use them now. For Who Is It? and Card Clash, tap <b>✨ Add details with Claude</b>."}</p><button class="btn green" data-pk="close">OK</button>`);
    if (S && (MODE === "host" || MODE === "cpu")) { S.opts = packOpts(Object.assign({}, S.opts)); commit(); } else render();
  } catch (e) { packOverlay(`<h2>That didn't work</h2><p>That file isn't a picture pack. Use the file from the Letter Quest picture page or Pack Builder.</p><button class="btn" data-pk="close">OK</button>`); }
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
  for (let i = 0; i < N * N; i++) { const x = cellFn(i); h += `<button class="${x.c || ""}" ${x.mv != null ? `data-fire="${x.mv}"` : ""}>${x.h || ""}</button>`; }
  return `<div class="bsg ${cls}">${h}</div>`;
}
// ----- ship drawings: each square gets its slice of the hull (bow, middle or stern) -----
function shipParts(ships) {
  const m = new Map(), N = GAMES.bs.N;
  (ships || []).forEach(sh => { const c = sh.slice().sort((a, z) => a - z), v = c.length > 1 && c[1] - c[0] === N; c.forEach((x, i) => m.set(x, { i, len: c.length, v })); });
  return m;
}
const SHIP_COL = { own: ["#a7b3c9", "#56627a", "#cfd8e8", "#5d6a82"], draft: ["#c3cde0", "#66738c", "#e3e9f4", "#6d7a92"], sunk: ["#5a4a52", "#2a2026", "#76616b", "#3a2e34"], ghost: ["rgba(167,179,201,.45)", "rgba(86,98,122,.6)", "rgba(207,216,232,.35)", "rgba(93,106,130,.5)"] };
function shipSVG(part, style) {
  const [hull, edge, deck, gun] = SHIP_COL[style] || SHIP_COL.own, { i, len, v } = part;
  const kind = i === 0 ? "bow" : i === len - 1 ? "stern" : "mid";
  let g = "";
  if (kind === "bow") g = `<path d="M110 12 L52 12 Q8 20 0 50 Q8 80 52 88 L110 88 Z" fill="${hull}" stroke="${edge}" stroke-width="5"/><path d="M110 28 L58 28 Q30 34 22 50 Q30 66 58 72 L110 72 Z" fill="${deck}"/><circle cx="76" cy="50" r="12" fill="${gun}"/><rect x="36" y="46" width="40" height="8" rx="4" fill="${gun}"/><circle cx="76" cy="50" r="5" fill="${edge}"/>`;
  else if (kind === "stern") g = `<path d="M-10 12 L78 12 Q100 16 100 50 Q100 84 78 88 L-10 88 Z" fill="${hull}" stroke="${edge}" stroke-width="5"/><path d="M-10 28 L74 28 Q88 32 88 50 Q88 68 74 72 L-10 72 Z" fill="${deck}"/><circle cx="30" cy="50" r="12" fill="${gun}"/><rect x="30" y="46" width="38" height="8" rx="4" fill="${gun}"/><circle cx="30" cy="50" r="5" fill="${edge}"/>`;
  else {
    g = `<rect x="-10" y="12" width="120" height="76" fill="${hull}" stroke="${edge}" stroke-width="5"/><rect x="-10" y="28" width="120" height="44" fill="${deck}"/>`;
    g += i === 1 ? `<rect x="16" y="22" width="68" height="56" rx="8" fill="${gun}"/><rect x="28" y="32" width="44" height="10" rx="3" fill="#dfe8f7" opacity=".85"/><rect x="38" y="50" width="24" height="20" rx="4" fill="${edge}"/><circle cx="50" cy="60" r="5" fill="${deck}"/>`
      : `<circle cx="50" cy="50" r="14" fill="${gun}"/><rect x="6" y="45" width="44" height="10" rx="4" fill="${gun}"/><circle cx="50" cy="50" r="6" fill="${edge}"/>`;
  }
  return `<svg class="shp" viewBox="0 0 100 100" preserveAspectRatio="none"><g ${v ? `transform="rotate(90 50 50)"` : ""}>${g}</g></svg>`;
}
const FIRE = `<svg class="fx" viewBox="0 0 100 100"><circle cx="50" cy="56" r="30" fill="rgba(60,60,60,.45)"/><path d="M50 10 L60 38 L88 30 L68 54 L90 74 L60 68 L50 92 L40 68 L10 74 L32 54 L12 30 L40 38 Z" fill="#ff7a1a"/><path d="M50 28 L56 44 L72 40 L60 54 L72 66 L56 62 L50 76 L44 62 L28 66 L40 54 L28 40 L44 44 Z" fill="#ffd23f"/></svg>`;
const SMOKE = `<svg class="fx" viewBox="0 0 100 100"><circle cx="38" cy="40" r="16" fill="rgba(40,40,46,.7)"/><circle cx="58" cy="32" r="13" fill="rgba(60,60,66,.65)"/><path d="M50 44 L56 58 L68 56 L58 66 L62 78 L50 70 L38 78 L42 66 L32 56 L44 58 Z" fill="#e2552b"/></svg>`;
const SPLASH = `<svg class="fx" viewBox="0 0 100 100"><circle cx="50" cy="50" r="26" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="5"/><circle cx="50" cy="50" r="12" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="4"/><circle cx="50" cy="50" r="4" fill="#fff"/></svg>`;
const miniShip = (L, dead) => `<svg viewBox="0 0 ${L * 12 + 6} 12" style="width:${L * 7 + 4}px;height:8px"><path d="M2 6 Q4 1 10 1 L${L * 12 + 4} 1 L${L * 12 + 4} 11 L10 11 Q4 11 2 6Z" fill="${dead ? "#ff5d73" : "#a7b3c9"}" opacity="${dead ? .45 : 1}"/></svg>`;
function fleetLine(seat) { // ships left for a seat
  const sunk = S.board.sunk[seat].map(s => s.length), left = sunk.slice();
  return `<span class="fleet">${GAMES.bs.FLEET.map(L => { const k = left.indexOf(L); const dead = k >= 0; if (dead) left.splice(k, 1); return `<i class="${dead ? "dead" : ""}">${miniShip(L, dead)}</i>`; }).join("")}</span>`;
}
function boardBS(c) {
  const b = S.board, me = c.me, opp = 1 - me;
  const newCell = (seat, i) => c.animate && S.last && S.last.seat === seat && S.last.cell === i;
  const targetGrid = (shooter, clickable) => {
    const shots = b.shots[shooter], sunk = new Set(b.sunk[1 - shooter].flat());
    const shown = b.reveal ? new Set((b.reveal[1 - shooter] || []).flat()) : new Set();
    const aim = pending && pending.mv && pending.mv.fire;
    const sunkParts = shipParts(b.sunk[1 - shooter]), ghostParts = b.reveal ? shipParts(b.reveal[1 - shooter]) : new Map();
    return bsGrid(i => {
      const v = shots[i], nw = newCell(shooter, i) ? " new" : "";
      if (v === "h") return sunk.has(i) ? { c: "sea sunk" + nw, h: shipSVG(sunkParts.get(i), "sunk") + SMOKE } : { c: "sea hit" + nw, h: FIRE };
      if (v === "m") return { c: "sea miss" + nw, h: SPLASH };
      return { c: "sea" + (aim === i ? " aim" : "") + (clickable ? " can" : ""), h: ghostParts.has(i) ? shipSVG(ghostParts.get(i), "ghost") : "", mv: clickable ? i : null };
    });
  };
  const ownGrid = (seat, ships, mini, draft) => {
    const parts = shipParts(ships), shots = b.shots[1 - seat], sunk = new Set(b.sunk[seat].flat());
    return bsGrid(i => {
      const v = shots[i], nw = newCell(1 - seat, i) ? " new" : "", p = parts.get(i);
      if (v === "h") return { c: "sea" + (sunk.has(i) ? " sunk" : " hit") + nw, h: (p ? shipSVG(p, sunk.has(i) ? "sunk" : "own") : "") + (sunk.has(i) ? SMOKE : FIRE) };
      if (v === "m") return { c: "sea miss" + nw, h: SPLASH };
      return { c: "sea", h: p ? shipSVG(p, draft ? "draft" : "own") : "" };
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

function fmtNum(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return +(v / 1e9).toFixed(2) + "bn";
  if (a >= 1e6) return +(v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "m";
  return v.toLocaleString("en-GB", { maximumFractionDigits: 3 });
}
function fmtStat(v, u) {
  switch (u) {
    case "kg": return v < 1 ? Math.round(v * 1000) + " g" : v >= 1000 ? +(v / 1000).toFixed(v >= 10000 ? 0 : 1) + " t" : v.toLocaleString("en-GB") + " kg";
    case "people": return fmtNum(v);
    case "mkm": return v >= 1000 ? +(v / 1000).toFixed(1) + "bn km" : v + "m km";
    case "mya": return v + "m yrs ago";
    case "°C": return v.toLocaleString("en-GB") + "°C";
    case "/10": case "/100": return v + u;
    case "": return fmtNum(v);
    default: return fmtNum(v) + " " + u;
  }
}
const slug = t => String(t).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Pictures for a deck are fetched in the background as soon as the deck is known, so cards show instantly
const PRE = new Map(), READY = new Set();
let preDeck = "";
function preloadDeck(id) {
  const d = GAMES.tt.DECKS[id]; if (!d || !d.img || preDeck === id) return;
  preDeck = id;
  d.cards.forEach((c, i) => {
    const src = d.img(i, c); if (PRE.has(src)) return;
    const im = new Image(); im.decoding = "async";
    im.onload = () => { READY.add(src); (im.decode ? im.decode() : Promise.resolve()).catch(() => { }); };
    im.src = src; PRE.set(src, im);
  });
}
function cardPic(d, id) { // the card's picture (its emoji shows until the picture is ready, or if it can't load)
  const c = d.cards[id];
  if (d.pics) { const src = pkPic(d.pack, d.pics[id]); return `<div class="ttpic isart">${src ? `<img src="${src}" alt="${esc(c[0])}" class="ready" style="object-position:50% 30%">` : `<span class="ph">${c[1]}</span>`}</div>`; }
  const src = d.img ? d.img(id, c) : null;
  if (!src) return `<div class="ttpic">${c[1]}</div>`;
  const ok = READY.has(src);
  return `<div class="ttpic ${d.flag ? "isflag" : "isart"}">${ok ? "" : `<span class="ph">${c[1]}</span>`}<img src="${src}" alt="${esc(c[0])}" fetchpriority="high" class="${ok ? "ready" : ""}" onload="this.classList.add('ready')" onerror="this.remove()"></div>`;
}
function ttCard(d, id, o = {}) {
  const c = d.cards[id], tag = o.pick ? "button" : "div";
  return `<div class="ttcard p${o.seat} ${o.mini ? "mini" : ""} ${o.win ? "won" : ""} ${o.lost ? "lost" : ""} ${o.flip ? "flip" : ""}">
    ${cardPic(d, id)}<div class="ttname">${esc(c[0])}</div>
    <div class="ttstats">${d.stats.map((st, i) => `<${tag} class="ttrow ${o.hl === i ? "hl" : ""}" ${o.pick ? `data-tt="${i}"` : ""}><span>${st.l}</span><b>${fmtStat(c[2 + i], st.u)}</b></${tag}>`).join("")}</div>
  </div>`;
}
const ttBack = (seat, label) => `<div class="ttcard back p${seat}"><div class="ttbackin"><span>?</span></div><div class="ttname">${label}</div></div>`;
function boardTT(c) {
  const b = S.board, me = c.me, d = b.pdeck || GAMES.tt.DECKS[b.deck], left = me < 0 ? 0 : me, right = 1 - left;
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
    const mine = b.peek != null ? b.peek : null;
    h = mine != null
      ? `${ttCard(d, mine, { seat: me })}<p class="center small mut" style="margin:10px 0 0">Your card. ${esc(nameOf(S.seats[1 - me]))} is picking a stat. Fingers crossed!</p>`
      : `<div class="ttpair">${ttBack(me, "Your card")}${ttBack(1 - me, nm(1 - me) + " card")}</div>`;
  } else {
    h = `<div class="ttpair">${ttCard(d, b.top, { seat: S.turn, mini: true })}${ttBack(1 - S.turn, nm(1 - S.turn) + " card")}</div>`;
  }
  const info = [b.pot ? `${b.pot} card${b.pot > 1 ? "s" : ""} in the middle` : "", S.phase === "play" ? `Round ${b.rounds + (ttRevealPending() ? 0 : 1)} of ${GAMES.tt.MAX_ROUNDS}` : ""].filter(Boolean).join(" · ");
  return h + `<div class="ttinfo">${info}</div><p class="center small mut" style="margin-top:6px">${d.icon} ${esc(d.name)}: ${esc(d.note)}</p>`;
}
// painted portrait (img/faces/<name>.webp); the drawn face is the fallback if a picture is missing
function wiWP() { return S && S.board && S.board.wp; } // a function so the game icons can use faceSVG at start-up
const wiCount = () => wiWP() ? wiWP().ids.length : GAMES.wi.PEOPLE.length;
const wiName = i => wiWP() ? wiWP().names[i] : GAMES.wi.PEOPLE[i].name;
const wiQ = qi => wiWP() ? wiWP().q[qi] : GAMES.wi.QUESTIONS[qi][0];
const wiQN = () => wiWP() ? wiWP().q.length : GAMES.wi.QUESTIONS.length;
function faceSVG(i) {
  const wp = wiWP();
  if (wp) { const src = pkPic(wp.pack, wp.ids[i]); return src ? `<img class="face" src="${src}" alt="">` : `<svg viewBox="0 0 100 100" class="face"><rect width="100" height="100" fill="#e6dfcf"/><text x="50" y="62" text-anchor="middle" font-size="34" fill="#9a8f78">${i + 1}</text></svg>`; }
  const n = GAMES.wi.PEOPLE[i].name.toLowerCase();
  return `<img class="face" src="img/faces/${n}.webp" alt="" decoding="async" onerror="this.outerHTML=faceDrawn(${i})">`;
}
let facesLoaded = false;
function preloadFaces() { if (facesLoaded) return; facesLoaded = true; GAMES.wi.PEOPLE.forEach(p => { const im = new Image(); im.src = "img/faces/" + p.name.toLowerCase() + ".webp"; }); }
function faceDrawn(i) {
  const p = GAMES.wi.PEOPLE[i], has = k => p.x.includes(k), sk = SKIN[p.skin], hc = HAIR[p.hair];
  const darker = p.skin >= 4 ? "rgba(0,0,0,.35)" : "rgba(120,60,40,.35)";
  let back = "", top = "", hat = "", extra = "";
  if (p.style === "long") back = `<path d="M22 46 Q20 18 50 16 Q80 18 78 46 L80 92 Q66 98 50 98 Q34 98 20 92 Z" fill="${hc}"/>`;
  if (p.style === "short") top = `<path d="M24 46 Q22 16 50 15 Q78 16 76 46 Q72 30 62 28 Q50 34 36 28 Q28 32 24 46Z" fill="${hc}"/>`;
  if (p.style === "long") top = `<path d="M24 50 Q22 16 50 15 Q78 16 76 50 Q74 30 58 27 Q44 32 30 30 Q26 36 24 50Z" fill="${hc}"/>`;
  if (p.style === "curly") top = [[28, 34], [36, 24], [47, 19], [58, 20], [68, 25], [74, 35], [24, 44], [76, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${hc}"/>`).join("");
  if (p.style === "bun") top = `<circle cx="50" cy="12" r="10" fill="${hc}"/><path d="M24 46 Q22 18 50 17 Q78 18 76 46 Q70 28 50 26 Q30 28 24 46Z" fill="${hc}"/>`;
  if (p.style === "bald") top = `<ellipse cx="42" cy="28" rx="7" ry="3" fill="rgba(255,255,255,.35)"/>`;
  if (has("h")) hat = `<path d="M23 38 Q24 8 50 8 Q76 8 77 38 Z" fill="#e2524f"/><rect x="21" y="32" width="58" height="10" rx="5" fill="#f2f2f2"/><circle cx="50" cy="6" r="6" fill="#f2f2f2"/>`;
  if (has("c")) hat = `<path d="M24 36 Q24 12 50 12 Q76 12 76 36 Z" fill="#2f6fe0"/><path d="M50 34 L92 36 Q90 42 74 40 L50 38Z" fill="#2557b8"/><circle cx="50" cy="12" r="3" fill="#2557b8"/>`;
  const iris = EYE[p.eyes];
  const eyes = `<ellipse cx="40" cy="52" rx="6" ry="5" fill="#fff"/><ellipse cx="60" cy="52" rx="6" ry="5" fill="#fff"/><circle cx="40" cy="52" r="3.6" fill="${iris}"/><circle cx="60" cy="52" r="3.6" fill="${iris}"/><circle cx="40" cy="52" r="1.6" fill="#111"/><circle cx="60" cy="52" r="1.6" fill="#111"/>`;
  const brows = `<path d="M33 44 Q40 40 46 44" stroke="${p.style === "bald" ? "#5a3a24" : hc}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M54 44 Q60 40 67 44" stroke="${p.style === "bald" ? "#5a3a24" : hc}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const glasses = has("g") ? `<g stroke="#222" stroke-width="2.2" fill="rgba(255,255,255,.12)"><circle cx="40" cy="52" r="9"/><circle cx="60" cy="52" r="9"/><path d="M49 52 L51 52" fill="none"/></g>` : "";
  const mouth = has("s") ? `<path d="M40 70 Q50 80 60 70 Z" fill="#fff" stroke="#7a2e2e" stroke-width="2"/>` : `<path d="M41 71 Q50 77 59 71" stroke="#7a2e2e" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  const fh = p.style === "bald" ? "#6b4a30" : hc;
  const beard = has("b") ? `<path d="M25 58 Q26 92 50 94 Q74 92 75 58 Q70 74 62 76 Q50 80 38 76 Q30 74 25 58Z" fill="${fh}"/>` : "";
  const tache = has("m") ? `<path d="M38 67 Q44 62 50 66 Q56 62 62 67 Q56 69 50 68 Q44 69 38 67Z" fill="${fh}"/>` : "";
  const cheeks = has("r") ? `<circle cx="33" cy="63" r="5" fill="#ff7b8a" opacity=".45"/><circle cx="67" cy="63" r="5" fill="#ff7b8a" opacity=".45"/>` : "";
  const freck = has("f") ? [[34, 60], [37, 63], [31, 63], [66, 60], [63, 63], [69, 63]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#9a5a34"/>`).join("") : "";
  const ears = `<ellipse cx="24" cy="55" rx="4" ry="6" fill="${sk}"/><ellipse cx="76" cy="55" rx="4" ry="6" fill="${sk}"/>` + (has("e") ? `<circle cx="24" cy="63" r="2.6" fill="#ffd23f" stroke="#c99a10"/><circle cx="76" cy="63" r="2.6" fill="#ffd23f" stroke="#c99a10"/>` : "");
  extra = `<path d="M47 60 Q50 64 53 60" stroke="${darker}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 100 110" class="face">${back}<path d="M16 110 Q18 88 50 88 Q82 88 84 110Z" fill="${SHIRT[i % SHIRT.length]}"/><rect x="43" y="78" width="14" height="12" fill="${sk}"/>${ears}<ellipse cx="50" cy="54" rx="26" ry="29" fill="${sk}"/>${beard}${top}${hat}${brows}${eyes}${glasses}${cheeks}${freck}${extra}${tache}${mouth}</svg>`;
}
function wiCard(i, o = {}) {
  return `<${o.btn ? "button" : "div"} class="wic ${o.down ? "down" : ""} ${o.cls || ""}" ${o.attr || ""}>${faceSVG(i)}<span>${esc(wiName(i))}</span></${o.btn ? "button" : "div"}>`;
}
function wiSecret() { // which person this phone is hiding
  const me = mySeat(); if (me < 0) return null;
  if (MODE !== "guest") return S.sec ? S.sec[me] : null;
  const v = ls.get("h2h_mysec", null);
  if (v && v.k === secKey()) return v.pick;
  return S.board.reveal ? S.board.reveal[me] : null;
}
function boardWI(c) {
  const b = S.board, me = c.me, N = wiCount();
  if (WI.k !== secKey()) WI = { k: secKey(), pick: Math.floor(Math.random() * N), guessing: false, qOpen: false };
  const nm = seat => isMe(S.seats[seat]) ? "You" : esc(nameOf(S.seats[seat]));
  const nudge = !b.wp && S.opts && S.opts.usePack && (MODE === "host" || MODE === "cpu") && PREF.pack && PACKS.get(PREF.pack) && !PACKS.get(PREF.pack).tags
    ? `<div class="pkload">These are the standard faces: ${esc(PACKS.get(PREF.pack).name)} needs details from Claude first. <button class="iconbtn" data-act="packai" style="margin-top:6px">✨ Add details with Claude</button><br><span class="small mut">Then tap 🎮 Games and start Who Is It? again.</span></div>` : "";
  if (me >= 0 && b.stage === "pick") {
    if (!b.ready[me] && !(pending && pending.mv && pending.mv.pick != null)) {
      return `${nudge}<div class="wipick">${wiCard(WI.pick, { cls: "big" })}<div><p class="small mut" style="margin:0 0 8px">This is your mystery person. ${esc(nameOf(S.seats[1 - me]))} has to work out who it is.</p><button class="btn alt" data-act="wishuffle">🔀 Someone else</button><div class="gap"></div><button class="btn green" data-act="wiready">✅ Ready</button></div></div>`;
    }
    const mine = wiSecret() ?? (pending && pending.mv && pending.mv.pick);
    return `${nudge}<div class="wipick">${mine != null ? wiCard(mine, { cls: "big" }) : ""}<p class="mut">Ready! Keep it secret…</p></div>`;
  }
  const view = me >= 0 ? me : S.turn >= 0 ? S.turn : 0;
  const down = b.down[view], left = down.filter(x => !x).length;
  const last = b.log[b.log.length - 1];
  let lastLine = "";
  if (last) {
    if (last.q != null) lastLine = `<b>${nm(last.seat)}</b> asked: ${esc(wiQ(last.q))} <span class="ans ${last.a ? "y" : "n"}">${last.a ? "Yes" : "No"}</span>`;
    else lastLine = `<b>${nm(last.seat)}</b> guessed <b>${esc(wiName(last.guess))}</b>: <span class="ans ${last.ok ? "y" : "n"}">${last.ok ? "Right!" : "Wrong"}</span>`;
  }
  const mine = wiSecret();
  const canAct = c.myTurn && !pending;
  const grid = `<div class="wigrid ${WI.guessing && canAct ? "guessing" : ""}">${Array.from({ length: N }, (_, i) => {
    const isDown = down[i], canGuess = WI.guessing && canAct && !isDown;
    const rev = b.reveal && b.reveal[1 - view] === i;
    return wiCard(i, { btn: canGuess, down: isDown && !rev, cls: (rev ? "rev " : "") + (canGuess ? "can" : ""), attr: canGuess ? `data-wiguess="${i}"` : "" });
  }).join("")}</div>`;
  let controls = "";
  if (S.phase === "play" && canAct) {
    if (WI.guessing) controls = `<p class="center small" style="margin:8px 0">Tap the person you think it is. Wrong guess and your go ends.</p><button class="btn alt" data-act="wiguessoff">Back to questions</button>`;
    else {
      const asked = new Set(b.log.filter(l => l.seat === me && l.q != null).map(l => l.q));
      controls = `<div class="wiqs">${Array.from({ length: wiQN() }, (_, qi) => `<button data-wiask="${qi}" class="${asked.has(qi) ? "asked" : ""}">${esc(wiQ(qi))}</button>`).join("")}</div>
        <button class="btn" data-act="wiguesson" style="margin-top:12px">🎯 I know who it is!</button>`;
    }
  }
  const hist = b.log.length > 1 ? `<details class="wihist"><summary>All questions (${b.log.length})</summary>${b.log.slice().reverse().map(l => `<div>${l.q != null ? `${nm(l.seat)}: ${esc(wiQ(l.q))} <span class="ans ${l.a ? "y" : "n"}">${l.a ? "Yes" : "No"}</span>` : `${nm(l.seat)} guessed ${esc(wiName(l.guess))}: <span class="ans ${l.ok ? "y" : "n"}">${l.ok ? "Right" : "Wrong"}</span>`}</div>`).join("")}</details>` : "";
  return `${nudge}${lastLine ? `<div class="wilast">${lastLine}</div>` : ""}
    <div class="wiinfo">${me >= 0 && mine != null ? `<span class="wime">${faceSVG(mine)}<span>You are <b>${esc(wiName(mine))}</b></span></span>` : ""}<span class="mut small">${me >= 0 ? "Your board" : nm(view) + "'s board"}: ${left} left${me >= 0 ? ` · ${esc(nameOf(S.seats[1 - me]))}: ${b.down[1 - me].filter(x => !x).length} left` : ""}</span></div>
    ${controls}${grid}${hist}`;
}
// ----- mini golf -----
function golfStartAnim(s) {
  const L = s.last; if (!L) return;
  const key = s.sid + ":" + s.round + ":" + L.n;
  if (GOLF.seen === key) return;
  GOLF.seen = key;
  const g = GAMES.golf, pts = [];
  let k = 0;
  g.sim(L.hole, L.from[0], L.from[1], L.vx, L.vy, (x, y) => { if (k++ % 3 === 0) pts.push([x, y]); });
  pts.push(null); // end marker
  GOLF.anim = { key, hole: L.hole, seat: L.seat, pts, i: 0, water: L.water, sunk: L.sunk, from: L.from, t0: performance.now(), holeDone: s.board.hole !== L.hole || s.phase === "over" };
  GOLF.card = null; GOLF.msg = null;
  Snd.tone(300, .05, "triangle", .14); Snd.noise(.05, .12, 0, 2500);
  golfLoop();
}
const golfWho = seat => isMe(S.seats[seat]) ? "You" : nameOf(S.seats[seat]);
function golfAfterShot(a) { // say what just happened, and sum up the hole when it's finished
  const b = S.board, done = a.holeDone;
  const n = done ? b.scores[a.seat][a.hole] : b.balls[a.seat].strokes;
  const gaveUp = !a.sunk && (done ? n > GAMES.golf.MAX_STROKES : b.balls[a.seat].gaveUp);
  const who = golfWho(a.seat);
  let msg = null;
  if (a.sunk) msg = { cls: "good", t: n === 1 ? `🎉 HOLE IN ONE! ${who === "You" ? "You" : who} did it!` : `⛳ ${who} ${who === "You" ? "are" : "is"} in! ${n} shots` };
  else if (a.water) msg = { cls: "bad", t: `💦 Splash! ${who} ${who === "You" ? "go" : "goes"} back, +1 shot` };
  else if (gaveUp) msg = { cls: "bad", t: `${who} used all ${GAMES.golf.MAX_STROKES} shots. Ball picked up (scores ${n})` };
  if (msg) { GOLF.msg = Object.assign(msg, { until: Date.now() + 2800 }); setTimeout(() => { if (S && S.game === "golf" && !GOLF.anim) render(); }, 2900); }
  if (done && S.phase === "play") GOLF.card = { hole: a.hole, until: Date.now() + 9000 };
}
function golfAnimLeft() { const a = GOLF.anim; return a ? Math.max(0, (a.pts.length - a.i) * 16) : 0; }
let golfRaf = 0, golfTimer = 0;
function golfLoop() {
  cancelAnimationFrame(golfRaf); clearInterval(golfTimer);
  // moves by the clock, so a phone that pauses drawing (screen off, other app) still finishes the shot
  golfTimer = setInterval(() => { if (GOLF.anim) tick(false); else clearInterval(golfTimer); }, 120);
  const tick = (fromFrame = true) => {
    const a = GOLF.anim;
    if (!a) return;
    a.i = Math.min(a.pts.length - 1, Math.floor((performance.now() - a.t0) / 16));
    if (a.pts[a.i] === null) {
      clearInterval(golfTimer);
      GOLF.anim = null;
      if (a.sunk) { Snd.tone(523, .1, "triangle", .14); Snd.tone(784, .16, "triangle", .14, .1); Snd.tone(1047, .2, "triangle", .12, .2); buzz(40); }
      else if (a.water) Snd.miss();
      golfAfterShot(a);
      render(); maybeCPU();
      return;
    }
    drawGolf();
    if (fromFrame) golfRaf = requestAnimationFrame(() => tick(true));
  };
  golfRaf = requestAnimationFrame(() => tick(true));
}
function golfView(cv) {
  const g = GAMES.golf, wrap = cv.parentElement, w = wrap.clientWidth - 8;
  const h = Math.min(w * g.GH / g.GW, window.innerHeight * 0.66);
  const sc = Math.min(w / g.GW, h / g.GH), dpr = window.devicePixelRatio || 1;
  const cw = Math.round(g.GW * sc), ch = Math.round(g.GH * sc);
  if (cv.width !== cw * dpr) { cv.width = cw * dpr; cv.height = ch * dpr; cv.style.width = cw + "px"; cv.style.height = ch + "px"; }
  return { sc, dpr };
}
function drawGolf() {
  const cv = document.getElementById("golfcv"); if (!cv || !S || S.game !== "golf") return;
  const g = GAMES.golf, b = S.board, a = GOLF.anim, holeIx = a ? a.hole : b.hole, H = g.HOLES[holeIx];
  const { sc, dpr } = golfView(cv), c = cv.getContext("2d");
  c.setTransform(dpr * sc, 0, 0, dpr * sc, 0, 0);
  c.clearRect(0, 0, g.GW, g.GH);
  const poly = pts => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); };
  // grass with mowing stripes
  c.save(); poly(H.outline); c.clip();
  for (let y = 0; y < g.GH; y += 20) { c.fillStyle = (y / 20) % 2 ? "#3fa257" : "#46ad5f"; c.fillRect(0, y, g.GW, 20); }
  H.sand.forEach(r => { c.fillStyle = "#ead595"; c.beginPath(); c.roundRect(r[0], r[1], r[2], r[3], 10); c.fill(); c.fillStyle = "rgba(160,120,40,.25)"; for (let i = 0; i < 18; i++) c.fillRect(r[0] + (i * 37 % r[2]), r[1] + (i * 23 % r[3]), 1.4, 1.4); });
  H.water.forEach(r => { c.fillStyle = "#2f7fd8"; c.beginPath(); c.roundRect(r[0], r[1], r[2], r[3], 8); c.fill(); c.strokeStyle = "rgba(255,255,255,.45)"; c.lineWidth = 1.2; for (let y = r[1] + 8; y < r[1] + r[3]; y += 10) { c.beginPath(); for (let x = r[0] + 4; x < r[0] + r[2] - 4; x += 8) { c.moveTo(x, y); c.quadraticCurveTo(x + 2, y - 2, x + 4, y); } c.stroke(); } });
  c.restore();
  // tee and cup
  c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(H.tee[0] - 9, H.tee[1] - 3, 18, 6);
  c.fillStyle = "#0d1a10"; c.beginPath(); c.arc(H.cup[0], H.cup[1], g.CUP_R, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#ddd"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(H.cup[0], H.cup[1]); c.lineTo(H.cup[0], H.cup[1] - 30); c.stroke();
  c.fillStyle = "#ff5d73"; c.beginPath(); c.moveTo(H.cup[0], H.cup[1] - 30); c.lineTo(H.cup[0] + 16, H.cup[1] - 25); c.lineTo(H.cup[0], H.cup[1] - 20); c.fill();
  // walls
  c.lineCap = "round"; c.lineJoin = "round";
  const wall = pts => { poly(pts); c.strokeStyle = "#5b3a1f"; c.lineWidth = 7; c.stroke(); c.strokeStyle = "#a46a3c"; c.lineWidth = 4; c.stroke(); };
  wall(H.outline);
  H.blocks.forEach(bk => { poly(bk); c.fillStyle = "#a46a3c"; c.fill(); c.strokeStyle = "#5b3a1f"; c.lineWidth = 3; c.stroke(); });
  // balls
  const me = mySeat();
  const ballAt = (x, y, seat, ghost) => {
    c.globalAlpha = ghost ? .55 : 1;
    c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.arc(x + 1.2, y + 1.6, g.BALL_R, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, g.BALL_R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = seat ? "#ffd23f" : "#ff5d73"; c.lineWidth = 2.2; c.stroke(); c.globalAlpha = 1;
  };
  [0, 1].forEach(seat => {
    let x, y, show, holed = false;
    if (a && a.seat === seat) { const p = a.pts[a.i] || a.pts[a.i - 1] || a.from; x = p[0]; y = p[1]; show = true; }
    else if (a && a.hole !== b.hole) { show = true; holed = true; } // finished hole: their ball is already in the cup
    else { const bl = b.balls[seat]; x = bl.x; y = bl.y; show = !bl.in; holed = bl.in && !bl.gaveUp; }
    if (holed) { // sitting in the cup
      c.fillStyle = "#fff"; c.beginPath(); c.arc(H.cup[0] + (seat ? 3 : -3), H.cup[1] + 1, 3.6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = seat ? "#ffd23f" : "#ff5d73"; c.lineWidth = 1.6; c.stroke(); return;
    }
    if (!show) return;
    if (seat === me && !a) { // your ball: ring + label so it's easy to spot
      c.strokeStyle = me ? "rgba(255,210,63,.9)" : "rgba(255,93,115,.9)"; c.lineWidth = 1.4; c.setLineDash([2.5, 2.5]);
      c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = "#fff"; c.font = "700 8px Nunito, sans-serif"; c.textAlign = "center"; c.fillText(S.pass ? nameOf(S.seats[me]).toUpperCase().slice(0, 10) : "YOU", x, y - 14);
    }
    ballAt(x, y, seat, seat !== me && me >= 0);
  });
  // aim
  const A = GOLF.aim && GOLF.aimKey === golfAimKey() && golfCanAim() ? GOLF.aim : null;
  if (A && !a) {
    const bl = b.balls[me], pw = Math.min(1, A.len / A.max);
    const ang = Math.atan2(A.dy, A.dx);
    c.setLineDash([3, 4]); c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(bl.x, bl.y); c.lineTo(bl.x + Math.cos(ang) * (20 + pw * 90), bl.y + Math.sin(ang) * (20 + pw * 90)); c.stroke(); c.setLineDash([]);
    c.fillStyle = `hsl(${120 - pw * 120},85%,55%)`; c.fillRect(8, g.GH - 14, (g.GW - 16) * pw, 6);
    c.strokeStyle = "rgba(255,255,255,.4)"; c.strokeRect(8, g.GH - 14, g.GW - 16, 6);
  }
}
function golfCanAim() { return !!S && S.phase === "play" && S.game === "golf" && !GOLF.anim && !pending && !GOLF.card && waiting(mySeat()); }
function golfAimKey() { return S && S.board ? S.board.hole + "|" + (S.board.balls[mySeat()] || {}).strokes : ""; }
// Aim: drag back like a catapult to set direction and power. Letting go keeps the aim on screen;
// drag again to fine-tune it, then press Hit. The drag lives in GOLF (not on the canvas), so a redraw can't lose it.
function golfPointer(cv) {
  const g = GAMES.golf;
  const pos = e => { const c = document.getElementById("golfcv") || cv, r = c.getBoundingClientRect(), sc = r.width / g.GW; return { x: (e.clientX - r.left) / sc, y: (e.clientY - r.top) / sc }; };
  const end = () => { if (!GOLF.drag) return; GOLF.drag = null; if (GOLF.aim && GOLF.aim.len < 4) GOLF.aim = null; if (GOLF.held) { GOLF.held = false; render(); } else { drawGolf(); golfHitUI(); } };
  cv.onpointerdown = e => {
    if (!golfCanAim()) return;
    const p = pos(e), base = GOLF.aim && GOLF.aimKey === golfAimKey() ? GOLF.aim : { dx: 0, dy: 0 };
    GOLF.drag = { id: e.pointerId, x0: p.x, y0: p.y, bx: base.dx, by: base.dy }; GOLF.aimKey = golfAimKey();
    try { cv.setPointerCapture(e.pointerId); } catch (x) { }
    e.preventDefault();
  };
  if (!golfPointer.win) { // once: follow the finger even if it leaves the course or the canvas is redrawn
    golfPointer.win = true;
    window.addEventListener("pointermove", e => {
      const d = GOLF.drag; if (!d || e.pointerId !== d.id) return;
      const p = pos(e), max = 110;
      let dx = d.bx + (d.x0 - p.x), dy = d.by + (d.y0 - p.y), len = Math.sqrt(dx * dx + dy * dy);
      if (len > max) { dx *= max / len; dy *= max / len; len = max; }
      GOLF.aim = { dx, dy, len, max }; drawGolf(); golfHitUI();
    });
    ["pointerup", "pointercancel"].forEach(t => window.addEventListener(t, e => { if (GOLF.drag && e.pointerId === GOLF.drag.id) end(); }));
    window.addEventListener("blur", end);
  }
  cv.onlostpointercapture = () => setTimeout(() => { if (GOLF.drag && !document.getElementById("golfcv")) end(); }, 0);
}
function golfHitUI() {
  const btn = document.getElementById("golfhit"), lab = document.getElementById("golfpow"); if (!btn) return;
  const A = GOLF.aim && GOLF.aimKey === golfAimKey() ? GOLF.aim : null, ok = !!A && A.len >= 4 && golfCanAim();
  btn.disabled = !ok; if (lab) lab.textContent = A ? Math.round(Math.min(1, A.len / A.max) * 100) + "%" : "–";
}
function golfHit() {
  const g = GAMES.golf, A = GOLF.aim;
  if (!A || A.len < 4 || GOLF.aimKey !== golfAimKey() || !golfCanAim()) return;
  GOLF.aim = null; GOLF.drag = null;
  const pw = Math.min(1, A.len / A.max) * g.MAXV, ang = Math.atan2(A.dy, A.dx);
  myMove({ vx: Math.round(Math.cos(ang) * pw * 1000) / 1000, vy: Math.round(Math.sin(ang) * pw * 1000) / 1000 });
}
function boardGolf(c) {
  const g = GAMES.golf, b = S.board, a = GOLF.anim, holeIx = a ? a.hole : b.hole, H = g.HOLES[holeIx];
  const tot = sd => b.scores[sd].reduce((x, y) => x + y, 0);
  const cell = (sd, i) => { const v = b.scores[sd][i]; if (v == null) return i === b.hole && S.phase === "play" ? `<td class="cur">${b.balls[sd].strokes || ""}</td>` : "<td></td>"; const par = g.HOLES[i].par; return `<td class="${v < par ? "under" : v > par ? "over" : ""}">${v}</td>`; };
  const nm = sd => isMe(S.seats[sd]) ? "You" : esc(nameOf(S.seats[sd]));
  const card = `<table class="golfcard"><tr><th></th>${g.HOLES.map((_, i) => `<th class="${i === b.hole ? "cur" : ""}">${i + 1}</th>`).join("")}<th>Tot</th></tr>
    <tr class="par"><td>Par</td>${g.HOLES.map(h => `<td>${h.par}</td>`).join("")}<td>${g.HOLES.reduce((x, h) => x + h.par, 0)}</td></tr>
    ${[0, 1].map(sd => `<tr class="p${sd}"><td><i></i>${nm(sd)}</td>${g.HOLES.map((_, i) => cell(sd, i)).join("")}<td><b>${tot(sd)}</b></td></tr>`).join("")}</table>`;
  const now = Date.now();
  const msg = !a && GOLF.msg && now < GOLF.msg.until ? `<div class="golfmsg ${GOLF.msg.cls}">${esc(GOLF.msg.t)}</div>` : "";
  let banner = "";
  const cd = !a && GOLF.card && now < GOLF.card.until ? GOLF.card : null;
  if (cd) {
    const h = cd.hole, par = g.HOLES[h].par, word = d => d <= -3 ? "Albatross!" : d === -2 ? "Eagle!" : d === -1 ? "Birdie!" : d === 0 ? "Par" : d === 1 ? "Bogey" : `+${d}`;
    const sc = [0, 1].map(sd => b.scores[sd][h]);
    const won = sc[0] === sc[1] ? "Hole halved 🤝" : `🏆 ${golfWho(sc[0] < sc[1] ? 0 : 1)} won the hole`;
    banner = `<div class="golfbanner"><b>Hole ${h + 1} done</b>${[0, 1].map(sd => `<div class="gbrow p${sd}"><i></i><span>${nm(sd)}</span><em>${sc[sd]} shot${sc[sd] === 1 ? "" : "s"}</em><small>${sc[sd] === 1 ? "Hole in one!" : word(sc[sd] - par)}</small></div>`).join("")}<p>${won}</p><button class="btn green" data-act="golfnext">Next hole ▶</button></div>`;
  }
  return `<div class="golfhead"><b>Hole ${holeIx + 1} of ${g.HOLES.length}: ${esc(H.name)}</b><span>Par ${H.par}</span></div>
    <div class="golfwrap">${banner}${msg}<canvas id="golfcv"></canvas></div>
    ${c.myTurn && !a ? `<div class="golfctl"><button class="btn alt" data-act="golfreset">↺ Reset</button><span>Power <b id="golfpow">–</b></span><button class="btn green" id="golfhit" data-act="golfhit" disabled>⛳ Hit</button></div>
    <p class="center small mut" style="margin:6px 0 0">Drag back from anywhere to aim, like a catapult. Let go, drag again to adjust, then press Hit.</p>` : ""}${card}`;
}
// ----- air hockey -----
const RTC_CFG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const dcOpen = pid => { const d = FAST.dcs[pid]; return !!d && d.readyState === "open"; };
function rtcClose(pid) { try { FAST.pcs[pid] && FAST.pcs[pid].close(); } catch (e) { } delete FAST.pcs[pid]; delete FAST.dcs[pid]; }
function rtcCloseAll() { Object.keys(FAST.pcs).forEach(rtcClose); }
function waitIce(pc) {
  return new Promise(res => {
    if (pc.iceGatheringState === "complete") return res();
    const t = setTimeout(res, 2500);
    pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); res(); } });
  });
}
function rtcWire(pid, dc) {
  FAST.dcs[pid] = dc;
  dc.onmessage = e => { try { const m = JSON.parse(e.data); if (MODE === "host") hostMsg(m); else guestMsg(m); } catch (x) { } };
  dc.onopen = () => hkBar(); dc.onclose = () => { if (FAST.dcs[pid] === dc) delete FAST.dcs[pid]; hkBar(); };
}
async function rtcOffer(pid) {
  if (!window.RTCPeerConnection || !T) return;
  try {
    rtcClose(pid);
    const pc = new RTCPeerConnection(RTC_CFG); FAST.pcs[pid] = pc;
    rtcWire(pid, pc.createDataChannel("fast", { ordered: false, maxRetransmits: 0 }));
    await pc.setLocalDescription(await pc.createOffer()); await waitIce(pc);
    if (T) T.send({ t: "rtc", to: pid, from: ME.id, sdp: pc.localDescription.toJSON() });
  } catch (e) { }
}
async function rtcOnMsg(m) {
  if (m.to !== ME.id || !m.sdp || !window.RTCPeerConnection) return;
  try {
    if (m.sdp.type === "offer") {
      rtcClose(m.from);
      const pc = new RTCPeerConnection(RTC_CFG); FAST.pcs[m.from] = pc;
      pc.ondatachannel = e => rtcWire(m.from, e.channel);
      await pc.setRemoteDescription(m.sdp); await pc.setLocalDescription(await pc.createAnswer()); await waitIce(pc);
      if (T) T.send({ t: "rtc", to: m.from, from: ME.id, sdp: pc.localDescription.toJSON() });
    } else if (m.sdp.type === "answer") {
      const pc = FAST.pcs[m.from]; if (pc && pc.signalingState === "have-local-offer") await pc.setRemoteDescription(m.sdp);
    }
  } catch (e) { }
}
function fastSend(m, to) { if (dcOpen(to)) { try { FAST.dcs[to].send(JSON.stringify(m)); return true; } catch (e) { } } if (T) T.send(m); return false; }

const hkKey = () => S.sid + ":" + S.round;
const hkOpp = () => { const me = mySeat(); return me >= 0 ? S.seats[1 - me] : null; };
function hkEnsure() {
  const live = S && S.game === "hockey" && S.phase === "play" && (MODE === "host" || MODE === "cpu" || MODE === "guest");
  if (!live) { if (HKR) hkStop(); return; }
  if (HKR && HKR.key === hkKey()) return;
  hkStop();
  const g = GAMES.hockey, H = g.HK, now = performance.now();
  const pad = seat => { const y = seat === 0 ? H.L - 26 : 26; return { x: H.W / 2, y, tx: H.W / 2, ty: y, vx: 0, vy: 0, max: 1000 }; };
  HKR = { key: hkKey(), st: { puck: g.newPuck(S.board.serve), pad: [pad(0), pad(1)] }, t: now, acc: 0, n: 0, q: 0, frozenUntil: now + 2400, countdown: now + 2400,
    flash: null, lastSend: 0, frame: null, my: null, sentMy: null, lastMySend: 0, shown: [null, null], timers: [], ev: "", rtcTries: 0 };
  if (MODE === "cpu") { const cs = S.seats.indexOf("cpu"); HKR.st.pad[cs].max = { easy: 200, medium: 320, hard: 520 }[S.level] || 320; }
  if (MODE === "host" || MODE === "cpu") HKR.timers.push(setInterval(hkSim, 8));
  if (MODE === "guest") HKR.timers.push(setInterval(hkSendMine, 25));
  if (MODE === "host") { const opp = hkOpp(); if (opp) { rtcOffer(opp); HKR.timers.push(setInterval(() => { const o = hkOpp(); if (o && !dcOpen(o) && HKR.rtcTries++ < 3) rtcOffer(o); }, 7000)); } }
  const loop = () => { if (!HKR) return; hkDraw(); HKR.raf = requestAnimationFrame(loop); };
  HKR.raf = requestAnimationFrame(loop);
}
function hkStop() { if (!HKR) return; HKR.timers.forEach(clearInterval); cancelAnimationFrame(HKR.raf); HKR = null; }
function hkSim() {
  if (!HKR || !S || S.phase !== "play") return;
  const g = GAMES.hockey, now = performance.now(), ev = [];
  HKR.acc += Math.min(0.1, (now - HKR.t) / 1000); HKR.t = now;
  const cs = MODE === "cpu" ? S.seats.indexOf("cpu") : -1;
  while (HKR.acc >= 1 / 120) {
    HKR.acc -= 1 / 120;
    HKR.st.frozen = now < HKR.frozenUntil;
    if (cs >= 0 && HKR.n++ % 3 === 0 && !HKR.st.frozen) { const [x, y] = g.aiTarget(HKR.st, cs, S.level); HKR.st.pad[cs].tx = x; HKR.st.pad[cs].ty = y; }
    const r = g.step(HKR.st, 1 / 120, ev);
    if (r >= 0) { hkGoal(r); return; }
  }
  if (ev.length) { hkSound(ev); HKR.ev += ev.includes("h") ? "h" : "w"; }
  if (MODE === "host") {
    const opp = hkOpp(), direct = dcOpen(opp);
    if (now - HKR.lastSend >= (direct ? 22 : 50)) {
      HKR.lastSend = now; HKR.q++;
      const p = HKR.st.puck, m = HKR.st.pad, r1 = v => Math.round(v * 10) / 10;
      const f = { t: "hk", k: HKR.key, q: HKR.q, p: [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy)], m: [r1(m[0].x), r1(m[0].y), r1(m[1].x), r1(m[1].y)], z: HKR.st.frozen ? 1 : 0, e: HKR.ev };
      HKR.ev = "";
      fastSend(f, opp);
      if (direct && S.players.length > 2 && HKR.q % 3 === 0) T.send(f); // anyone watching
    }
  }
}
function hkGoal(scorer) {
  const g = GAMES.hockey, now = performance.now();
  S.board.score[scorer]++; S.board.serve = 1 - scorer; S.moves++; S.lastBy = scorer; S.fx = "goal";
  HKR.st.puck = g.newPuck(1 - scorer); HKR.frozenUntil = now + 1400; HKR.countdown = 0;
  if (S.board.score[scorer] >= S.board.target) { S.result = { w: scorer, line: [] }; S.phase = "over"; const p = pl(S.seats[scorer]); if (p) p.wins++; }
  playFx(S); if (S.phase === "over") resultFx();
  commit();
}
function hkSound(ev) { if (ev.includes("h")) { Snd.tone(780, .04, "square", .07); Snd.noise(.04, .1, 0, 3000); } else Snd.tone(420, .03, "triangle", .05); }
function hkPadIn(m) {
  if (!HKR || m.k !== HKR.key) return;
  const seat = S.seats.indexOf(m.pid); if (seat < 0) return;
  const [x, y] = GAMES.hockey.clampPad(seat, m.x, m.y); HKR.st.pad[seat].tx = x; HKR.st.pad[seat].ty = y;
}
function hkFrameIn(m) {
  if (!HKR || m.k !== HKR.key || m.q <= HKR.q) return;
  HKR.q = m.q; HKR.frame = { p: m.p, m: m.m, z: m.z, at: performance.now() }; lastSeen = Date.now();
  if (m.e) hkSound(m.e);
}
function hkSendMine() {
  if (!HKR || !HKR.my || !T) return;
  const now = performance.now(), direct = dcOpen(S.host);
  if (now - HKR.lastMySend < (direct ? 25 : 50)) return;
  if (HKR.sentMy && HKR.sentMy[0] === HKR.my[0] && HKR.sentMy[1] === HKR.my[1] && now - HKR.lastMySend < 500) return;
  HKR.lastMySend = now; HKR.sentMy = HKR.my.slice();
  fastSend({ t: "hp", pid: ME.id, k: HKR.key, x: Math.round(HKR.my[0] * 10) / 10, y: Math.round(HKR.my[1] * 10) / 10 }, S.host);
}
function hkSplit() { return mySeat() >= 0 && MODE !== "cpu" && (PREF.hkView || "split") === "split"; }
function hkGeom(cv) {
  const H = GAMES.hockey.HK, split = hkSplit(), stage = cv.parentElement;
  const aw = stage.clientWidth, ah = stage.clientHeight, span = split ? H.L / 2 : H.L;
  const sc = Math.min(aw / H.W, ah / span), dpr = window.devicePixelRatio || 1, cw = Math.floor(H.W * sc), ch = Math.floor(span * sc);
  if (cv.width !== cw * dpr || cv.height !== ch * dpr) { cv.width = cw * dpr; cv.height = ch * dpr; cv.style.width = cw + "px"; cv.style.height = ch + "px"; }
  const persp = Math.max(0, mySeat()), y0 = split ? H.L / 2 : 0;
  // world -> view: your own goal is always at the bottom of your screen
  const toV = (x, y) => persp === 0 ? [x, y - y0] : [H.W - x, H.L - y - y0];
  const toW = (vx, vy) => persp === 0 ? [vx, vy + y0] : [H.W - vx, H.L - (vy + y0)];
  return { sc, dpr, split, toV, toW, span, persp };
}
function hkPositions() {
  const H = GAMES.hockey.HK, me = mySeat();
  if (MODE !== "guest") return { puck: HKR.st.puck, pads: HKR.st.pad.map(p => [p.x, p.y]), frozen: HKR.st.frozen };
  const f = HKR.frame; if (!f) return null;
  const dt = f.z ? 0 : Math.min(0.12, (performance.now() - f.at) / 1000);
  let x = f.p[0] + f.p[2] * dt, y = f.p[1] + f.p[3] * dt;
  x = Math.max(H.PR, Math.min(H.W - H.PR, x));
  const pads = [[f.m[0], f.m[1]], [f.m[2], f.m[3]]].map((p, i) => {
    const s0 = HKR.shown[i] || p; const n = [s0[0] + (p[0] - s0[0]) * .5, s0[1] + (p[1] - s0[1]) * .5]; HKR.shown[i] = n; return n;
  });
  if (me >= 0 && HKR.my) pads[me] = GAMES.hockey.clampPad(me, HKR.my[0], HKR.my[1]);
  return { puck: { x, y }, pads, frozen: !!f.z };
}
function hkDraw() {
  const cv = document.getElementById("hkcv"); if (!cv || !HKR) return;
  const H = GAMES.hockey.HK, G = hkGeom(cv), c = cv.getContext("2d"), now = performance.now();
  c.setTransform(G.dpr * G.sc, 0, 0, G.dpr * G.sc, 0, 0);
  c.clearRect(0, 0, H.W, G.span);
  const line = (pts, col, w, dash) => { c.beginPath(); pts.forEach((p, i) => { const v = G.toV(p[0], p[1]); i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1]); }); c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]); };
  const circ = (x, y, r, fill, stroke, lw) => { const v = G.toV(x, y); c.beginPath(); c.arc(v[0], v[1], r, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); } };
  // table
  const g2 = c.createLinearGradient(0, 0, 0, G.span); g2.addColorStop(0, "#123a8a"); g2.addColorStop(1, "#0d2c6e");
  c.fillStyle = g2; c.beginPath(); c.roundRect(0, -40, H.W, G.span + 80, GAMES.hockey.CR); c.fill();
  c.fillStyle = "rgba(255,255,255,.05)"; for (let x = 6; x < H.W; x += 8) for (let y = 4; y < G.span; y += 8) c.fillRect(x, y, .8, .8);
  line([[0, H.L / 2], [H.W, H.L / 2]], "rgba(255,93,115,.85)", 1.4, [4, 3]);
  circ(H.W / 2, H.L / 2, 16, null, "rgba(255,255,255,.35)", 1);
  for (const gy of [0, H.L]) { const v = G.toV(H.W / 2, gy); c.beginPath(); c.arc(v[0], v[1], 26, 0, Math.PI * 2); c.strokeStyle = "rgba(255,255,255,.3)"; c.lineWidth = 1; c.stroke(); }
  // boards and goals
  c.strokeStyle = "#c7d2fe"; c.lineWidth = 3; c.beginPath(); c.roundRect(1.5, G.split ? -40 : 1.5, H.W - 3, G.split ? G.span + 38.5 : G.span - 3, GAMES.hockey.CR); c.stroke();
  for (const [gy, seat] of [[0, 1], [H.L, 0]]) {
    const v = G.toV(H.W / 2, gy); if (v[1] < -5 || v[1] > G.span + 5) continue;
    c.fillStyle = "#050914"; c.fillRect(v[0] - H.GOAL / 2, v[1] - 3, H.GOAL, 6);
    c.fillStyle = seat ? "#ffd23f" : "#ff5d73"; c.fillRect(v[0] - H.GOAL / 2 - 3, v[1] - 3, 3, 6); c.fillRect(v[0] + H.GOAL / 2, v[1] - 3, 3, 6);
  }
  const P = hkPositions();
  if (P) {
    const pc = ["#ff5d73", "#ffd23f"];
    P.pads.forEach((m, i) => { circ(m[0], m[1] + 1.5, H.MR, "rgba(0,0,0,.35)"); circ(m[0], m[1], H.MR, pc[i]); circ(m[0], m[1], H.MR * .55, "rgba(255,255,255,.35)"); circ(m[0], m[1], H.MR * .3, pc[i]); });
    circ(P.puck.x, P.puck.y + 1.2, H.PR, "rgba(0,0,0,.4)"); circ(P.puck.x, P.puck.y, H.PR, "#f1f5ff", "#9fb0e8", 1.2);
  }
  // overlays
  const msg = HKR.flash && now < HKR.flash.until ? (HKR.flash.seat === mySeat() ? "GOAL! 🎉" : mySeat() < 0 ? "GOAL!" : "They scored") :
    MODE !== "guest" && HKR.countdown && now < HKR.countdown ? String(Math.ceil((HKR.countdown - now) / 800)) :
    MODE === "guest" && !HKR.frame ? "Connecting…" : MODE === "guest" && HKR.frame.z ? "Get ready…" : "";
  if (msg) { c.fillStyle = "rgba(255,255,255,.92)"; c.font = `700 ${msg.length > 3 ? 13 : 30}px Fredoka, sans-serif`; c.textAlign = "center"; c.fillText(msg, H.W / 2, G.split ? G.span * .55 : G.span * .53); }
  if (G.split) { c.fillStyle = "rgba(255,255,255,.12)"; c.font = "700 46px Fredoka, sans-serif"; c.textAlign = "center"; const me = mySeat(); c.fillText(`${S.board.score[me]}`, H.W / 2, G.span * .8); }
}
function hkPointer(cv) {
  const H = GAMES.hockey.HK;
  const set = e => {
    const me = mySeat(); if (me < 0 || !HKR) return;
    const r = cv.getBoundingClientRect(), G = hkGeom(cv);
    const [wx, wy] = G.toW((e.clientX - r.left) / G.sc, (e.clientY - r.top) / G.sc - (G.persp === 0 ? 0 : 0));
    const [x, y] = GAMES.hockey.clampPad(me, wx, wy - (G.persp === 0 ? 10 : -10)); // paddle sits just above your finger
    if (MODE === "guest") HKR.my = [x, y]; else { HKR.st.pad[me].tx = x; HKR.st.pad[me].ty = y; }
  };
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); set(e); };
  cv.onpointermove = e => { if (e.pointerType === "mouse" && !e.buttons) return; set(e); };
}
function hkBar() {
  const el = document.getElementById("hkbar"); if (!el || !S || S.game !== "hockey") return;
  const me = mySeat(), b = S.board, opp = hkOpp();
  const nm = sd => isMe(S.seats[sd]) ? "You" : esc(nameOf(S.seats[sd]));
  const link = MODE === "cpu" ? "" : (MODE === "host" ? dcOpen(opp) : dcOpen(S.host)) ? `<span class="hklink ok">⚡ Direct</span>` : `<span class="hklink">☁️ Online</span>`;
  const order = me === 1 ? [1, 0] : [0, 1];
  el.innerHTML = `<div class="hkscore">${order.map((sd, i) => `<span class="p${sd}"><i></i>${nm(sd)} <b>${b.score[sd]}</b></span>${i === 0 ? `<em>first to ${b.target}</em>` : ""}`).join("")}</div>
    <div class="hkbtns">${link}${gamesBtn()}${me >= 0 && MODE !== "cpu" ? `<button class="iconbtn" data-act="hkview">${hkSplit() ? "🖥️ Whole table" : "📱📱 Phones end to end"}</button>` : ""}${soundBtn()}<button class="iconbtn" data-act="leave">Leave</button></div>
    ${hkSplit() ? `<div class="hkhint">Put the phones top to top. The puck slides across!</div>` : ""}`;
}
function renderHockey() {
  const key = hkKey() + ":" + (hkSplit() ? "s" : "f") + (SUGGEST ? "+s" : "") + (S.suggest ? "+b" : "") + conn;
  if (app.dataset.hk === key && document.getElementById("hkcv")) { hkBar(); return; }
  app.dataset.hk = key;
  app.innerHTML = `<div class="hk ${hkSplit() ? "split" : ""}">${connBanner()}${suggestBanner()}${suggestPanel()}<div class="hkstage"><canvas id="hkcv"></canvas></div><div id="hkbar" class="hkbar"></div></div>`;
  hkPointer(document.getElementById("hkcv")); hkBar();
}
function deckPicker(sel, attr) {
  const pk = PREF.pack && PACKS.get(PREF.pack), extra = pk && pk.deck ? `<button class="${sel === "pack" ? "on" : ""}" ${attr}="pack">🖼️ ${esc(pk.name)}</button>` : "";
  return `<div class="seg decks">${Object.values(GAMES.tt.DECKS).map(d => `<button class="${sel === d.id ? "on" : ""}" ${attr}="${d.id}">${d.icon} ${esc(d.name)}</button>`).join("")}${extra}</div>`;
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
    const label = isMe(id) ? "You" : esc(p.name);
    let sub = "";
    if (S.phase === "play") sub = w ? (simul ? "choosing…" : id === "cpu" ? "thinking…" : "to play") : simul ? "ready ✓" : "";
    else if (over && S.result.w === seat) sub = "wins!";
    if (S.game === "dots" && !(over && S.result.w === seat)) sub = `${S.board.score[seat]} box${S.board.score[seat] === 1 ? "" : "es"}`;
    if (S.game === "golf" && S.phase === "play") { const bl = S.board.balls[seat]; sub = bl.in ? (bl.gaveUp ? "picked up" : `in ✓ ${bl.strokes}`) : `${bl.strokes} shot${bl.strokes === 1 ? "" : "s"}`; }
    if (S.game === "tt" && !(over && S.result.w === seat)) sub = `${S.board.count[seat]} card${S.board.count[seat] === 1 ? "" : "s"}`;
    if (WORDG.includes(S.game) && S.board && !(over && S.result.w === seat)) { const n = S.board.score[seat]; sub = S.game === "ws" ? `${n} found` : `${n} word${n === 1 ? "" : "s"}`; }
    if (RACEG.includes(S.game) && S.board && !(over && S.result.w === seat)) sub = raceChip(seat);
    if (typeof g2Chip === "function" && !(over && S.result.w === seat)) { const x = g2Chip(seat); if (x != null) sub = x; }
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
      else if (isMe(S.seats[L.w])) { status = "You win the round!"; cls = "me"; }
      else status = `${esc(nameOf(S.seats[L.w]))} wins the round`;
      if (L.w === "draw") sub = "Whoever wins the next round takes them all";
    }
    else if (RACEG.includes(S.game)) [status, cls, sub] = raceStatus(me);
    else if (myTurn) {
      cls = "me";
      const wiPick = S.game === "wi" && S.board.stage === "pick";
      status = bsPlace ? "Place your fleet" : wiPick ? "Choose your mystery person" : S.game === "rps" ? "Pick your move" : S.game === "tt" ? "Pick a stat" : S.game === "wi" ? "Your turn: ask a question" : S.game === "golf" ? "Your shot" : S.game === "hm" ? (HM.solving ? "Fill in the word" : "Your turn: pick a letter") : S.game === "ws" ? "Find the words! 🔎" : S.game === "cw" ? "Your turn: answer a clue" : "Your turn";
      if (S.game === "dots" && S.lastBy === me && S.fx === "box") sub = "Box! Go again";
      if (S.game === "golf" && S.board.balls[1 - me].in && !S.board.balls[1 - me].gaveUp) sub = `${esc(nameOf(S.seats[1 - me]))} is in with ${S.board.balls[1 - me].strokes}. Your shot`;
      if (S.game === "bs" && S.last && S.last.seat !== me) sub = S.last.sunk ? "They sank your ship!" : S.last.hit ? "They hit you!" : "They missed";
    } else if (S.game === "ws") status = "Find the words! 🔎";
    else if (S.turn < 0) {
      const wait = [0, 1].filter(s => g.waiting(S, s) && s !== me).map(s => S.seats[s] === "cpu" ? "the computer" : esc(nameOf(S.seats[s])));
      status = wait.length ? `Waiting for ${wait.join(" and ")}…` : "…";
      if (bsPlace && me >= 0) sub = "They're placing their ships";
    } else if (S.seats[S.turn] === "cpu") status = "Computer is thinking…";
    else if (S.game === "golf" && GOLF.anim) status = GOLF.anim.seat === mySeat() ? "Rolling…" : `${esc(nameOf(S.seats[GOLF.anim.seat]))} is putting…`;
    else if (S.game === "golf" && me >= 0 && S.board.balls[me].in) { status = "You're in! ⛳"; cls = "me"; sub = `${esc(nameOf(S.seats[1 - me]))} is still playing this hole`; }
    else status = S.game === "tt" ? `${esc(nameOf(S.seats[S.turn]))} is choosing…` : `${esc(nameOf(S.seats[S.turn]))}'s turn`;
    if (!myTurn && S.game === "bs" && S.last && S.last.seat === me) sub = S.last.sunk ? "You sank a ship! 🚢" : S.last.hit ? "Hit! 💥" : "Miss";
    if (S.game === "dots" && !myTurn && S.lastBy >= 0 && S.lastBy !== me && S.fx === "box" && me >= 0) sub = "They got a box and go again";
    if (pending && MODE === "guest" && !g.local) sub = "Sending…";
    if (me < 0) sub = `You're watching${S.queue.indexOf(ME.id) === 0 ? ". You're next up!" : ""}`;
  } else if (over) {
    if (S.result.w === "draw") status = "It's a draw! 🤝";
    else if (isMe(S.seats[S.result.w])) { status = "You win! 🎉"; cls = "me"; }
    else status = `${esc(nameOf(S.seats[S.result.w]))} wins!`;
    if (S.game === "dots") sub = `Boxes ${S.board.score[0]} – ${S.board.score[1]}`;
    if (S.game === "rps") sub = `${S.board.score[0]} – ${S.board.score[1]}`;
    if (S.game === "bs") sub = "Every ship sunk";
    if (S.game === "wi" && S.board.reveal) sub = `${esc(nameOf(S.seats[0]))} was ${esc(wiName(S.board.reveal[0]))}, ${esc(nameOf(S.seats[1]))} was ${esc(wiName(S.board.reveal[1]))}`;
    if (S.game === "hockey") sub = `${S.board.score[0]} – ${S.board.score[1]}`;
    if (S.game === "golf") { const t = sd => S.board.scores[sd].reduce((x, y) => x + y, 0); sub = `Total strokes ${t(0)} – ${t(1)} (lowest wins)`; }
    if (S.game === "hm") sub = `Words ${S.board.score[0]} – ${S.board.score[1]}${S.board.prev ? `. The last word was ${S.board.prev.word} ${S.board.prev.pic || ""}` : ""}`;
    if (S.game === "ws") sub = `Words found ${S.board.score[0]} – ${S.board.score[1]}`;
    if (RACEG.includes(S.game)) sub = raceOver() + (S.game === "flag" && S.board.prev ? `. The last one was ${esc(S.board.prev.name)}` : "");
    if (S.game === "cw") sub = `Words answered ${S.board.score[0]} – ${S.board.score[1]}`;
    if (S.game === "tt") sub = S.board.count[0] && S.board.count[1] ? `Most cards after ${GAMES.tt.MAX_ROUNDS} rounds: ${S.board.count[0]} – ${S.board.count[1]}` : "Won every card";
  }
  if (typeof g2Sub === "function" && (S.phase === "play" || over)) { const x = g2Sub(me, over, myTurn); if (x != null && (x || !sub)) sub = x; }
  if (S.pass && S.phase === "play" && !shaking) { // one screen: say whose go it is, by name
    const now = mySeat();
    if (now >= 0) { status = `${esc(nameOf(S.seats[now]))}'s turn`; cls = "me p" + now; }
  }

  const board = { ttt: boardTTT, c4: boardC4, dots: boardDots, bs: boardBS, rps: boardRPS, tt: boardTT, wi: boardWI, golf: boardGolf, hm: boardHM, ws: boardWS, cw: boardCW, flag: boardFlag, snap: boardSnap, spot: boardSpot,
    hockey: () => `<div class="hkfinal"><span class="p0">${S.board.score[0]}</span><em>–</em><span class="p1">${S.board.score[1]}</span></div>`, ...(typeof BOARDS2 === "object" ? BOARDS2 : {}) }[S.game](c);

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
      ${MODE === "host" ? `<button class="btn" data-act="tolobby">🎮 Choose another game</button>` : ""}
      ${MODE === "guest" ? `<button class="btn" data-act="opensuggest">💡 Suggest another game</button>` : ""}
      ${MODE === "cpu" ? `<div class="card"><p class="label">Switch game</p>${gamePicker(S.game, "data-setgame", S.pass ? ONE_SCREEN : null)}${S.game === "tt" ? `<div class="gap"></div><p class="label">Card Clash theme</p>${deckPicker(S.opts && S.opts.deck, "data-setdeck")}` : ""}${KIDSG.includes(S.game) ? `<div class="gap"></div><p class="label">${kidsLabel(S.game)}</p>${kidsSeg(S.opts && S.opts.kids, "data-setkids")}` : ""}${MODE === "cpu" && !S.pass ? `<div class="gap"></div><p class="label">Computer level</p>${levelSeg(S.level, "data-setlevel")}` : ""}${MODE === "cpu" && !S.pass ? packRow(S.game) : ""}</div>` : ""}
    </div>`;
  }

  const queue = S.queue.length && !over ? `<div class="queue">Waiting to play: ${S.queue.map(id => esc(nameOf(id))).join(", ")}</div>` : "";
  const draws = S.draws ? `<div class="center small mut" style="margin-top:-4px;margin-bottom:8px">${S.draws} draw${S.draws > 1 ? "s" : ""}</div>` : "";

  app.innerHTML = `
  <div class="top"><span class="t">${esc(g.name)}${(g.word || g.kidsOpt) && S.board && S.board.kids ? ` <span class="small mut">· Kids</span>` : ""}${MODE === "cpu" ? ` <span class="small mut">· ${S.pass ? "One screen" : LEVELS[S.level]}</span>` : ""}</span><span class="row" style="flex:none;gap:6px">${gamesBtn()}${MODE === "host" ? `<button class="iconbtn" data-act="qr">${showQR ? "Hide QR" : "📱 Join QR"}</button>` : ""}${soundBtn()}</span></div>
  ${connBanner()}${suggestBanner()}${suggestPanel()}
  ${MODE === "host" && showQR ? inviteBlock() : ""}
  <div class="bar">${chip(0, "")}<div class="score"><span><b>${w0}</b> – <b>${w1}</b></span></div>${chip(1, "r")}</div>
  ${draws}
  <div class="status ${cls}">${status}${sub ? `<span class="sub">${sub}</span>` : ""}</div>
  ${board}
  ${after}
  ${queue}
  <div class="foot">${MODE === "guest" ? `<span class="small mut" style="align-self:center">Game ${esc(S.room)}</span>` : ""}<button class="iconbtn" data-act="leave">Leave</button></div>`;
  if (S.game === "golf") { const cv = document.getElementById("golfcv"); if (cv) { golfPointer(cv); drawGolf(); golfHitUI(); } }
}

// ===== WORD GAMES: Hangman, Word Search, Crossword =====
const WORDG = ["hm", "ws", "cw"], KIDSG = WORDG.concat(["flag", "snap", "spot"]);
const kidsLabel = gm => WORDG.includes(gm) ? "Words" : "Version";
function kidsSeg(on, attr) {
  return `<div class="seg">${[["0", "📚 Standard"], ["1", "🧒 Kids"]].map(([v, t]) => `<button class="${(on ? "1" : "0") === v ? "on" : ""}" ${attr}="${v}">${t}</button>`).join("")}</div>`;
}
const KB_ROWS = ["ABCDEFG", "HIJKLMN", "OPQRSTU", "VWXYZ"];
function keyboard(state) { // state(L) gives the key's classes; "off" disables it
  return `<div class="kbd">${KB_ROWS.map(r => `<div>${[...r].map(L => { const st = state(L) || ""; return `<button data-key="${L}" class="${st}" ${/\boff\b/.test(st) ? "disabled" : ""}>${L}</button>`; }).join("")}</div>`).join("")}</div>`;
}
const who = seat => isMe(S.seats[seat]) ? "You" : S.seats[seat] === "cpu" ? "The computer" : esc(nameOf(S.seats[seat]));

// ----- Hangman -----
let HM = { k: "", solving: false, typed: [] };
function hmPic(b) {
  if (b.kids) { // a bunch of balloons; each wrong letter pops one
    const n = b.max, cols = ["#ff5d73", "#ffd23f", "#51e08a", "#6c8cff", "#ff9f43", "#c56cf0"];
    let s = "";
    for (let i = 0; i < n; i++) {
      const a = (-62 + (124 / (n - 1)) * i) * Math.PI / 180, row = i % 2, x = 110 + Math.sin(a) * (70 + row * 18), y = 92 - Math.cos(a) * (46 + row * 20);
      const popped = i >= n - b.wrong;
      s += popped ? `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" opacity=".55">💥</text>`
        : `<path d="M${x} ${y + 15} Q${(x + 110) / 2} ${y + 60} 110 152" stroke="#c7cde8" stroke-width="1" fill="none"/><ellipse cx="${x}" cy="${y}" rx="12" ry="15" fill="${cols[i % cols.length]}"/><ellipse cx="${x - 4}" cy="${y - 6}" rx="3" ry="5" fill="rgba(255,255,255,.55)"/>`;
    }
    const sad = b.wrong >= b.max - 2;
    return `<svg class="hmpic" viewBox="0 0 220 200">${s}<circle cx="110" cy="170" r="20" fill="#ffd8a8"/><circle cx="103" cy="166" r="2.4" fill="#2a2140"/><circle cx="117" cy="166" r="2.4" fill="#2a2140"/><path d="M102 ${sad ? 179 : 175} Q110 ${sad ? 172 : 182} 118 ${sad ? 179 : 175}" stroke="#2a2140" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
  }
  const P = ["M20 190 H150", "M50 190 V18", "M50 18 H140 M50 48 L80 18", "M140 18 V44", "C", "M140 79 V130", "M140 92 L118 116 M140 92 L162 116", "M140 130 L122 164 M140 130 L158 164"];
  return `<svg class="hmpic" viewBox="0 0 220 200">${P.map((d, i) => { const on = i < b.wrong, st = on ? `stroke="#eef2ff" stroke-width="6"` : `stroke="rgba(255,255,255,.12)" stroke-width="4" stroke-dasharray="6 6"`;
    return d === "C" ? `<circle cx="140" cy="61" r="17" fill="none" ${st}/>` : `<path d="${d}" fill="none" stroke-linecap="round" ${st}/>`; }).join("")}</svg>`;
}
function boardHM(c) {
  const b = S.board, can = c.myTurn && !pending, key = S.sid + ":" + S.round + ":" + b.n + ":" + S.moves;
  if (HM.k !== key) HM = { k: key, solving: false, typed: [] };
  if (!can) HM.solving = false;
  const blanks = b.shown.map((x, i) => x ? -1 : i).filter(i => i >= 0);
  const word = `<div class="hmword ${b.len > 9 ? "long" : ""}">${b.shown.map((ch, i) => { const t = HM.solving && !ch ? HM.typed[blanks.indexOf(i)] : ""; return `<span class="${ch ? "on" : t ? "ty" : ""}">${ch || t || ""}</span>`; }).join("")}</div>`;
  const L = S.last && S.last.n === b.n ? S.last : null;
  let line = "";
  if (b.prev && b.prev.n === b.n - 1 && !L && S.phase === "play") line = `<div class="wline good">It was <b>${b.prev.word}</b> ${b.prev.pic || ""} · ${b.prev.w == null ? "nobody got it" : b.prev.w === c.me ? "you got it! 🎉" : who(b.prev.w) + " got it"}</div>`;
  else if (L && L.letter) line = `<div class="wline ${L.hits ? "good" : "bad"}">${who(L.seat)} picked ${L.letter}: ${L.hits ? `${L.hits === 1 ? "it's in!" : `${L.hits} of them!`}` : "not in the word"}</div>`;
  else if (L && L.solve) line = `<div class="wline bad">${who(L.seat)} guessed ${L.solve}. Not quite!</div>`;
  const lives = b.kids ? `${b.max - b.wrong} balloon${b.max - b.wrong === 1 ? "" : "s"} left` : `${b.max - b.wrong} wrong guess${b.max - b.wrong === 1 ? "" : "es"} left`;
  const head = `<div class="hmcat"><span>${b.ic} ${esc(b.cat)} · ${b.len} letters</span>${b.pic ? `<span class="hmhint">Hint: ${b.pic}</span>` : ""}</div>`;
  let keys;
  if (HM.solving) keys = keyboard(() => HM.typed.length >= blanks.length ? "off" : "") +
    `<div class="krow"><button class="btn alt" data-act="hmcancel">Cancel</button><button class="btn alt" data-act="hmback">⌫</button><button class="btn green" data-act="hmcheck" ${HM.typed.length < blanks.length ? "disabled" : ""}>✓ That's it</button></div>`;
  else keys = keyboard(Lt => (b.used[Lt] === 1 ? "hit off" : b.used[Lt] === 0 ? "miss off" : can ? "" : "off")) +
    (can ? `<div class="krow"><button class="btn alt" data-act="hmsolve">💡 I know the word!</button></div>` : "");
  const sc = `<div class="rscore"><b class="p0">${b.score[0]}</b><span>first to ${b.target} words</span><b class="p1">${b.score[1]}</b></div>`;
  return `${line}${head}<div class="hmstage">${hmPic(b)}</div>${word}<p class="center small mut" style="margin:4px 0 8px">${lives}</p>${S.phase === "play" ? keys : ""}${sc}`;
}

// ----- Word Search -----
let WS = { k: "", a: null, z: null, drag: null, msg: null };
const wsCanPlay = () => !!S && S.game === "ws" && S.phase === "play" && mySeat() >= 0 && waiting(mySeat()) && !pending;
function boardWS(c) {
  const b = S.board, N = b.N, key = S.sid + ":" + S.round;
  if (WS.k !== key) WS = { k: key, a: null, z: null, drag: null, msg: null };
  const ctr = k => [k % N + .5, Math.floor(k / N) + .5];
  const seg = (a, z, cls, id) => { const [x1, y1] = ctr(a), [x2, y2] = ctr(z); return `<line ${id ? `id="${id}"` : ""} class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; };
  const lines = b.words.filter(w => w.line).map(w => seg(w.line[0], w.line[1], "p" + w.by)).join("") + seg(WS.a ?? 0, WS.z ?? WS.a ?? 0, "sel" + (WS.a == null ? " hide" : ""), "wsprev");
  const msg = WS.msg && Date.now() < WS.msg.until ? `<div class="wline bad">${WS.msg.t}</div>` : S.last && S.last.seat !== c.me && S.phase === "play" ? `<div class="wline">${who(S.last.seat)} found ${b.words[S.last.i].pic || ""} ${b.words[S.last.i].w}</div>` : "";
  return `${msg}<div class="hmcat"><span>${b.ic} ${esc(b.cat)}</span><span class="mut">${b.words.filter(w => w.by == null).length} left</span></div>
    <div class="wswrap ${b.kids ? "kids" : ""}" style="--n:${N}"><svg class="wslines" viewBox="0 0 ${N} ${N}">${lines}</svg>
    <div class="wsgrid">${[...b.g].map((ch, i) => `<span data-wsc="${i}" class="${WS.a === i ? "a" : ""}">${ch}</span>`).join("")}</div></div>
    <div class="wslist ${b.kids ? "kids" : ""}">${b.words.map(w => `<span class="${w.by != null ? "f p" + w.by : ""}">${w.pic ? `<i>${w.pic}</i>` : ""}${w.w}</span>`).join("")}</div>
    ${S.phase === "play" ? `<p class="center small mut" style="margin:8px 0 0">${b.kids ? "Tap the first letter, then the last letter" : "Tap the first letter then the last, or drag across. Words can go any way, even backwards"}</p>` : ""}`;
}
function wsPaint() {
  document.querySelectorAll(".wsgrid [data-wsc].a").forEach(e => e.classList.remove("a"));
  if (WS.a != null) { const e = document.querySelector(`[data-wsc="${WS.a}"]`); if (e) e.classList.add("a"); }
  const ln = document.getElementById("wsprev"), N = S && S.board && S.board.N; if (!ln || !N) return;
  if (WS.a == null) { ln.classList.add("hide"); return; }
  const z = WS.z != null && GAMES.ws.line(N, WS.a, WS.z) ? WS.z : WS.a;
  ln.classList.remove("hide"); ln.setAttribute("x1", WS.a % N + .5); ln.setAttribute("y1", Math.floor(WS.a / N) + .5); ln.setAttribute("x2", z % N + .5); ln.setAttribute("y2", Math.floor(z / N) + .5);
}
function wsTry(a, z) {
  WS.a = WS.z = null;
  const b = S.board, i = GAMES.ws.match(b, a, z);
  if (i >= 0) return myMove({ ws: [a, z] });
  WS.msg = { t: GAMES.ws.line(b.N, a, z) ? "That's not one of the words" : "Words go in a straight line", until: Date.now() + 1800 };
  Snd.tone(240, .12, "triangle", .1); render(); setTimeout(() => { if (S && S.game === "ws") render(); }, 1850);
}
const wsCellAt = (x, y) => { const el = document.elementFromPoint(x, y), t = el && el.closest && el.closest("[data-wsc]"); return t ? Number(t.dataset.wsc) : null; };
window.addEventListener("pointerdown", e => {
  const t = e.target.closest && e.target.closest("[data-wsc]"); if (!t || !wsCanPlay()) return;
  e.preventDefault(); const i = Number(t.dataset.wsc);
  if (WS.a != null && WS.a !== i) return wsTry(WS.a, i); // second tap
  if (WS.a === i) { WS.a = WS.z = null; return wsPaint(); } // tap the same letter again to cancel
  WS.a = i; WS.z = null; WS.drag = { id: e.pointerId, moved: false }; wsPaint();
});
window.addEventListener("pointermove", e => {
  if (!WS.drag || e.pointerId !== WS.drag.id) return;
  const i = wsCellAt(e.clientX, e.clientY);
  if (i != null && i !== WS.z) { WS.z = i === WS.a ? null : i; if (WS.z != null) WS.drag.moved = true; wsPaint(); }
});
window.addEventListener("pointerup", e => {
  if (!WS.drag || e.pointerId !== WS.drag.id) return;
  const moved = WS.drag.moved; WS.drag = null; const i = wsCellAt(e.clientX, e.clientY);
  if (moved && i != null && i !== WS.a && WS.a != null) wsTry(WS.a, i); else if (moved) { WS.z = null; wsPaint(); }
});
window.addEventListener("pointercancel", () => { WS.drag = null; });

// ----- Crossword -----
let CW = { k: "", sel: null, typed: [] };
function boardCW(c) {
  const b = S.board, can = c.myTurn && !pending, key = S.sid + ":" + S.round, cells = wd => GAMES.cw.cells(b, wd);
  if (CW.k !== key) CW = { k: key, sel: null, typed: [] };
  if (CW.sel != null && (!can || b.words[CW.sel].by != null)) { CW.sel = null; CW.typed = []; }
  const sel = CW.sel != null ? b.words[CW.sel] : null, selCells = sel ? cells(sel) : [], open = selCells.filter(k => !b.letters[k]);
  const grid = `<div class="cwgrid ${b.kids ? "kids" : ""}" style="--w:${b.w}">${b.mask.map((m, k) => {
    if (!m) return "<i></i>";
    const t = sel && !b.letters[k] ? CW.typed[open.indexOf(k)] || "" : "", o = b.own[k];
    return `<span data-cwcell="${k}" class="${o === 0 ? "p0" : o === 1 ? "p1" : o === -1 ? "gift" : ""} ${selCells.includes(k) ? "sel" : ""} ${t ? "ty" : ""}">${b.nums[k] ? `<em>${b.nums[k]}</em>` : ""}${b.letters[k] || t}</span>`;
  }).join("")}</div>`;
  const L = S.last, wn = i => `${b.words[i].n} ${b.words[i].d ? "down" : "across"}`;
  let line = "";
  if (L && S.phase === "play") {
    if (L.pass) line = `<div class="wline">${who(L.seat)} passed${L.gift != null ? ". You're both stuck, so here's a free letter ✨" : ""}</div>`;
    else if (L.ok) line = `<div class="wline good">${who(L.seat)} got ${wn(L.i)}: <b>${L.word}</b> ✓</div>`;
    else line = `<div class="wline bad">${who(L.seat)} tried ${L.word} for ${wn(L.i)} ✗</div>`;
  }
  const clue = (wd, i) => `<button data-cwclue="${i}" class="${wd.by != null ? "done " + (wd.by === "auto" ? "" : "p" + wd.by) : ""} ${CW.sel === i ? "on" : ""}" ${!can || wd.by != null ? "disabled" : ""}>
    <b>${wd.n}</b><span>${wd.pic ? `<i>${wd.pic}</i>` : ""}${esc(wd.clue)} <small>(${wd.len})</small>${wd.by != null ? `<em>${cells(wd).map(k => b.letters[k]).join("")}</em>` : ""}</span></button>`;
  const list = d => b.words.map((wd, i) => wd.d === d ? clue(wd, i) : "").join("");
  let ctl = "";
  if (S.phase === "play" && can) {
    ctl = sel ? `<div class="cwasking">${sel.pic ? `<i>${sel.pic}</i>` : ""}<b>${wn(CW.sel)}</b> ${esc(sel.clue)}</div>${keyboard(() => CW.typed.length >= open.length ? "off" : "")}
      <div class="krow"><button class="btn alt" data-act="cwcancel">Back</button><button class="btn alt" data-act="cwback">⌫</button><button class="btn green" data-act="cwcheck" ${CW.typed.length < open.length ? "disabled" : ""}>✓ Answer</button></div>`
      : `<div class="krow"><p class="small mut" style="flex:2;margin:0;align-self:center">Pick a clue, or tap a square</p><button class="btn alt" data-act="cwpass">Pass</button></div>`;
  }
  const sc = `<div class="rscore"><b class="p0">${b.score[0]}</b><span>words answered</span><b class="p1">${b.score[1]}</b></div>`;
  return `${line}${grid}${ctl}<div class="cwclues"><div><p class="label">Across</p>${list(0)}</div><div><p class="label">Down</p>${list(1)}</div></div>${sc}`;
}
function cwTapCell(k) {
  const b = S.board, hits = b.words.map((wd, i) => i).filter(i => b.words[i].by == null && GAMES.cw.cells(b, b.words[i]).includes(k));
  if (!hits.length) return;
  const at = hits.indexOf(CW.sel);
  CW.sel = hits[at < 0 ? 0 : (at + 1) % hits.length]; CW.typed = []; render();
}
function wordKey(L) {
  if (S.game === "hm") {
    if (!HM.solving) return myMove({ letter: L });
    const blanks = S.board.shown.filter(x => !x).length; if (HM.typed.length < blanks) { HM.typed.push(L); Snd.pick(); } return render();
  }
  if (S.game === "cw" && CW.sel != null) {
    const b = S.board, open = GAMES.cw.cells(b, b.words[CW.sel]).filter(k => !b.letters[k]).length;
    if (CW.typed.length < open) { CW.typed.push(L); Snd.pick(); } return render();
  }
}
function cwAnswer() {
  const b = S.board, wd = b.words[CW.sel], t = CW.typed.slice();
  const word = GAMES.cw.cells(b, wd).map(k => b.letters[k] || t.shift()).join("");
  const i = CW.sel; CW.sel = null; CW.typed = [];
  myMove({ cw: i, word });
}
function hmAnswer() {
  const t = HM.typed.slice(), word = S.board.shown.map(x => x || t.shift()).join("");
  HM.solving = false; HM.typed = []; myMove({ solve: word });
}

// ===== RACE GAMES: Flag Quiz, Symbol Snap, Spot the Difference =====
// Both players play at once. After each flag / match / picture, both phones show the answer for a moment (game.reveal ms).
const RACEG = ["flag", "snap", "spot"];
let RV = { k: "", until: 0 };
function raceRev() { // true while the last answer is still on show
  const g = G(), b = S && S.board; if (!g.reveal || !b || !b.prev) return false;
  const cur = S.game === "spot" ? b.p : b.n, pn = S.game === "spot" ? b.prev.p : b.prev.n;
  if (pn !== cur - 1) return false;
  const k = S.sid + ":" + S.round + ":" + cur;
  if (RV.k !== k) { RV = { k, until: Date.now() + g.reveal }; setTimeout(() => { if (S && MODE !== "home") render(); }, g.reveal + 40); }
  return Date.now() < RV.until;
}
const opp = me => S.seats[1 - me] === "cpu" ? "The computer" : esc(nameOf(S.seats[1 - me]));
function raceStatus(me) { // [status, class, sub line]
  const b = S.board, rev = raceRev(), mine = s => s === me && me >= 0;
  if (S.game === "flag") {
    if (rev) { const P = b.prev; return [P.w == null ? "Nobody got that one" : mine(P.w) ? "You got it! 🎉" : `${who(P.w)} got it`, P.w != null && mine(P.w) ? "me" : "", `It was <b>${esc(P.name)}</b>${P.cap ? ` · capital ${esc(P.cap)}` : ""}`]; }
    if (me >= 0 && b.out[me]) return ["Not that one! ❌", "", `${opp(me)} can still answer`];
    return ["Name the flag! 🏳️", "me", me >= 0 && b.out[1 - me] ? `${opp(me)} got it wrong. Your chance!` : ""];
  }
  if (S.game === "snap") {
    if (rev) { const P = b.prev; return [mine(P.seat) ? "Snap! You got it 🎉" : `${who(P.seat)} got it`, mine(P.seat) ? "me" : "", `The match was ${GAMES.snap[b.kids ? "KIDS" : "SYM"][P.sym]}`]; }
    if (Date.now() < SNL.until) return ["Oops! Not that one", "", "Wait a moment…"];
    return ["Find the match! 👀", "me", "Tap the picture that's on your card AND the middle card"];
  }
  if (S.game === "spot") {
    if (rev) return [`Picture ${b.prev.p + 1} done!`, "", b.prev.missed.length ? "White dashed rings show the ones nobody found" : "Every difference found"];
    if (spMiss(me)) return ["Not there! ❌", "", "Wait a moment…"];
    const sk = me >= 0 && b.skip[1 - me] && !b.skip[me] ? `${opp(me)} wants to skip this picture` : me >= 0 && b.skip[me] ? `Waiting for ${opp(me)} to skip too` : "";
    return ["Spot the differences! 🔍", "me", sk || "Tap a difference on either picture"];
  }
  return ["", "", ""];
}
const raceChip = seat => { const n = S.board.score[seat]; return S.game === "flag" ? `${n} right` : S.game === "snap" ? `${n} card${n === 1 ? "" : "s"}` : `${n} found`; };
const raceOver = () => { const [a, z] = S.board.score; return S.game === "flag" ? `Flags ${a} – ${z}` : S.game === "snap" ? `Cards won ${a} – ${z}` : `Differences found ${a} – ${z}`; };
const raceScore = label => `<div class="rscore"><b class="p0">${S.board.score[0]}</b><span>${label}</span><b class="p1">${S.board.score[1]}</b></div>`;

// ----- Flag Quiz -----
function boardFlag(c) {
  const b = S.board, rev = raceRev(), over = S.phase === "over";
  const P = (rev || over) && b.prev ? b.prev : null, me = c.me;
  const can = !P && c.myTurn && !pending;
  const flag = P ? P.flag : b.q && b.q.flag, opts = P ? P.opts : b.q ? b.q.opts : [];
  const picks = P ? P.picks : b.picks;
  const btn = (o, i) => {
    let cls = "";
    if (P && i === P.ans) cls = "ok";
    else if (picks.includes(i)) cls = "bad";
    const tags = [0, 1].filter(s => picks[s] === i).map(s => `<i class="p${s}">${s === me ? "you" : S.seats[s] === "cpu" ? "cpu" : esc(nameOf(S.seats[s])).slice(0, 8)}</i>`).join("");
    return `<button class="fqopt ${cls}" data-flag="${i}" ${can && !picks.includes(i) ? "" : "disabled"}>${esc(o)}${tags}</button>`;
  };
  const head = `<div class="hmcat"><span>🏳️ Flag ${Math.min((P ? P.n : b.n) + 1, b.total)} of ${b.total}</span><span class="mut">${b.kids ? "Kids" : ["Easy one", "Trickier", "Hard one"][(b.q || {}).tier] || ""}</span></div>`;
  return `${head}<div class="fqwrap ${P ? "rev" : ""}">${flag ? `<img class="fqflag" src="img/flags/${flag}.svg" alt="">` : ""}</div>
    <div class="fqopts ${b.kids ? "kids" : ""}">${opts.map(btn).join("")}</div>${raceScore("flags right")}`;
}

// ----- Symbol Snap -----
let SNL = { until: 0, bad: null };
function snRand(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }
function snCard(card, kids, opts = {}) {
  const R = snRand(card.r), n = card.s.length, list = GAMES.snap[kids ? "KIDS" : "SYM"], a0 = R() * Math.PI * 2;
  const syms = card.s.map((x, i) => {
    const ring = i > 0, ang = a0 + (i - 1) * Math.PI * 2 / (n - 1);
    const rad = ring ? (kids ? 31 : 33) : 0, x0 = 50 + Math.cos(ang) * rad, y0 = 50 + Math.sin(ang) * rad;
    const sz = (kids ? 21 : 16.5) * (ring ? .85 + R() * .35 : 1.1 + R() * .15), rot = Math.round(R() * 70 - 35);
    const cls = opts.hit === x ? "hit" : SNL.bad && SNL.bad.c === opts.id && SNL.bad.x === x && Date.now() < SNL.until ? "bad" : "";
    const face = x >= 1000 ? ((src => src ? `<img src="${src}" alt="" draggable="false">` : `<b class="pw">${x - 999}</b>`)(pkPic(S.board.pack, x - 1000))) : list[x];
    return `<button class="sym ${x >= 1000 ? "pic" : ""} ${cls}" data-sn="${x}" data-snc="${opts.id || ""}" style="left:${x0.toFixed(1)}%;top:${y0.toFixed(1)}%;--sz:${sz.toFixed(1)};--r:${rot}deg">${face}</button>`;
  }).join("");
  return `<div class="sncard ${opts.cls || ""}">${syms}</div>`;
}
function boardSnap(c) {
  const b = S.board, rev = raceRev(), me = c.me, P = (rev || S.phase === "over") && b.prev ? b.prev : null;
  const mySeat_ = me >= 0 ? me : 0, locked = Date.now() < SNL.until;
  const mid = P ? P.mid : b.mid, mine = P ? P.cards[mySeat_] : b.cards[mySeat_];
  const hit = P ? P.sym : null;
  const lab = me >= 0 ? "Your card" : `${esc(nameOf(S.seats[0]))}'s card`;
  return `<div class="hmcat"><span>🃏 First to ${b.target} cards</span><span class="mut">${b.left} left in the pile</span></div>
    <div class="snwrap ${locked ? "lock" : ""}"><p class="label center">Middle card</p>${snCard(mid, b.kids, { id: "m", hit, cls: P && P.seat !== me ? "p" + P.seat : "" })}
    <p class="label center" style="margin-top:10px">${lab}</p>${snCard(mine, b.kids, { id: "y", hit: P && P.seat === mySeat_ ? hit : P ? null : null, cls: "mine p" + mySeat_ })}</div>
    ${raceScore("cards won")}`;
}
function snapTap(x, which) {
  const me = mySeat(), b = S.board; if (me < 0 || S.phase !== "play" || pending || raceRev() || Date.now() < SNL.until) return;
  if (b.cards[me].s.includes(x) && b.mid.s.includes(x)) return myMove({ sn: x, n: b.n });
  SNL = { until: Date.now() + 1000, bad: { c: which, x } }; buzz(120);
  Snd.tone(220, .14, "triangle", .12); render(); setTimeout(() => { if (S && S.game === "snap") render(); }, 1020);
}

// ----- Spot the Difference -----
let SPX = { k: "", until: 0, mine: false };
function spBG(theme, p, seed) { // the painted background for each theme; p = which bits are there (1), missing (0) or a different colour (2)
  const R = snRand(seed), on = k => p[k] !== 0, alt = k => p[k] === 2;
  const grad = (id, a, z) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${z}"/></linearGradient></defs><rect width="300" height="200" fill="url(#${id})"/>`;
  const cloud = (x, y, s) => `<g fill="#fff"><ellipse cx="${x}" cy="${y}" rx="${22 * s}" ry="${9 * s}"/><ellipse cx="${x - 9 * s}" cy="${y - 5 * s}" rx="${11 * s}" ry="${9 * s}"/><ellipse cx="${x + 8 * s}" cy="${y - 7 * s}" rx="${12 * s}" ry="${10 * s}"/></g>`;
  const sun = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r + 7}" fill="#ffe066" opacity=".3"/><circle cx="${x}" cy="${y}" r="${r}" fill="#ffd23f"/>`;
  const stars = (n, h) => Array.from({ length: n }, () => `<circle cx="${(R() * 300).toFixed(1)}" cy="${(R() * h).toFixed(1)}" r="${(.5 + R() * .9).toFixed(2)}" fill="#fff" opacity="${(.45 + R() * .55).toFixed(2)}"/>`).join("");
  switch (theme) {
    case "garden": return grad("bgg", "#7cc8f5", "#dff3ff") + (on("sun") ? sun(262, 34, 17) : "") + (on("cloud1") ? cloud(70, 34, 1.15) : "") + (on("cloud2") ? cloud(178, 26, .95) : "")
      + `<path d="M0 122 Q60 90 130 114 T300 106 V200 H0Z" fill="#94d47c"/><rect y="124" width="300" height="76" fill="#63bf5b"/><path d="M0 124 Q75 118 150 125 T300 122 V130 H0Z" fill="#58b350"/>`
      + `<rect x="24" y="92" width="58" height="50" fill="#f3dfbf"/><path d="M18 94 L53 66 L88 94Z" fill="#d94f4f"/><rect x="46" y="114" width="15" height="28" rx="2" fill="${alt("door") ? "#3f7be0" : "#8b4a2b"}"/><circle cx="58" cy="129" r="1.4" fill="#ffd23f"/>`
      + `<rect x="29" y="98" width="13" height="12" fill="${alt("win") ? "#ffd23f" : "#a9dcff"}" stroke="#fff" stroke-width="1.6"/><rect x="65" y="98" width="13" height="12" fill="#a9dcff" stroke="#fff" stroke-width="1.6"/>`;
    case "sea": return grad("bgs", "#3db4e6", "#0b4a86") + `<g fill="#fff" opacity=".07"><path d="M40 0 L80 0 L30 170 L10 170Z"/><path d="M160 0 L190 0 L170 170 L140 170Z"/><path d="M250 0 L275 0 L290 150 L270 150Z"/></g>`
      + `<path d="M0 176 Q80 166 160 176 T300 172 V200 H0Z" fill="#e8cf8c"/>`
      + (on("weed") ? `<g stroke="#2f9e57" stroke-width="5" fill="none" stroke-linecap="round"><path d="M22 196 Q12 180 22 166 T18 142"/><path d="M34 196 Q42 178 32 164 T38 148"/></g>` : "")
      + (on("rock") ? `<ellipse cx="262" cy="185" rx="22" ry="13" fill="#7d8796"/><ellipse cx="255" cy="180" rx="8" ry="4" fill="#9aa3b0"/>` : "")
      + (on("bubbles") ? `<g fill="none" stroke="#e8f7ff" stroke-width="1.6"><circle cx="146" cy="44" r="5"/><circle cx="155" cy="31" r="4"/><circle cx="149" cy="20" r="3"/></g>` : "")
      + `<path d="M215 194 V176 M215 183 L206 171 M215 181 L224 169" stroke="${alt("coral") ? "#ffcc33" : "#ff6f91"}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
    case "space": return grad("bgp", "#0b1035", "#26124f") + stars(55, 200)
      + (on("moon") ? `<circle cx="46" cy="40" r="18" fill="#e9e6d6"/><circle cx="40" cy="35" r="4" fill="#cfcbb8"/><circle cx="53" cy="46" r="3" fill="#cfcbb8"/>` : "")
      + (on("comet") ? `<path d="M118 12 L147 26" stroke="#9fe7ff" stroke-width="5" stroke-linecap="round" opacity=".55"/><circle cx="150" cy="27" r="4.5" fill="#fff"/>` : "")
      + `<circle cx="250" cy="150" r="24" fill="${alt("planet") ? "#ff9f43" : "#b07cff"}"/><path d="M232 142 Q250 136 268 146" stroke="rgba(255,255,255,.25)" stroke-width="4" fill="none"/><ellipse cx="250" cy="150" rx="40" ry="9" fill="none" stroke="#ffe6a8" stroke-width="3" transform="rotate(-18 250 150)"/>`;
    case "snow": return grad("bgn", "#0c1a45", "#2c4f94") + stars(28, 110) + (on("moon") ? `<circle cx="262" cy="30" r="15" fill="#fdf3c2"/><circle cx="262" cy="30" r="21" fill="#fdf3c2" opacity=".18"/>` : "")
      + `<path d="M0 134 Q90 116 170 134 T300 128 V200 H0Z" fill="#dfe9fb"/><path d="M0 150 Q100 140 200 152 T300 148 V200 H0Z" fill="#f4f8ff"/>`
      + `<rect x="72" y="74" width="8" height="16" fill="#8a4430"/><rect x="26" y="94" width="56" height="48" fill="#a4553a"/><path d="M20 96 L54 70 L88 96Z" fill="#f7fbff"/>`
      + `<rect x="41" y="109" width="14" height="13" fill="${alt("win") ? "#33415f" : "#ffd66b"}" stroke="#f7fbff" stroke-width="1.5"/><rect x="60" y="116" width="14" height="26" fill="#5b2c1c"/>`
      + (on("wreath") ? `<circle cx="67" cy="124" r="4.5" fill="none" stroke="#2f9e57" stroke-width="3"/><circle cx="67" cy="128" r="1.4" fill="#e23b3b"/>` : "")
      + (on("smoke") ? `<g fill="#c9d3e6" opacity=".8"><circle cx="78" cy="66" r="4"/><circle cx="83" cy="57" r="5"/><circle cx="80" cy="46" r="6"/></g>` : "");
    case "farm": return grad("bgf", "#8fd3ff", "#e8f7ff") + (on("sun") ? sun(38, 32, 16) : "")
      + `<path d="M0 116 Q100 98 200 114 T300 110 V200 H0Z" fill="#a6d672"/><rect y="142" width="300" height="58" fill="#7cc35b"/>`
      + `<g stroke="#b98a52" stroke-width="3"><line x1="0" y1="126" x2="215" y2="126"/><line x1="0" y1="134" x2="215" y2="134"/>${Array.from({ length: 12 }, (_, i) => `<line x1="${8 + i * 18}" y1="120" x2="${8 + i * 18}" y2="140"/>`).join("")}</g>`
      + `<rect x="224" y="96" width="62" height="46" fill="#c8423a"/><path d="M218 98 L255 70 L292 98Z" fill="#8f2d27"/>`
      + (on("loft") ? `<circle cx="255" cy="86" r="6" fill="#ffe7a0" stroke="#fff" stroke-width="1.5"/>` : "")
      + `<rect x="243" y="112" width="24" height="30" fill="${alt("door") ? "#3f7be0" : "#f4efe6"}"/><path d="M243 112 L267 142 M267 112 L243 142" stroke="#8f2d27" stroke-width="2"/>`;
    case "beach": return grad("bgb", "#79c7f2", "#fff1cf") + (on("sun") ? sun(262, 30, 15) : "") + (on("cloud") ? cloud(120, 28, 1) : "")
      + `<rect y="92" width="300" height="42" fill="#2f9fd6"/><g stroke="#fff" stroke-width="1.5" opacity=".45" fill="none"><path d="M10 104 q8 -4 16 0 t16 0"/><path d="M150 118 q8 -4 16 0 t16 0"/><path d="M230 100 q8 -4 16 0 t16 0"/></g>`
      + `<path d="M0 134 Q100 124 200 136 T300 130 V200 H0Z" fill="#f2d79b"/>`
      + (on("palm") ? `<path d="M38 172 Q28 132 32 96" stroke="#8b5a2b" stroke-width="7" fill="none" stroke-linecap="round"/><g fill="#2f9e57"><path d="M32 96 Q12 86 4 102 Q18 92 32 98Z"/><path d="M32 96 Q52 84 62 100 Q46 92 32 98Z"/><path d="M32 96 Q24 74 8 78 Q24 82 32 98Z"/><path d="M32 96 Q42 74 58 76 Q42 82 32 98Z"/></g>` : "");
  }
  return "";
}
function spPic(pic, side, b, extra) {
  const items = pic[side], props = side === "A" ? pic.pA : pic.pB;
  const things = items.map(([e, x, y, s, f]) => f ? `<g transform="translate(${x} ${y}) scale(-1 1)"><text x="0" y="0" font-size="${s}">${e}</text></g>` : `<text x="${x}" y="${y}" font-size="${s}">${e}</text>`).join("");
  return `<svg class="spimg" data-spimg="${side}" viewBox="0 0 300 200">${spBG(pic.theme, props, pic.seed)}<g class="things" text-anchor="middle" dominant-baseline="central">${things}</g>${extra}</svg>`;
}
function spMiss(me) { // did I just tap a wrong spot? (shows a ✖ and pauses my taps for a moment)
  const L = S.last, b = S.board;
  if (!L || !L.miss || L.seat !== me || me < 0 || L.p !== b.p) return false;
  const k = S.sid + ":" + S.round + ":" + L.k;
  if (SPX.k !== k) { SPX = { k, until: Date.now() + 1100, mine: true }; buzz(120); setTimeout(() => { if (S && S.game === "spot") render(); }, 1120); }
  return Date.now() < SPX.until;
}
function boardSpot(c) {
  const b = S.board, rev = raceRev(), me = c.me, P = (rev || S.phase === "over") && b.prev ? b.prev : null;
  const pic = P ? P.pic : b.pic; if (!pic) return raceScore("differences");
  const found = P ? P.found : b.found;
  let marks = found.map(([x, y, r, by]) => `<circle class="spfound p${by}" cx="${x}" cy="${y}" r="${r}"/>`).join("");
  if (P) marks += P.missed.map(([x, y, r]) => `<circle class="spmissed" cx="${x}" cy="${y}" r="${r}"/>`).join("");
  const L = S.last;
  if (!P && spMiss(me)) marks += `<text class="spx" x="${L.miss[0]}" y="${L.miss[1]}" text-anchor="middle" dominant-baseline="central">✖</text>`;
  const locked = !P && Date.now() < SPX.until && SPX.mine;
  const T = GAMES.spot.THEMES[pic.theme];
  const skip = !P && S.phase === "play" && me >= 0 ? `<button class="btn alt small spskip" data-act="spskip" ${b.skip[me] || pending ? "disabled" : ""}>${b.skip[me] ? "⏳ Waiting to skip…" : b.skip[1 - me] ? `🤷 Skip this picture (${opp(me)} wants to)` : "🤷 We're stuck: skip this picture"}</button>` : "";
  return `<div class="hmcat"><span>${T.ic} ${T.name} · picture ${(P ? P.p : b.p) + 1} of ${b.total}</span><span class="mut">${P ? "" : `${b.left} left`}</span></div>
    <div class="spwrap ${locked ? "lock" : ""} ${b.kids ? "kids" : ""}">${spPic(pic, "A", b, marks)}${spPic(pic, "B", b, marks)}</div>
    ${raceScore("differences")}${skip}`;
}
function spotTap(e, svg) {
  const me = mySeat(), b = S.board; if (me < 0 || S.phase !== "play" || pending || raceRev() || !b.pic || (SPX.mine && Date.now() < SPX.until)) return;
  const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 300, y = (e.clientY - r.top) / r.height * 200;
  myMove({ sp: [Math.round(x * 10) / 10, Math.round(y * 10) / 10], p: b.p });
}
window.addEventListener("pointerdown", e => {
  if (!S || !e.target.closest) return;
  if (S.game === "snap") { const t = e.target.closest("[data-sn]"); if (t) { e.preventDefault(); snapTap(Number(t.dataset.sn), t.dataset.snc); } return; }
  if (S.game === "spot") { const t = e.target.closest("[data-spimg]"); if (t) { e.preventDefault(); spotTap(e, t); } }
});

// ===== TAPS =====
app.addEventListener("click", e => {
  const el = e.target.closest("[data-usepack],[data-pickpack],[data-suggest],[data-act],[data-mv],[data-fire],[data-rps],[data-tt],[data-wiask],[data-wiguess],[data-deck],[data-setdeck],[data-pickgame],[data-setgame],[data-level],[data-setlevel],[data-kick],[data-key],[data-cwclue],[data-cwcell],[data-kids],[data-setkids],[data-flag]");
  if (!el) return;
  const d = el.dataset;
  if (d.usepack != null || d.pickpack) {
    if (d.pickpack) PREF.pack = d.pickpack; else PREF.usePack = d.usepack === "1";
    savePref();
    if (S && (MODE === "host" || MODE === "cpu")) { S.opts = packOpts(Object.assign({}, S.opts)); if (S.phase === "over") nextRound(); return commit(); }
    return render();
  }
  if (d.suggest) { if (MODE === "guest" && T) { T.send({ t: "suggest", pid: ME.id, game: d.suggest }); SUGGEST = false; toast(`Suggested ${GAMES[d.suggest].name} to ${nameOf(S.host)}`); render(); } return; }
  if (d.mv != null) return myMove(Number(d.mv));
  if (d.flag != null) { if (!raceRev()) myMove({ fq: Number(d.flag), n: S.board.n }); return; }
  if (d.fire != null) return myMove({ fire: Number(d.fire) });
  if (d.rps) return myMove(d.rps);
  if (d.tt != null) return myMove(Number(d.tt));
  if (d.key) return wordKey(d.key);
  if (d.cwclue != null) { CW.sel = Number(d.cwclue); CW.typed = []; return render(); }
  if (d.cwcell != null) return cwTapCell(Number(d.cwcell));
  if (d.kids != null) { PREF.kids = d.kids === "1"; savePref(); return renderHome(); }
  if (d.setkids != null) { if (MODE === "host" || MODE === "cpu") { PREF.kids = d.setkids === "1"; savePref(); S.opts = Object.assign({}, S.opts, { kids: PREF.kids }); if (S.phase === "over") nextRound(); commit(); } return; }
  if (d.wiask != null) { WI.guessing = false; return myMove({ ask: Number(d.wiask) }); }
  if (d.wiguess != null) { WI.guessing = false; return myMove({ guess: Number(d.wiguess) }); }
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
    case "screens1": PREF.screens = "one"; savePref(); return renderHome();
    case "screens2": PREF.screens = "two"; savePref(); return renderHome();
    case "pass": { const n2 = $("#nm2"); if (n2) { PREF.p2 = cleanName(n2.value); savePref(); } return startPass(); }
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
    case "tolobby": return toLobby();
    case "golfnext": GOLF.card = null; render(); return maybeCPU();
    case "golfhit": return golfHit();
    case "hmsolve": HM.solving = true; HM.typed = []; return render();
    case "hmcancel": HM.solving = false; HM.typed = []; return render();
    case "hmback": HM.typed.pop(); return render();
    case "hmcheck": return hmAnswer();
    case "cwcancel": CW.sel = null; CW.typed = []; return render();
    case "cwback": CW.typed.pop(); return render();
    case "cwcheck": return cwAnswer();
    case "cwpass": return myMove({ pass: true });
    case "spskip": {
      if (!S || S.game !== "spot" || !S.board.pic) return;
      const p = S.board.p; myMove({ skip: true, p });
      if (MODE === "cpu" && S.board.p === p && applyMove("cpu", { skip: true, p }, null)) { afterMove(); commit(); } // the computer always agrees
      return;
    }
    case "golfreset": GOLF.aim = null; drawGolf(); return golfHitUI();
    case "takesuggest": return takeSuggestion();
    case "nosuggest": if (MODE === "host" && S) { S.suggest = null; commit(); } return;
    case "opensuggest": SUGGEST = true; return render();
    case "closesuggest": SUGGEST = false; return render();
    case "games":
      if (MODE === "guest") { SUGGEST = true; return render(); }
      if (S.phase !== "play" || Date.now() - gamesArm < 3000) { gamesArm = 0; return toLobby(); }
      gamesArm = Date.now(); toast("Tap 🎮 Games again to stop this game and pick another"); return;
    case "cpugames": MODE = "home"; S = null; clearTimeout(cpuTimer); cpuTimer = null; return render();
    case "reconnect": heal(true); if (MODE === "guest") setTimeout(sendHello, 700); else setTimeout(sendState, 700); return;
    case "shuffle": DRAFT = { k: secKey(), ships: GAMES.bs.randomFleet() }; Snd.pick(); return render();
    case "ready": return myMove({ ships: draftFleet() });
    case "ttnext": TTSEEN = ttKey(); render(); return maybeCPU();
    case "wishuffle": { const n = wiCount(); let x; do { x = Math.floor(Math.random() * n); } while (x === WI.pick); WI.pick = x; Snd.pick(); return render(); }
    case "wiready": return myMove({ pick: WI.pick });
    case "wiguesson": WI.guessing = true; return render();
    case "hkview": PREF.hkView = hkSplit() ? "full" : "split"; savePref(); return render();
    case "wiguessoff": WI.guessing = false; return render();
    case "packload": return pkFile.click();
    case "packai": return packAI();
    case "packshare": return packShare();
  }
});
app.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.id === "jc") { e.target.blur(); app.querySelector('[data-act="joincode"]').click(); }
  else if (e.target.id === "nm") { const n2 = $("#nm2"); if (n2) n2.focus(); else { e.target.blur(); if (MODE === "join") app.querySelector('[data-act="join"]').click(); } }
  else if (e.target.id === "nm2") e.target.blur();
});
app.addEventListener("input", e => {
  if (e.target.id === "nm") { ME.name = cleanName(e.target.value); ls.set("h2h_name", ME.name); }
  if (e.target.id === "nm2") { PREF.p2 = cleanName(e.target.value); savePref(); }
  if (e.target.id === "jc") e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
});

// ===== START =====
// keep pictures saved on the phone so they appear instantly next time
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
// A pack shared into Head to Head from another app arrives via the service worker; load it as if it was picked
async function takeSharedPack() {
  if (!P.has("shared-pack") || !("caches" in window)) return;
  history.replaceState(null, "", location.pathname);
  try {
    const c = await caches.open("h2h-shared"), r = await c.match("shared-pack"); if (!r) return;
    const name = decodeURIComponent(r.headers.get("x-name") || "pack.json"), blob = await r.blob(); await c.delete("shared-pack");
    await loadPackFile(new File([blob], name, { type: "application/json" }));
  } catch (e) { }
}
PACKS.refreshList().finally(function boot() {
  setTimeout(takeSharedPack, 300);
  const j = (P.get("join") || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (j.length === 4) {
    joinCode = j;
    const saved = ls.get("h2h_host", null);
    if (saved && saved.S && saved.S.room === j && GAMES[saved.S.game] && Date.now() - saved.t < 3 * 3600e3) { startHosting(saved.S); return; } // the host scanned their own code
    MODE = ME.name ? "guest" : "join";
    if (MODE === "guest") return startJoining(j);
  }
  render();
});
