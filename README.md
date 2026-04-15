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

### Runtime environment assumptions

The app expects environment variables to be provided explicitly.

- API server (`artifacts/api-server`)
  - `PORT` (required): port for Express + Socket.IO
  - `CORS_ALLOWED_ORIGINS` (recommended): comma-separated allowed web origins
  - `FRONTEND_ORIGIN` (optional fallback if `CORS_ALLOWED_ORIGINS` is unset)
  - `NODE_ENV`, `LOG_LEVEL` (optional)
- Frontend (`artifacts/tutorcall`)
  - `PORT` (required by `vite.config.ts`)
  - `BASE_PATH` (required by `vite.config.ts`, use `/` unless deploying under subpath)

Use:

- `/home/runner/work/Nogadex-Teams/Nogadex-Teams/artifacts/api-server/.env.example`
- `/home/runner/work/Nogadex-Teams/Nogadex-Teams/artifacts/tutorcall/.env.example`

### Run in development

Start the API/signaling server:

```bash
set -a && source artifacts/api-server/.env.example && set +a
pnpm --filter @workspace/api-server run dev
```

Start the frontend:

```bash
set -a && source artifacts/tutorcall/.env.example && set +a
pnpm --filter @workspace/tutorcall run dev
```

### On Replit

Everything starts automatically. The API server runs on port 8080 and the frontend on the port specified by the `PORT` environment variable.

## Runbook (local, staging, production)

### Local

1. Copy both `.env.example` files to `.env` in each artifact package.
   (or export values from those files into your shell/session)
2. Run API and frontend in separate terminals:
   - `pnpm --filter @workspace/api-server run dev`
   - `pnpm --filter @workspace/tutorcall run dev`
3. Confirm health check: `GET /api/healthz`.

### Staging

1. Set staged env values:
   - API: `PORT`, `CORS_ALLOWED_ORIGINS` with staging frontend URL(s)
   - Frontend: `PORT`, `BASE_PATH=/` (or staging subpath)
2. Run:
   - `pnpm run typecheck`
   - `pnpm run build`
3. Smoke checks:
   - API health endpoint responds `{"status":"ok"}`
   - frontend build output contains `artifacts/tutorcall/dist/public/index.html`

### Production

1. Provision env vars explicitly (do not rely on defaults).
2. Set strict CORS origins using `CORS_ALLOWED_ORIGINS`.
3. Build and start API:
   - `pnpm --filter @workspace/api-server run build`
   - `PORT=<port> pnpm --filter @workspace/api-server run start`
4. Build and serve frontend artifacts from `artifacts/tutorcall/dist/public`.

## CI and required checks before merge

- CI workflow is defined at `.github/workflows/ci.yml` and runs install, typecheck, build, and smoke checks.
- In GitHub repository settings, enable branch protection and require the `CI` check to pass before merge.

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
