# Kokohor server — change notes

## Family Chat activity bridge
- New system feed types on `UnifiedContent`: `activity` and `group_call`
  (clients cannot create them via `POST /api/v1/feed`).
- `utils/kokohor/familyActivity.js` posts/updates/removes an `activity` card
  in the family feed whenever these are created/edited/deleted:
  - FamilyContent (all content types incl. Key Dates) — private items are
    visible to the creator only.
  - Donation campaigns (not `HIDDEN` ones) and contributions (no amounts).
  - Safety Net vaults — creator-only card when sealed; a card for the assigned
    members when the vault opens.
- Restricted audience support (`meta.audience`) in `getFeed`, socket rooms
  and `canViewContent`.

## Group call logs
- New `GroupCallLog` model. `sockets/kokohor/groupCallSocket.js` records
  invited/joined users, connect time and duration, and when a call ends:
  saves the log, posts a `group_call` card into the family chat, creates
  `GROUP_CALL_MISSED` notifications (+ push) for invitees who never joined,
  and emits `kokohor:group-call:logged` to everyone involved.
- `get_calls` now merges group calls with 1-1 calls (per-viewer missed/ended).
- 1-1 call messages now store `callStatus` / `callType` (previously read but
  never saved, so every call showed as "ended").

## Fixes
- Safety Net release cron was never started and notified with the wrong
  arguments; it now starts after MongoDB connects, never overlaps, and notifies
  only assigned users.
- FamilyContent: `like` returns the `likes` array the app expects; comment
  delete works on Mongoose 9; update accepts `existingImages` so removed
  photos are actually removed; create/update return the populated creator and
  `isOwner`; family owners can delete (moderate) content.

---

# Round 2

## New endpoints
- `GET  /api/v1/feed/unread-counts` → `{ counts: { familyId: n }, total }`
- `POST /api/v1/feed/family/:familyId/read` (also clears that family's in-app notifications)
- `PUT/DELETE /api/v1/families/:id/photo` (owner; multipart field `photo`) — new `Family.familyPhoto`
- `GET  /api/v1/users/moderation/me`, `POST /api/v1/users/moderation`
  `{ action: block|unblock|snooze|unsnooze, targetType: user|family, targetId, hours? }`
- `GET /post/:id` share landing page, `GET /api/v1/share/post/:id` (public posts only),
  `GET /.well-known/assetlinks.json`, `GET /.well-known/apple-app-site-association`

## Block & snooze enforcement (`utils/kokohor/moderation.js`)
- New `User.blockedUsers`, `User.blockedFamilies`, `User.snoozes`.
- Feeds hide blocked authors (and blocked families on the public feed).
- Family notifications: no in-app record for blocked; no push for blocked or snoozed.
- 1-1 messages and calls refused if either side blocked the other.
- Group calls don't ring people who blocked/snoozed the caller or the family.

## Push
- Family notification pushes now carry `type`, `familyId`, `relatedId`
  (so taps open the right chat item) and use a channel the app creates.
- The sender's own family notification is stored as already-read.
- `notifyUser` honours the push preference and block/snooze.
- Group call ringing is a visible push on `incoming_calls`.

## Env for deep links (set on the server serving kokokorcircle.com)
- `SHARE_BASE_URL` (default https://kokokorcircle.com)
- `ANDROID_SHA256_FINGERPRINTS` — Play Console → App integrity → App signing key SHA-256
- `APPLE_TEAM_ID`
- optional: `PLAY_STORE_URL`, `APP_STORE_URL`, `ANDROID_PACKAGE`, `IOS_BUNDLE_ID`

## Call reliability (Android networks)

- `kookohor-rejoin-room` / `kookohor-call-alive` socket events; answered 1-1
  calls survive a socket drop for CALL_RECONNECT_GRACE_SECONDS (default 20).
- Group calls: invitees still ringing get `kokohor:group-call:ended`.
- `/calls/ice-servers`: optional own TURN (TURN_URLS, TURN_USERNAME,
  TURN_CREDENTIAL), `hasTurn` flag, STUN-only responses not cached.
