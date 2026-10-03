# Concept Pro Connect — Dual-mode WebRTC POC

Local organization-scoped streaming POC with two switchable media paths:

| `MEDIA_MODE` | Path |
|--------------|------|
| `dm` (default) | Nest registers/imports cameras; browser plays via **DM Mediaserver** WebRTC (`/api/ws`) |
| `p2p` | Socket.IO signaling + webcam NVR simulator + Coturn/TURN |

Flip mode by changing backend env and restarting Nest. The SPA reads `GET /config` at runtime (no rebuild required).

**Docs**

- Architecture (dual-mode, components, data vs media plane): [`docs/architecture.md`](./docs/architecture.md)
- How P2P connects between devices (handshake, ICE/TURN, multi-machine): [`docs/p2p-connection.md`](./docs/p2p-connection.md)

## Stack

| Piece | Where |
|-------|--------|
| Postgres | Docker `:5432` |
| Redis (P2P signaling fanout) | Docker `:6379` |
| Coturn (P2P TURN) | Docker `:3478` |
| NestJS API + Socket.IO signaling | `backend/` `:3001` |
| React + Vite SPA | `frontend/` `:3000` |
| DM Mediaserver (external) | e.g. ConceptPro-Mediaserver `:1984` |

## Quick start — DM Mediaserver mode

### 1. Infrastructure

```bash
cd webrtc_poc
cp .env.example .env
docker compose up -d postgres
# Redis optional in DM mode (still fine to start)
docker compose up -d redis
```

### 2. DM Mediaserver

Start your DM Mediaserver instance (ConceptPro-Mediaserver or any install) so `http://127.0.0.1:1984` responds.

Seeded cameras use `NVR2_CAM_1_LOW` … `NVR2_CAM_4_LOW` — those keys must exist in DM Mediaserver (yaml or prior register).

### 3. Backend

```bash
cd backend
# MEDIA_MODE=dm and DM_MEDIASERVER_* are in backend/.env / .env.example
npm install
npm run start:dev
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 — login as `alice@acme.local` / `poc` → select cameras in the sidebar → live grid.

## Quick start — P2P mode

1. Set `MEDIA_MODE=p2p` in `backend/.env` and restart Nest.
2. Start Redis + Coturn:

```bash
docker compose up -d postgres redis coturn-bridge
```

3. Login → **Simulator** (publish webcam) in one browser; **Watch** from another user in the same org.

Set `TURN_EXTERNAL_IP` / `VITE_TURN_HOST` to your LAN IP for multi-machine or force-relay tests.

Flow summary: both peers join room `{orgId}:{nvrId}` over Socket.IO `/signaling`; the simulator publishes webcam tracks; SDP/ICE are relayed via Nest + Redis; media goes peer-to-peer or through Coturn. Details and multi-device checklist: [`docs/p2p-connection.md`](./docs/p2p-connection.md).

## Seeded users

| Org | User | Password | Seeded NVR / cameras |
|-----|------|----------|----------------------|
| Acme Security | `alice@acme.local` (admin), `bob@acme.local` | `poc` | Front Gate + CAM 1–4 (`NVR2_CAM_*_LOW`) |
| Beta Monitoring | `carol@beta.local` (admin) | `poc` | Lobby Cam (no seeded cameras) |

## Config

### Backend

| Var | Purpose |
|-----|---------|
| `MEDIA_MODE` | `dm` (DM Mediaserver) \| `p2p` |
| `DM_MEDIASERVER_API_BASE` | Nest → DM Mediaserver HTTP (default `http://127.0.0.1:1984`) |
| `DM_MEDIASERVER_PUBLIC_BASE` | Browser-facing base for WS URLs |
| `REDIS_URL` | P2P signaling fanout |
| `JWT_SECRET`, `CORS_ORIGIN`, `DATABASE_*` | Auth / DB |

`GET /config` returns `{ mediaMode, mediaModeLabel, dmMediaserverPublicBase, signalingPath }`.

### Frontend

| Var | Purpose |
|-----|---------|
| `VITE_API_URL` | Nest REST |
| `VITE_SIGNALING_URL` | Socket.IO host (P2P) |
| `VITE_DM_MEDIASERVER_BASE` | Fallback DM Mediaserver base |
| `VITE_TURN_*` | ICE for P2P |

## API sketch

- `GET /config`
- `POST /auth/login`, `POST /auth/register`, `GET /me`
- `GET|POST /nvrs`, `GET|DELETE /nvrs/:id`
- `GET /cameras`, `GET|POST /nvrs/:id/cameras`, `DELETE /cameras/:id`
- `GET /cameras/:id/stream-info`
- `GET /dm-mediaserver/health`, `GET /dm-mediaserver/streams`
- Socket.IO path `/signaling` (P2P) — `join`, `welcome`, `peer-joined`, `peer-left`, `description`, `ice`

## UI

Concept Pro–style dark shell: sidebar devices, live multi-tile grid + WebRTC player in **DM Mediaserver** mode; dashboard + Simulator/Watch in **p2p** mode. Devices page manages NVRs/cameras (stream key import or RTSP register).

## Project layout

```
webrtc_poc/
  docker-compose.yml
  .env.example
  README.md
  docs/
    architecture.md       # System architecture & dual-mode design
    p2p-connection.md     # P2P handshake & multi-device guide
  backend/                # NestJS
  frontend/               # React + Vite
```
