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
    a.socket.emit("paired", { partnerName: b.username, partnerGender: b.gender });
    b.socket.emit("paired", { partnerName: a.username, partnerGender: a.gender });
  }
}

io.on("connection", (socket) => {
  socketMap.set(socket.id, { socket, partner: null, username: "Stranger", gender: "male" });

  socket.on("join", ({ username, gender }) => {
    const me = socketMap.get(socket.id);
    if (me) {
      me.username = username || "Stranger";
      me.gender = gender || "male";
    }
    if (!waitingQueue.includes(socket.id)) waitingQueue.push(socket.id);
    socket.emit("waiting");
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
    socket.emit("waiting");
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
  --pink:#FF4D8D;
  --pink-light:#FFB3D1;
  --blue:#4D79FF;
  --purple:#8B5CF6;
  --bg:#FFF0F5;
  --white:#FFFFFF;
  --text:#1a0a2e;
  --text-light:#6B7280;
  --radius:20px;
}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}

/* CANVAS BG */
#bgCanvas{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none}

/* NAVBAR */
.navbar{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:16px 32px;background:rgba(255,255,255,0.85);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,77,141,0.1)}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.4rem;color:var(--text)}
.logo-icon{width:38px;height:38px;background:linear-gradient(135deg,var(--pink),var(--purple));border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-size:1.1rem;font-weight:900}
.online-badge{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.9);border:1px solid rgba(255,77,141,0.2);border-radius:50px;padding:8px 16px;font-size:0.85rem;font-weight:600;color:var(--text)}
.online-dot{width:8px;height:8px;background:#22c55e;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.3)}}

/* HERO */
.hero{position:relative;z-index:10;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:100px 20px 40px;text-align:center}
.anon-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.8);border:1px solid rgba(255,77,141,0.2);border-radius:50px;padding:8px 20px;font-size:0.85rem;font-weight:500;color:var(--text-light);margin-bottom:24px}
.hero h1{font-size:clamp(2.5rem,6vw,4.5rem);font-weight:900;line-height:1.1;margin-bottom:16px;letter-spacing:-2px}
.hero h1 span.pink{color:var(--pink)}
.hero h1 span.blue{color:var(--blue)}
.hero p{font-size:1.1rem;color:var(--text-light);margin-bottom:40px;max-width:420px}

/* GENDER CARD */
.gender-card{background:rgba(255,255,255,0.95);border-radius:28px;padding:32px;box-shadow:0 20px 60px rgba(255,77,141,0.15);max-width:460px;width:100%;margin:0 auto 32px}
.gender-label{font-size:0.8rem;font-weight:700;letter-spacing:3px;color:var(--text-light);margin-bottom:20px;text-transform:uppercase}
.gender-btns{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.gender-btn{border:2px solid transparent;border-radius:20px;padding:24px 16px;cursor:pointer;transition:all 0.3s;display:flex;flex-direction:column;align-items:center;gap:12px;background:#f8faff;font-family:'Inter',sans-serif}
.gender-btn.male{border-color:rgba(77,121,255,0.2);background:rgba(77,121,255,0.05)}
.gender-btn.male:hover,.gender-btn.male.active{border-color:var(--blue);background:rgba(77,121,255,0.1);transform:translateY(-3px);box-shadow:0 10px 30px rgba(77,121,255,0.2)}
.gender-btn.female{border-color:rgba(255,77,141,0.2);background:rgba(255,77,141,0.05)}
.gender-btn.female:hover,.gender-btn.female.active{border-color:var(--pink);background:rgba(255,77,141,0.1);transform:translateY(-3px);box-shadow:0 10px 30px rgba(255,77,141,0.2)}
.gender-avatar{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.6rem}
.gender-btn.male .gender-avatar{background:linear-gradient(135deg,#4D79FF,#7B9FFF)}
.gender-btn.female .gender-avatar{background:linear-gradient(135deg,#FF4D8D,#FF8CB4)}
.gender-name{font-weight:700;font-size:1rem}
.gender-btn.male .gender-name{color:var(--blue)}
.gender-btn.female .gender-name{color:var(--pink)}
.start-chatting{font-size:0.75rem;color:var(--text-light);display:flex;align-items:center;gap:4px}

/* NAME INPUT SCREEN */
.name-screen{display:none;position:fixed;inset:0;z-index:200;background:rgba(255,240,245,0.95);backdrop-filter:blur(20px);align-items:center;justify-content:center;flex-direction:column;gap:20px;padding:20px}
.name-screen.show{display:flex}
.name-box{background:white;border-radius:28px;padding:40px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(255,77,141,0.15);text-align:center}
.name-box h2{font-size:1.6rem;font-weight:800;margin-bottom:8px}
.name-box p{color:var(--text-light);margin-bottom:28px;font-size:0.95rem}
.name-input{width:100%;border:2px solid rgba(255,77,141,0.2);border-radius:14px;padding:14px 18px;font-size:1rem;font-family:'Inter',sans-serif;outline:none;transition:border 0.3s;background:#fff}
.name-input:focus{border-color:var(--pink)}
.start-btn{width:100%;margin-top:16px;padding:16px;border:none;border-radius:14px;font-size:1rem;font-weight:700;cursor:pointer;transition:all 0.3s;font-family:'Inter',sans-serif}
.start-btn.male-btn{background:linear-gradient(135deg,var(--blue),#7B9FFF);color:white}
.start-btn.female-btn{background:linear-gradient(135deg,var(--pink),#FF8CB4);color:white}
.start-btn:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(255,77,141,0.3)}

/* CHAT SCREEN */
.chat-screen{display:none;position:fixed;inset:0;z-index:200;flex-direction:column;background:var(--bg)}
.chat-screen.show{display:flex}
.chat-header{padding:12px 16px;background:rgba(255,255,255,0.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,77,141,0.1);display:flex;align-items:center;justify-content:space-between}
.chat-user{display:flex;align-items:center;gap:10px}
.chat-avatar{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:800;color:white}
.chat-user-info h3{font-size:0.95rem;font-weight:700}
.chat-user-info p{font-size:0.75rem;color:var(--text-light)}
.next-btn{display:flex;align-items:center;gap:6px;padding:10px 18px;border:2px solid rgba(255,77,141,0.3);border-radius:50px;background:white;font-size:0.85rem;font-weight:600;cursor:pointer;transition:all 0.3s;color:var(--text);font-family:'Inter',sans-serif}
.next-btn:hover{background:var(--pink);color:white;border-color:var(--pink)}

/* MESSAGES */
.messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.msg-wrap{display:flex;align-items:flex-end;gap:8px}
.msg-wrap.mine{flex-direction:row-reverse}
.msg-avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:800;color:white;flex-shrink:0}
.msg-content{max-width:75%}
.msg-name{font-size:0.7rem;font-weight:600;color:var(--text-light);margin-bottom:4px;padding:0 4px}
.msg-wrap.mine .msg-name{text-align:right}
.msg-bubble{padding:12px 16px;border-radius:18px;font-size:0.95rem;line-height:1.4;word-break:break-word}
.msg-wrap.mine .msg-bubble{background:linear-gradient(135deg,var(--pink),#FF8CB4);color:white;border-bottom-right-radius:4px}
.msg-wrap.theirs .msg-bubble{background:white;color:var(--text);border-bottom-left-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,0.06)}
.msg-bubble img{max-width:200px;border-radius:12px;cursor:zoom-in}
.system-msg{text-align:center;color:var(--text-light);font-size:0.8rem;font-style:italic;padding:4px 0}

/* TYPING */
.typing-indicator{display:none;align-items:center;gap:8px;padding:0 16px 8px}
.typing-indicator.show{display:flex}
.typing-dots{display:flex;gap:4px;background:white;padding:10px 14px;border-radius:18px;border-bottom-left-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,0.06)}
.typing-dots span{width:6px;height:6px;background:var(--pink-light);border-radius:50%;animation:bounce 1.2s infinite}
.typing-dots span:nth-child(2){animation-delay:0.2s}
.typing-dots span:nth-child(3){animation-delay:0.4s}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}

/* WAITING */
.waiting-screen{display:none;position:fixed;inset:0;z-index:300;background:rgba(255,240,245,0.97);backdrop-filter:blur(20px);align-items:center;justify-content:center;flex-direction:column;gap:20px}
.waiting-screen.show{display:flex}
.waiting-spinner{width:80px;height:80px;border-radius:50%;border:4px solid rgba(255,77,141,0.15);border-top:4px solid var(--pink);animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.waiting-screen h3{font-size:1.3rem;font-weight:700}
.waiting-screen p{color:var(--text-light);font-size:0.9rem}
.cancel-btn{padding:12px 28px;border:2px solid rgba(255,77,141,0.3);border-radius:50px;background:white;cursor:pointer;font-weight:600;font-family:'Inter',sans-serif;font-size:0.9rem;color:var(--text);transition:all 0.3s}
.cancel-btn:hover{background:var(--pink);color:white;border-color:var(--pink)}

/* INPUT BAR */
.input-bar{padding:12px 16px;background:rgba(255,255,255,0.95);border-top:1px solid rgba(255,77,141,0.1);display:flex;align-items:center;gap:10px}
.msg-input{flex:1;border:2px solid rgba(255,77,141,0.15);border-radius:50px;padding:12px 20px;font-size:0.95rem;font-family:'Inter',sans-serif;outline:none;background:white;transition:border 0.3s}
.msg-input:focus{border-color:var(--pink)}
.img-btn,.send-btn{width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.3s;flex-shrink:0}
.img-btn{background:rgba(255,77,141,0.1);color:var(--pink)}
.img-btn:hover{background:var(--pink);color:white}
.send-btn{background:linear-gradient(135deg,var(--pink),#FF8CB4);color:white}
.send-btn:hover{transform:scale(1.1);box-shadow:0 6px 20px rgba(255,77,141,0.4)}

/* FEATURES SECTION */
.features{position:relative;z-index:10;padding:60px 20px;max-width:900px;margin:0 auto}
.features-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
@media(min-width:600px){.features-grid{grid-template-columns:repeat(4,1fr)}}
.feature-card{background:rgba(255,255,255,0.8);border-radius:20px;padding:20px;text-align:center;backdrop-filter:blur(10px)}
.feature-icon{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 12px}
.feature-card h4{font-size:0.9rem;font-weight:700;margin-bottom:4px}
.feature-card p{font-size:0.75rem;color:var(--text-light)}

/* TRUST */
.trust{position:relative;z-index:10;text-align:center;padding:20px;margin-bottom:40px}
.trust-badge{display:inline-flex;align-items:center;gap:12px;background:rgba(255,255,255,0.9);border-radius:50px;padding:12px 24px;box-shadow:0 4px 20px rgba(255,77,141,0.1)}
.trust-avatars{display:flex}
.trust-avatars img{width:32px;height:32px;border-radius:50%;border:2px solid white;margin-left:-8px;object-fit:cover}
.trust-avatars img:first-child{margin-left:0}
.trust-text{font-size:0.85rem;color:var(--text)}
.trust-text strong{color:var(--pink)}

/* LIGHTBOX */
#lightbox{position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.9);display:none;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(6px);animation:lbIn .2s ease}
#lightbox.open{display:flex}
@keyframes lbIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
#lightbox img{max-width:92vw;max-height:88vh;border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.7);object-fit:contain;pointer-events:none}
.msg-bubble img{cursor:zoom-in}

/* ANIMATIONS */
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.msg-wrap{animation:fadeIn 0.3s ease}
</style>
</head>
<body>

<canvas id="bgCanvas"></canvas>

<!-- NAVBAR -->
<nav class="navbar">
  <div class="logo">
    <div class="logo-icon">S</div>
    Strangoo
  </div>
  <div class="online-badge">
    <div class="online-dot"></div>
    <span id="onlineCount">0</span> people online
  </div>
</nav>

<!-- HERO / HOME SCREEN -->
<div class="hero" id="homeScreen">
  <div class="anon-badge">🎭 Anonymous · No Signup</div>
  <h1>Meet <span class="pink">New People</span><br><span class="blue">Instantly</span> ✦</h1>
  <p>Anonymous video & text chat with strangers worldwide.</p>

  <div class="gender-card">
    <div class="gender-label">I am a</div>
    <div class="gender-btns">
      <button class="gender-btn male" onclick="selectGender('male')">
        <div class="gender-avatar">👤</div>
        <div class="gender-name">Male</div>
        <div class="start-chatting">Start Chatting →</div>
      </button>
      <button class="gender-btn female" onclick="selectGender('female')">
        <div class="gender-avatar">👤</div>
        <div class="gender-name">Female</div>
        <div class="start-chatting">Start Chatting →</div>
      </button>
    </div>
  </div>
</div>

<!-- FEATURES -->
<div class="features" id="featuresSection">
  <div class="features-grid">
    <div class="feature-card">
      <div class="feature-icon" style="background:rgba(139,92,246,0.1)">🎭</div>
      <h4>100% Anonymous</h4>
      <p>Your privacy is our priority</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon" style="background:rgba(34,197,94,0.1)">⚡</div>
      <h4>No Signup</h4>
      <p>Start chatting instantly</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon" style="background:rgba(77,121,255,0.1)">🔒</div>
      <h4>End-to-End Secure</h4>
      <p>Your conversation is safe</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon" style="background:rgba(255,77,141,0.1)">🌍</div>
      <h4>Worldwide Users</h4>
      <p>Connect globally, anytime</p>
    </div>
  </div>
</div>

<div class="trust" id="trustSection">
  <div class="trust-badge">
    <div class="trust-avatars">
      <img src="https://i.pravatar.cc/32?img=1" alt="">
      <img src="https://i.pravatar.cc/32?img=2" alt="">
      <img src="https://i.pravatar.cc/32?img=3" alt="">
    </div>
    <div class="trust-text">Trusted by <strong>50K+</strong> happy users worldwide ❤️</div>
  </div>
</div>

<!-- NAME SCREEN -->
<div class="name-screen" id="nameScreen">
  <div class="name-box">
    <h2 id="nameTitle">What's your name?</h2>
    <p>This will be shown to your chat partner</p>
    <input class="name-input" id="nameInput" placeholder="Enter your display name" maxlength="20"/>
    <button class="start-btn" id="startBtn" onclick="startChat()">Start Chatting 🚀</button>
  </div>
</div>

<!-- WAITING SCREEN -->
<div class="waiting-screen" id="waitingScreen">
  <div class="waiting-spinner"></div>
  <h3>Finding a stranger...</h3>
  <p>Please wait while we connect you</p>
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
    <div class="msg-avatar" id="typingAvatar" style="width:28px;height:28px;font-size:0.7rem">?</div>
    <div class="typing-dots"><span></span><span></span><span></span></div>
  </div>
  <div class="input-bar">
    <input class="msg-input" id="msgInput" placeholder="Type a message..." onkeydown="handleKey(event)" oninput="handleTyping()"/>
    <button class="img-btn" onclick="document.getElementById('imgInput').click()">🖼</button>
    <input type="file" id="imgInput" accept="image/*" style="display:none" onchange="sendImage(event)"/>
    <button class="send-btn" onclick="sendMessage()">➤</button>
  </div>
</div>

<!-- LIGHTBOX -->
<div id="lightbox" onclick="closeLightbox()"><img id="lbImg" src="" alt=""/></div>

<script>
// BG CANVAS ANIMATION
const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function createParticles() {
  particles = [];
  const count = Math.floor(window.innerWidth / 20);
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 4 + 1,
      dx: (Math.random() - 0.5) * 0.5,
      dy: (Math.random() - 0.5) * 0.5,
      color: Math.random() > 0.5 ? 'rgba(255,77,141,' : 'rgba(77,121,255,',
      alpha: Math.random() * 0.3 + 0.05
    });
  }
}
createParticles();

function animateBg() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.x += p.dx;
    p.y += p.dy;
    if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color + p.alpha + ')';
    ctx.fill();
  });
  requestAnimationFrame(animateBg);
}
animateBg();

// SOCKET
const socket = io({ path: '/ws/socket.io' });
let myGender = 'male';
let myName = '';
let partnerGender = 'male';
let partnerUsername = '';
let typingTimer = null;

socket.on('online_count', count => {
  document.getElementById('onlineCount').textContent = count.toLocaleString();
});

socket.on('waiting', () => {
  document.getElementById('waitingScreen').classList.add('show');
  document.getElementById('chatScreen').classList.remove('show');
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

socket.on('message', ({ text, image, type }) => {
  clearTimeout(typingTimer);
  document.getElementById('typingIndicator').classList.remove('show');
  if (type === 'image') addMsg(null, image, false);
  else addMsg(text, null, false);
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

// FUNCTIONS
function selectGender(gender) {
  myGender = gender;
  document.getElementById('nameScreen').classList.add('show');
  const btn = document.getElementById('startBtn');
  const title = document.getElementById('nameTitle');
  if (gender === 'female') {
    btn.className = 'start-btn female-btn';
    title.textContent = "What's your name? 🌸";
  } else {
    btn.className = 'start-btn male-btn';
    title.textContent = "What's your name? 💙";
  }
  setTimeout(() => document.getElementById('nameInput').focus(), 100);
}

function startChat() {
  const name = document.getElementById('nameInput').value.trim();
  myName = name || (myGender === 'female' ? 'Angel' : 'Stranger');
  document.getElementById('nameScreen').classList.remove('show');
  document.getElementById('homeScreen').style.display = 'none';
  document.getElementById('featuresSection').style.display = 'none';
  document.getElementById('trustSection').style.display = 'none';
  socket.emit('join', { username: myName, gender: myGender });
}

function cancelWait() {
  document.getElementById('waitingScreen').classList.remove('show');
  document.getElementById('homeScreen').style.display = 'flex';
  document.getElementById('featuresSection').style.display = 'block';
  document.getElementById('trustSection').style.display = 'block';
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
  addMsg(text, null, true);
  input.value = '';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function handleTyping() {
  socket.emit('typing');
}

function sendImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const imageData = reader.result;
    socket.emit('image', { image: imageData });
    addMsg(null, imageData, true);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function addMsg(text, image, isMine) {
  const msgs = document.getElementById('messages');
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap ' + (isMine ? 'mine' : 'theirs');
  
  const name = isMine ? myName : partnerUsername;
  const gender = isMine ? myGender : partnerGender;
  const color = gender === 'female' ? 'linear-gradient(135deg,#FF4D8D,#FF8CB4)' : 'linear-gradient(135deg,#4D79FF,#7B9FFF)';
  const initial = name.charAt(0).toUpperCase();
  
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.style.background = color;
  avatar.textContent = initial;
  
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

// Enter key on name input
document.getElementById('nameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') startChat();
});
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Strangoo server running on port " + PORT));
