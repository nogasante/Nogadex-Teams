import { randomUUID } from "crypto";

export interface RoomParticipant {
  id: string;
  socketId: string;
  name: string;
  isHost: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  joinedAt: string;
}

export interface Room {
  id: string;
  hostName: string;
  createdAt: string;
  participantCount: number;
}

interface RoomData {
  id: string;
  hostName: string;
  createdAt: string;
  participants: Map<string, RoomParticipant>;
}

class RoomStore {
  private rooms: Map<string, RoomData> = new Map();

  createRoom(hostName: string): Room {
    const id = randomUUID().slice(0, 8).toUpperCase();
    const room: RoomData = {
      id,
      hostName,
      createdAt: new Date().toISOString(),
      participants: new Map(),
    };
    this.rooms.set(id, room);
    return this.toPublic(room);
  }

  getRoom(roomId: string): Room | null {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) return null;
    return this.toPublic(room);
  }

  getParticipants(roomId: string): RoomParticipant[] {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) return [];
    return Array.from(room.participants.values()).map((p) => ({
      id: p.id,
      socketId: p.socketId,
      name: p.name,
      isHost: p.isHost,
      isMuted: p.isMuted,
      isVideoOff: p.isVideoOff,
      joinedAt: p.joinedAt,
    }));
  }

  addParticipant(roomId: string, participant: Omit<RoomParticipant, "joinedAt">): RoomParticipant | null {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) return null;
    const p: RoomParticipant = {
      ...participant,
      joinedAt: new Date().toISOString(),
    };
    room.participants.set(participant.socketId, p);
    return p;
  }

  removeParticipant(socketId: string): { roomId: string; participant: RoomParticipant } | null {
    for (const [roomId, room] of this.rooms) {
      const participant = room.participants.get(socketId);
      if (participant) {
        room.participants.delete(socketId);
        if (room.participants.size === 0) {
          this.rooms.delete(roomId);
        }
        return { roomId, participant };
      }
    }
    return null;
  }

  updateParticipant(socketId: string, updates: Partial<Pick<RoomParticipant, "isMuted" | "isVideoOff">>): RoomParticipant | null {
    for (const room of this.rooms.values()) {
      const participant = room.participants.get(socketId);
      if (participant) {
        Object.assign(participant, updates);
        return participant;
      }
    }
    return null;
  }

  getRoomForSocket(socketId: string): { room: RoomData; participant: RoomParticipant } | null {
    for (const room of this.rooms.values()) {
      const participant = room.participants.get(socketId);
      if (participant) return { room, participant };
    }
    return null;
  }

  private toPublic(room: RoomData): Room {
    return {
      id: room.id,
      hostName: room.hostName,
      createdAt: room.createdAt,
      participantCount: room.participants.size,
    };
  }
}

export const roomStore = new RoomStore();
