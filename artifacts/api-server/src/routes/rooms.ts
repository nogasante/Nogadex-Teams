import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { CreateRoomBody, GetRoomParams, GetRoomParticipantsParams } from "@workspace/api-zod";
import type { Server as SocketServer } from "socket.io";
import { roomStore } from "../lib/roomStore.js";

const router: IRouter = Router();

router.post("/rooms", (req, res) => {
  const parsed = CreateRoomBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { hostName } = parsed.data;
  const room = roomStore.createRoom(hostName);
  res.status(201).json(room);
});

router.get("/rooms/:roomId", (req, res) => {
  const parsed = GetRoomParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid room ID" });
    return;
  }
  const room = roomStore.getRoom(parsed.data.roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json(room);
});

router.get("/rooms/:roomId/participants", (req, res) => {
  const parsed = GetRoomParticipantsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid room ID" });
    return;
  }
  const participants = roomStore.getParticipants(parsed.data.roomId);
  res.json({ participants });
});

export default router;
