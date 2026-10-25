# U-Loc — Secure Real-Time Location Sharing

A privacy-focused, real-time location sharing application. No database, no persistent storage. Built with Vue.js 3, Node.js, Express, Socket.IO, and Leaflet/OpenStreetMap.

## Features

- **Real-time location sharing** via WebSocket (Socket.IO)
- **Mobile-first responsive design** optimized for phones and tablets
- **Interactive maps** with Leaflet + OpenStreetMap (no API key required)
- **Pairing code system** for secure session association
- **Admin dashboard** for creating and managing sharing sessions
- **No database** — zero persistent storage of location data
- **Cryptographically secure** session tokens and pairing codes
- **HTTPS/WSS** support in production
- **Docker-ready** deployment with health checks
- **Comprehensive test suite** with Vitest

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Client Layer                      │
│                                                      │
│  ┌──────────────────┐     ┌───────────────────────┐  │
│  │   Admin SPA      │     │   Sharer SPA          │  │
│  │   (Vue.js 3)     │     │   (Vue.js 3)          │  │
│  │   /admin         │     │   /                   │  │
│  │   Leaflet Map    │     │   Geolocation API     │  │
│  └────────┬─────────┘     └───────────┬───────────┘  │
│           │                           │              │
└───────────┼───────────────────────────┼──────────────┘
            │  REST + Socket.IO         │  REST + Socket.IO
            │                           │
┌───────────┼───────────────────────────┼──────────────┐
│           ▼                           ▼              │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Node.js + Express + Socket.IO          │ │
│  │                   (Port 3001)                    │ │
│  │                                                  │ │
│  │   REST API (/api)          Socket.IO (ws://)     │ │
│  │   ├─ POST /admin/login     ├─ admin:auth         │ │
│  │   ├─ POST /admin/sessions  ├─ admin:subscribe    │ │
│  │   ├─ POST /share/validate  ├─ sharer:join        │ │
│  │   └─ GET  /health          ├─ sharer:location    │ │
│  │                            └─ sharer:stop        │ │
│  │                                                  │ │
│  │   ┌──────────────────────────────────────────┐   │ │
│  │   │         In-Memory Session Store          │   │ │
│  │   │    (Map<sessionId, SessionData>)         │   │ │
│  │   │    Auto-cleanup on expiry/disconnect     │   │ │
│  │   └──────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────┘ │
│                    Server Layer                       │
└──────────────────────────────────────────────────────┘
```

### Data Flow

1. **Admin authenticates** → `POST /api/admin/login` → receives JWT token
2. **Admin creates session** → `POST /api/admin/sessions` → gets a 6-character pairing code
3. **User enters pairing code** → validates via REST → connects via Socket.IO → grants consent
4. **Location updates** flow via Socket.IO from sharer → server → subscribed admin
5. **Session ends** (user stops, admin ends, or TTL expires) → all data cleared from memory

## Quick Start

### Prerequisites

- **Node.js** >= 22.x
- **npm** >= 10.x

### Development Setup

```bash
# Clone the repository
git clone <repo-url> u_loc
cd u_loc

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Start backend (terminal 1)
cd backend
cp ../.env.example .env  # Edit with your settings
npm run dev

# Start frontend (terminal 2)
cd frontend
npm run dev
```

The backend runs on `http://localhost:3001` and the frontend on `http://localhost:5173`.

### Docker Deployment

```bash
# Set required environment variables
export ADMIN_PASSWORD=your-secure-password
export JWT_SECRET=$(openssl rand -base64 32)

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Docker Development

```bash
# Start with development overrides (hot-reload, source mounting)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Configuration

| Variable | Description | Default | Required |
|---|---|---|---|
| `PORT` | Backend server port | `3001` | No |
| `NODE_ENV` | Environment (`development` / `production`) | `development` | No |
| `ADMIN_PASSWORD` | Password for admin authentication | `change-me-in-production` | **Yes (prod)** |
| `JWT_SECRET` | Secret key for signing JWT tokens | `change-me-use-openssl-rand-base64-32` | **Yes (prod)** |
| `SESSION_TTL_MS` | Session time-to-live in milliseconds | `3600000` (1 hour) | No |
| `STALE_THRESHOLD_MS` | Time before a session is considered stale | `30000` (30 seconds) | No |
| `MAX_LOCATION_RATE_MS` | Minimum interval between location updates | `1000` (1 second) | No |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost:5173,http://localhost:3000` | No |
| `VITE_API_URL` | Backend API URL for the frontend | `http://localhost:3001` | No |
| `VITE_SOCKET_URL` | Socket.IO URL for the frontend | `http://localhost:3001` | No |

## Usage Guide

### For Administrators

1. Navigate to `/admin` in your browser
2. Log in with the configured admin password
3. Create a sharing session (optionally with a descriptive label)
4. Share the **6-character pairing code** with the user you want to track
5. The dashboard displays the user's real-time location on a map once they connect
6. End the session at any time to immediately clear all data

### For Users (Location Sharers)

1. Navigate to the app root `/` in your browser
2. Read and agree to the **consent dialog** explaining what data is shared
3. Enter the **6-character pairing code** provided by the administrator
4. Allow **browser location access** when prompted
5. Your location is shared in real-time on the map
6. Press **"Stop Sharing"** at any time to immediately end the session

## Testing

```bash
# Run backend tests
cd backend
npm test

# Run backend tests in watch mode
cd backend
npm run test:watch

# Run frontend tests
cd frontend
npm test

# Run frontend tests in watch mode
cd frontend
npm run test:watch
```

## API Reference

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/health` | Health check — returns server status | None |
| `POST` | `/api/admin/login` | Authenticate admin — returns JWT token | None |
| `POST` | `/api/admin/sessions` | Create a new sharing session | JWT |
| `GET` | `/api/admin/sessions` | List all active sessions | JWT |
| `DELETE` | `/api/admin/sessions/:id` | End and delete a session | JWT |
| `POST` | `/api/share/validate` | Validate a pairing code | None |

## Socket.IO Protocol

Full protocol documentation is available in [PROTOCOL.md](./PROTOCOL.md). Below is a summary.

### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `admin:auth` | `{ token: string }` | Authenticate admin socket connection |
| `admin:subscribe` | `{ sessionId: string }` | Subscribe to a session's location updates |
| `admin:unsubscribe` | `{ sessionId: string }` | Unsubscribe from a session's location updates |
| `admin:end-session` | `{ sessionId: string }` | End and delete a session |
| `sharer:join` | `{ pairingCode: string, consent: boolean }` | Join a session as a location sharer |
| `sharer:location` | `{ lat: number, lng: number, accuracy: number, timestamp: number }` | Send a location update |
| `sharer:stop` | `{}` | Stop sharing and end the session |

### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `admin:authenticated` | `{}` | Admin socket authentication succeeded |
| `admin:auth-error` | `{ message: string }` | Admin socket authentication failed |
| `session:joined` | `{ sessionId: string }` | Sharer successfully joined a session |
| `session:error` | `{ code: string, message: string }` | Session operation failed |
| `session:location-update` | `{ lat: number, lng: number, accuracy: number, timestamp: number }` | Location update for a subscribed session |
| `session:ended` | `{ sessionId: string, reason: string }` | Session has ended |
| `session:created` | `{ sessionId: string, pairingCode: string, label?: string }` | A new session was created (admin broadcast) |
| `session:sharer-connected` | `{ sessionId: string }` | A sharer connected to the session |
| `session:sharer-disconnected` | `{ sessionId: string }` | A sharer disconnected from the session |

### Session Lifecycle

```
  ┌─────────┐     Admin creates     ┌─────────┐
  │         │ ──────────────────────▶│         │
  │  (none) │                        │ CREATED │
  │         │                        │         │
  └─────────┘                        └────┬────┘
                                          │
                                 Sharer enters
                                 pairing code
                                          │
                                          ▼
                                     ┌─────────┐
                                     │         │
                                     │ PAIRED  │
                                     │         │
                                     └────┬────┘
                                          │
                                  Location updates
                                     begin
                                          │
                                          ▼
                                     ┌─────────┐
                                     │         │
                                     │ SHARING │
                                     │         │
                                     └────┬────┘
                                          │
                              ┌───────────┼───────────┐
                              │           │           │
                         User stops   Admin ends   TTL expires
                              │           │           │
                              ▼           ▼           ▼
                                     ┌─────────┐
                                     │         │
                                     │  ENDED  │
                                     │         │
                                     └─────────┘
                                  (data cleared)
```

## Privacy & Data Handling

- **No database** is used — all data is held in server memory only
- **Location data** exists only during active sessions and is never written to disk
- **No auto-expiration**: Once started, sharing sessions remain active indefinitely and only end when the administrator explicitly cancels or deletes them
- **All session data** is cleared when the session is ended or deleted by the administrator
- **No location history** is stored — only the most recent position is held
- **Admin tokens** expire after 1 hour (configurable via `SESSION_TTL_MS`)
- **Pairing codes** are single-use and cryptographically random
- **No analytics** or third-party tracking is included
- **No logs** contain location coordinates, tokens, or pairing codes

## Production Deployment Checklist

- [ ] Set a strong `ADMIN_PASSWORD` (avoid defaults)
- [ ] Generate a secure `JWT_SECRET` (`openssl rand -base64 32`)
- [ ] Configure `ALLOWED_ORIGINS` for your domain(s)
- [ ] Set up **HTTPS/TLS** (reverse proxy with nginx/Caddy recommended)
- [ ] Review `SESSION_TTL_MS` for your use case
- [ ] Set `NODE_ENV=production`
- [ ] Configure firewall rules (expose only ports 80/443)
- [ ] Set up Docker container monitoring and log rotation
- [ ] Review [SECURITY.md](./SECURITY.md) for security considerations

## Future Android Support

The Socket.IO protocol is fully documented in [PROTOCOL.md](./PROTOCOL.md) and is browser-independent. A future Android application can connect using the same events and authentication flow. Key considerations:

- Use the official [Socket.IO Java/Kotlin client](https://socketio.github.io/socket.io-client-java/)
- Implement location updates using Android `FusedLocationProviderClient`
- Handle consent via Android's runtime permission system
- Store admin tokens securely in Android Keystore
- Background location sharing requires a foreground service with persistent notification

## Security

See [SECURITY.md](./SECURITY.md) for comprehensive security documentation, threat model, and security measures.

## License

MIT
