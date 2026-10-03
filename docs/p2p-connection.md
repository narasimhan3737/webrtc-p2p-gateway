# How P2P connects between devices

This document explains how two devices establish a peer-to-peer WebRTC session in `MEDIA_MODE=p2p`: signaling, negotiation, ICE/TURN, and multi-machine setup.

For the full dual-mode system design (DM vs P2P, modules, data model), see **[architecture.md](./architecture.md)**.

> Cameras / `streamKey` / DM Mediaserver belong to **`dm` mode**. P2P rooms are keyed by **NVR**, not by camera.

## Architecture at a glance

```
 Device A (Simulator)              Nest + Redis              Device B (Viewer)
 ┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
 │ Webcam + RTCPeer    │────►│ Socket.IO /signaling │◄────│ RTCPeerConnection   │
 │ Connection          │ SDP │ JWT auth, org check  │ SDP │ <video> sink        │
 │                     │ ICE │ Redis pub/sub fanout │ ICE │                     │
 └──────────┬──────────┘     └──────────────────────┘     └──────────┬──────────┘
            │                                                         │
            │         media (UDP / host / srflx / relay)              │
            └──────────────────── Coturn TURN ────────────────────────┘
                              (when direct path fails)
```

| Piece | Role |
|-------|------|
| Nest signaling (`/signaling`) | Auth, room join, relay SDP + ICE only — **no media** |
| Redis | Pub/sub channel `signaling:{orgId}:{nvrId}` so peers get events once |
| Coturn | TURN on `:3478` (+ UDP relay `49152–49200`) for NAT / cross-network |
| Simulator page | Publishes webcam tracks (`role: simulator`) |
| Watch page | Receives remote stream (`role: viewer`) |

Media never flows through Nest or Redis. Those only carry signaling.

## Room model

```
roomId = `${organizationId}:${nvrId}`
```

- Join uses **`nvrId`** + **`role`** (`simulator` | `viewer`).
- JWT must match the NVR's organization (cross-org join is rejected).
- At most **one simulator** and **one viewer** per room.
- Simulator is **impolite**; viewer is **polite** (perfect negotiation).

Peers discover each other only by joining the same org-scoped NVR room — not by scanning cameras or IPs.

## Connection sequence

Typical demo: Alice publishes on an NVR; Bob watches the same NVR in the same org.

```
Simulator                         Signaling                         Viewer
    │                                 │                                │
    │  connect + auth JWT             │                                │
    │────────────────────────────────►│                                │
    │  join { nvrId, role:simulator } │                                │
    │────────────────────────────────►│                                │
    │  welcome { peers: [] }          │                                │
    │◄────────────────────────────────│                                │
    │  (waits — no publish yet)       │                                │
    │                                 │  connect + auth JWT            │
    │                                 │◄───────────────────────────────│
    │                                 │  join { nvrId, role:viewer }   │
    │                                 │◄───────────────────────────────│
    │  peer-joined                    │  welcome { peers: [simulator] }│
    │◄────────────────────────────────│───────────────────────────────►│
    │  addTrack → negotiationneeded   │                                │
    │  description (offer)            │                                │
    │────────────────────────────────►│────────────────────────────────►│
    │                                 │  setRemoteDescription(offer)   │
    │                                 │  description (answer)          │
    │◄────────────────────────────────│◄───────────────────────────────│
    │  setRemoteDescription(answer)   │                                │
    │  ice ↔ ice (trickle)            │  ice ↔ ice                     │
    │◄───────────────────────────────►│◄──────────────────────────────►│
    │════════════ media (P2P or TURN) ═════════════════════════════════│
```

### Steps in detail

1. Both users log in and receive a JWT (`sub`, `organizationId`, `role`, `email`).
2. **Simulator** opens `/simulator`, selects an NVR, starts the webcam, connects Socket.IO with `auth.token`.
3. On `connect`, client emits `join` `{ nvrId, role: 'simulator' }`.
4. Gateway verifies JWT, loads NVR via `getForOrg`, builds `roomId`, rejects duplicate role / full room, marks NVR `online`, emits `welcome`, publishes `peer-joined`.
5. If `welcome.peers` is empty, the simulator **does not** publish yet.
6. **Viewer** opens `/watch/:nvrId`, connects, joins as `viewer`, always creates `RTCPeerConnection`.
7. When the second peer joins, the simulator runs `maybeStart()` → `addTrack` → `onnegotiationneeded` → SDP **offer**.
8. Viewer applies offer (polite side wins collisions), sends **answer**.
9. Both sides trickle ICE candidates via `ice` events; viewer attaches remote tracks to `<video>`.
10. On disconnect, gateway leaves the room; if the simulator left, NVR status → `offline` and `peer-left` is published.

Order is flexible: viewer can join first; when the simulator later joins and sees a peer (or receives `peer-joined`), publishing starts the same way.

## Signaling events

Transport: Socket.IO path `/signaling`, token in `handshake.auth.token` (or `query.token`).

### Client → server

| Event | Payload |
|-------|---------|
| `join` | `{ nvrId: string, role: 'simulator' \| 'viewer' }` |
| `description` | `{ description: RTCSessionDescriptionInit }` |
| `ice` | `{ candidate: RTCIceCandidateInit }` |

### Server → client

| Event | Payload |
|-------|---------|
| `welcome` | `{ roomId, nvrId, role, polite, peers: [{ role, polite }] }` |
| `peer-joined` | `{ role, polite }` |
| `peer-left` | `{ role? }` |
| `description` / `ice` | Relayed client payloads |
| `error` | `{ message }` |

Redis envelope (internal): `{ from, event, data }` on channel `signaling:{roomId}`. Subscribers skip their own `from` socket id.

## Perfect negotiation

Implemented in `frontend/src/webrtc/peer.ts`:

- Simulator = **impolite** publisher; viewer = **polite** consumer.
- On offer collision (`makingOffer` or not `stable`), the impolite side ignores the remote offer; the polite side accepts and answers.
- ICE policy from the UI: `all` (host/srflx/relay) or `relay` (TURN-only — useful to validate Coturn).

## ICE and TURN (why devices need Coturn)

Each peer builds:

```ts
iceServers: [
  { urls: `turn:${VITE_TURN_HOST}:3478`, username, credential },
  { urls: 'stun:stun.l.google.com:19302' },
]
```

| Candidate type | When it works |
|----------------|---------------|
| Host | Same LAN, no firewall blocking UDP between peers |
| Server-reflexive (STUN) | NAT that allows hole-punching |
| Relay (TURN) | Symmetric NAT, strict firewalls, or forced `relay` policy |

For **different machines**, Coturn must advertise a reachable address via `TURN_EXTERNAL_IP` (host LAN IP), and the SPA must use the same host in `VITE_TURN_HOST`.

## Connecting devices on different machines

### Same LAN (recommended for the POC)

1. On the host, set in `webrtc_poc/.env`:

   ```env
   TURN_EXTERNAL_IP=<host-LAN-IP>   # e.g. 192.168.1.109
   ```

2. Frontend (`frontend/.env`):

   ```env
   VITE_API_URL=http://<host-LAN-IP>:3001
   VITE_SIGNALING_URL=http://<host-LAN-IP>:3001
   VITE_TURN_HOST=<host-LAN-IP>
   VITE_TURN_USERNAME=poc_user
   VITE_TURN_CREDENTIAL=poc_password
   ```

3. Backend `CORS_ORIGIN` must include every frontend origin devices use (e.g. `http://localhost:3000,http://192.168.1.109:3000`).

4. Start infra + apps:

   ```bash
   docker compose up -d postgres redis coturn-bridge
   # MEDIA_MODE=p2p in backend/.env — restart Nest
   # npm run start:dev (backend) + npm run dev (frontend)
   ```

5. Device A: login → **Simulator** → pick NVR → start webcam.  
   Device B (same org): login → **Watch** that NVR → Connect.

6. Optional: set ICE policy to **relay** to prove media goes through Coturn.

### Signaling over ngrok, media on LAN

HTTP tunnels can expose Nest + Vite; they do **not** replace TURN UDP.

- Point `VITE_API_URL` / `VITE_SIGNALING_URL` at the ngrok HTTPS URL.
- Keep `VITE_TURN_HOST` / `TURN_EXTERNAL_IP` on the **LAN IP** (or a public TURN if peers are off-LAN).
- Add the frontend origin to `CORS_ORIGIN`.

### Checklist when video never appears

| Check | What to verify |
|-------|----------------|
| Mode | `MEDIA_MODE=p2p`, Nest restarted; UI shows Simulator / Watch |
| Same org + NVR | Both users in Acme (or same org); same `nvrId` |
| Room capacity | Only one simulator and one viewer |
| TURN reachability | From the viewer device, UDP/TCP to `TURN_HOST:3478` |
| External IP | Coturn recreated after changing `TURN_EXTERNAL_IP` |
| Vite env | Restart Vite after changing `VITE_*` |
| Browser | `chrome://webrtc-internals` — look for selected candidate pair (`relay` vs `host`) |

## Roles and org scope

| Role | Page | Behavior |
|------|------|----------|
| `simulator` | `/simulator` | Impolite; publishes webcam; sets NVR `online` / `offline` |
| `viewer` | `/watch/:nvrId` | Polite; receives only |

Seeded users (password `poc`): `alice@acme.local` / `bob@acme.local` (Acme), `carol@beta.local` (Beta). Alice and Bob can share an Acme NVR room; Carol cannot join that room.

## Key source files

| File | Responsibility |
|------|----------------|
| `backend/src/signaling/signaling.gateway.ts` | Join, welcome, relay, leave |
| `backend/src/signaling/signaling-redis.service.ts` | Redis pub/sub fanout |
| `frontend/src/webrtc/peer.ts` | Socket.IO client, PC, perfect negotiation |
| `frontend/src/pages/SimulatorPage.tsx` | Publisher UI |
| `frontend/src/pages/WatchPage.tsx` | Viewer UI |
| `docker-compose.yml` | Postgres, Redis, Coturn / Coturn-bridge |

## Operational notes

- **Room occupancy is in-memory** on the Nest process. Redis fans out messages but does not sync “already has a simulator” across multiple Nest replicas — run a single signaling instance for this POC.
- **P2P ≠ multi-camera**: one webcam stream per NVR room. Camera entities are for DM Mediaserver mode.
- Restart Coturn after `TURN_EXTERNAL_IP` changes; restart Nest after `MEDIA_MODE` / CORS changes; restart Vite after `VITE_*` changes.
