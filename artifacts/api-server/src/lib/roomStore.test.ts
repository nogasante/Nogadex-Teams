import test from "node:test";
import assert from "node:assert/strict";

async function loadFreshRoomStore() {
  const module = await import(`./roomStore.ts?case=${Date.now()}-${Math.random()}`);
  return module.roomStore as {
    createRoom: (hostName: string) => { id: string; hostName: string; createdAt: string; participantCount: number };
    getRoom: (roomId: string) => { id: string; hostName: string; createdAt: string; participantCount: number } | null;
    getParticipants: (roomId: string) => Array<{
      id: string;
      socketId: string;
      name: string;
      isHost: boolean;
      isMuted: boolean;
      isVideoOff: boolean;
      joinedAt: string;
    }>;
    addParticipant: (
      roomId: string,
      participant: {
        id: string;
        socketId: string;
        name: string;
        isHost: boolean;
        isMuted: boolean;
        isVideoOff: boolean;
      },
    ) => {
      id: string;
      socketId: string;
      name: string;
      isHost: boolean;
      isMuted: boolean;
      isVideoOff: boolean;
      joinedAt: string;
    } | null;
    updateParticipant: (
      socketId: string,
      updates: Partial<{ isMuted: boolean; isVideoOff: boolean }>,
    ) => { isMuted: boolean; isVideoOff: boolean } | null;
    removeParticipant: (socketId: string) => { roomId: string; participant: { name: string } } | null;
    getRoomForSocket: (socketId: string) => { room: { id: string }; participant: { socketId: string } } | null;
  };
}

test("creates rooms and supports case-insensitive room lookup", async () => {
  const roomStore = await loadFreshRoomStore();

  const room = roomStore.createRoom("Host User");
  const found = roomStore.getRoom(room.id.toLowerCase());

  assert.ok(/^[A-Z0-9]{8}$/.test(room.id));
  assert.equal(room.hostName, "Host User");
  assert.equal(room.participantCount, 0);
  assert.ok(Date.parse(room.createdAt) > 0);
  assert.deepEqual(found, room);
});

test("adds participants and returns room context for socket", async () => {
  const roomStore = await loadFreshRoomStore();
  const room = roomStore.createRoom("Teacher");

  const participant = roomStore.addParticipant(room.id, {
    id: "participant-1",
    socketId: "socket-1",
    name: "Alice",
    isHost: true,
    isMuted: false,
    isVideoOff: false,
  });

  const participants = roomStore.getParticipants(room.id.toLowerCase());
  const context = roomStore.getRoomForSocket("socket-1");

  assert.ok(participant);
  assert.ok(participant?.joinedAt);
  assert.equal(participants.length, 1);
  assert.equal(participants[0]?.socketId, "socket-1");
  assert.equal(roomStore.getRoom(room.id)?.participantCount, 1);
  assert.equal(context?.room.id, room.id);
  assert.equal(context?.participant.socketId, "socket-1");
});

test("returns null/empty for missing rooms and unknown sockets", async () => {
  const roomStore = await loadFreshRoomStore();

  assert.equal(roomStore.getRoom("UNKNOWN"), null);
  assert.deepEqual(roomStore.getParticipants("UNKNOWN"), []);
  assert.equal(
    roomStore.addParticipant("UNKNOWN", {
      id: "p",
      socketId: "s",
      name: "Name",
      isHost: false,
      isMuted: false,
      isVideoOff: false,
    }),
    null,
  );
  assert.equal(roomStore.updateParticipant("missing-socket", { isMuted: true }), null);
  assert.equal(roomStore.removeParticipant("missing-socket"), null);
  assert.equal(roomStore.getRoomForSocket("missing-socket"), null);
});

test("updates and removes participants, deleting room when it becomes empty", async () => {
  const roomStore = await loadFreshRoomStore();
  const room = roomStore.createRoom("Owner");

  roomStore.addParticipant(room.id, {
    id: "host-1",
    socketId: "socket-host",
    name: "Owner",
    isHost: true,
    isMuted: false,
    isVideoOff: false,
  });
  roomStore.addParticipant(room.id, {
    id: "guest-1",
    socketId: "socket-guest",
    name: "Guest",
    isHost: false,
    isMuted: false,
    isVideoOff: false,
  });

  const updated = roomStore.updateParticipant("socket-guest", {
    isMuted: true,
    isVideoOff: true,
  });
  const removedGuest = roomStore.removeParticipant("socket-guest");
  const roomAfterGuestLeave = roomStore.getRoom(room.id);
  const removedHost = roomStore.removeParticipant("socket-host");
  const roomAfterHostLeave = roomStore.getRoom(room.id);

  assert.equal(updated?.isMuted, true);
  assert.equal(updated?.isVideoOff, true);
  assert.equal(removedGuest?.roomId, room.id);
  assert.equal(removedGuest?.participant.name, "Guest");
  assert.equal(roomAfterGuestLeave?.participantCount, 1);
  assert.equal(removedHost?.roomId, room.id);
  assert.equal(roomAfterHostLeave, null);
});

