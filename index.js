const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: "/ws/socket.io",
  cors: { origin: "*" },
  maxHttpBufferSize: 5 * 1024 * 1024,
});

const waitingQueue = [];
const socketMap = new Map();

function tryPair() {
  while (waitingQueue.length >= 2) {
    const idA = waitingQueue.shift();
    const idB = waitingQueue.shift();
    const a = socketMap.get(idA);
    const b = socketMap.get(idB);
    if (!a || !b) {
      if (a) waitingQueue.unshift(idA);
      if (b) waitingQueue.unshift(idB);
      continue;
    }
    a.partner = idB;
    b.partner = idA;
    stats.totalChats++;
    a.socket.emit("paired", { partnerName: b.username, partnerGender: b.gender });
    b.socket.emit("paired", { partnerName: a.username, partnerGender: a.gender });
  }
}

const maleNames = ["Shadow","Blaze","Storm","Titan","Viper","Ghost","Falcon","Raven","Wolf","Phoenix","Cobra","Steel","Thunder","Ace","Bolt"];
const femaleNames = ["Luna","Aurora","Stella","Nova","Iris","Ember","Skye","Aria","Zara","Mira","Seren","Ivy","Nyx","Rose","Star"];

function randomName(gender) {
  const list = gender === "female" ? femaleNames : maleNames;
  return list[Math.floor(Math.random() * list.length)];
}

function randomOnline() {
  return Math.floor(Math.random() * 101) + 100;
}

io.on("connection", (socket) => {
  socketMap.set(socket.id, { socket, partner: null, username: "Stranger", gender: "male", chatType: "text" });

  socket.on("join", ({ gender, chatType, username }) => {
    const me = socketMap.get(socket.id);
    if (me) {
      me.gender = gender || "male";
      me.chatType = chatType || "text";
      me.username = (username && username.trim()) ? username.trim() : randomName(gender || "male");
    }
    if (!waitingQueue.includes(socket.id)) waitingQueue.push(socket.id);
    socket.emit("waiting", { username: me.username });
    tryPair();
  });

  socket.on("message", (data) => {
    const me = socketMap.get(socket.id);
    stats.totalMessages++;
    if (me && me.partner) {
      const partner = socketMap.get(me.partner);
      if (partner) partner.socket.emit("message", { text: data.text, type: "text" });
    }
  });

  socket.on("image", (data) => {
    const me = socketMap.get(socket.id);
    if (me && me.partner) {
      const partner = socketMap.get(me.partner);
      if (partner) partner.socket.emit("message", { image: data.image, type: "image" });
    }
  });

  socket.on("audio_msg", (data) => {
    const me = socketMap.get(socket.id);
    if (me && me.partner) {
      const partner = socketMap.get(me.partner);
      if (partner) partner.socket.emit("message", { audio: data.audio, type: "audio" });
    }
  });

  socket.on("typing", () => {
    const me = socketMap.get(socket.id);
    if (me && me.partner) {
      const partner = socketMap.get(me.partner);
      if (partner) partner.socket.emit("typing");
    }
  });

  socket.on("next", () => {
    const me = socketMap.get(socket.id);
    if (me && me.partner) {
      const partner = socketMap.get(me.partner);
      if (partner) {
        partner.partner = null;
        partner.socket.emit("partner_left");
        if (!waitingQueue.includes(me.partner)) waitingQueue.push(me.partner);
      }
      me.partner = null;
    }
    const idx = waitingQueue.indexOf(socket.id);
    if (idx > -1) waitingQueue.splice(idx, 1);
    if (!waitingQueue.includes(socket.id)) waitingQueue.push(socket.id);
    socket.emit("waiting", { username: me ? me.username : "Stranger" });
    tryPair();
  });

  socket.on("disconnect", () => {
    const me = socketMap.get(socket.id);
    if (me && me.partner) {
      const partner = socketMap.get(me.partner);
      if (partner) {
        partner.partner = null;
        partner.socket.emit("partner_left");
        if (!waitingQueue.includes(me.partner)) waitingQueue.push(me.partner);
        tryPair();
      }
    }
    const idx = waitingQueue.indexOf(socket.id);
    if (idx > -1) waitingQueue.splice(idx, 1);
    socketMap.delete(socket.id);
  });
});

// Stats tracking
const stats = {
  totalVisits: 0,
  todayVisits: 0,
  totalMessages: 0,
  totalChats: 0,
  lastReset: new Date().toDateString()
};

// Reset daily stats at midnight
setInterval(() => {
  const today = new Date().toDateString();
  if (stats.lastReset !== today) {
    stats.todayVisits = 0;
    stats.lastReset = today;
  }
}, 60000);

function getAdminStats() {
  const users = Array.from(socketMap.values());
  const activeUsers = users.filter(u => u.username !== "Stranger");
  const males = activeUsers.filter(u => u.gender === "male").length;
  const females = activeUsers.filter(u => u.gender === "female").length;
  const activeChats = users.filter(u => u.partner !== null).length / 2;
  const waiting = waitingQueue.length;
  return {
    totalOnline: socketMap.size,
    activeUsers: activeUsers.length,
    males, females,
    maleRatio: activeUsers.length ? Math.round(males/activeUsers.length*100) : 0,
    femaleRatio: activeUsers.length ? Math.round(females/activeUsers.length*100) : 0,
    activeChats: Math.floor(activeChats),
    waiting,
    totalVisits: stats.totalVisits,
    todayVisits: stats.todayVisits,
    totalMessages: stats.totalMessages,
    totalChats: stats.totalChats
  };
}

// Admin panel route - password protected
const ADMIN_PASS = "strangoo@admin2026";

app.get("/admin", (req, res) => {
  const pass = req.query.pass;
  if (pass !== ADMIN_PASS) {
    res.send(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0D0E1A;color:white;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:#1A1B35;border:1px solid rgba(124,58,237,0.3);border-radius:16px;padding:40px;width:300px;text-align:center}
h2{margin-bottom:24px;color:#9D5CFF}
input{width:100%;padding:12px;border:1px solid rgba(124,58,237,0.3);border-radius:10px;background:#0D0E1A;color:white;font-size:1rem;margin-bottom:16px;outline:none}
button{width:100%;padding:12px;background:linear-gradient(135deg,#7C3AED,#FF4D8D);border:none;border-radius:10px;color:white;font-size:1rem;font-weight:700;cursor:pointer}
</style>
</head>
<body>
<div class="box">
  <h2>🔐 Admin Login</h2>
  <form onsubmit="login(event)">
    <input type="password" id="p" placeholder="Enter admin password"/>
    <button type="submit">Login</button>
  </form>
</div>
<script>
function login(e) {
  e.preventDefault();
  window.location.href = '/admin?pass=' + document.getElementById('p').value;
}
</script>
</body>
</html>`);
    return;
  }

  const s = getAdminStats();
  res.send(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Strangoo Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0D0E1A;color:white;font-family:'Inter',sans-serif;padding:20px;min-height:100vh}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid rgba(124,58,237,0.2)}
.logo{font-size:1.3rem;font-weight:800;color:#9D5CFF}
.refresh{padding:8px 16px;background:rgba(124,58,237,0.2);border:1px solid rgba(124,58,237,0.3);border-radius:8px;color:#9D5CFF;cursor:pointer;font-size:0.82rem;font-weight:600}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.card{background:#1A1B35;border:1px solid rgba(124,58,237,0.2);border-radius:14px;padding:16px}
.card-label{font-size:0.72rem;color:#A0A3C4;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.card-value{font-size:1.8rem;font-weight:800}
.card-value.purple{color:#9D5CFF}
.card-value.blue{color:#4D79FF}
.card-value.pink{color:#FF4D8D}
.card-value.green{color:#22c55e}
.card-value.orange{color:#f59e0b}
.section{background:#1A1B35;border:1px solid rgba(124,58,237,0.2);border-radius:14px;padding:16px;margin-bottom:12px}
.section h3{font-size:0.85rem;color:#A0A3C4;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px}
.ratio-bar{height:12px;border-radius:6px;background:#0D0E1A;overflow:hidden;margin-bottom:8px}
.ratio-fill-m{height:100%;background:linear-gradient(90deg,#4D79FF,#7B9FFF);border-radius:6px;transition:width 0.5s}
.ratio-fill-f{height:100%;background:linear-gradient(90deg,#FF4D8D,#FF8CB4);border-radius:6px;transition:width 0.5s}
.ratio-labels{display:flex;justify-content:space-between;font-size:0.78rem}
.male-label{color:#4D79FF;font-weight:700}
.female-label{color:#FF4D8D;font-weight:700}
.stat-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
.stat-row:last-child{border-bottom:none}
.stat-name{font-size:0.82rem;color:#A0A3C4}
.stat-val{font-size:0.9rem;font-weight:700;color:white}
.live-dot{width:8px;height:8px;background:#22c55e;border-radius:50%;display:inline-block;animation:pulse 2s infinite;margin-right:6px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
</style>
</head>
<body>
<div class="header">
  <div class="logo">💬 Strangoo Admin</div>
  <button class="refresh" onclick="location.reload()">🔄 Refresh</button>
</div>

<div class="grid">
  <div class="card">
    <div class="card-label"><span class="live-dot"></span>Live Users</div>
    <div class="card-value green">${s.totalOnline}</div>
  </div>
  <div class="card">
    <div class="card-label">Active Chats</div>
    <div class="card-value purple">${s.activeChats}</div>
  </div>
  <div class="card">
    <div class="card-label">Today Visits</div>
    <div class="card-value blue">${s.todayVisits}</div>
  </div>
  <div class="card">
    <div class="card-label">Total Visits</div>
    <div class="card-value orange">${s.totalVisits}</div>
  </div>
</div>

<div class="section">
  <h3>👥 Male vs Female Ratio</h3>
  <div class="ratio-bar"><div class="ratio-fill-m" style="width:${s.maleRatio}%"></div></div>
  <div class="ratio-labels">
    <span class="male-label">♂ Male: ${s.males} (${s.maleRatio}%)</span>
    <span class="female-label">♀ Female: ${s.females} (${s.femaleRatio}%)</span>
  </div>
</div>

<div class="section">
  <h3>📊 Stats</h3>
  <div class="stat-row"><span class="stat-name">Waiting for partner</span><span class="stat-val">${s.waiting}</span></div>
  <div class="stat-row"><span class="stat-name">Total messages sent</span><span class="stat-val">${s.totalMessages}</span></div>
  <div class="stat-row"><span class="stat-name">Total chats started</span><span class="stat-val">${s.totalChats}</span></div>
  <div class="stat-row"><span class="stat-name">Active users (joined)</span><span class="stat-val">${s.activeUsers}</span></div>
</div>

<div style="text-align:center;color:#A0A3C4;font-size:0.72rem;margin-top:16px">
  Auto-refresh every 30s • Last updated: ${new Date().toLocaleTimeString('en-IN')}
</div>

<script>setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`);
});

app.get("/{*splat}", (req, res) => {
  stats.totalVisits++;
  stats.todayVisits++;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Strangoo - Meet New People Instantly</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<script src="/ws/socket.io/socket.io.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0D0E1A;
  --bg2:#13142A;
  --card:#1A1B35;
  --card2:#20214A;
  --purple:#7C3AED;
  --purple2:#9D5CFF;
  --pink:#FF4D8D;
  --blue:#4D79FF;
  --text:#FFFFFF;
  --text2:#A0A3C4;
  --border:rgba(124,58,237,0.25);
  --radius:14px;
}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--purple);border-radius:4px}

/* NAVBAR */
.navbar{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:rgba(13,14,26,0.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
.logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:1.1rem}
.logo-icon{width:30px;height:30px;background:linear-gradient(135deg,var(--purple),var(--purple2));border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:0.9rem}
.online-pill{display:flex;align-items:center;gap:5px;background:var(--card);border:1px solid var(--border);border-radius:50px;padding:5px 10px;font-size:0.75rem;font-weight:600;color:var(--text2)}
.online-dot{width:6px;height:6px;background:#22c55e;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.3)}}

/* HOME */
.home-screen{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 16px 80px;text-align:center}
.hero h1{font-size:clamp(1.8rem,7vw,2.8rem);font-weight:900;line-height:1.1;margin-bottom:8px;letter-spacing:-1px}
.hero h1 .grad{background:linear-gradient(135deg,var(--purple2),var(--pink));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{font-size:0.85rem;color:var(--text2);margin-bottom:20px;line-height:1.5}

/* CHAT TYPE */
.section-label{font-size:0.68rem;font-weight:700;letter-spacing:3px;color:var(--text2);text-transform:uppercase;margin-bottom:10px}
.chat-types{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:360px;margin:0 auto 16px}
.chat-type-btn{background:var(--card);border:2px solid var(--border);border-radius:var(--radius);padding:14px 10px;cursor:pointer;transition:all 0.3s;display:flex;flex-direction:column;align-items:center;gap:7px;font-family:'Inter',sans-serif}
.chat-type-btn:hover{border-color:var(--purple);background:var(--card2)}
.chat-type-btn.active{border-color:var(--purple2);background:var(--card2);box-shadow:0 0 16px rgba(124,58,237,0.3)}
.chat-type-icon{font-size:1.6rem;width:44px;height:44px;background:var(--card2);border-radius:10px;display:flex;align-items:center;justify-content:center}
.chat-type-btn.active .chat-type-icon{background:linear-gradient(135deg,var(--purple),var(--purple2))}
.chat-type-name{font-size:0.85rem;font-weight:700;color:var(--text)}
.chat-type-desc{font-size:0.7rem;color:var(--text2);text-align:center}

/* GENDER */
.gender-section{width:100%;max-width:360px;margin:0 auto 16px}
.gender-btns{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gender-btn{background:var(--card);border:2px solid var(--border);border-radius:var(--radius);padding:12px;cursor:pointer;transition:all 0.3s;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Inter',sans-serif;font-size:0.9rem;font-weight:700;color:var(--text)}
.gender-btn.male.active{border-color:var(--blue);background:rgba(77,121,255,0.1);box-shadow:0 0 16px rgba(77,121,255,0.2)}
.gender-btn.female.active{border-color:var(--pink);background:rgba(255,77,141,0.1);box-shadow:0 0 16px rgba(255,77,141,0.2)}
.gender-symbol{font-size:1.2rem}

/* START BTN */
.start-btn{width:100%;max-width:360px;padding:14px;border:none;border-radius:var(--radius);font-size:0.95rem;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;background:linear-gradient(135deg,var(--purple),var(--pink));color:white;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 24px rgba(124,58,237,0.4);transition:all 0.3s}
.start-btn:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(124,58,237,0.5)}

/* FEATURES BAR */
.features-bar{position:fixed;bottom:0;left:0;right:0;z-index:50;border-top:1px solid var(--border);padding:10px 16px;display:flex;justify-content:center;gap:20px;flex-wrap:wrap;background:var(--bg2)}
.feat{display:flex;align-items:center;gap:5px;font-size:0.72rem;color:var(--text2)}

/* WAITING */
.waiting-screen{display:none;position:fixed;inset:0;z-index:300;background:rgba(13,14,26,0.97);backdrop-filter:blur(20px);align-items:center;justify-content:center;flex-direction:column;gap:16px}
.waiting-screen.show{display:flex}
.waiting-ring{width:64px;height:64px;border-radius:50%;border:3px solid rgba(124,58,237,0.2);border-top:3px solid var(--purple2);animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.waiting-screen h3{font-size:1.1rem;font-weight:700}
.waiting-screen p{color:var(--text2);font-size:0.82rem}
.cancel-btn{padding:8px 20px;border:1px solid var(--border);border-radius:50px;background:transparent;cursor:pointer;font-weight:600;font-family:'Inter',sans-serif;font-size:0.82rem;color:var(--text2);transition:all 0.3s}
.cancel-btn:hover{border-color:var(--purple);color:var(--purple2)}

/* CHAT SCREEN */
.chat-screen{display:none;position:fixed;inset:0;z-index:200;flex-direction:column;background:var(--bg)}
.chat-screen.show{display:flex}
.chat-header{padding:8px 14px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.chat-user{display:flex;align-items:center;gap:9px}
.chat-avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:800;color:white;flex-shrink:0}
.chat-user-info h3{font-size:0.88rem;font-weight:700}
.chat-user-info p{font-size:0.7rem;color:var(--text2)}
.next-btn{display:flex;align-items:center;gap:5px;padding:7px 13px;border:1px solid var(--border);border-radius:50px;background:transparent;font-size:0.78rem;font-weight:600;cursor:pointer;transition:all 0.3s;color:var(--text2);font-family:'Inter',sans-serif}
.next-btn:hover{border-color:var(--purple);color:var(--purple2)}

/* MESSAGES */
.messages{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
.msg-wrap{display:flex;align-items:flex-end;gap:6px;animation:fadeIn 0.25s ease}
.msg-wrap.mine{flex-direction:row-reverse}
.msg-avatar{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:800;color:white;flex-shrink:0}
.msg-content{max-width:72%}
.msg-name{font-size:0.65rem;font-weight:600;color:var(--text2);margin-bottom:2px;padding:0 3px}
.msg-wrap.mine .msg-name{text-align:right}
.msg-bubble{padding:8px 12px;border-radius:14px;font-size:0.82rem;line-height:1.4;word-break:break-word}
.msg-wrap.mine .msg-bubble{background:linear-gradient(135deg,var(--purple),var(--purple2));color:white;border-bottom-right-radius:3px}
.msg-wrap.theirs .msg-bubble{background:var(--card);color:var(--text);border-bottom-left-radius:3px;border:1px solid var(--border)}
.msg-bubble img{max-width:160px;border-radius:8px;cursor:zoom-in;display:block;-webkit-user-select:none;user-select:none;pointer-events:none}
.msg-bubble img.viewable{pointer-events:auto}
.system-msg{text-align:center;color:var(--text2);font-size:0.72rem;font-style:italic;padding:2px 0}

/* AUDIO MESSAGE - WhatsApp style */
.audio-msg{display:flex;align-items:center;gap:8px;min-width:160px;max-width:200px}
.audio-play-btn{width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.9rem;flex-shrink:0;transition:all 0.2s}
.msg-wrap.mine .audio-play-btn{background:rgba(255,255,255,0.2);color:white}
.msg-wrap.theirs .audio-play-btn{background:var(--purple);color:white}
.audio-play-btn:hover{transform:scale(1.1)}
.audio-waveform{flex:1;display:flex;align-items:center;gap:2px;height:28px}
.audio-waveform span{width:3px;border-radius:3px;background:rgba(255,255,255,0.5);transition:background 0.2s}
.msg-wrap.theirs .audio-waveform span{background:rgba(160,163,196,0.5)}
.audio-waveform span.played{background:rgba(255,255,255,0.9)}
.msg-wrap.theirs .audio-waveform span.played{background:var(--purple2)}
.audio-duration{font-size:0.68rem;color:rgba(255,255,255,0.7);flex-shrink:0}
.msg-wrap.theirs .audio-duration{color:var(--text2)}

/* TYPING */
.typing-indicator{display:none;align-items:center;gap:6px;padding:0 10px 5px;flex-shrink:0}
.typing-indicator.show{display:flex}
.typing-dots{display:flex;gap:3px;background:var(--card);padding:7px 10px;border-radius:14px;border-bottom-left-radius:3px;border:1px solid var(--border)}
.typing-dots span{width:4px;height:4px;background:var(--purple2);border-radius:50%;animation:bounce 1.2s infinite}
.typing-dots span:nth-child(2){animation-delay:0.2s}
.typing-dots span:nth-child(3){animation-delay:0.4s}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}

/* RECORDING BAR */
.recording-bar{display:none;align-items:center;gap:10px;padding:10px 14px;padding-bottom:max(10px,env(safe-area-inset-bottom));background:var(--bg2);border-top:1px solid var(--border);flex-shrink:0}
.recording-bar.show{display:flex}
.rec-mic{font-size:1.2rem;animation:recPulse2 1s infinite}
@keyframes recPulse2{0%,100%{opacity:1}50%{opacity:0.4}}
.rec-timer{font-size:1rem;font-weight:700;color:#ff4444;min-width:36px}
.rec-slide{flex:1;font-size:0.78rem;color:var(--text2);text-align:center}
.rec-cancel{width:32px;height:32px;border-radius:50%;background:rgba(255,68,68,0.15);border:1px solid rgba(255,68,68,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.85rem;color:#ff4444;flex-shrink:0}

/* INPUT BAR */
.input-bar{padding:8px 10px;padding-bottom:max(8px,env(safe-area-inset-bottom));background:var(--bg2);border-top:1px solid var(--border);display:flex;align-items:center;gap:6px;flex-shrink:0}
.msg-input{flex:1;border:1px solid var(--border);border-radius:50px;padding:9px 14px;font-size:0.82rem;font-family:'Inter',sans-serif;outline:none;background:var(--card);color:var(--text);transition:border 0.3s;min-width:0}
.msg-input::placeholder{color:var(--text2)}
.msg-input:focus{border-color:var(--purple)}
.icon-btn{width:36px;height:36px;border-radius:50%;border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.3s;flex-shrink:0;background:var(--card);font-size:0.9rem}
.icon-btn:hover{border-color:var(--purple);background:var(--card2)}
.send-btn{width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.3s;flex-shrink:0;background:linear-gradient(135deg,var(--purple),var(--purple2));color:white;font-size:0.9rem}
.send-btn:hover{transform:scale(1.1)}
.record-btn{width:36px;height:36px;border-radius:50%;border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--card);font-size:0.9rem;transition:all 0.3s;-webkit-user-select:none;user-select:none}
.record-btn.recording{background:linear-gradient(135deg,#ff4444,#ff6666);border-color:#ff4444;animation:recPulse 1s infinite}
@keyframes recPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,68,68,0.4)}50%{box-shadow:0 0 0 6px rgba(255,68,68,0)}}

/* LIGHTBOX */
#lightbox{position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.92);display:none;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(8px)}
#lightbox.open{display:flex}
#lightbox img{max-width:92vw;max-height:88vh;border-radius:10px;object-fit:contain;pointer-events:none}

@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>

<!-- NAVBAR -->
<nav class="navbar">
  <div class="logo">
    <div class="logo-icon">💬</div>
    Strangoo
  </div>
  <div class="online-pill">
    <div class="online-dot"></div>
    <span id="onlineCount">142</span> online
  </div>
</nav>

<!-- HOME SCREEN -->
<div class="home-screen" id="homeScreen">
  <div class="hero" style="width:100%;max-width:360px">
    <h1>Meet New People<br><span class="grad">Instantly</span></h1>
    <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);border-radius:50px;padding:5px 14px;font-size:0.75rem;font-weight:600;color:#9D5CFF;margin-bottom:10px">✅ No Sign Up Required</div>
    <p>Anonymous text & audio chat<br>with strangers worldwide.</p>

    <div class="section-label">Choose Chat Type</div>
    <div class="chat-types">
      <button class="chat-type-btn active" id="textBtn" onclick="selectChatType('text')">
        <div class="chat-type-icon">💬</div>
        <div class="chat-type-name">Text Chat</div>
        <div class="chat-type-desc">Start a text conversation</div>
      </button>
      <button class="chat-type-btn" id="audioBtn" onclick="selectChatType('audio')">
        <div class="chat-type-icon">🎧</div>
        <div class="chat-type-name">Audio Chat</div>
        <div class="chat-type-desc">Talk with voice anonymously</div>
      </button>
    </div>

    <div class="gender-section">
      <div class="section-label">I Am</div>
      <div class="gender-btns">
        <button class="gender-btn male active" id="maleBtn" onclick="selectGender('male')">
          <span class="gender-symbol">♂</span> Male
        </button>
        <button class="gender-btn female" id="femaleBtn" onclick="selectGender('female')">
          <span class="gender-symbol">♀</span> Female
        </button>
      </div>
    </div>

    <div style="width:100%;max-width:360px;margin-bottom:14px">
      <div class="section-label" style="margin-bottom:8px">Your Name</div>
      <input id="nameInput" type="text" maxlength="20" placeholder="Enter your display name..." style="width:100%;border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;font-size:0.88rem;font-family:'Inter',sans-serif;outline:none;background:var(--card);color:var(--text);transition:border 0.3s" onfocus="this.style.borderColor='var(--purple)'" onblur="this.style.borderColor='var(--border)'" onkeydown="if(event.key==='Enter') startChat()"/>
    </div>

    <button class="start-btn" onclick="startChat()">
      Start Chatting ⚡
    </button>
  </div>
</div>

<!-- FEATURES BAR -->
<div class="features-bar" id="featBar">
  <div class="feat">🎭 100% Anonymous</div>
  <div class="feat">⚡ Instant Matching</div>
  <div class="feat">🌍 Worldwide</div>
  <div class="feat">🛡️ Safe & Secure</div>
</div>

<!-- WAITING SCREEN -->
<div class="waiting-screen" id="waitingScreen">
  <div class="waiting-ring"></div>
  <h3>Finding a stranger...</h3>
  <p id="waitingName"></p>
  <button class="cancel-btn" onclick="cancelWait()">Cancel</button>
</div>

<!-- CHAT SCREEN -->
<div class="chat-screen" id="chatScreen">
  <div class="chat-header">
    <div class="chat-user">
      <div class="chat-avatar" id="partnerAvatar">?</div>
      <div class="chat-user-info">
        <h3 id="partnerName">Stranger</h3>
        <p id="chatSubtitle">Connected</p>
      </div>
    </div>
    <button class="next-btn" onclick="nextChat()">⇄ Next</button>
  </div>
  <div class="messages" id="messages"></div>
  <div class="typing-indicator" id="typingIndicator">
    <div class="msg-avatar" id="typingAvatar" style="width:22px;height:22px;font-size:0.6rem">?</div>
    <div class="typing-dots"><span></span><span></span><span></span></div>
  </div>
  <div class="input-bar" id="inputBar">
    <input class="msg-input" id="msgInput" placeholder="Type a message..." onkeydown="handleKey(event)" oninput="handleTyping()"/>
    <button class="icon-btn" onclick="document.getElementById('imgInput').click()" title="Image">🖼</button>
    <input type="file" id="imgInput" accept="image/*" style="display:none" onchange="sendImage(event)"/>
    <button class="record-btn" id="recordBtn" 
      onmousedown="startRecording(event)" 
      onmouseup="stopRecording(event)" 
      onmouseleave="stopRecording(event)"
      ontouchstart="startRecording(event)" 
      ontouchend="stopRecording(event)"
      ontouchmove="handleRecordMove(event)"
      title="Hold to record">🎤</button>
    <button class="send-btn" onclick="sendMessage()">➤</button>
  </div>

  <!-- RECORDING BAR - WhatsApp style -->
  <div class="recording-bar" id="recordingBar">
    <div class="rec-mic">🎤</div>
    <div class="rec-timer" id="recTimer">0:00</div>
    <div class="rec-slide">← Slide to cancel</div>
    <div class="rec-cancel" onclick="cancelRecording()">✕</div>
  </div>
</div>

<!-- LIGHTBOX -->
<div id="lightbox" onclick="closeLightbox()"><img id="lbImg" src="" alt="" style="-webkit-user-select:none;user-select:none;-webkit-touch-callout:none" oncontextmenu="return false"/></div>

<script>
const socket = io({ path: '/ws/socket.io' });
let myGender = 'male';
let myChatType = 'text';
let myName = '';
let partnerGender = 'male';
let partnerUsername = '';
let typingTimer = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Fake online count between 100-200
let fakeOnline = Math.floor(Math.random() * 101) + 100;
document.getElementById('onlineCount').textContent = fakeOnline;
setInterval(() => {
  fakeOnline += Math.floor(Math.random() * 7) - 3;
  if (fakeOnline < 100) fakeOnline = 100;
  if (fakeOnline > 200) fakeOnline = 200;
  document.getElementById('onlineCount').textContent = fakeOnline;
}, 8000);

socket.on('waiting', ({ username }) => {
  myName = username;
  document.getElementById('waitingScreen').classList.add('show');
  document.getElementById('chatScreen').classList.remove('show');
  document.getElementById('waitingName').textContent = 'You are ' + username;
});

socket.on('paired', ({ partnerName, partnerGender: pg }) => {
  partnerUsername = partnerName;
  partnerGender = pg;
  document.getElementById('waitingScreen').classList.remove('show');
  document.getElementById('chatScreen').classList.add('show');
  document.getElementById('messages').innerHTML = '';

  const pAvatar = document.getElementById('partnerAvatar');
  const tAvatar = document.getElementById('typingAvatar');
  pAvatar.textContent = partnerName.charAt(0).toUpperCase();
  tAvatar.textContent = partnerName.charAt(0).toUpperCase();
  const color = pg === 'female' ? 'linear-gradient(135deg,#FF4D8D,#FF8CB4)' : 'linear-gradient(135deg,#4D79FF,#7B9FFF)';
  pAvatar.style.background = color;
  tAvatar.style.background = color;
  document.getElementById('partnerName').textContent = partnerName;
  document.getElementById('chatSubtitle').textContent = 'Chatting with ' + partnerName;
  addSystemMsg('Connected with ' + partnerName + ' 🎉');
});

socket.on('message', ({ text, image, audio, type }) => {
  clearTimeout(typingTimer);
  document.getElementById('typingIndicator').classList.remove('show');
  if (type === 'image') addMsg(null, image, null, false);
  else if (type === 'audio') addMsg(null, null, audio, false);
  else addMsg(text, null, null, false);
});

socket.on('typing', () => {
  document.getElementById('typingIndicator').classList.add('show');
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => document.getElementById('typingIndicator').classList.remove('show'), 2000);
});

socket.on('partner_left', () => {
  document.getElementById('typingIndicator').classList.remove('show');
  addSystemMsg('Stranger has left. Click Next to find someone new.');
});

function selectChatType(type) {
  myChatType = type;
  document.getElementById('textBtn').classList.toggle('active', type === 'text');
  document.getElementById('audioBtn').classList.toggle('active', type === 'audio');
}

function selectGender(gender) {
  myGender = gender;
  document.getElementById('maleBtn').classList.toggle('active', gender === 'male');
  document.getElementById('femaleBtn').classList.toggle('active', gender === 'female');
}

function startChat() {
  const nameInput = document.getElementById('nameInput').value.trim();
  myName = nameInput || (myGender === 'female' ? 'Angel' : 'Stranger');
  document.getElementById('homeScreen').style.display = 'none';
  document.getElementById('featBar').style.display = 'none';
  socket.emit('join', { gender: myGender, chatType: myChatType, username: myName });
}

function cancelWait() {
  document.getElementById('waitingScreen').classList.remove('show');
  document.getElementById('homeScreen').style.display = 'flex';
  document.getElementById('featBar').style.display = 'flex';
}

function nextChat() {
  document.getElementById('typingIndicator').classList.remove('show');
  socket.emit('next');
}

function sendMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('message', { text });
  addMsg(text, null, null, true);
  input.value = '';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}
function handleTyping() { socket.emit('typing'); }

function sendImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Compress image before sending
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let w = img.width, h = img.height;
    const MAX = 800;
    if (w > MAX || h > MAX) {
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else { w = Math.round(w * MAX / h); h = MAX; }
    }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const compressed = canvas.toDataURL('image/jpeg', 0.7);
    URL.revokeObjectURL(url);
    socket.emit('image', { image: compressed });
    addMsg(null, compressed, null, true);
  };
  img.src = url;
  e.target.value = '';
}

let recInterval = null;
let recSeconds = 0;
let recStartX = 0;
let cancelled = false;

async function startRecording(e) {
  if (e) e.preventDefault();
  if (isRecording) return;
  cancelled = false;
  recStartX = e.touches ? e.touches[0].clientX : e.clientX;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = ev => audioChunks.push(ev.data);
    mediaRecorder.start();
    isRecording = true;

    document.getElementById('inputBar').style.display = 'none';
    document.getElementById('recordingBar').classList.add('show');

    recSeconds = 0;
    document.getElementById('recTimer').textContent = '0:00';
    recInterval = setInterval(() => {
      recSeconds++;
      const m = Math.floor(recSeconds / 60);
      const s = recSeconds % 60;
      document.getElementById('recTimer').textContent = m + ':' + String(s).padStart(2,'0');
    }, 1000);

  } catch(err) { alert('Microphone access denied!'); }
}

function handleRecordMove(e) {
  if (!isRecording) return;
  const currentX = e.touches ? e.touches[0].clientX : e.clientX;
  const diff = recStartX - currentX;
  // If slid left more than 80px — cancel
  if (diff > 80) {
    cancelled = true;
    cancelRecording();
  }
}

function stopRecording(e) {
  if (e) e.preventDefault();
  if (!isRecording || !mediaRecorder) return;
  if (cancelled) return;
  clearInterval(recInterval);

  mediaRecorder.onstop = () => {
    if (!cancelled) {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit('audio_msg', { audio: reader.result });
        addMsg(null, null, reader.result, true);
      };
      reader.readAsDataURL(blob);
    }
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  };
  mediaRecorder.stop();
  isRecording = false;

  document.getElementById('recordingBar').classList.remove('show');
  document.getElementById('inputBar').style.display = 'flex';
}

function cancelRecording() {
  if (!isRecording || !mediaRecorder) return;
  clearInterval(recInterval);
  cancelled = true;
  mediaRecorder.onstop = () => {
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  };
  mediaRecorder.stop();
  isRecording = false;
  audioChunks = [];

  document.getElementById('recordingBar').classList.remove('show');
  document.getElementById('inputBar').style.display = 'flex';
}

function addMsg(text, image, audio, isMine) {
  const msgs = document.getElementById('messages');
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap ' + (isMine ? 'mine' : 'theirs');

  const name = isMine ? myName : partnerUsername;
  const gender = isMine ? myGender : partnerGender;
  const color = gender === 'female' ? 'linear-gradient(135deg,#FF4D8D,#FF8CB4)' : 'linear-gradient(135deg,#4D79FF,#7B9FFF)';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.style.background = color;
  avatar.textContent = name.charAt(0).toUpperCase();

  const content = document.createElement('div');
  content.className = 'msg-content';

  const nameEl = document.createElement('div');
  nameEl.className = 'msg-name';
  nameEl.textContent = name;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.style.cssText = '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none';
    img.addEventListener('click', () => openLightbox(image));
    img.addEventListener('touchend', (e) => { e.preventDefault(); openLightbox(image); });
    bubble.appendChild(img);
  } else if (audio) {
    // WhatsApp style audio
    const audioWrap = document.createElement('div');
    audioWrap.className = 'audio-msg';

    const playBtn = document.createElement('button');
    playBtn.className = 'audio-play-btn';
    playBtn.textContent = '▶';

    const waveform = document.createElement('div');
    waveform.className = 'audio-waveform';
    const heights = [8,12,16,20,24,20,16,24,18,14,20,16,12,18,22,16,12,8,14,20];
    heights.forEach(h => {
      const bar = document.createElement('span');
      bar.style.height = h + 'px';
      waveform.appendChild(bar);
    });

    const duration = document.createElement('span');
    duration.className = 'audio-duration';
    duration.textContent = '0:00';

    const audioEl = new Audio(audio);
    let playing = false;
    let durationSet = false;

    audioEl.onloadedmetadata = () => {
      if (!durationSet) {
        const d = Math.round(audioEl.duration);
        duration.textContent = '0:' + String(d).padStart(2,'0');
        durationSet = true;
      }
    };

    audioEl.ontimeupdate = () => {
      const pct = audioEl.currentTime / (audioEl.duration || 1);
      const bars = waveform.querySelectorAll('span');
      bars.forEach((b, i) => {
        b.classList.toggle('played', i / bars.length < pct);
      });
      const rem = Math.round(audioEl.duration - audioEl.currentTime);
      duration.textContent = '0:' + String(Math.max(0,rem)).padStart(2,'0');
    };

    audioEl.onended = () => {
      playing = false;
      playBtn.textContent = '▶';
      waveform.querySelectorAll('span').forEach(b => b.classList.remove('played'));
    };

    playBtn.onclick = () => {
      if (playing) {
        audioEl.pause();
        playBtn.textContent = '▶';
      } else {
        audioEl.play();
        playBtn.textContent = '⏸';
      }
      playing = !playing;
    };

    audioWrap.appendChild(playBtn);
    audioWrap.appendChild(waveform);
    audioWrap.appendChild(duration);
    bubble.appendChild(audioWrap);
  } else {
    bubble.textContent = text;
  }

  content.appendChild(nameEl);
  content.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(content);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function addSystemMsg(text) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function openLightbox(src) {
  document.getElementById('lbImg').src = src;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

// Disable right click on images
document.addEventListener('contextmenu', e => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});
// Disable drag on images
document.addEventListener('dragstart', e => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Strangoo running on port " + PORT));
