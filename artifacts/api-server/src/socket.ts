import { Server as SocketIOServer, Socket } from "socket.io";
import http from "http";
import { logger } from "./lib/logger";

interface ChatSocket extends Socket {
  partnerId?: string;
  gender?: "male" | "female";
  username?: string;
}

const waitingQueue: string[] = [];
const socketMap = new Map<string, ChatSocket>();

function tryPair(io: SocketIOServer) {
  while (waitingQueue.length >= 2) {
    const idA = waitingQueue.shift()!;
    const idB = waitingQueue.shift()!;

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

    logger.info({ socketA: idA, socketB: idB }, "Paired two users");
  }
}

function enqueue(socket: ChatSocket) {
  if (!waitingQueue.includes(socket.id)) {
    waitingQueue.push(socket.id);
    socket.emit("waiting");
    logger.info({ socketId: socket.id }, "User added to queue");
  }
}

function disconnectFromPartner(socket: ChatSocket) {
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

function broadcastOnlineCount(io: SocketIOServer) {
  io.emit("online_count", socketMap.size);
}

export function setupSocket(server: http.Server) {
  const io = new SocketIOServer(server, {
    path: "/ws/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 5 * 1024 * 1024,
  });

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as ChatSocket;
    socketMap.set(socket.id, socket);
    logger.info({ socketId: socket.id }, "User connected");
    broadcastOnlineCount(io);

    socket.on("set_profile", (data: { gender: "male" | "female"; username: string }) => {
      if (data.gender !== "male" && data.gender !== "female") return;
      if (typeof data.username !== "string" || data.username.length > 30) return;
      socket.gender = data.gender;
      socket.username = data.username;
      enqueue(socket);
      tryPair(io);
    });

    socket.on("message", (payload: { type: "text"; text: string } | { type: "image"; dataUrl: string }) => {
      const partnerId = socket.partnerId;
      if (!partnerId) return;
      const partner = socketMap.get(partnerId);
      if (!partner) return;

      if (payload.type === "text") {
        if (typeof payload.text !== "string" || payload.text.trim().length === 0) return;
        const safeText = payload.text.slice(0, 500);
        partner.emit("message", { type: "text", text: safeText, fromSelf: false });
        socket.emit("message", { type: "text", text: safeText, fromSelf: true });
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
      tryPair(io);
    });

    socket.on("disconnect", () => {
      socketMap.delete(socket.id);
      const idx = waitingQueue.indexOf(socket.id);
      if (idx !== -1) waitingQueue.splice(idx, 1);
      disconnectFromPartner(socket);
      broadcastOnlineCount(io);
      logger.info({ socketId: socket.id }, "User disconnected");
    });
  });

  return io;
}
