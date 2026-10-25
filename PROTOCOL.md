# Socket.IO Protocol Reference

This document describes the Socket.IO communication protocol used by U-Loc. It is designed to be platform-independent so that future mobile applications (Android, iOS) can implement the same protocol.

## Overview

U-Loc uses a combination of REST API calls and Socket.IO events for real-time communication:

- **REST API** — Used for authentication (`/api/admin/login`), session management (`/api/admin/sessions`), and pairing code validation (`/api/share/validate`)
- **Socket.IO** — Used for real-time location streaming, session lifecycle events, and admin notifications

## Connection

| Property | Value |
|---|---|
| **URL** | `wss://your-server:3001` (production) or `ws://localhost:3001` (development) |
| **Transport** | WebSocket with HTTP long-polling fallback |
| **Library** | Socket.IO v4 |
| **Path** | `/socket.io/` (default) |

### Connection Example (JavaScript)

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
});
```

### Connection Example (Kotlin/Android)

```kotlin
val options = IO.Options().apply {
    transports = arrayOf("websocket", "polling")
    reconnection = true
    reconnectionDelay = 1000
    reconnectionDelayMax = 5000
}

val socket = IO.socket("https://your-server:3001", options)
socket.connect()
```

## Authentication Flow

### Admin Authentication

```
┌──────────┐                              ┌──────────┐
│  Admin   │                              │  Server  │
│  Client  │                              │          │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  1. POST /api/admin/login               │
     │    { password: "..." }                  │
     │ ───────────────────────────────────────▶ │
     │                                         │
     │  2. Response: { token: "jwt..." }       │
     │ ◀─────────────────────────────────────── │
     │                                         │
     │  3. Connect Socket.IO                   │
     │ ═══════════════════════════════════════▶ │
     │                                         │
     │  4. Emit: admin:auth                    │
     │    { token: "jwt..." }                  │
     │ ───────────────────────────────────────▶ │
     │                                         │
     │  5. Event: admin:authenticated          │
     │    {}                                   │
     │ ◀─────────────────────────────────────── │
     │                                         │
     │  6. Emit: admin:subscribe               │
     │    { sessionId: "..." }                 │
     │ ───────────────────────────────────────▶ │
     │                                         │
```

### Sharer Authentication

```
┌──────────┐                              ┌──────────┐
│  Sharer  │                              │  Server  │
│  Client  │                              │          │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  1. POST /api/share/validate            │
     │    { pairingCode: "ABC123" }            │
     │ ───────────────────────────────────────▶ │
     │                                         │
     │  2. Response: { valid: true }           │
     │ ◀─────────────────────────────────────── │
     │                                         │
     │  3. Connect Socket.IO                   │
     │ ═══════════════════════════════════════▶ │
     │                                         │
     │  4. Emit: sharer:join                   │
     │    { pairingCode: "ABC123",             │
     │      consent: true }                    │
     │ ───────────────────────────────────────▶ │
     │                                         │
     │  5. Event: session:joined               │
     │    { sessionId: "..." }                 │
     │ ◀─────────────────────────────────────── │
     │                                         │
     │  6. Emit: sharer:location               │
     │    { lat, lng, accuracy, timestamp }    │
     │ ───────────────────────────────────────▶ │
     │                                         │
```

## Events Reference

### Client → Server Events

---

#### `admin:auth`

Authenticate the admin socket connection with a JWT token.

- **Direction:** Client → Server
- **Payload:**
  ```json
  {
    "token": "string (JWT)"
  }
  ```
- **Success Response:** `admin:authenticated` event
- **Error Response:** `admin:auth-error` event
- **Notes:**
  - Must be emitted before any admin operations
  - Token is obtained from `POST /api/admin/login`
  - Expired tokens will receive an `admin:auth-error`

---

#### `admin:subscribe`

Subscribe to real-time location updates for a specific session.

- **Direction:** Client → Server
- **Payload:**
  ```json
  {
    "sessionId": "string"
  }
  ```
- **Success Response:** Starts receiving `session:location-update` events
- **Error Response:** `session:error` event
- **Notes:**
  - Requires prior `admin:auth` authentication
  - Admin is added to the session's Socket.IO room
  - Admin can subscribe to multiple sessions simultaneously

---

#### `admin:unsubscribe`

Stop receiving location updates for a specific session.

- **Direction:** Client → Server
- **Payload:**
  ```json
  {
    "sessionId": "string"
  }
  ```
- **Notes:**
  - Admin is removed from the session's Socket.IO room
  - Does not end the session itself

---

#### `admin:end-session`

End and delete a sharing session.

- **Direction:** Client → Server
- **Payload:**
  ```json
  {
    "sessionId": "string"
  }
  ```
- **Notes:**
  - Immediately disconnects the sharer
  - Clears all session data from memory
  - Broadcasts `session:ended` to all subscribers

---

#### `sharer:join`

Join a session as a location sharer using a pairing code.

- **Direction:** Client → Server
- **Payload:**
  ```json
  {
    "pairingCode": "string (6 characters, case-insensitive)",
    "consent": true
  }
  ```
- **Success Response:** `session:joined` event
- **Error Response:** `session:error` event
- **Notes:**
  - `consent` **must** be `true` — the server rejects `false` or missing consent
  - Pairing code is **invalidated** after successful join (single-use)
  - Only one sharer can join per session

---

#### `sharer:location`

Send a location update to the server.

- **Direction:** Client → Server
- **Payload:**
  ```json
  {
    "lat": "number (-90 to 90)",
    "lng": "number (-180 to 180)",
    "accuracy": "number (positive, meters)",
    "timestamp": "number (Unix timestamp in milliseconds)"
  }
  ```
- **Notes:**
  - **Rate limited** to 1 update per second per session
  - Coordinates are validated for range
  - Only the most recent location is stored (no history)
  - Forwarded to subscribed admins as `session:location-update`

---

#### `sharer:stop`

Stop sharing location and end the session.

- **Direction:** Client → Server
- **Payload:**
  ```json
  {}
  ```
- **Notes:**
  - Immediately ends the session
  - All session data is cleared from memory
  - Broadcasts `session:ended` to subscribed admins

---

### Server → Client Events

---

#### `admin:authenticated`

Confirms that admin socket authentication was successful.

- **Direction:** Server → Client (admin only)
- **Payload:**
  ```json
  {}
  ```

---

#### `admin:auth-error`

Indicates that admin socket authentication failed.

- **Direction:** Server → Client (admin only)
- **Payload:**
  ```json
  {
    "message": "string (human-readable error)"
  }
  ```
- **Possible Messages:**
  - `"Invalid or expired token"`
  - `"Token required"`

---

#### `session:joined`

Confirms that the sharer has successfully joined a session.

- **Direction:** Server → Client (sharer only)
- **Payload:**
  ```json
  {
    "sessionId": "string"
  }
  ```

---

#### `session:error`

Indicates a session operation error.

- **Direction:** Server → Client
- **Payload:**
  ```json
  {
    "code": "string (error code)",
    "message": "string (human-readable description)"
  }
  ```
- **See:** [Error Codes](#error-codes) section below

---

#### `session:location-update`

Delivers a location update for a session the admin is subscribed to.

- **Direction:** Server → Client (subscribed admins only)
- **Payload:**
  ```json
  {
    "lat": "number",
    "lng": "number",
    "accuracy": "number",
    "timestamp": "number"
  }
  ```

---

#### `session:ended`

Notifies that a session has ended.

- **Direction:** Server → Client (all parties in the session)
- **Payload:**
  ```json
  {
    "sessionId": "string",
    "reason": "string ('user_stopped' | 'admin_ended' | 'expired' | 'disconnected')"
  }
  ```

---

#### `session:created`

Notifies authenticated admins that a new session was created.

- **Direction:** Server → Client (all authenticated admin sockets)
- **Payload:**
  ```json
  {
    "sessionId": "string",
    "pairingCode": "string",
    "label": "string | undefined"
  }
  ```

---

#### `session:sharer-connected`

Notifies subscribed admins that a sharer has connected to a session.

- **Direction:** Server → Client (subscribed admins only)
- **Payload:**
  ```json
  {
    "sessionId": "string"
  }
  ```

---

#### `session:sharer-disconnected`

Notifies subscribed admins that a sharer has disconnected from a session.

- **Direction:** Server → Client (subscribed admins only)
- **Payload:**
  ```json
  {
    "sessionId": "string"
  }
  ```

---

## Session Lifecycle State Machine

```
                    ┌─────────────────┐
                    │                 │
    Admin creates   │    CREATED      │  Pairing code generated
    POST /sessions  │                 │  Waiting for sharer
                    └────────┬────────┘
                             │
                    Sharer emits
                    sharer:join
                    (valid code + consent)
                             │
                             ▼
                    ┌─────────────────┐
                    │                 │
                    │     PAIRED      │  Pairing code invalidated
                    │                 │  Sharer in room
                    └────────┬────────┘
                             │
                    First sharer:location
                    event received
                             │
                             ▼
                    ┌─────────────────┐
                    │                 │
                    │    SHARING      │  Location updates flowing
                    │                 │  Admin sees real-time map
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         sharer:stop    admin:end      TTL expires
              │         session          │
              │              │              │
              ▼              ▼              ▼
                    ┌─────────────────┐
                    │                 │
                    │     ENDED       │  All data cleared
                    │                 │  Sockets notified
                    └─────────────────┘
```

### State Descriptions

| State | Description | Transitions |
|---|---|---|
| **CREATED** | Session exists with a pairing code. No sharer has connected yet. | → PAIRED (sharer joins) or → ENDED (admin ends / TTL expires) |
| **PAIRED** | Sharer has joined with valid code and consent. Code is now invalidated. | → SHARING (first location received) or → ENDED (sharer stops / admin ends / TTL expires) |
| **SHARING** | Location updates are flowing from sharer to subscribed admins. | → ENDED (any termination condition) |
| **ENDED** | Session is terminated. All data has been cleared from memory. | Terminal state |

## Error Codes

| Code | Description | When |
|---|---|---|
| `INVALID_PAIRING_CODE` | The pairing code was not found or has already been used | `sharer:join` with invalid/used code |
| `SESSION_EXPIRED` | The session TTL has been exceeded | Any operation on an expired session |
| `CONSENT_REQUIRED` | The `consent` field was not `true` | `sharer:join` without consent |
| `RATE_LIMITED` | Too many location updates in the time window | `sharer:location` exceeding rate limit |
| `UNAUTHORIZED` | Not authenticated or token is invalid/expired | Any privileged operation without auth |
| `INVALID_COORDINATES` | Latitude or longitude is out of valid range | `sharer:location` with bad coordinates |
| `SESSION_NOT_FOUND` | The referenced session does not exist | `admin:subscribe`, `admin:end-session` with invalid ID |
| `PAYLOAD_TOO_LARGE` | The event payload exceeds the 1 KB limit | Any event with oversized payload |
| `ALREADY_JOINED` | This socket is already associated with a session | `sharer:join` when already in a session |

## Reconnection Strategy

### Socket.IO Auto-Reconnect

Socket.IO provides built-in reconnection with exponential backoff:

```
Attempt 1: wait ~1000ms
Attempt 2: wait ~2000ms
Attempt 3: wait ~4000ms
...
Max delay: 5000ms
```

### Sharer Reconnection

1. Socket.IO handles the transport-level reconnect automatically
2. On the `connect` event (after reconnection), the sharer should:
   - Re-emit `sharer:join` with the original pairing code (if still held)
   - The server will reject if the session has expired or ended
3. If rejected, display an appropriate error to the user
4. Resume sending `sharer:location` events once `session:joined` is received

> **Note:** Since pairing codes are single-use, the server must recognize the socket
> as having previously joined the session. The implementation should track this via
> the session state rather than requiring a new pairing code.

### Admin Reconnection

1. On the `connect` event (after reconnection), the admin should:
   - Re-emit `admin:auth` with the stored JWT token
   - Wait for `admin:authenticated`
   - Re-emit `admin:subscribe` for each session they were monitoring
2. If the JWT has expired during the disconnect, the admin must re-login via REST

## Payload Size Limits

| Constraint | Limit |
|---|---|
| Maximum event payload | 1 KB |
| Maximum pairing code length | 6 characters |
| Maximum label length | 100 characters |
| Maximum simultaneous sessions | Limited by server memory |

## Android Implementation Notes

### Recommended Libraries

- **Socket.IO Client:** `io.socket:socket.io-client:2.x` (Java/Kotlin)
- **HTTP Client:** OkHttp or Retrofit for REST API calls
- **Location:** Google Play Services `FusedLocationProviderClient`
- **JSON:** Kotlinx.serialization or Gson

### Location Updates

```kotlin
// Use FusedLocationProviderClient for battery-efficient location
val locationRequest = LocationRequest.Builder(
    Priority.PRIORITY_HIGH_ACCURACY,
    1000L // 1 second interval (matches server rate limit)
).build()

fusedLocationClient.requestLocationUpdates(
    locationRequest,
    locationCallback,
    Looper.getMainLooper()
)
```

### Consent Handling

On Android, consent should be handled through:
1. A clear in-app consent dialog before starting location sharing
2. Android runtime permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`)
3. For background sharing: `ACCESS_BACKGROUND_LOCATION` permission + foreground service

### Token Storage

```kotlin
// Use Android Keystore for secure token storage
val keyStore = KeyStore.getInstance("AndroidKeyStore")
keyStore.load(null)

// Encrypt the JWT before storing in SharedPreferences
val cipher = Cipher.getInstance("AES/GCM/NoPadding")
// ... (full implementation with KeyStore-backed key)
```

### Foreground Service

Background location sharing requires a foreground service with a persistent notification:

```kotlin
class LocationSharingService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildNotification("Sharing your location...")
        startForeground(NOTIFICATION_ID, notification)
        // Start location updates and Socket.IO connection
        return START_STICKY
    }
}
```

### Network Handling

- Listen for network connectivity changes (`ConnectivityManager`)
- Socket.IO will auto-reconnect, but the app should show UI status
- Handle airplane mode and location service toggling gracefully
