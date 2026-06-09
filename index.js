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

// ── Socket pairing logic ─────────────────────────────────────────────────────

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
    a.partnerId = idB;
    b.partnerId = idA;
    a.emit("paired", { partnerGender: b.gender, partnerUsername: b.username });
    b.emit("paired", { partnerGender: a.gender, partnerUsername: a.username });
  }
}

function enqueue(socket) {
  if (!waitingQueue.includes(socket.id)) {
    waitingQueue.push(socket.id);
    socket.emit("waiting");
  }
}

function disconnectPartner(socket) {
  const pid = socket.partnerId;
  if (pid) {
    const p = socketMap.get(pid);
    if (p) { p.partnerId = undefined; p.emit("partner_left"); }
    socket.partnerId = undefined;
  }
}

io.on("connection", (socket) => {
  socketMap.set(socket.id, socket);
  io.emit("online_count", socketMap.size);

  socket.on("set_profile", ({ gender, username }) => {
    if (gender !== "male" && gender !== "female") return;
    if (typeof username !== "string" || username.length > 30) return;
    socket.gender = gender;
    socket.username = username.trim() || "Stranger";
    enqueue(socket);
    tryPair();
  });

  socket.on("message", (payload) => {
    const partner = socketMap.get(socket.partnerId);
    if (!partner) return;
    if (payload.type === "text") {
      if (typeof payload.text !== "string" || !payload.text.trim()) return;
      const t = payload.text.slice(0, 500);
      partner.emit("message", { type: "text", text: t, fromSelf: false });
      socket.emit("message", { type: "text", text: t, fromSelf: true });
    } else if (payload.type === "image") {
      if (typeof payload.dataUrl !== "string" || !payload.dataUrl.startsWith("data:image/")) return;
      if (payload.dataUrl.length > 4 * 1024 * 1024) return;
      partner.emit("message", { type: "image", dataUrl: payload.dataUrl, fromSelf: false });
      socket.emit("message", { type: "image", dataUrl: payload.dataUrl, fromSelf: true });
    }
  });

  socket.on("next", () => { disconnectPartner(socket); enqueue(socket); tryPair(); });

  socket.on("disconnect", () => {
    socketMap.delete(socket.id);
    const idx = waitingQueue.indexOf(socket.id);
    if (idx !== -1) waitingQueue.splice(idx, 1);
    disconnectPartner(socket);
    io.emit("online_count", socketMap.size);
  });
});

// ── HTML ─────────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Strangoo</title>
<script src="/ws/socket.io/socket.io.js"></script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#120d2e;color:#fff;overflow:hidden}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;background:linear-gradient(135deg,#1a0d3d 0%,#0d1b4b 50%,#1a1040 100%)}

/* Particles */
#particles{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0}
.particle{position:absolute;bottom:-60px;border-radius:50%;opacity:0;animation:floatUp linear infinite}
@keyframes floatUp{
  0%{transform:translateY(0) translateX(0) scale(1);opacity:0}
  10%{opacity:.7}
  90%{opacity:.3}
  100%{transform:translateY(-110vh) translateX(var(--sway)) scale(var(--scale-end));opacity:0}
}
.heart{border-radius:0;background:none!important}
.heart::before,.heart::after{content:'';position:absolute;width:100%;height:100%;background:var(--color);border-radius:50%}
.heart::before{top:-50%;left:0}
.heart::after{top:0;left:50%}
.heart{transform:rotate(-45deg)}

/* Screens */
.screen{position:relative;z-index:1;display:none;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100dvh;padding:24px}
.screen.active{display:flex}

/* Cards */
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:32px;width:100%;max-width:380px;backdrop-filter:blur(12px)}

/* Gender select */
.logo{font-size:2rem;font-weight:800;letter-spacing:-.5px;margin-bottom:6px}
.tagline{color:rgba(255,255,255,.5);font-size:.9rem;margin-bottom:32px}
.gender-label{color:rgba(255,255,255,.5);font-size:.7rem;letter-spacing:.15em;text-transform:uppercase;margin-bottom:16px;text-align:center}
.gender-btns{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.gender-btn{border:none;border-radius:14px;padding:28px 12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:12px;font-size:1rem;font-weight:600;transition:transform .15s,box-shadow .15s}
.gender-btn:hover{transform:translateY(-2px)}
.gender-btn.male{background:rgba(59,130,246,.18);color:#60a5fa}
.gender-btn.female{background:rgba(236,72,153,.18);color:#f472b6}
.gender-btn .avatar{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.gender-btn.male .avatar{background:linear-gradient(135deg,#3b82f6,#6366f1)}
.gender-btn.female .avatar{background:linear-gradient(135deg,#ec4899,#f43f5e)}
.anon{color:rgba(255,255,255,.3);font-size:.78rem;margin-top:20px;text-align:center}

/* Name entry */
.avatar-lg{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
.screen-title{font-size:1.4rem;font-weight:700;margin-bottom:6px;text-align:center}
.screen-sub{color:rgba(255,255,255,.45);font-size:.85rem;margin-bottom:24px;text-align:center}
input[type=text]{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:13px 16px;color:#fff;font-size:1rem;outline:none;transition:border-color .2s}
input[type=text]::placeholder{color:rgba(255,255,255,.3)}
input[type=text]:focus{border-color:var(--theme,.6em)}
.btn{width:100%;border:none;border-radius:12px;padding:14px;font-size:1rem;font-weight:600;cursor:pointer;transition:opacity .15s,transform .15s;margin-top:12px}
.btn:hover{opacity:.9;transform:translateY(-1px)}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
.btn-primary{background:linear-gradient(135deg,var(--theme,#3b82f6),var(--theme2,#6366f1));color:#fff}

/* Waiting */
.spinner{width:52px;height:52px;border:3px solid rgba(255,255,255,.15);border-top-color:var(--theme,#3b82f6);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px}
@keyframes spin{to{transform:rotate(360deg)}}
.wait-title{font-size:1.3rem;font-weight:700;margin-bottom:8px;text-align:center}
.wait-sub{color:rgba(255,255,255,.45);font-size:.85rem;text-align:center}
.btn-outline{background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7)}
.btn-outline:hover{background:rgba(255,255,255,.06)}

/* Chat */
#screen-chat{padding:0;justify-content:flex-start}
.chat-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(0,0,0,.25);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;width:100%}
.header-left{display:flex;align-items:center;gap:10px;min-width:0}
.avatar-sm{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.header-names{min-width:0}
.my-name{font-weight:700;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.partner-name{font-size:.75rem;color:rgba(255,255,255,.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.header-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
.avatar-partner{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.btn-next{border:none;border-radius:10px;padding:8px 16px;font-size:.85rem;font-weight:600;cursor:pointer;background:rgba(255,255,255,.1);color:#fff;transition:background .15s}
.btn-next:hover{background:rgba(255,255,255,.18)}

.messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;width:100%}
.messages::-webkit-scrollbar{width:4px}
.messages::-webkit-scrollbar-track{background:transparent}
.messages::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:2px}

.msg-row{display:flex;align-items:flex-end;gap:8px}
.msg-row.self{flex-direction:row-reverse}
.msg-bubble-wrap{display:flex;flex-direction:column;max-width:72%;gap:3px}
.msg-row.self .msg-bubble-wrap{align-items:flex-end}
.msg-sender{font-size:.7rem;font-weight:600;color:rgba(255,255,255,.4);padding:0 4px}
.msg-bubble{padding:11px 14px;border-radius:18px;font-size:.93rem;line-height:1.45;word-break:break-word}
.msg-bubble.self{border-bottom-right-radius:5px;color:#fff}
.msg-bubble.stranger{border-bottom-left-radius:5px;background:rgba(255,255,255,.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.18);color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.msg-bubble img{max-width:220px;max-height:220px;border-radius:12px;display:block;object-fit:contain}
.msg-system{text-align:center;font-size:.75rem;color:rgba(255,255,255,.35);padding:4px 0;font-style:italic}

.chat-input-area{padding:12px 16px;background:rgba(0,0,0,.2);backdrop-filter:blur(12px);border-top:1px solid rgba(255,255,255,.08);display:flex;align-items:flex-end;gap:10px;flex-shrink:0;width:100%}
.img-preview-wrap{position:relative;display:inline-block;margin-bottom:8px}
.img-preview-wrap img{max-height:80px;border-radius:10px;display:block}
.img-preview-wrap .remove-img{position:absolute;top:-6px;right:-6px;width:20px;height:20px;background:#ef4444;border:none;border-radius:50%;color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.input-col{flex:1;display:flex;flex-direction:column;gap:0}
.chat-input{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:10px 16px;color:#fff;font-size:.93rem;outline:none;width:100%;resize:none;font-family:inherit;max-height:120px;line-height:1.4;transition:border-color .2s}
.chat-input:focus{border-color:rgba(255,255,255,.3)}
.chat-input::placeholder{color:rgba(255,255,255,.3)}
.icon-btn{width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.08);color:rgba(255,255,255,.7);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;flex-shrink:0}
.icon-btn:hover{background:rgba(255,255,255,.15)}
.send-btn{width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;transition:opacity .15s}
.send-btn:disabled{opacity:.35;cursor:not-allowed}

/* Partner left */
.left-icon{width:64px;height:64px;background:rgba(239,68,68,.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:1.6rem}
</style>
</head>
<body>

<div id="particles"></div>

<!-- Gender Select -->
<div class="screen active" id="screen-gender">
  <div style="text-align:center;margin-bottom:28px">
    <div class="logo">Strangoo</div>
    <div class="tagline">Talk to strangers around the world</div>
  </div>
  <div class="card">
    <div class="gender-label">I am a</div>
    <div class="gender-btns">
      <button class="gender-btn male" onclick="selectGender('male')">
        <div class="avatar">${personIcon()}</div>
        <span>Male</span>
      </button>
      <button class="gender-btn female" onclick="selectGender('female')">
        <div class="avatar">${personIcon()}</div>
        <span>Female</span>
      </button>
    </div>
  </div>
  <div class="anon">Anonymous · No account needed</div>
</div>

<!-- Name Entry -->
<div class="screen" id="screen-name">
  <div class="card">
    <div id="name-avatar" class="avatar-lg"></div>
    <div class="screen-title">What's your name?</div>
    <div class="screen-sub">You can use any name you like</div>
    <input type="text" id="name-input" maxlength="20" placeholder="Enter your display name"
      oninput="document.getElementById('name-continue').disabled=!this.value.trim()"
      onkeydown="if(event.key==='Enter')submitName()"/>
    <button class="btn btn-primary" id="name-continue" onclick="submitName()" disabled>Continue</button>
  </div>
</div>

<!-- Waiting -->
<div class="screen" id="screen-waiting">
  <div style="text-align:center">
    <div class="spinner" id="wait-spinner"></div>
    <div class="wait-title">Finding a stranger…</div>
    <div class="wait-sub" style="margin-bottom:28px">Connecting you with someone new</div>
    <button class="btn btn-outline" style="max-width:200px" onclick="cancelSearch()">Cancel</button>
  </div>
</div>

<!-- Chat -->
<div class="screen" id="screen-chat">
  <div class="chat-header">
    <div class="header-left">
      <div class="avatar-sm" id="my-avatar-header"></div>
      <div class="header-names">
        <div class="my-name" id="header-my-name"></div>
        <div class="partner-name" id="header-partner-name"></div>
      </div>
    </div>
    <div class="header-right">
      <div class="avatar-partner" id="partner-avatar-header"></div>
      <button class="btn-next" onclick="nextStranger()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline;margin-right:5px"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
        Next
      </button>
    </div>
  </div>
  <div class="messages" id="messages"></div>
  <div class="chat-input-area">
    <div class="input-col">
      <div id="img-preview-wrap" style="display:none" class="img-preview-wrap">
        <img id="img-preview"/>
        <button class="remove-img" onclick="clearImage()">✕</button>
      </div>
      <textarea class="chat-input" id="chat-input" rows="1" placeholder="Type a message…"
        oninput="autoResize(this);updateSendBtn()"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage()}"></textarea>
    </div>
    <button class="icon-btn" title="Send photo" onclick="document.getElementById('file-input').click()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
    </button>
    <input type="file" id="file-input" accept="image/*" style="display:none" onchange="handleImage(event)"/>
    <button class="send-btn" id="send-btn" onclick="sendMessage()" disabled>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
    </button>
  </div>
</div>

<!-- Partner Left -->
<div class="screen" id="screen-left">
  <div style="text-align:center">
    <div class="left-icon">👋</div>
    <div style="font-size:1.4rem;font-weight:700;margin-bottom:8px">Stranger left the chat</div>
    <div style="color:rgba(255,255,255,.45);font-size:.9rem;margin-bottom:28px">The conversation has ended</div>
    <button class="btn btn-primary" style="max-width:220px" onclick="nextStranger()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline;vertical-align:middle;margin-right:6px"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/></svg>
      Find New Stranger
    </button>
  </div>
</div>

<script>
// ── State ────────────────────────────────────────────────────────────────────
let gender = null;
let username = '';
let partnerGender = null;
let partnerUsername = '';
let pendingImage = null;
let socket = null;

// ── Socket ───────────────────────────────────────────────────────────────────
function initSocket() {
  if (socket) return;
  socket = io({ path: '/ws/socket.io', reconnection: true });

  socket.on('waiting', () => show('screen-waiting'));

  socket.on('paired', ({ partnerGender: pg, partnerUsername: pu }) => {
    partnerGender = pg || null;
    partnerUsername = pu || 'Stranger';
    buildChatHeader();
    clearMessages();
    addSystem('Connected with ' + partnerUsername + '.');
    show('screen-chat');
  });

  socket.on('partner_left', () => {
    addSystem(partnerUsername + ' has disconnected.');
    show('screen-left');
  });

  socket.on('message', (msg) => {
    addMessage(msg.type, msg.fromSelf, msg.text, msg.dataUrl);
  });

  socket.on('disconnect', () => {
    if (getCurrentScreen() === 'screen-chat' || getCurrentScreen() === 'screen-waiting') {
      show('screen-gender');
      gender = null; username = ''; partnerGender = null; partnerUsername = '';
    }
  });
}

// ── Navigation ───────────────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  spawnParticles();
}

function getCurrentScreen() {
  const a = document.querySelector('.screen.active');
  return a ? a.id : null;
}

function selectGender(g) {
  gender = g;
  setTheme(g);
  document.getElementById('name-avatar').innerHTML = avatarHtml(g, 72);
  document.getElementById('name-input').value = '';
  document.getElementById('name-continue').disabled = true;
  show('screen-name');
  setTimeout(() => document.getElementById('name-input').focus(), 100);
}

function submitName() {
  const val = document.getElementById('name-input').value.trim();
  if (!val) return;
  username = val;
  initSocket();
  socket.emit('set_profile', { gender, username });
  show('screen-waiting');
}

function cancelSearch() {
  show('screen-gender');
  gender = null; username = '';
  document.body.style.setProperty('--theme', '#7c3aed');
  document.body.style.setProperty('--theme2', '#6366f1');
}

function nextStranger() {
  clearMessages();
  if (socket) socket.emit('next');
  else { initSocket(); socket.emit('set_profile', { gender, username }); }
  show('screen-waiting');
}

// ── Theme ────────────────────────────────────────────────────────────────────
function setTheme(g) {
  if (g === 'male') {
    document.body.style.setProperty('--theme', '#3b82f6');
    document.body.style.setProperty('--theme2', '#6366f1');
  } else {
    document.body.style.setProperty('--theme', '#ec4899');
    document.body.style.setProperty('--theme2', '#f43f5e');
  }
}

// ── Avatars ──────────────────────────────────────────────────────────────────
function avatarHtml(g, size) {
  const grad = g === 'male'
    ? 'linear-gradient(135deg,#3b82f6,#6366f1)'
    : 'linear-gradient(135deg,#ec4899,#f43f5e)';
  const icon = '<svg width="' + Math.round(size*.5) + '" height="' + Math.round(size*.5) + '" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>';
  return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + grad + ';display:flex;align-items:center;justify-content:center">' + icon + '</div>';
}

function buildChatHeader() {
  document.getElementById('my-avatar-header').innerHTML = avatarHtml(gender, 36);
  document.getElementById('header-my-name').textContent = username;
  document.getElementById('header-partner-name').textContent = 'Chatting with ' + partnerUsername;
  document.getElementById('partner-avatar-header').innerHTML = avatarHtml(partnerGender || 'male', 32);
}

// ── Messages ─────────────────────────────────────────────────────────────────
function clearMessages() {
  document.getElementById('messages').innerHTML = '';
}

function addSystem(text) {
  const div = document.createElement('div');
  div.className = 'msg-system';
  div.textContent = text;
  appendMsg(div);
}

function addMessage(type, fromSelf, text, dataUrl) {
  const row = document.createElement('div');
  row.className = 'msg-row ' + (fromSelf ? 'self' : '');

  const g = fromSelf ? gender : (partnerGender || 'male');
  const name = fromSelf ? username : partnerUsername;

  const avatarEl = document.createElement('div');
  avatarEl.innerHTML = avatarHtml(g, 30);

  const wrap = document.createElement('div');
  wrap.className = 'msg-bubble-wrap';

  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.textContent = name;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble ' + (fromSelf ? 'self' : 'stranger');

  if (fromSelf) {
    const grad = gender === 'male'
      ? 'linear-gradient(135deg,#3b82f6,#6366f1)'
      : 'linear-gradient(135deg,#ec4899,#f43f5e)';
    const glow = gender === 'male'
      ? '0 6px 20px rgba(59,130,246,.45)'
      : '0 6px 20px rgba(236,72,153,.45)';
    bubble.style.background = grad;
    bubble.style.boxShadow = glow;
  }

  if (type === 'image' && dataUrl) {
    const img = document.createElement('img');
    img.src = dataUrl;
    bubble.appendChild(img);
    bubble.style.padding = '4px';
  } else {
    bubble.textContent = text || '';
  }

  wrap.appendChild(sender);
  wrap.appendChild(bubble);

  if (fromSelf) { row.appendChild(wrap); row.appendChild(avatarEl.firstChild); }
  else { row.appendChild(avatarEl.firstChild); row.appendChild(wrap); }

  appendMsg(row);
}

function appendMsg(el) {
  const container = document.getElementById('messages');
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

// ── Input ────────────────────────────────────────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function updateSendBtn() {
  const hasText = document.getElementById('chat-input').value.trim();
  document.getElementById('send-btn').disabled = !hasText && !pendingImage;
}

function sendMessage() {
  if (pendingImage) {
    socket.emit('message', { type: 'image', dataUrl: pendingImage });
    clearImage();
  }
  const text = document.getElementById('chat-input').value.trim();
  if (text) {
    socket.emit('message', { type: 'text', text });
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-input').style.height = 'auto';
  }
  updateSendBtn();
  document.getElementById('chat-input').focus();
}

function handleImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingImage = ev.target.result;
    document.getElementById('img-preview').src = pendingImage;
    document.getElementById('img-preview-wrap').style.display = 'inline-block';
    updateSendBtn();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function clearImage() {
  pendingImage = null;
  document.getElementById('img-preview-wrap').style.display = 'none';
  document.getElementById('img-preview').src = '';
  updateSendBtn();
}

// ── Particles ────────────────────────────────────────────────────────────────
function spawnParticles() {
  const container = document.getElementById('particles');
  container.innerHTML = '';
  const isMale = gender === 'male';
  const isFemale = gender === 'female';

  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle' + (isFemale ? ' heart' : '');

    const size = 6 + Math.random() * 14;
    const left = Math.random() * 100;
    const duration = 6 + Math.random() * 10;
    const delay = Math.random() * 12;
    const sway = (Math.random() - .5) * 80;

    if (!isFemale) {
      const color = isMale ? 'rgba(96,165,250,' : 'rgba(167,139,250,';
      p.style.background = color + (.2 + Math.random() * .4) + ')';
      p.style.boxShadow = '0 0 ' + size + 'px ' + (isMale ? 'rgba(59,130,246,.4)' : 'rgba(124,58,237,.3)');
    } else {
      p.style.setProperty('--color', 'rgba(244,114,182,' + (.3 + Math.random() * .4) + ')');
    }

    Object.assign(p.style, {
      width: size + 'px',
      height: size + 'px',
      left: left + '%',
      animationDuration: duration + 's',
      animationDelay: delay + 's',
      '--sway': sway + 'px',
      '--scale-end': .4 + Math.random() * .8,
    });

    container.appendChild(p);
  }
}

// Init particles on load
spawnParticles();
</script>
</body>
</html>`;

function personIcon() {
  return `<svg width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`;
}

app.get("*", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(HTML);
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Strangoo on http://localhost:${PORT}`));
