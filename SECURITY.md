# Kokohor security notes

This file describes how data is protected, so nothing is overstated.

## What is protected, and how

| Data | In transit | At rest / on server | End-to-end encrypted? |
|---|---|---|---|
| API calls (REST) | TLS (HTTPS) — Render terminates TLS; the app only talks to `https://` | MongoDB (encryption depends on your Atlas/host settings) | No |
| Real-time events (chat, feed, call signalling) | TLS (WSS) | — | No |
| 1-1 DMs, family chat, posts, comments | TLS | Stored **in plaintext** in MongoDB so the server can deliver, notify and sync across devices | **No** |
| Voice notes / images / videos | TLS upload | Backblaze B2 (URL-addressed) | **No** |
| Voice / video **call audio & video** | WebRTC DTLS-SRTP, keys negotiated directly between the devices. A TURN relay only forwards encrypted packets | Not stored | **Yes, between the call participants** (the server only relays signalling) |
| Push notification text | Expo / FCM / APNs over TLS | Held by those services briefly | No |

**Plain statement:** calls are end-to-end encrypted by WebRTC. Messages are
encrypted in transit (HTTPS/WSS) but are **not end-to-end encrypted** — the
server can read them. Real E2EE messaging would need per-device key pairs, key
exchange (e.g. the Signal protocol), encrypted media, and giving up
server-side message previews in push notifications. That's a separate project.

## Hardening in this release

- **Socket authentication.** The app sends its JWT in the Socket.IO handshake.
  The server verifies it (`middlewares/kokohor/socketAuth.js`) and acts as the
  token's user. A payload claiming a different `userId`/`senderId`/`callerId`
  is rejected. Previously any client could impersonate anyone over sockets.
  - `KOKOHOR_SOCKET_AUTH=warn` (default): old app versions without the token
    still work, and a warning is logged.
  - **Set `KOKOHOR_SOCKET_AUTH=enforce` once everyone is on this app version.**
- **DM rooms:** you can only open or post to a conversation you belong to.
  Typing events only go to rooms you joined.
- **1-1 calls:** signalling is only relayed between sockets in the same call
  room. Only the callee can accept, and only the two parties can end a call.
  SDP is no longer logged.
- **Group calls:** the caller must be a member of every family they call, and
  only the initiator can end the call for everyone.
- **Family content:** reading, creating, liking or commenting requires family
  membership. Private items are only visible to their creator. The client can
  no longer set `creator`.
- **Safety Net list:** only your own vaults, plus released vaults you're
  assigned to (it used to show every released vault to every member).
- **JWT:** no guessable fallback secret in production, and HS256 is pinned.
  `req.user` no longer carries the password, passcode or security answer.
- **Logs:** removed the startup dump of every user's email and push token, the
  per-request user dumps, push-token logging, and message/SDP payload dumps.
- **TURN key:** removed from the app. `GET /api/v1/calls/ice-servers`
  (authenticated) serves credentials from `METERED_TURN_URL`.
- **Headers:** nosniff, frame DENY, no-referrer, HSTS; `x-powered-by` off.
- **Blocks** (from the last release): enforced server-side for DMs, calls,
  group ringing, feeds and notifications.

## Action items for you

1. **Rotate keys that have been shared.** `.env` was inside the zips passed
   around (MongoDB URI, JWT secrets, Paystack, OpenAI, Gemini, Dojah, Firebase
   private key, email password). Rotate them, and keep secrets in the Render
   environment only. This zip no longer includes `.env` — see `.env.example`.
2. **Rotate the Metered TURN key** (it shipped in older app builds) and set
   `METERED_TURN_URL` on the server.
3. **Set `JWT_SECRET`** to a long random value (it's required in production).
   Changing it signs everyone out once.
4. **Set `KOKOHOR_SOCKET_AUTH=enforce`** after the new app version is rolled out.
5. **CORS** is `*`. That's fine for a mobile app using bearer tokens. If you
   add a browser admin panel with cookie auth, restrict it.
6. **Media URLs** (Backblaze) are reachable by anyone who has the link. For
   sensitive uploads (e.g. Safety Net vaults), switch to a private bucket with
   signed, short-lived URLs.
7. Consider rate limiting on `/auth/*` and the OTP / passcode endpoints
   (e.g. `express-rate-limit`).
