import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { roomStore } from "./roomStore.js";
import { logger } from "./logger.js";
import { randomUUID } from "crypto";

export function setupSocketIO(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    path: "/api/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on("join-room", ({ roomId, userName, isHost, audioOnly }: { roomId: string; userName: string; isHost: boolean; audioOnly?: boolean }) => {
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

    socket.on("offer", ({ target, offer }: { target: string; offer: RTCSessionDescriptionInit }) => {
      const ctx = roomStore.getRoomForSocket(socket.id);
      if (!ctx) return;
      io.to(target).emit("offer", {
        sender: socket.id,
        userName: ctx.participant.name,
        isHost: ctx.participant.isHost,
        offer,
      });
    });

    socket.on("answer", ({ target, answer }: { target: string; answer: RTCSessionDescriptionInit }) => {
      io.to(target).emit("answer", {
        sender: socket.id,
        answer,
      });
    });

    socket.on("ice-candidate", ({ target, candidate }: { target: string; candidate: RTCIceCandidateInit }) => {
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

    socket.on("send-chat", (payload: { content?: string; message?: string; id?: string; timestamp?: number }) => {
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
    socket.on("send-reaction", ({ emoji }: { emoji: string }) => {
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
