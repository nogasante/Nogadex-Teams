# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (available but not used for TutorCall)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/tutorcall run dev` — run frontend locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## TutorCall Application

### Architecture

A peer-to-peer video tutoring platform with:
- **Frontend**: React + Vite at `/` (artifacts/tutorcall)
- **Backend**: Express + Socket.io at `/api` (artifacts/api-server)

### Key Files

- `artifacts/api-server/src/lib/socketServer.ts` — Socket.io signaling server for WebRTC
- `artifacts/api-server/src/lib/roomStore.ts` — In-memory room & participant management
- `artifacts/api-server/src/routes/rooms.ts` — REST API for rooms
- `artifacts/tutorcall/src/hooks/useWebRTC.ts` — WebRTC + Socket.io client hook
- `artifacts/tutorcall/src/pages/Home.tsx` — Landing page (join/create room)
- `artifacts/tutorcall/src/pages/Room.tsx` — Video call room UI
- `artifacts/tutorcall/src/lib/socket.ts` — Socket.io client config

### Features

- Name-only join (no sign-up)
- WebRTC peer-to-peer video/audio
- Video grid with participant names
- Mute/unmute, video on/off, screen sharing
- Text chat sidebar
- Host controls: mute participants, spotlight/pin a video
- Unique room IDs via REST API

### Socket.io Path

The Socket.io server is mounted at `/api/socket.io` (under the `/api` proxy path).
