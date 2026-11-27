const express = require("express");
const { protect } = require("../../middlewares/kokohor/authMiddleware");

/**
 * GET /api/v1/calls/ice-servers
 *
 * STUN + TURN servers for WebRTC. TURN is what makes calls connect on mobile
 * data (carrier-grade NAT), hotel/office Wi-Fi and strict firewalls; STUN
 * alone only works on simple home NATs.
 *
 * Sources (all from env, any combination):
 *   METERED_TURN_URL  — Metered credentials URL incl. apiKey, e.g.
 *     https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>
 *   TURN_URLS         — your own TURN server(s) (e.g. coturn), comma separated:
 *     turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:443?transport=tcp
 *   TURN_USERNAME / TURN_CREDENTIAL — credentials for TURN_URLS
 *
 * Include a `turns:` URL on port 443 (TLS over TCP): many firewalls and
 * some mobile carriers block UDP and all ports except 443.
 *
 * The response also says `hasTurn` so the app knows when it's STUN-only.
 */
const router = express.Router();
const LEGACY_TURN_URL =
  "https://kokohorcircle.metered.live/api/v1/turn/credentials?apiKey=6ac42d0030222a2c6d4aa342715d62b68750";
const STUN = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, servers: null };

const urlsOf = (s) => (Array.isArray(s?.urls) ? s.urls : s?.urls ? [s.urls] : []);
const isTurn = (s) => urlsOf(s).some((u) => /^turns?:/i.test(u));

function staticTurn() {
  const urls = String(process.env.TURN_URLS || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length || !process.env.TURN_USERNAME || !process.env.TURN_CREDENTIAL) return [];
  return [{ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }];
}

async function meteredTurn() {
  const url = process.env.METERED_TURN_URL || (staticTurn().length ? null : LEGACY_TURN_URL);
  if (!url) return [];
  if (!process.env.METERED_TURN_URL) {
    console.warn("[callConfig] METERED_TURN_URL not set — using the legacy key. Set it and rotate the old key.");
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const list = await r.json();
    return Array.isArray(list) ? list.filter(isTurn) : [];
  } finally {
    clearTimeout(t);
  }
}

router.get("/ice-servers", protect, async (req, res) => {
  try {
    if (cache.servers && Date.now() - cache.at < CACHE_MS) {
      return res.json({ iceServers: cache.servers, hasTurn: true });
    }
    let turn = staticTurn();
    try {
      turn = [...turn, ...(await meteredTurn())];
    } catch (err) {
      console.warn("[callConfig] TURN credential fetch failed:", err.message);
    }
    const servers = [...STUN, ...turn];
    if (turn.length) cache = { at: Date.now(), servers };
    res.json({ iceServers: servers, hasTurn: turn.length > 0 });
  } catch (err) {
    res.json({ iceServers: STUN, hasTurn: false });
  }
});

module.exports = router;
