const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// ── Socket.io ────────────────────────────────────────────────────────────────

const io = new Server(server, {
  path: "/ws/socket.io",
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 5 * 1024 * 1024,
});

const waitingQueue = [];
const socketMap = new Map();

function tryPair() {
  while (waitingQueue.length >= 2) {
    const idA = waitingQueue.shift();
    const idB = waitingQueue.shift();
    const sockA = socketMap.get(idA);
    const sockB = socketMap.get(idB);
    if (!sockA || !sockB) {
      if (sockA) waitingQueue.unshift(idA);
      if (sockB) waitingQueue.unshift(idB);
      continue;
    }
    sockA.partnerId = idB;
    sockB.partnerId = idA;
    sockA.emit("paired", { partnerGender: sockB.gender, partnerUsername: sockB.username });
    sockB.emit("paired", { partnerGender: sockA.gender, partnerUsername: sockA.username });
    console.log(`Paired ${idA} <-> ${idB}`);
  }
}

function enqueue(socket) {
  if (!waitingQueue.includes(socket.id)) {
    waitingQueue.push(socket.id);
    socket.emit("waiting");
  }
}

function disconnectFromPartner(socket) {
  const partnerId = socket.partnerId;
  if (partnerId) {
    const partner = socketMap.get(partnerId);
    if (partner) {
      partner.partnerId = undefined;
      partner.emit("partner_left");
    }
    socket.partnerId = undefined;
  }
}

io.on("connection", (socket) => {
  socketMap.set(socket.id, socket);
  io.emit("online_count", socketMap.size);
  console.log(`Connected: ${socket.id} (${socketMap.size} online)`);

  socket.on("set_profile", (data) => {
    if (data.gender !== "male" && data.gender !== "female") return;
    if (typeof data.username !== "string" || data.username.length > 30) return;
    socket.gender = data.gender;
    socket.username = data.username;
    enqueue(socket);
    tryPair();
  });

  socket.on("message", (payload) => {
    const partner = socketMap.get(socket.partnerId);
    if (!partner) return;
    if (payload.type === "text") {
      if (typeof payload.text !== "string" || !payload.text.trim()) return;
      const safe = payload.text.slice(0, 500);
      partner.emit("message", { type: "text", text: safe, fromSelf: false });
      socket.emit("message", { type: "text", text: safe, fromSelf: true });
    } else if (payload.type === "image") {
      if (typeof payload.dataUrl !== "string") return;
      if (!payload.dataUrl.startsWith("data:image/")) return;
      if (payload.dataUrl.length > 4 * 1024 * 1024) return;
      partner.emit("message", { type: "image", dataUrl: payload.dataUrl, fromSelf: false });
      socket.emit("message", { type: "image", dataUrl: payload.dataUrl, fromSelf: true });
    }
  });

  socket.on("next", () => {
    disconnectFromPartner(socket);
    enqueue(socket);
    tryPair();
  });

  socket.on("disconnect", () => {
    socketMap.delete(socket.id);
    const idx = waitingQueue.indexOf(socket.id);
    if (idx !== -1) waitingQueue.splice(idx, 1);
    disconnectFromPartner(socket);
    io.emit("online_count", socketMap.size);
    console.log(`Disconnected: ${socket.id} (${socketMap.size} online)`);
  });
});

// ── Static frontend ──────────────────────────────────────────────────────────

const staticDir = path.join(__dirname, "artifacts", "chat-app", "dist", "public");
app.use(express.static(staticDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Strangoo listening on port ${PORT}`);
});
