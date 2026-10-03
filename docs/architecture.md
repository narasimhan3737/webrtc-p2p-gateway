# Architecture — how the POC works

Concept Pro Connect is a dual-mode WebRTC spike: one NestJS + React stack, two media paths selected at runtime by `MEDIA_MODE`.

| Mode | What streams | Who terminates WebRTC |
|------|--------------|------------------------|
| `dm` | Cameras on an NVR via DM Mediaserver | Browser ↔ DM Mediaserver |
| `p2p` | Webcam from NVR Simulator | Browser ↔ Browser (TURN if needed) |

Shared layers (auth, orgs, NVRs, devices UI) stay the same; only the live-media path changes.

## System context

```
                    ┌─────────────────────────────────────────────┐
                    │                 Operator browsers            │
                    │         React SPA  (Vite :3000)             │
                    └───────────┬───────────────────┬─────────────┘
                                │ REST + JWT        │
              ┌─────────────────▼───────────────────▼─────────────────┐
              │              NestJS API  (:3001)                      │
              │  Auth · NVRs · Cameras · Config · Signaling (P2P)     │
              └───┬──────────┬──────────┬──────────┬──────────────────┘
                  │          │          │          │
           Postgres     Redis*     Coturn*    DM Mediaserver*
            :5432       :6379       :3478         :1984
                                  (P2P only)   (DM mode only)

* Redis + Coturn required for P2P. DM Mediaserver required for dm mode.
```

| Component | Port | Responsibility |
|-----------|------|----------------|
| React SPA | 3000 | Login, devices, live grid (dm) or Simulator/Watch (p2p) |
| NestJS | 3001 | REST API, JWT, Socket.IO `/signaling`, DM proxy helpers |
| Postgres | 5432 | Orgs, users, NVRs, cameras |
| Redis | 6379 | Signaling message fanout (P2P) |
| Coturn | 3478 | TURN relay for P2P ICE |
| DM Mediaserver | 1984 | Ingest RTSP / stream keys; WebRTC to browsers (DM) |

## Dual-mode switch

```
backend/.env          GET /config                 SPA
MEDIA_MODE=dm|p2p  ──►  { mediaMode, … }  ──►  useAppConfig()
                                                 │
                         ┌───────────────────────┴───────────────────────┐
                         │ mediaMode === 'dm'      mediaMode === 'p2p'   │
                         │ Home: camera grid       Home: NVR list        │
                         │ WebRTCPlayer → DM       /simulator, /watch    │
                         │ Redis/Coturn optional   Redis + Coturn needed │
                         └───────────────────────────────────────────────┘
```

- Flip mode by changing `MEDIA_MODE` and **restarting Nest** — no frontend rebuild.
- Routes `/simulator` and `/watch/:nvrId` are gated by `RequireP2p` and redirect home in `dm` mode.
- `GET /config` also exposes `dmMediaserverPublicBase` and `signalingPath: '/signaling'`.

## Domain model

```
Organization 1──* User
      │
      ├──* NvrDevice  (status: online | offline; used by both modes)
      │        │
      │        └──* Camera  (streamKey, optional rtspUrl — primarily DM mode)
```

| Entity | Purpose |
|--------|---------|
| **Organization** | Tenant boundary; JWT carries `organizationId` |
| **User** | `admin` \| `member`; login issues JWT |
| **NvrDevice** | Logical device. P2P room key = `{orgId}:{nvrId}`. Status flipped when a simulator joins/leaves |
| **Camera** | Points at a DM Mediaserver `streamKey` (and optional RTSP register). Not used as the P2P room key |

All list/join operations are org-scoped. Cross-org access is rejected.

## Backend module map

```
AppModule
├── AuthModule          login / register / JWT strategy
├── NvrsModule          CRUD + status (online/offline)
├── CamerasModule       CRUD + stream-info; registers RTSP on DM when needed
├── DmMediaserverModule HTTP client to DM Mediaserver API
├── SignalingModule     Socket.IO gateway + Redis pub/sub (P2P)
├── SeedModule          demo orgs / users / NVRs / cameras on boot
├── HealthController
└── AppConfigController GET /config
```

Media bytes never pass through Nest in either mode. Nest only:

- Stores metadata and auth
- Registers/imports streams on DM Mediaserver (`dm`)
- Relays SDP/ICE over Socket.IO (`p2p`)

## Frontend structure

```
App (routes)
├── /login
└── Layout (auth required)
    ├── /           HomePage     — camera tiles (dm) or NVR dashboard (p2p)
    ├── /devices    DevicesPage  — manage NVRs + cameras
    ├── /simulator  SimulatorPage  (p2p only) — publish webcam
    └── /watch/:id  WatchPage      (p2p only) — receive stream

webrtc/peer.ts              P2P RTCPeerConnection + Socket.IO
utils/dmMediaserver*.ts     DM WebRTC session (WS to mediaserver)
components/WebRTCPlayer.tsx DM tile player
state/appConfig.tsx         loads GET /config
```

## Mode A — DM Mediaserver (`MEDIA_MODE=dm`)

Browser plays camera streams from an external mediaserver. Nest is control plane only.

```
┌──────────┐  REST: cameras, stream-info   ┌──────────┐  HTTP register/API  ┌────────────────┐
│  Browser │ ─────────────────────────────►│   Nest   │ ───────────────────►│ DM Mediaserver │
│  SPA     │                               │          │                     │    :1984       │
│          │  WebRTC WS /api/ws (media)    │          │                     │                │
│          │ ◄─────────────────────────────────────────────────────────────►│  RTSP / keys   │
└──────────┘                               └──────────┘                     └───────┬────────┘
                                                                                    │
                                                                              IP cameras / NVR
```

### Runtime flow

1. User logs in → JWT.
2. Sidebar / home lists **cameras** for the org (`GET /cameras`).
3. Selecting a camera mounts `WebRTCPlayer`.
4. Player calls `GET /cameras/:id/stream-info` → `{ streamKey, httpBase, wsUrl, … }`.
5. Browser opens a WebRTC session to DM Mediaserver (`startDmMediaserverSession`) using that stream key — **not** through Nest Socket.IO.
6. Adding a camera with `rtspUrl` makes Nest call DM Mediaserver to register the stream, then persists the camera row.

### When to use

Live NVR / RTSP pipelines where a mediaserver already terminates WebRTC to many viewers.

## Mode B — P2P (`MEDIA_MODE=p2p`)

Two browsers share an NVR room. Nest + Redis carry signaling; Coturn helps ICE across NATs.

```
 Simulator browser              Nest :3001 + Redis           Viewer browser
 ┌──────────────────┐     ┌─────────────────────────┐     ┌──────────────────┐
 │ getUserMedia     │     │ Socket.IO /signaling    │     │ <video>          │
 │ RTCPeerConnection│◄───►│ JWT · org · room        │◄───►│ RTCPeerConnection│
 │                  │ SDP │ Redis: signaling:org:nvr│ SDP │                  │
 └────────┬─────────┘ ICE └─────────────────────────┘ ICE └────────┬─────────┘
          │                         media                          │
          └──────────── host / STUN / Coturn TURN ─────────────────┘
```

### Runtime flow (summary)

1. Both users in the **same org** open Simulator and Watch for the **same NVR**.
2. Each connects Socket.IO with JWT → `join { nvrId, role }`.
3. Room id = `{organizationId}:{nvrId}` — max one simulator + one viewer.
4. Simulator publishes webcam tracks; perfect negotiation (viewer polite) exchanges SDP.
5. ICE candidates trickle via `ice` events; media is peer-to-peer or TURN-relayed.

Full handshake, events, and multi-device TURN setup: **[p2p-connection.md](./p2p-connection.md)**.

### When to use

POC of device-to-viewer streaming without a mediaserver; validate signaling + TURN across machines.

## Request paths by concern

| Concern | Path |
|---------|------|
| Auth | `POST /auth/login`, `GET /me` |
| Runtime mode | `GET /config` |
| Devices | `GET|POST /nvrs`, `GET|POST /nvrs/:id/cameras`, … |
| DM play | REST stream-info → browser → DM Mediaserver WS |
| P2P play | Socket.IO `/signaling` → browser ↔ browser (+ Coturn) |
| Health | `GET /health`, `GET /dm-mediaserver/health` |

## Data vs media plane

```
                 CONTROL PLANE                         MEDIA PLANE
        (Nest REST, JWT, Socket.IO SDP/ICE)     (RTP / WebRTC media bytes)

  dm:   Nest ↔ Postgres, Nest ↔ DM API          Browser ↔ DM Mediaserver
  p2p:  Nest ↔ Postgres, Nest ↔ Redis           Browser ↔ Browser (or TURN)
```

Keeping planes separate means Nest stays lightweight: metadata and signaling only.

## Deployment shapes

| Shape | What runs | Notes |
|-------|-----------|--------|
| Local DM | Postgres + Nest + SPA + DM Mediaserver | Redis/Coturn optional |
| Local P2P same machine | Postgres + Redis + Coturn + Nest + SPA | Two browser profiles / users |
| P2P multi-device LAN | Same + `TURN_EXTERNAL_IP` / `VITE_TURN_HOST` = host LAN IP | See p2p-connection.md |
| Signaling via ngrok | Nest/SPA tunneled; TURN still on LAN or public TURN | HTTP tunnel ≠ media path |

## Design constraints (POC)

- One Nest process for signaling occupancy (room map is in-memory; Redis fans out messages only).
- P2P is **1:1 per NVR room**, not multi-viewer fanout.
- Cameras are the playable unit in **dm**; NVRs are the playable unit in **p2p**.
- Seeded `streamKey` values (`NVR2_CAM_*_LOW`) must exist on DM Mediaserver for out-of-the-box dm demos.
