# TutorCall

A peer-to-peer video tutoring platform built with Node.js, Express, Socket.io, and WebRTC. No sign-up required — just enter your name and join.

## Features

- **Instant Join**: Enter your name only — no account or registration needed
- **WebRTC Video Calls**: True peer-to-peer video and audio via browser WebRTC APIs
- **Video Grid**: Responsive grid showing all participants with name labels
- **Controls**: Mute/unmute, video on/off, screen sharing, leave call
- **Text Chat**: Real-time chat sidebar throughout the session
- **Host Controls**: Mute individual participants, pin/spotlight a participant's video
- **Room Management**: Unique room IDs generated automatically

## Tech Stack

- **Backend**: Node.js, Express 5, Socket.io (signaling server)
- **Frontend**: React, Vite, TailwindCSS
- **Real-time**: WebRTC for peer-to-peer connections, Socket.io for signaling
- **Monorepo**: pnpm workspaces

## Setup & Running

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Install dependencies

```bash
pnpm install
```

### Run in development

Start the API/signaling server:

```bash
pnpm --filter @workspace/api-server run dev
```

Start the frontend:

```bash
pnpm --filter @workspace/tutorcall run dev
```

### On Replit

Everything starts automatically. The API server runs on port 8080 and the frontend on the port specified by the `PORT` environment variable.

## How It Works

1. **Landing page**: Enter your name, then either:
   - **Create a Room**: Generates a unique room ID — share this with participants
   - **Join a Room**: Enter an existing room ID

2. **Video room**: WebRTC establishes peer-to-peer connections via the Socket.io signaling server. Each participant's camera/microphone stream is shared directly with other participants.

3. **Host controls**: The room creator is the host and can mute participants or spotlight/pin a specific video to the main stage.

## Architecture

```
artifacts/
  api-server/         # Express + Socket.io signaling server
    src/
      lib/
        socketServer.ts  # WebRTC signaling (offer/answer/ICE)
        roomStore.ts     # In-memory room & participant store
      routes/
        rooms.ts         # REST endpoints for room management
  tutorcall/          # React + Vite frontend
    src/
      hooks/
        useWebRTC.ts     # WebRTC + Socket.io logic
      pages/
        Home.tsx         # Landing page
        Room.tsx         # Video call room
      lib/
        socket.ts        # Socket.io client config
```

## Socket.io Events

| Event (client → server) | Payload | Description |
|---|---|---|
| `join-room` | `{ roomId, userName, isHost }` | Join a room |
| `offer` | `{ target, offer }` | Send WebRTC offer |
| `answer` | `{ target, answer }` | Send WebRTC answer |
| `ice-candidate` | `{ target, candidate }` | Send ICE candidate |
| `toggle-mute` | `{ isMuted }` | Update mute status |
| `toggle-video` | `{ isVideoOff }` | Update video status |
| `start-screen-share` | — | Begin screen share |
| `stop-screen-share` | — | End screen share |
| `mute-participant` | `{ target }` | Host mutes a participant |
| `spotlight-participant` | `{ target }` | Host spotlights a participant |
| `send-chat` | `{ content }` | Send a chat message |

| Event (server → client) | Payload | Description |
|---|---|---|
| `room-joined` | `{ participantId, participants }` | Joined successfully, existing peers |
| `user-joined` | `{ socketId, name, isHost }` | New participant arrived |
| `user-left` | `{ socketId, name }` | Participant disconnected |
| `offer` | `{ sender, offer }` | Received WebRTC offer |
| `answer` | `{ sender, answer }` | Received WebRTC answer |
| `ice-candidate` | `{ sender, candidate }` | Received ICE candidate |
| `participant-muted` | `{ socketId, isMuted }` | Participant mute state changed |
| `participant-spotlighted` | `{ socketId }` | Participant spotlighted |
| `chat-message` | `{ id, senderName, content, timestamp }` | Chat message received |
| `forced-mute` | — | You were muted by the host |
