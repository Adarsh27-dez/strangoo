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
    if (!a || !b) { if (a) waitingQueue.unshift(idA); if (b) waitingQueue.unshift(idB); continue; }
    a.partnerId = idB; b.partnerId = idA;
    a.emit("paired", { partnerGender: b.gender, partnerUsername: b.username });
    b.emit("paired", { partnerGender: a.gender, partnerUsername: a.username });
  }
}

function enqueue(socket) {
  if (!waitingQueue.includes(socket.id)) { waitingQueue.push(socket.id); socket.emit("waiting"); }
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
    enqueue(socket); tryPair();
  });

  socket.on("typing_start", () => {
    const p = socketMap.get(socket.partnerId);
    if (p) p.emit("typing_start");
  });

  socket.on("typing_stop", () => {
    const p = socketMap.get(socket.partnerId);
    if (p) p.emit("typing_stop");
  });

  socket.on("message", (payload) => {
    const partner = socketMap.get(socket.partnerId);
    if (!partner) return;
    const p = socketMap.get(socket.partnerId);
    if (p) p.emit("typing_stop");
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

const EMOJIS = ["😀","😂","🥹","😊","😍","🥰","😘","🤣","😎","🤩","🥳","😏","😭","😤","😱","🤔","💯","❤️","🧡","💛","💚","💙","💜","❤️‍🔥","👍","👎","👏","🙌","🤝","✌️","🤞","👋","💪","🫶","🤲","🫂","💋","🔥","⚡","🌟","✨","🎉","🎊","💫","🌙","🌈","🦋","🌸","🌹","🍀","😆","🙏","💀","👀","🤯","🥺","😇","🤪","😴","🥱"];

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Strangoo – Chat with Strangers</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<script src="/ws/socket.io/socket.io.js"></script>
<style>
:root{
  --blue1:#3b82f6;--blue2:#6366f1;
  --pink1:#ec4899;--pink2:#f43f5e;
  --t1:#3b82f6;--t2:#6366f1;
  --bg:#08071a;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:#fff;overflow:hidden}
body{min-height:100dvh;position:relative}

/* ── Background ── */
#bg-canvas{position:fixed;inset:0;z-index:0;pointer-events:none}
#particles{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1}
.particle{position:absolute;bottom:-80px;border-radius:50%;opacity:0;animation:floatUp linear infinite}
@keyframes floatUp{
  0%{transform:translateY(0) translateX(0) scale(1);opacity:0}
  8%{opacity:.8}88%{opacity:.25}
  100%{transform:translateY(-115vh) translateX(var(--sway,0px)) scale(var(--se,.5));opacity:0}
}
.heart-particle{border-radius:0!important;background:transparent!important;position:relative}
.heart-particle::before,.heart-particle::after{content:'';position:absolute;width:100%;height:100%;background:var(--hc,#f472b6);border-radius:50%}
.heart-particle::before{top:-50%;left:0}
.heart-particle::after{top:0;left:50%}
.heart-particle{transform:rotate(-45deg)}

/* ── Screens ── */
.screen{position:absolute;inset:0;z-index:2;display:none;flex-direction:column;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .3s ease}
.screen.active{display:flex}
.screen.visible{opacity:1}

/* ── Glassmorphism card ── */
.glass{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:32px;width:100%;max-width:400px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 8px 48px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08)}

/* ── Gender Select ── */
.logo-wrap{text-align:center;margin-bottom:28px}
.logo{font-size:2.2rem;font-weight:800;letter-spacing:-.5px;background:linear-gradient(135deg,#a78bfa,#818cf8,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.tagline{color:rgba(255,255,255,.4);font-size:.88rem;margin-top:4px}
.section-label{font-size:.68rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.35);text-align:center;margin-bottom:14px}
.gender-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.gender-btn{border:none;border-radius:18px;padding:26px 12px 22px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:14px;font-size:.95rem;font-weight:700;transition:transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .18s;position:relative;overflow:hidden}
.gender-btn::before{content:'';position:absolute;inset:0;opacity:0;transition:opacity .2s}
.gender-btn:hover{transform:translateY(-3px)}
.gender-btn:hover::before{opacity:1}
.gender-btn.male{background:linear-gradient(145deg,rgba(59,130,246,.2),rgba(99,102,241,.15));color:#93c5fd;border:1px solid rgba(59,130,246,.3)}
.gender-btn.male::before{background:radial-gradient(circle at 50% 0%,rgba(59,130,246,.15),transparent 70%)}
.gender-btn.male:hover{box-shadow:0 12px 40px rgba(59,130,246,.25)}
.gender-btn.female{background:linear-gradient(145deg,rgba(236,72,153,.2),rgba(244,63,94,.15));color:#f9a8d4;border:1px solid rgba(236,72,153,.3)}
.gender-btn.female::before{background:radial-gradient(circle at 50% 0%,rgba(236,72,153,.15),transparent 70%)}
.gender-btn.female:hover{box-shadow:0 12px 40px rgba(236,72,153,.25)}
.g-avatar{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative;z-index:1}
.gender-btn.male .g-avatar{background:linear-gradient(135deg,#3b82f6,#6366f1);box-shadow:0 6px 20px rgba(59,130,246,.4)}
.gender-btn.female .g-avatar{background:linear-gradient(135deg,#ec4899,#f43f5e);box-shadow:0 6px 20px rgba(236,72,153,.4)}
.anon-badge{text-align:center;margin-top:18px;font-size:.75rem;color:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;gap:6px}
.anon-dot{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.2)}

/* ── Name Entry ── */
.name-avatar{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 22px;position:relative}
.name-avatar::after{content:'';position:absolute;inset:-3px;border-radius:50%;background:linear-gradient(135deg,var(--t1),var(--t2));z-index:-1;opacity:.5;filter:blur(6px)}
.form-title{font-size:1.5rem;font-weight:700;text-align:center;margin-bottom:6px}
.form-sub{color:rgba(255,255,255,.4);font-size:.85rem;text-align:center;margin-bottom:26px}
.input-wrap{position:relative}
.premium-input{width:100%;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.12);border-radius:14px;padding:14px 18px;color:#fff;font-size:1rem;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s;display:block}
.premium-input::placeholder{color:rgba(255,255,255,.25)}
.premium-input:focus{border-color:var(--t1);box-shadow:0 0 0 3px rgba(59,130,246,.15)}
.female .premium-input:focus{box-shadow:0 0 0 3px rgba(236,72,153,.15)}
.primary-btn{width:100%;border:none;border-radius:14px;padding:15px;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;background:linear-gradient(135deg,var(--t1),var(--t2));color:#fff;margin-top:14px;transition:opacity .15s,transform .15s,box-shadow .2s;box-shadow:0 6px 24px rgba(59,130,246,.35)}
.primary-btn:hover:not(:disabled){opacity:.92;transform:translateY(-1px);box-shadow:0 10px 30px rgba(59,130,246,.4)}
.primary-btn:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none}

/* ── Waiting Screen ── */
.wait-center{text-align:center;display:flex;flex-direction:column;align-items:center}
.pulse-wrap{position:relative;width:110px;height:110px;display:flex;align-items:center;justify-content:center;margin:0 auto 28px}
.pulse-ring{position:absolute;border-radius:50%;border:2px solid var(--t1);animation:pulseRing 2.4s ease-out infinite;opacity:0}
.pulse-ring:nth-child(1){width:80px;height:80px;animation-delay:0s}
.pulse-ring:nth-child(2){width:100px;height:100px;animation-delay:.6s}
.pulse-ring:nth-child(3){width:120px;height:120px;animation-delay:1.2s}
@keyframes pulseRing{
  0%{transform:scale(.85);opacity:.7}
  100%{transform:scale(1.5);opacity:0}
}
.pulse-avatar{position:relative;z-index:2;width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.wait-dots{display:flex;gap:5px;justify-content:center;margin-top:14px}
.wait-dot{width:6px;height:6px;border-radius:50%;background:var(--t1);animation:waitBounce .9s ease-in-out infinite}
.wait-dot:nth-child(2){animation-delay:.2s}
.wait-dot:nth-child(3){animation-delay:.4s}
@keyframes waitBounce{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
.wait-title{font-size:1.35rem;font-weight:700;margin-bottom:8px}
.wait-sub{color:rgba(255,255,255,.4);font-size:.85rem;margin-bottom:30px}
.outline-btn{background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.15);border-radius:12px;padding:11px 28px;color:rgba(255,255,255,.65);font-size:.88rem;font-weight:600;font-family:inherit;cursor:pointer;transition:background .15s,border-color .15s}
.outline-btn:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25)}

/* ── Chat Screen ── */
#screen-chat{padding:0;justify-content:flex-start;align-items:stretch}
.chat-header{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;background:rgba(6,5,20,.85);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;position:relative}
.chat-header::after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--t1),transparent);opacity:.4}
.h-left{display:flex;align-items:center;gap:10px;min-width:0}
.h-avatar{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative}
.h-avatar.online::after{content:'';position:absolute;bottom:1px;right:1px;width:9px;height:9px;background:#22c55e;border-radius:50%;border:2px solid var(--bg)}
.h-names{min-width:0}
.h-myname{font-weight:700;font-size:.95rem;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.h-partnername{font-size:.72rem;color:rgba(255,255,255,.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.h-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
.h-partner-av{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.next-btn{display:flex;align-items:center;gap:6px;border:none;border-radius:10px;padding:8px 14px;font-size:.82rem;font-weight:600;font-family:inherit;cursor:pointer;background:rgba(255,255,255,.09);color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.12);transition:background .15s,transform .15s}
.next-btn:hover{background:rgba(255,255,255,.15);transform:scale(1.03)}

/* ── Messages ── */
.messages{flex:1;overflow-y:auto;padding:14px 14px 8px;display:flex;flex-direction:column;gap:6px;scroll-behavior:smooth}
.messages::-webkit-scrollbar{width:3px}
.messages::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:2px}

.msg-row{display:flex;align-items:flex-end;gap:8px;animation:msgFadeIn .28s cubic-bezier(.22,1,.36,1) forwards;opacity:0;transform:translateY(8px)}
@keyframes msgFadeIn{to{opacity:1;transform:translateY(0)}}
.msg-row.self{flex-direction:row-reverse}
.msg-col{display:flex;flex-direction:column;max-width:70%;gap:3px}
.msg-row.self .msg-col{align-items:flex-end}
.msg-name{font-size:.68rem;font-weight:600;color:rgba(255,255,255,.35);padding:0 5px}
.bubble{padding:11px 15px;border-radius:20px;font-size:.92rem;line-height:1.5;word-break:break-word;position:relative}
.bubble.self{border-bottom-right-radius:5px;color:#fff}
.bubble.them{border-bottom-left-radius:5px;background:rgba(255,255,255,.1);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.14);color:#f0f0f0}
.bubble img{max-width:220px;max-height:200px;border-radius:14px;display:block;object-fit:contain}
.bubble img.raw{padding:0;margin:0}
.msg-system{text-align:center;font-size:.72rem;color:rgba(255,255,255,.28);padding:6px 12px;margin:2px auto;background:rgba(255,255,255,.04);border-radius:20px;max-width:80%}

/* ── Typing indicator ── */
.typing-row{display:flex;align-items:flex-end;gap:8px;animation:msgFadeIn .28s forwards}
.typing-bubble{padding:12px 16px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:20px;border-bottom-left-radius:5px;display:flex;gap:5px;align-items:center}
.typing-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.5);animation:typingBounce 1.1s ease-in-out infinite}
.typing-dot:nth-child(2){animation-delay:.18s}
.typing-dot:nth-child(3){animation-delay:.36s}
@keyframes typingBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}

/* ── Input Area ── */
.input-area{padding:10px 12px 12px;background:rgba(6,5,20,.8);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.07);flex-shrink:0}
.img-preview-row{display:none;margin-bottom:8px;padding:0 4px}
.img-preview-inner{position:relative;display:inline-block}
.img-preview-inner img{max-height:72px;border-radius:10px;display:block;border:1px solid rgba(255,255,255,.15)}
.remove-img-btn{position:absolute;top:-7px;right:-7px;width:20px;height:20px;background:rgba(239,68,68,.9);border:none;border-radius:50%;color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;line-height:1}
.input-row{display:flex;align-items:flex-end;gap:8px}
.input-box{flex:1;display:flex;align-items:flex-end;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.1);border-radius:26px;padding:8px 8px 8px 16px;transition:border-color .2s,box-shadow .2s;gap:4px}
.input-box:focus-within{border-color:var(--t1);box-shadow:0 0 0 3px rgba(59,130,246,.12)}
.chat-textarea{flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:.93rem;font-family:inherit;resize:none;max-height:100px;line-height:1.5;align-self:flex-end;padding:2px 0}
.chat-textarea::placeholder{color:rgba(255,255,255,.25)}
.ic-btn{width:34px;height:34px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,.45);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:color .15s,background .15s;font-size:1.1rem}
.ic-btn:hover{color:rgba(255,255,255,.85);background:rgba(255,255,255,.08)}
.send-btn{width:42px;height:42px;border-radius:50%;border:none;background:linear-gradient(135deg,var(--t1),var(--t2));color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s,transform .15s,box-shadow .2s;box-shadow:0 4px 16px rgba(59,130,246,.35)}
.send-btn:hover:not(:disabled){transform:scale(1.08);box-shadow:0 6px 20px rgba(59,130,246,.5)}
.send-btn:disabled{opacity:.3;cursor:not-allowed;transform:none;box-shadow:none}

/* ── Emoji Picker ── */
.emoji-picker{position:absolute;bottom:70px;left:12px;background:rgba(15,12,40,.96);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:12px;display:grid;grid-template-columns:repeat(8,36px);gap:2px;z-index:100;box-shadow:0 8px 40px rgba(0,0,0,.6);display:none}
.emoji-picker.open{display:grid;animation:emojiIn .2s cubic-bezier(.34,1.56,.64,1)}
@keyframes emojiIn{from{opacity:0;transform:scale(.9) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
.emo{width:36px;height:36px;border-radius:8px;border:none;background:transparent;cursor:pointer;font-size:1.2rem;display:flex;align-items:center;justify-content:center;transition:background .12s;line-height:1}
.emo:hover{background:rgba(255,255,255,.1)}

/* ── Partner Left ── */
.left-wrap{text-align:center}
.left-icon-wrap{width:72px;height:72px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 22px;font-size:1.8rem}
.left-title{font-size:1.4rem;font-weight:700;margin-bottom:8px}
.left-sub{color:rgba(255,255,255,.4);font-size:.88rem;margin-bottom:28px}

/* ── Utility ── */
input[type=file]{display:none}
</style>
</head>
<body>

<canvas id="bg-canvas"></canvas>
<div id="particles"></div>

<!-- Gender Select -->
<div class="screen" id="screen-gender">
  <div class="logo-wrap">
    <div class="logo">Strangoo</div>
    <div class="tagline">Meet someone new, right now</div>
  </div>
  <div class="glass">
    <div class="section-label">I am a</div>
    <div class="gender-grid">
      <button class="gender-btn male" onclick="selectGender('male')">
        <div class="g-avatar">${personSVG(26)}</div>
        <span>Male</span>
      </button>
      <button class="gender-btn female" onclick="selectGender('female')">
        <div class="g-avatar">${personSVG(26)}</div>
        <span>Female</span>
      </button>
    </div>
  </div>
  <div class="anon-badge"><div class="anon-dot"></div>Anonymous · No account needed<div class="anon-dot"></div></div>
</div>

<!-- Name Entry -->
<div class="screen" id="screen-name">
  <div class="glass">
    <div class="name-avatar" id="name-av"></div>
    <div class="form-title">What's your name?</div>
    <div class="form-sub">Use any name — you stay anonymous</div>
    <div class="input-wrap">
      <input class="premium-input" type="text" id="name-input" maxlength="20" placeholder="Your display name"
        oninput="document.getElementById('name-go').disabled=!this.value.trim()"
        onkeydown="if(event.key==='Enter')submitName()"/>
    </div>
    <button class="primary-btn" id="name-go" onclick="submitName()" disabled>Start Chatting →</button>
  </div>
</div>

<!-- Waiting -->
<div class="screen" id="screen-waiting">
  <div class="wait-center">
    <div class="pulse-wrap">
      <div class="pulse-ring"></div>
      <div class="pulse-ring"></div>
      <div class="pulse-ring"></div>
      <div class="pulse-avatar" id="wait-av"></div>
    </div>
    <div class="wait-title">Searching for stranger</div>
    <div class="wait-dots"><div class="wait-dot"></div><div class="wait-dot"></div><div class="wait-dot"></div></div>
    <div class="wait-sub" style="margin-top:10px">Looking around the world for you…</div>
    <button class="outline-btn" onclick="cancelSearch()">Cancel</button>
  </div>
</div>

<!-- Chat -->
<div class="screen" id="screen-chat">
  <div class="chat-header">
    <div class="h-left">
      <div class="h-avatar online" id="h-my-av"></div>
      <div class="h-names">
        <div class="h-myname" id="h-myname"></div>
        <div class="h-partnername" id="h-partner"></div>
      </div>
    </div>
    <div class="h-right">
      <div class="h-partner-av" id="h-partner-av"></div>
      <button class="next-btn" onclick="nextStranger()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
        Next
      </button>
    </div>
  </div>
  <div class="messages" id="messages"></div>
  <div class="input-area" style="position:relative">
    <div class="emoji-picker" id="emoji-picker"></div>
    <div class="img-preview-row" id="img-preview-row">
      <div class="img-preview-inner">
        <img id="img-preview"/>
        <button class="remove-img-btn" onclick="clearImage()">✕</button>
      </div>
    </div>
    <div class="input-row">
      <div class="input-box">
        <textarea class="chat-textarea" id="chat-ta" rows="1" placeholder="Type a message…"
          oninput="autoResize(this);updateSend();handleTyping()"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMsg()}"></textarea>
        <button class="ic-btn" title="Emoji" onclick="toggleEmoji(event)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </button>
      </div>
      <button class="ic-btn" title="Photo" onclick="document.getElementById('file-in').click()" style="width:42px;height:42px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.1);border-radius:50%">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
      </button>
      <input type="file" id="file-in" accept="image/*" onchange="handleImg(event)"/>
      <button class="send-btn" id="send-btn" onclick="sendMsg()" disabled>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  </div>
</div>

<!-- Partner Left -->
<div class="screen" id="screen-left">
  <div class="left-wrap">
    <div class="left-icon-wrap">👋</div>
    <div class="left-title">Stranger left</div>
    <div class="left-sub">The chat has ended</div>
    <button class="primary-btn" style="max-width:220px;margin:0 auto;display:block" onclick="nextStranger()">
      Find New Stranger →
    </button>
  </div>
</div>

<script>
// ── State ────────────────────────────────────────────────────────────────────
var gender=null,username='',partnerGender=null,partnerUsername='',pendingImg=null,socket=null;
var typingTimer=null,isTypingSent=false,typingEl=null;

// ── Star background ──────────────────────────────────────────────────────────
(function(){
  var c=document.getElementById('bg-canvas'),ctx=c.getContext('2d');
  var stars=[];
  function resize(){c.width=innerWidth;c.height=innerHeight}
  function initStars(){
    stars=[];
    for(var i=0;i<160;i++){
      stars.push({x:Math.random()*c.width,y:Math.random()*c.height,r:.5+Math.random()*1.2,a:Math.random(),da:(Math.random()-.5)*.008,spd:Math.random()*.15});
    }
  }
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    // Deep space gradient
    var g=ctx.createLinearGradient(0,0,c.width,c.height);
    g.addColorStop(0,'#0c0820');g.addColorStop(.5,'#08071a');g.addColorStop(1,'#0d1432');
    ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);
    // Stars
    stars.forEach(function(s){
      s.a+=s.da;if(s.a<=0||s.a>=1)s.da*=-1;
      s.y-=s.spd;if(s.y<0)s.y=c.height;
      ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,'+s.a.toFixed(2)+')';ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize',function(){resize();initStars()});
  resize();initStars();draw();
})();

// ── Emoji picker ─────────────────────────────────────────────────────────────
var EMOJIS=${JSON.stringify(EMOJIS)};
(function(){
  var p=document.getElementById('emoji-picker');
  EMOJIS.forEach(function(e){
    var b=document.createElement('button');b.className='emo';b.textContent=e;
    b.onclick=function(){
      var ta=document.getElementById('chat-ta');
      ta.value+=e;autoResize(ta);updateSend();
      document.getElementById('emoji-picker').classList.remove('open');
      ta.focus();
    };
    p.appendChild(b);
  });
})();

function toggleEmoji(ev){
  ev.stopPropagation();
  document.getElementById('emoji-picker').classList.toggle('open');
}
document.addEventListener('click',function(){
  document.getElementById('emoji-picker').classList.remove('open');
});

// ── Socket ───────────────────────────────────────────────────────────────────
function initSocket(){
  if(socket)return;
  socket=io({path:'/ws/socket.io',reconnection:true});
  socket.on('waiting',function(){show('screen-waiting')});
  socket.on('paired',function(d){
    partnerGender=d.partnerGender||null;
    partnerUsername=d.partnerUsername||'Stranger';
    buildHeader();clearMsgs();
    addSystem('Connected with '+partnerUsername+' \u2014 say hello!');
    show('screen-chat');
  });
  socket.on('partner_left',function(){
    removeTyping();
    addSystem(partnerUsername+' has left the chat.');
    show('screen-left');
  });
  socket.on('message',function(msg){
    removeTyping();
    addMsg(msg.type,msg.fromSelf,msg.text,msg.dataUrl);
  });
  socket.on('typing_start',function(){showTyping()});
  socket.on('typing_stop',function(){removeTyping()});
  socket.on('disconnect',function(){
    if(getCurrentScreen()==='screen-chat'||getCurrentScreen()==='screen-waiting'){
      show('screen-gender');gender=null;username='';
    }
  });
}

// ── Navigation ───────────────────────────────────────────────────────────────
function show(id){
  var prev=document.querySelector('.screen.active');
  if(prev){prev.classList.remove('visible');setTimeout(function(){prev.classList.remove('active')},50)}
  var next=document.getElementById(id);
  next.classList.add('active');
  setTimeout(function(){next.classList.add('visible')},20);
  spawnParticles();
}
function getCurrentScreen(){var a=document.querySelector('.screen.active');return a?a.id:null}

function selectGender(g){
  gender=g;setTheme(g);
  document.getElementById('name-av').innerHTML=avatarHtml(g,80);
  document.getElementById('name-input').value='';
  document.getElementById('name-go').disabled=true;
  show('screen-name');
  setTimeout(function(){document.getElementById('name-input').focus()},350);
}

function submitName(){
  var v=document.getElementById('name-input').value.trim();
  if(!v)return;
  username=v;
  document.getElementById('wait-av').innerHTML=avatarHtml(gender,64);
  initSocket();socket.emit('set_profile',{gender:gender,username:username});
  show('screen-waiting');
}

function cancelSearch(){
  show('screen-gender');gender=null;username='';
  setTheme(null);
}

function nextStranger(){
  clearMsgs();removeTyping();
  document.getElementById('wait-av').innerHTML=avatarHtml(gender,64);
  if(socket)socket.emit('next');
  else{initSocket();socket.emit('set_profile',{gender:gender,username:username});}
  show('screen-waiting');
}

// ── Theme ────────────────────────────────────────────────────────────────────
function setTheme(g){
  var t1=g==='female'?'#ec4899':'#3b82f6';
  var t2=g==='female'?'#f43f5e':'#6366f1';
  document.documentElement.style.setProperty('--t1',t1);
  document.documentElement.style.setProperty('--t2',t2);
}

// ── Avatar ───────────────────────────────────────────────────────────────────
function avatarHtml(g,size){
  var grad=g==='female'?'linear-gradient(135deg,#ec4899,#f43f5e)':'linear-gradient(135deg,#3b82f6,#6366f1)';
  var glow=g==='female'?'rgba(236,72,153,.45)':'rgba(59,130,246,.45)';
  var ic=Math.round(size*.44);
  return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+grad+';display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px '+glow+'"><svg width="'+ic+'" height="'+ic+'" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg></div>';
}

function buildHeader(){
  document.getElementById('h-my-av').innerHTML=avatarHtml(gender,38);
  document.getElementById('h-myname').textContent=username;
  document.getElementById('h-partner').textContent='Chatting with '+partnerUsername;
  document.getElementById('h-partner-av').innerHTML=avatarHtml(partnerGender||'male',32);
}

// ── Messages ─────────────────────────────────────────────────────────────────
function clearMsgs(){document.getElementById('messages').innerHTML='';typingEl=null}

function addSystem(text){
  var d=document.createElement('div');d.className='msg-system';d.textContent=text;
  appendEl(d);
}

function addMsg(type,fromSelf,text,dataUrl){
  var g=fromSelf?gender:(partnerGender||'male');
  var name=fromSelf?username:partnerUsername;
  var row=document.createElement('div');
  row.className='msg-row '+(fromSelf?'self':'');

  var avWrap=document.createElement('div');avWrap.innerHTML=avatarHtml(g,28);

  var col=document.createElement('div');col.className='msg-col';

  var nm=document.createElement('div');nm.className='msg-name';nm.textContent=name;

  var bub=document.createElement('div');
  bub.className='bubble '+(fromSelf?'self':'them');

  if(fromSelf){
    var grad=gender==='female'?'linear-gradient(135deg,#ec4899,#f43f5e)':'linear-gradient(135deg,#3b82f6,#6366f1)';
    var glow=gender==='female'?'0 6px 24px rgba(236,72,153,.4)':'0 6px 24px rgba(59,130,246,.4)';
    bub.style.background=grad;bub.style.boxShadow=glow;
  }

  if(type==='image'&&dataUrl){
    var img=document.createElement('img');img.src=dataUrl;
    img.style.cssText='max-width:220px;max-height:200px;border-radius:14px;display:block;object-fit:contain';
    bub.style.padding='4px';bub.appendChild(img);
  }else{
    bub.textContent=text||'';
  }

  col.appendChild(nm);col.appendChild(bub);

  if(fromSelf){row.appendChild(col);row.appendChild(avWrap.firstChild);}
  else{row.appendChild(avWrap.firstChild);row.appendChild(col);}

  appendEl(row);
}

function showTyping(){
  if(typingEl)return;
  var g=partnerGender||'male';
  var row=document.createElement('div');row.className='typing-row';

  var avWrap=document.createElement('div');avWrap.innerHTML=avatarHtml(g,28);

  var bub=document.createElement('div');bub.className='typing-bubble';
  for(var i=0;i<3;i++){var dot=document.createElement('div');dot.className='typing-dot';bub.appendChild(dot);}

  row.appendChild(avWrap.firstChild);row.appendChild(bub);
  typingEl=row;
  appendEl(row);
}

function removeTyping(){
  if(typingEl&&typingEl.parentNode){typingEl.parentNode.removeChild(typingEl);}
  typingEl=null;
}

function appendEl(el){
  var c=document.getElementById('messages');c.appendChild(el);
  c.scrollTop=c.scrollHeight;
}

// ── Typing events ────────────────────────────────────────────────────────────
function handleTyping(){
  if(!socket||!socket.connected)return;
  if(!isTypingSent){socket.emit('typing_start');isTypingSent=true;}
  clearTimeout(typingTimer);
  typingTimer=setTimeout(function(){socket.emit('typing_stop');isTypingSent=false;},2000);
}

// ── Input ────────────────────────────────────────────────────────────────────
function autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,100)+'px'}

function updateSend(){
  var hasText=document.getElementById('chat-ta').value.trim();
  document.getElementById('send-btn').disabled=!hasText&&!pendingImg;
}

function sendMsg(){
  if(pendingImg){
    socket.emit('message',{type:'image',dataUrl:pendingImg});clearImage();
  }
  var text=document.getElementById('chat-ta').value.trim();
  if(text){
    socket.emit('message',{type:'text',text:text});
    document.getElementById('chat-ta').value='';
    document.getElementById('chat-ta').style.height='auto';
  }
  clearTimeout(typingTimer);
  if(isTypingSent){socket.emit('typing_stop');isTypingSent=false;}
  updateSend();
  document.getElementById('chat-ta').focus();
}

function handleImg(e){
  var f=e.target.files[0];if(!f)return;
  var r=new FileReader();
  r.onload=function(ev){
    pendingImg=ev.target.result;
    document.getElementById('img-preview').src=pendingImg;
    document.getElementById('img-preview-row').style.display='block';
    updateSend();
  };
  r.readAsDataURL(f);e.target.value='';
}

function clearImage(){
  pendingImg=null;
  document.getElementById('img-preview-row').style.display='none';
  document.getElementById('img-preview').src='';
  updateSend();
}

// ── Particles ────────────────────────────────────────────────────────────────
function spawnParticles(){
  var container=document.getElementById('particles');
  container.innerHTML='';
  var isMale=gender==='male',isFemale=gender==='female';
  for(var i=0;i<20;i++){
    var p=document.createElement('div');
    p.className='particle'+(isFemale?' heart-particle':'');
    var size=7+Math.random()*14;
    var left=Math.random()*100;
    var dur=7+Math.random()*10;
    var delay=Math.random()*14;
    var sway=(Math.random()-.5)*100;
    if(isFemale){
      var alpha=.25+Math.random()*.45;
      p.style.setProperty('--hc','rgba(244,114,182,'+alpha+')');
    }else{
      var col=isMale?'rgba(96,165,250,':'rgba(167,139,250,';
      var a=.2+Math.random()*.4;
      p.style.background=col+a+')';
      p.style.boxShadow='0 0 '+(size*1.2)+'px '+(isMale?'rgba(59,130,246,.35)':'rgba(124,58,237,.3)');
    }
    p.style.cssText+='width:'+size+'px;height:'+size+'px;left:'+left+'%;animation-duration:'+dur+'s;animation-delay:'+delay+'s;';
    p.style.setProperty('--sway',sway+'px');
    p.style.setProperty('--se',(.4+Math.random()*.7));
    container.appendChild(p);
  }
}
spawnParticles();
</script>
</body>
</html>`;

function personSVG(s) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`;
}

app.get("/{*splat}", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(HTML);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Strangoo on http://localhost:${PORT}`));
