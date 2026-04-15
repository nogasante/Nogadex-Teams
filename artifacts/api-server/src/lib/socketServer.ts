import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { roomStore } from "./roomStore.js";
import { logger } from "./logger.js";
import { randomUUID } from "crypto";
import { isAllowedOrigin } from "./runtimeConfig.js";

const ROOM_ID_PATTERN = /^[A-Z0-9]{6,12}$/;
const MAX_NAME_LENGTH = 80;
const MAX_CHAT_MESSAGE_LENGTH = 1000;

const RATE_LIMITS = {
  joinRoom: { limit: 5, windowMs: 60_000 },
  sendChat: { limit: 20, windowMs: 10_000 },
  sendReaction: { limit: 15, windowMs: 10_000 },
  signaling: { limit: 120, windowMs: 10_000 },
} as const;

interface EventWindow {
  startedAt: number;
  count: number;
}

const eventWindows = new Map<string, EventWindow>();
let lastRateLimitCleanupAt = 0;

function getRateLimitWindowForEvent(eventName: string | undefined) {
  const rateLimitKeyByEvent: Record<string, keyof typeof RATE_LIMITS> = {
    "join-room": "joinRoom",
    "send-chat": "sendChat",
    "send-reaction": "sendReaction",
  };
  const key = eventName ? rateLimitKeyByEvent[eventName] : undefined;
  return key ? RATE_LIMITS[key] : RATE_LIMITS.signaling;
}

function cleanupExpiredWindows(now: number): void {
  if (now - lastRateLimitCleanupAt < 60_000) {
    return;
  }
  lastRateLimitCleanupAt = now;

  for (const [key, entry] of eventWindows.entries()) {
    const [, eventName] = key.split(":", 2);
    const currentLimit = getRateLimitWindowForEvent(eventName);

    if (now - entry.startedAt >= currentLimit.windowMs) {
      eventWindows.delete(key);
    }
  }
}

function consumeRateLimit(
  socketId: string,
  eventName: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  cleanupExpiredWindows(now);
  const key = `${socketId}:${eventName}`;
  const existing = eventWindows.get(key);

  if (!existing || now - existing.startedAt >= windowMs) {
    eventWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}

function toSafeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isJoinRoomPayload(
  payload: unknown,
): payload is {
  roomId: string;
  userName: string;
  isHost: boolean;
  audioOnly?: boolean;
} {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  const roomId = toSafeString(candidate["roomId"]);
  const userName = toSafeString(candidate["userName"]);
  const isHost = candidate["isHost"];
  const audioOnly = candidate["audioOnly"];

  const validAudioOnly =
    audioOnly === undefined || typeof audioOnly === "boolean";

  return (
    ROOM_ID_PATTERN.test(roomId.toUpperCase()) &&
    userName.length >= 2 &&
    userName.length <= MAX_NAME_LENGTH &&
    typeof isHost === "boolean" &&
    validAudioOnly
  );
}

function isSendChatPayload(
  payload: unknown,
): payload is { content?: string; message?: string; id?: string; timestamp?: number } {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  const content = toSafeString(candidate["content"]);
  const message = toSafeString(candidate["message"]);
  const hasBody = content.length > 0 || message.length > 0;

  if (!hasBody) {
    return false;
  }

  if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
    return false;
  }

  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    return false;
  }

  if (candidate["id"] !== undefined && typeof candidate["id"] !== "string") {
    return false;
  }

  if (
    candidate["timestamp"] !== undefined &&
    typeof candidate["timestamp"] !== "number"
  ) {
    return false;
  }

  return true;
}

function isSendReactionPayload(payload: unknown): payload is { emoji: string } {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  const emoji = toSafeString(candidate["emoji"]);
  return emoji.length > 0 && emoji.length <= 8;
}

function isSignalPayload(
  payload: unknown,
): payload is { target: string; offer?: unknown; answer?: unknown; candidate?: unknown } {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  const target = toSafeString(candidate["target"]);
  if (target.length < 2 || target.length > 128) {
    return false;
  }
  return true;
}

export function setupSocketIO(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    path: "/api/socket.io",
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Socket CORS origin denied"));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on("join-room", (payload: unknown) => {
      if (
        !consumeRateLimit(
          socket.id,
          "join-room",
          RATE_LIMITS.joinRoom.limit,
          RATE_LIMITS.joinRoom.windowMs,
        )
      ) {
        socket.emit("error", { message: "Rate limit exceeded for join-room" });
        return;
      }

      if (!isJoinRoomPayload(payload)) {
        socket.emit("error", { message: "Invalid join-room payload" });
        return;
      }

      const { roomId, userName, isHost, audioOnly } = payload;
      const upperRoomId = roomId.toUpperCase();
      const participantId = randomUUID();

      const participant = roomStore.addParticipant(upperRoomId, {
        id: participantId,
        socketId: socket.id,
        name: userName,
        isHost,
        isMuted: false,
        isVideoOff: audioOnly ?? false,
      });

      if (!participant) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      socket.join(upperRoomId);

      const existingParticipants = roomStore.getParticipants(upperRoomId).filter(
        (p) => p.socketId !== socket.id
      );

      socket.emit("room-joined", {
        participantId,
        participants: existingParticipants,
      });

      socket.to(upperRoomId).emit("user-joined", {
        participantId,
        socketId: socket.id,
        name: userName,
        isHost,
        audioOnly: audioOnly ?? false,
      });

      logger.info({ socketId: socket.id, roomId: upperRoomId, userName }, "User joined room");
    });

    socket.on("offer", (payload: unknown) => {
      if (
        !consumeRateLimit(
          socket.id,
          "offer",
          RATE_LIMITS.signaling.limit,
          RATE_LIMITS.signaling.windowMs,
        )
      ) {
        socket.emit("error", { message: "Rate limit exceeded for offer" });
        return;
      }
      if (!isSignalPayload(payload) || payload.offer === undefined) {
        socket.emit("error", { message: "Invalid offer payload" });
        return;
      }
      const { target, offer } = payload;
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx) return;
      io.to(target).emit("offer", {
        sender: socket.id,
        userName: ctx.participant.name,
        isHost: ctx.participant.isHost,
        offer,
      });
    });

    socket.on("answer", (payload: unknown) => {
      if (
        !consumeRateLimit(
          socket.id,
          "answer",
          RATE_LIMITS.signaling.limit,
          RATE_LIMITS.signaling.windowMs,
        )
      ) {
        socket.emit("error", { message: "Rate limit exceeded for answer" });
        return;
      }
      if (!isSignalPayload(payload) || payload.answer === undefined) {
        socket.emit("error", { message: "Invalid answer payload" });
        return;
      }
      const { target, answer } = payload;
      io.to(target).emit("answer", {
        sender: socket.id,
        answer,
      });
    });

    socket.on("ice-candidate", (payload: unknown) => {
      if (
        !consumeRateLimit(
          socket.id,
          "ice-candidate",
          RATE_LIMITS.signaling.limit,
          RATE_LIMITS.signaling.windowMs,
        )
      ) {
        socket.emit("error", { message: "Rate limit exceeded for ice-candidate" });
        return;
      }
      if (!isSignalPayload(payload) || payload.candidate === undefined) {
        socket.emit("error", { message: "Invalid ice-candidate payload" });
        return;
      }
      const { target, candidate } = payload;
      io.to(target).emit("ice-candidate", {
        sender: socket.id,
        candidate,
      });
    });

    socket.on("toggle-mute", ({ isMuted }: { isMuted: boolean }) => {
      const updated = roomStore.updateParticipant(socket.id, { isMuted });
      if (!updated) return;
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx) return;
      socket.to(ctx.room.id).emit("participant-muted", {
        socketId: socket.id,
        isMuted,
      });
    });

    socket.on("toggle-video", ({ isVideoOff }: { isVideoOff: boolean }) => {
      const updated = roomStore.updateParticipant(socket.id, { isVideoOff });
      if (!updated) return;
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx) return;
      socket.to(ctx.room.id).emit("participant-video-toggled", {
        socketId: socket.id,
        isVideoOff,
      });
    });

    socket.on("start-screen-share", () => {
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx) return;
      socket.to(ctx.room.id).emit("screen-share-started", { socketId: socket.id });
    });

    socket.on("stop-screen-share", () => {
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx) return;
      socket.to(ctx.room.id).emit("screen-share-stopped", { socketId: socket.id });
    });

    socket.on("mute-participant", ({ target }: { target: string }) => {
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx || !ctx.participant.isHost) return;
      roomStore.updateParticipant(target, { isMuted: true });
      io.to(target).emit("forced-mute");
      socket.to(ctx.room.id).emit("participant-muted", {
        socketId: target,
        isMuted: true,
      });
    });

    socket.on("spotlight-participant", ({ target }: { target: string | null }) => {
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx || !ctx.participant.isHost) return;
      io.to(ctx.room.id).emit("participant-spotlighted", { socketId: target });
    });

    socket.on("send-chat", (payload: unknown) => {
      if (
        !consumeRateLimit(
          socket.id,
          "send-chat",
          RATE_LIMITS.sendChat.limit,
          RATE_LIMITS.sendChat.windowMs,
        )
      ) {
        socket.emit("error", { message: "Rate limit exceeded for send-chat" });
        return;
      }

      if (!isSendChatPayload(payload)) {
        socket.emit("error", { message: "Invalid send-chat payload" });
        return;
      }

      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx) return;
      const content = payload.content || payload.message || "";
      const chatMessage = {
        id: payload.id || randomUUID(),
        senderName: ctx.participant.name,
        socketId: socket.id,
        content,
        timestamp: payload.timestamp || Date.now(),
      };
      io.to(ctx.room.id).emit("chat-message", chatMessage);
    });

    // Raise / lower hand
    socket.on("raise-hand", () => {
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx) return;
      io.to(ctx.room.id).emit("hand-raised", {
        socketId: socket.id,
        name: ctx.participant.name,
      });
    });

    socket.on("lower-hand", () => {
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx) return;
      io.to(ctx.room.id).emit("hand-lowered", { socketId: socket.id });
    });

    // Reactions (emoji)
    socket.on("send-reaction", (payload: unknown) => {
      if (
        !consumeRateLimit(
          socket.id,
          "send-reaction",
          RATE_LIMITS.sendReaction.limit,
          RATE_LIMITS.sendReaction.windowMs,
        )
      ) {
        socket.emit("error", { message: "Rate limit exceeded for send-reaction" });
        return;
      }

      if (!isSendReactionPayload(payload)) {
        socket.emit("error", { message: "Invalid send-reaction payload" });
        return;
      }

      const { emoji } = payload;
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx) return;
      io.to(ctx.room.id).emit("reaction", {
        id: randomUUID(),
        socketId: socket.id,
        senderName: ctx.participant.name,
        emoji,
        timestamp: Date.now(),
      });
    });

    // Host: lower someone else's hand
    socket.on("host-lower-hand", ({ target }: { target: string }) => {
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx || !ctx.participant.isHost) return;
      io.to(ctx.room.id).emit("hand-lowered", { socketId: target });
    });

    socket.on("disconnect", () => {
      for (const key of eventWindows.keys()) {
        if (key.startsWith(`${socket.id}:`)) {
          eventWindows.delete(key);
        }
      }
      const result = roomStore.removeParticipant(socket.id);
      if (result) {
        const { roomId, participant } = result;
        socket.to(roomId).emit("user-left", {
          socketId: socket.id,
          name: participant.name,
        });
        logger.info({ socketId: socket.id, roomId, name: participant.name }, "User left room");
      }
      logger.info({ socketId: socket.id }, "Socket disconnected");
    });
  });

  return io;
}
