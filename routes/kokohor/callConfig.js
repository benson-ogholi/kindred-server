const express = require("express");
const { protect } = require("../../middlewares/kokohor/authMiddleware");

/**
 * GET /api/v1/calls/ice-servers
 *
 * Returns STUN/TURN servers for WebRTC. The TURN provider key used to be
 * hard-coded in the app bundle (anyone could extract it and burn the TURN
 * quota); it now lives only on the server.
 *
 * Env: METERED_TURN_URL — full credentials URL incl. apiKey, e.g.
 *   https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>
 * (LEGACY_TURN_URL below keeps calls working until it's set; rotate that
 * key in the Metered dashboard since it shipped in older app builds.)
 */
const router = express.Router();
const LEGACY_TURN_URL =
  "https://kokohorcircle.metered.live/api/v1/turn/credentials?apiKey=6ac42d0030222a2c6d4aa342715d62b68750";
const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
let cache = { at: 0, servers: null };

router.get("/ice-servers", protect, async (req, res) => {
  try {
    if (cache.servers && Date.now() - cache.at < 10 * 60 * 1000) {
      return res.json({ iceServers: cache.servers });
    }
    const url = process.env.METERED_TURN_URL || LEGACY_TURN_URL;
    if (!process.env.METERED_TURN_URL) {
      console.warn("[callConfig] METERED_TURN_URL not set — using the legacy key. Set it and rotate the old key.");
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const turn = await r.json();
    if (!Array.isArray(turn)) throw new Error("bad TURN response");
    cache = { at: Date.now(), servers: [...STUN, ...turn] };
    res.json({ iceServers: cache.servers });
  } catch (err) {
    res.json({ iceServers: STUN });
  }
});

module.exports = router;
