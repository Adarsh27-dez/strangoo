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
    a.socket.emit("paired", { partnerName: b.username, partnerGender: b.gender, chatType: a.chatType });
    b.socket.emit("paired", { partnerName: a.username, partnerGender: a.gender, chatType: b.chatType });
  }
}

const maleNames = ["Shadow","Blaze","Storm","Titan","Viper","Ghost","Falcon","Raven","Wolf","Phoenix","Cobra","Steel","Thunder","Ace","Bolt"];
const femaleNames = ["Luna","Aurora","Stella","Nova","Iris","Ember","Skye","Aria","Zara","Mira","Seren","Ivy","Nyx","Rose","Star"];

function randomName(gender) {
  const list = gender === "female" ? femaleNames : maleNames;
  return list[Math.floor(Math.random() * list.length)];
}

io.on("connection", (socket) => {
  socketMap.set(socket.id, { socket, partner: null, username: "Stranger", gender: "male", chatType: "text" });

  socket.on("join", ({ gender, chatType }) => {
    const me = socketMap.get(socket.id);
    if (me) {
      me.gender = gender || "male";
      me.chatType = chatType || "text";
      me.username = randomName(me.gender);
    }
    if (!waitingQueue.includes(socket.id)) waitingQueue.push(socket.id);
    socket.emit("waiting", { username: me.username });
    tryPair();
  });

  socket.on("message", (data) => {
    const me = socketMap.get(socket.id);
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
    io.emit("online_count", socketMap.size);
  });

  io.emit("online_count", socketMap.size);
});

app.get("/{*splat}", (req, res) => {
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
  --radius:16px;
}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}

/* SCROLLBAR */
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--purple);border-radius:4px}

/* NAVBAR */
.navbar{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:14px 24px;background:rgba(13,14,26,0.9);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.3rem;color:var(--text)}
.logo-icon{width:36px;height:36px;background:linear-gradient(135deg,var(--purple),var(--purple2));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.1rem}
.nav-links{display:flex;gap:24px}
.nav-link{color:var(--text2);font-size:0.9rem;font-weight:500;cursor:pointer;transition:color 0.2s;text-decoration:none}
.nav-link.active{color:var(--purple2);border-bottom:2px solid var(--purple2);padding-bottom:2px}

/* HERO */
.hero{position:relative;z-index:10;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:90px 20px 40px;text-align:center;max-width:600px;margin:0 auto}

/* BADGES */
.badges{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-bottom:28px}
.badge{display:flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--border);border-radius:50px;padding:7px 14px;font-size:0.78rem;font-weight:500;color:var(--text2)}

/* HEADING */
.hero h1{font-size:clamp(2.2rem,8vw,3.5rem);font-weight:900;line-height:1.1;margin-bottom:14px;letter-spacing:-1px}
.hero h1 .grad{background:linear-gradient(135deg,var(--purple2),var(--pink));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{font-size:1rem;color:var(--text2);margin-bottom:36px;line-height:1.6}

/* CHAT TYPE */
.section-label{font-size:0.75rem;font-weight:700;letter-spacing:3px;color:var(--text2);text-transform:uppercase;margin-bottom:14px}
.chat-types{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:420px;margin:0 auto 28px}
.chat-type-btn{background:var(--card);border:2px solid var(--border);border-radius:var(--radius);padding:20px 16px;cursor:pointer;transition:all 0.3s;display:flex;flex-direction:column;align-items:center;gap:10px;font-family:'Inter',sans-serif}
.chat-type-btn:hover{border-color:var(--purple);background:var(--card2);transform:translateY(-2px)}
.chat-type-btn.active{border-color:var(--purple2);background:var(--card2);box-shadow:0 0 20px rgba(124,58,237,0.3)}
.chat-type-icon{font-size:2rem;width:56px;height:56px;background:var(--card2);border-radius:14px;display:flex;align-items:center;justify-content:center}
.chat-type-btn.active .chat-type-icon{background:linear-gradient(135deg,var(--purple),var(--purple2))}
.chat-type-name{font-size:0.95rem;font-weight:700;color:var(--text)}
.chat-type-desc{font-size:0.75rem;color:var(--text2);text-align:center}

/* GENDER */
.gender-section{width:100%;max-width:420px;margin:0 auto 24px}
.gender-btns{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.gender-btn{background:var(--card);border:2px solid var(--border);border-radius:var(--radius);padding:16px;cursor:pointer;transition:all 0.3s;display:flex;align-items:center;justify-content:center;gap:10px;font-family:'Inter',sans-serif;font-size:1rem;font-weight:700;color:var(--text)}
.gender-btn.male:hover,.gender-btn.male.active{border-color:var(--blue);background:rgba(77,121,255,0.1);box-shadow:0 0 20px rgba(77,121,255,0.2)}
.gender-btn.female:hover,.gender-btn.female.active{border-color:var(--pink);background:rgba(255,77,141,0.1);box-shadow:0 0 20px rgba(255,77,141,0.2)}
.gender-symbol{font-size:1.4rem}

/* START BTN */
.start-btn{width:100%;max-width:420px;padding:18px;border:none;border-radius:var(--radius);font-size:1rem;font-weight:700;cursor:pointer;transition:all 0.3s;font-family:'Inter',sans-serif;background:linear-gradient(135deg,var(--purple),var(--pink));color:white;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 8px 32px rgba(124,58,237,0.4)}
.start-btn:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(124,58,237,0.5)}
.start-btn span{font-size:1.2rem}

/* FEATURES BAR */
.features-bar{position:relative;z-index:10;border-top:1px solid var(--border);padding:20px;display:flex;justify-content:center;gap:32px;flex-wrap:wrap;background:var(--bg2)}
.feat{display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--text2)}
.feat-icon{font-size:1.1rem}

/* ONLINE BADGE */
.online-pill{display:flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--border);border-radius:50px;padding:6px 14px;font-size:0.8rem;font-weight:600;color:var(--text2)}
.online-dot{width:7px;height:7px;background:#22c55e;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.3)}}

/* WAITING */
.waiting-screen{display:none;position:fixed;inset:0;z-index:300;background:rgba(13,14,26,0.97);backdrop-filter:blur(20px);align-items:center;justify-content:center;flex-direction:column;gap:20px}
.waiting-screen.show{display:flex}
.waiting-ring{width:80px;height:80px;border-radius:50%;border:3px solid rgba(124,58,237,0.2);border-top:3px solid var(--purple2);animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.waiting-screen h3{font-size:1.2rem;font-weight:700}
.waiting-screen p{color:var(--text2);font-size:0.85rem}
.cancel-btn{padding:10px 24px;border:1px solid var(--border);border-radius:50px;background:transparent;cursor:pointer;font-weight:600;font-family:'Inter',sans-serif;font-size:0.85rem;color:var(--text2);transition:all 0.3s}
.cancel-btn:hover{border-color:var(--purple);color:var(--purple2)}

/* CHAT SCREEN */
.chat-screen{display:none;position:fixed;inset:0;z-index:200;flex-direction:column;background:var(--bg)}
.chat-screen.show{display:flex}
.chat-header{padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.chat-user{display:flex;align-items:center;gap:10px}
.chat-avatar{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.95rem;font-weight:800;color:white;flex-shrink:0}
.chat-user-info h3{font-size:0.9rem;font-weight:700}
.chat-user-info p{font-size:0.72rem;color:var(--text2)}
.next-btn{display:flex;align-items:center;gap:5px;padding:8px 14px;border:1px solid var(--border);border-radius:50px;background:transparent;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.3s;color:var(--text2);font-family:'Inter',sans-serif}
.next-btn:hover{border-color:var(--purple);color:var(--purple2)}

/* MESSAGES */
.messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.msg-wrap{display:flex;align-items:flex-end;gap:7px;animation:fadeIn 0.3s ease}
.msg-wrap.mine{flex-direction:row-reverse}
.msg-avatar{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:800;color:white;flex-shrink:0}
.msg-content{max-width:72%}
.msg-name{font-size:0.68rem;font-weight:600;color:var(--text2);margin-bottom:3px;padding:0 4px}
.msg-wrap.mine .msg-name{text-align:right}
.msg-bubble{padding:9px 13px;border-radius:16px;font-size:0.83rem;line-height:1.4;word-break:break-word}
.msg-wrap.mine .msg-bubble{background:linear-gradient(135deg,var(--purple),var(--purple2));color:white;border-bottom-right-radius:3px}
.msg-wrap.theirs .msg-bubble{background:var(--card);color:var(--text);border-bottom-left-radius:3px;border:1px solid var(--border)}
.msg-bubble img{max-width:180px;border-radius:10px;cursor:zoom-in;display:block}
.msg-bubble audio{max-width:200px;width:100%}
.system-msg{text-align:center;color:var(--text2);font-size:0.75rem;font-style:italic;padding:3px 0}

/* TYPING */
.typing-indicator{display:none;align-items:center;gap:7px;padding:0 12px 6px;flex-shrink:0}
.typing-indicator.show{display:flex}
.typing-dots{display:flex;gap:3px;background:var(--card);padding:8px 12px;border-radius:16px;border-bottom-left-radius:3px;border:1px solid var(--border)}
.typing-dots span{width:5px;height:5px;background:var(--purple2);border-radius:50%;animation:bounce 1.2s infinite}
.typing-dots span:nth-child(2){animation-delay:0.2s}
.typing-dots span:nth-child(3){animation-delay:0.4s}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}

/* INPUT BAR */
.input-bar{padding:10px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom));background:var(--bg2);border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0}
.msg-input{flex:1;border:1px solid var(--border);border-radius:50px;padding:10px 16px;font-size:0.85rem;font-family:'Inter',sans-serif;outline:none;background:var(--card);color:var(--text);transition:border 0.3s}
.msg-input::placeholder{color:var(--text2)}
.msg-input:focus{border-color:var(--purple)}
.icon-btn{width:40px;height:40px;border-radius:50%;border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.3s;flex-shrink:0;background:var(--card);font-size:1rem}
.icon-btn:hover{border-color:var(--purple);background:var(--card2)}
.send-btn{width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.3s;flex-shrink:0;background:linear-gradient(135deg,var(--purple),var(--purple2));color:white;font-size:1rem}
.send-btn:hover{transform:scale(1.1);box-shadow:0 4px 16px rgba(124,58,237,0.5)}
.record-btn{width:40px;height:40px;border-radius:50%;border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.3s;flex-shrink:0;background:var(--card);font-size:1rem}
.record-btn.recording{background:linear-gradient(135deg,#ff4444,#ff6666);border-color:#ff4444;animation:recordPulse 1s infinite}
@keyframes recordPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,68,68,0.4)}50%{box-shadow:0 0 0 8px rgba(255,68,68,0)}}

/* LIGHTBOX */
#lightbox{position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.92);display:none;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(8px)}
#lightbox.open{display:flex}
#lightbox img{max-width:92vw;max-height:88vh;border-radius:12px;object-fit:contain;pointer-events:none}

@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>

<!-- NAVBAR -->
<nav class="navbar">
  <div class="logo">
    <div class="logo-icon">💬</div>
    Strangoo
  </div>
  <div style="display:flex;align-items:center;gap:20px">
    <div class="online-pill">
      <div class="online-dot"></div>
      <span id="onlineCount">0</span> online
    </div>
    <div style="display:flex;gap:16px">
      <span class="nav-link active">Home</span>
      <span class="nav-link">Chat</span>
    </div>
  </div>
</nav>

<!-- HOME SCREEN -->
<div style="min-height:100vh;display:flex;flex-direction:column" id="homeScreen">
  <div class="hero">
    <div class="badges">
      <div class="badge">👤 No Signup</div>
      <div class="badge">🎭 100% Anonymous</div>
      <div class="badge">🛡️ Safe & Secure</div>
    </div>

    <h1>Meet New People<br><span class="grad">Instantly</span></h1>
    <p>Anonymous text, audio & video chat<br>with strangers worldwide.</p>

    <!-- CHAT TYPE -->
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

    <!-- GENDER -->
    <div class="gender-section">
      <div class="section-label" style="margin-bottom:12px">I Am</div>
      <div class="gender-btns">
        <button class="gender-btn male active" id="maleBtn" onclick="selectGender('male')">
          <span class="gender-symbol">♂</span> Male
        </button>
        <button class="gender-btn female" id="femaleBtn" onclick="selectGender('female')">
          <span class="gender-symbol">♀</span> Female
        </button>
      </div>
    </div>

    <button class="start-btn" onclick="startChat()">
      Start Chatting <span>⚡</span>
    </button>
  </div>

  <!-- FEATURES BAR -->
  <div class="features-bar">
    <div class="feat"><span class="feat-icon">🎭</span> 100% Anonymous</div>
    <div class="feat"><span class="feat-icon">⚡</span> Instant Matching</div>
    <div class="feat"><span class="feat-icon">🌍</span> Worldwide Users</div>
    <div class="feat"><span class="feat-icon">🛡️</span> Safe & Secure</div>
  </div>
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
    <div class="msg-avatar" id="typingAvatar" style="width:24px;height:24px;font-size:0.65rem">?</div>
    <div class="typing-dots"><span></span><span></span><span></span></div>
  </div>
  <div class="input-bar">
    <input class="msg-input" id="msgInput" placeholder="Type a message..." onkeydown="handleKey(event)" oninput="handleTyping()"/>
    <button class="icon-btn" onclick="document.getElementById('imgInput').click()" title="Send image">🖼</button>
    <input type="file" id="imgInput" accept="image/*" style="display:none" onchange="sendImage(event)"/>
    <button class="record-btn" id="recordBtn" onmousedown="startRecording()" onmouseup="stopRecording()" ontouchstart="startRecording(event)" ontouchend="stopRecording(event)" title="Hold to record voice">🎤</button>
    <button class="send-btn" onclick="sendMessage()">➤</button>
  </div>
</div>

<!-- LIGHTBOX -->
<div id="lightbox" onclick="closeLightbox()"><img id="lbImg" src="" alt=""/></div>

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

socket.on('online_count', count => {
  document.getElementById('onlineCount').textContent = count.toLocaleString();
});

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
  typingTimer = setTimeout(() => {
    document.getElementById('typingIndicator').classList.remove('show');
  }, 2000);
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
  document.getElementById('homeScreen').style.display = 'none';
  socket.emit('join', { gender: myGender, chatType: myChatType });
}

function cancelWait() {
  document.getElementById('waitingScreen').classList.remove('show');
  document.getElementById('homeScreen').style.display = 'flex';
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
  const reader = new FileReader();
  reader.onload = () => {
    socket.emit('image', { image: reader.result });
    addMsg(null, reader.result, null, true);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

async function startRecording(e) {
  if (e) e.preventDefault();
  if (isRecording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.start();
    isRecording = true;
    document.getElementById('recordBtn').classList.add('recording');
  } catch(err) {
    alert('Microphone access denied!');
  }
}

function stopRecording(e) {
  if (e) e.preventDefault();
  if (!isRecording || !mediaRecorder) return;
  mediaRecorder.onstop = () => {
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onload = () => {
      socket.emit('audio_msg', { audio: reader.result });
      addMsg(null, null, reader.result, true);
    };
    reader.readAsDataURL(blob);
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  };
  mediaRecorder.stop();
  isRecording = false;
  document.getElementById('recordBtn').classList.remove('recording');
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
    img.onclick = () => openLightbox(image);
    bubble.appendChild(img);
  } else if (audio) {
    const aud = document.createElement('audio');
    aud.src = audio;
    aud.controls = true;
    bubble.appendChild(aud);
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

document.getElementById('msgInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Strangoo server running on port " + PORT));
