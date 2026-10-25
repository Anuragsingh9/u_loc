# Security Documentation

This document describes the threat model, security measures, and best practices for deploying and operating U-Loc.

## Threat Model

### Identified Threats

| Threat | Severity | Mitigation |
|---|---|---|
| **Unauthorized location access** | Critical | JWT authentication, Socket.IO room isolation, pairing code validation |
| **Session hijacking** | High | Cryptographically random session IDs, short-lived JWTs, single-use pairing codes |
| **Replay attacks** | Medium | Token expiration, timestamp validation, single-use pairing codes |
| **Cross-session data leakage** | High | Per-session Socket.IO rooms, strict access control on subscriptions |
| **Denial of service** | Medium | Rate limiting on all endpoints, payload size limits, connection limits |
| **Man-in-the-middle** | Critical | HTTPS/WSS required in production, HSTS headers |
| **Brute-force attacks** | Medium | Rate limiting on login, timing-safe comparison |
| **XSS / Injection** | Medium | Input validation, Content-Security-Policy headers, Helmet.js |

### Trust Boundaries

```
┌──────────────────────────────────────────────────────┐
│  UNTRUSTED: Public Internet                          │
│                                                      │
│  ┌─────────────┐           ┌─────────────┐          │
│  │  Admin       │           │  Sharer     │          │
│  │  Browser     │           │  Browser    │          │
│  └──────┬──────┘           └──────┬──────┘          │
│         │                         │                  │
└─────────┼─────────────────────────┼──────────────────┘
          │    HTTPS / WSS          │
          │    ════════════         │
┌─────────┼─────────────────────────┼──────────────────┐
│  TRUSTED: Server                  │                   │
│         ▼                         ▼                   │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Express + Socket.IO                            │  │
│  │  ├─ Authentication middleware                   │  │
│  │  ├─ Rate limiting                               │  │
│  │  ├─ Input validation                            │  │
│  │  └─ Session management                          │  │
│  │                                                 │  │
│  │  ┌───────────────────────────────────────────┐  │  │
│  │  │  In-Memory Session Store (no persistence) │  │  │
│  │  └───────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

## Security Measures

### Authentication & Authorization

#### Admin Authentication
- Admin authenticates via `POST /api/admin/login` with a password
- Server performs **timing-safe comparison** (`crypto.timingSafeEqual`) to prevent timing attacks
- On success, a **JWT token** is issued with a configurable expiration (default: 1 hour)
- The JWT is signed with a secret key (`JWT_SECRET`) that must be unique per deployment
- All admin API endpoints and Socket.IO events require a valid JWT

#### Socket.IO Authentication
- Admin sockets must emit `admin:auth` with a valid JWT before any privileged operations
- Sharer sockets must emit `sharer:join` with a valid pairing code
- Unauthenticated sockets cannot access any session data
- Sockets are disconnected after authentication failures

### Session Security

#### Pairing Codes
- Generated using `crypto.randomBytes()` for cryptographic randomness
- 6-character alphanumeric codes (case-insensitive)
- **Single-use**: invalidated immediately after first successful pairing
- Cannot be reused even if the session is still active

#### Session Isolation
- Each session has a unique, cryptographically random ID
- Socket.IO rooms enforce session boundaries
- Admin can only subscribe to sessions they created
- Sharer can only join a session with a valid pairing code
- No cross-session data access is possible

#### Session Lifecycle
- Sessions have a configurable TTL (default: 1 hour)
- Expired sessions are automatically cleaned up by a periodic sweep
- All session data (location, metadata, socket references) is purged on cleanup
- Sessions can be manually ended by either the admin or the sharer

### Transport Security

#### HTTPS/WSS
- **Required in production** — do not expose the service over plain HTTP
- Use a reverse proxy (nginx, Caddy) with TLS termination
- Socket.IO connections should use WSS (WebSocket Secure)

#### CORS
- Strict origin validation via the `ALLOWED_ORIGINS` configuration
- Only explicitly listed origins are permitted
- Socket.IO connections also validate the origin header

#### Security Headers (Helmet.js)
The following headers are set by Helmet.js:

| Header | Purpose |
|---|---|
| `Content-Security-Policy` | Prevents XSS and data injection |
| `X-Content-Type-Options: nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options: DENY` | Prevents clickjacking |
| `X-XSS-Protection: 0` | Disables legacy XSS filter (CSP is preferred) |
| `Strict-Transport-Security` | Enforces HTTPS |
| `Referrer-Policy: no-referrer` | Prevents referrer leakage |

### Input Validation

#### Coordinate Validation
- Latitude: must be a number between `-90` and `90` (inclusive)
- Longitude: must be a number between `-180` and `180` (inclusive)
- Accuracy: must be a positive number
- Timestamp: must be a valid Unix timestamp (milliseconds)
- All fields are required — partial updates are rejected

#### Payload Limits
- Maximum payload size: **1 KB** per Socket.IO event
- Prevents memory exhaustion from oversized payloads
- Malformed payloads are rejected with an error event

#### Schema Validation
- All REST request bodies are validated against expected schemas
- All Socket.IO event payloads are validated before processing
- Unexpected fields are stripped; missing required fields cause rejection

### Data Protection

#### No Persistent Storage
- **No database** is used — no SQL, NoSQL, or file-based storage
- All data lives exclusively in server memory (`Map` objects)
- When the server process stops, all data is lost (by design)
- No crash dumps or core files contain location data

#### Memory-Only Session Data
- Only the **most recent** location update is stored per session
- Previous locations are overwritten, not appended
- Session data is immediately deleted when:
  - The sharer stops sharing
  - The admin ends the session
  - The session TTL expires
  - The server shuts down

#### Logging Policy
- **No location coordinates** are logged
- **No tokens or pairing codes** are logged
- **No personally identifiable information** is logged
- Server logs contain only:
  - Connection/disconnection events (socket IDs only)
  - Session lifecycle events (session IDs only)
  - Error messages (without sensitive context)

#### Client-Side Storage
- Admin JWT tokens are stored in **`sessionStorage`** (not `localStorage`)
- Tokens are cleared when the browser tab is closed
- No cookies are used for authentication
- No location data is cached on the client

### Rate Limiting

| Resource | Limit | Window | Action on Exceed |
|---|---|---|---|
| `POST /api/admin/login` | 5 requests | 1 minute per IP | `429 Too Many Requests` |
| `sharer:location` events | 1 update | 1 second per session | Event silently dropped |
| Socket.IO connections | Configurable | Per IP | Connection refused |
| Payload size | 1 KB | Per event | Event rejected |

## Responsible Disclosure

If you discover a security vulnerability in U-Loc, please report it privately:

1. **Do not** open a public GitHub issue
2. Email the maintainers with a description of the vulnerability
3. Include steps to reproduce, if possible
4. Allow reasonable time for a fix before public disclosure

We take all security reports seriously and will respond promptly.

## Infrastructure Considerations

While U-Loc does not persist any data, your infrastructure environment may introduce additional data handling:

- **Cloud providers** (AWS, GCP, Azure) may log network traffic metadata
- **CDN / Reverse proxy** (Cloudflare, nginx) may log request URLs and headers
- **Container orchestration** (Kubernetes, Docker Swarm) may retain container logs
- **Load balancers** may log connection details

### Recommendations

1. **Review** your infrastructure provider's data handling and retention policies
2. **Configure** log rotation and retention to minimize data exposure
3. **Disable** access logging for the WebSocket path if possible
4. **Use** private networking between the frontend proxy and backend
5. **Encrypt** inter-service communication if using multiple nodes
6. **Audit** regularly for unintended data retention

## Security Configuration Checklist

- [ ] `ADMIN_PASSWORD` is strong and unique (not the default)
- [ ] `JWT_SECRET` is cryptographically random (use `openssl rand -base64 32`)
- [ ] `ALLOWED_ORIGINS` contains only your production domain(s)
- [ ] `NODE_ENV=production` is set
- [ ] HTTPS/TLS is configured with valid certificates
- [ ] Firewall allows only ports 80 and 443
- [ ] Server logs do not contain sensitive data
- [ ] Container images are built from a minimal base image
- [ ] Dependencies are audited (`npm audit`) regularly
