const express = require("express");
const mongoose = require("mongoose");
const UnifiedContent = require("../../models/kokohor/UnifiedContent");

/**
 * Share links + app/universal-link plumbing for https://kokokorcircle.com
 *
 *   GET /post/:id                          landing page (opens the app, store fallback)
 *   GET /api/v1/share/post/:id             public preview JSON (public posts only)
 *   GET /.well-known/assetlinks.json       Android App Links verification
 *   GET /.well-known/apple-app-site-association   iOS Universal Links
 *
 * For these to work, kokokorcircle.com (or the paths above) must be served
 * by this server — e.g. point the domain at it, or proxy /post/* and
 * /.well-known/* to it from the landing site.
 *
 * Env:
 *   SHARE_BASE_URL                 default https://kokokorcircle.com
 *   ANDROID_PACKAGE                default com.kokohor.app
 *   ANDROID_SHA256_FINGERPRINTS    comma-separated SHA-256 signing cert fingerprints
 *                                  (Play Console → App integrity → App signing)
 *   APPLE_TEAM_ID                  Apple developer Team ID
 *   IOS_BUNDLE_ID                  default com.kokohor.app
 *   PLAY_STORE_URL / APP_STORE_URL store links for the "Get the app" button
 */
const router = express.Router();

const BASE = (process.env.SHARE_BASE_URL || "https://kokokorcircle.com").replace(/\/$/, "");
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || "com.kokohor.app";
const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID || "com.kokohor.app";
const PLAY_STORE_URL =
  process.env.PLAY_STORE_URL || `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const APP_STORE_URL = process.env.APP_STORE_URL || "https://apps.apple.com/";

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

async function publicPreview(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const item = await UnifiedContent.findById(id)
    .select("type title body images visibility author createdAt meta.toSelf")
    .populate("author", "firstName lastName profilePicture")
    .lean();
  if (!item) return null;
  if (item.visibility !== "public" || item.meta?.toSelf) {
    // Family-only content: never leak its text; the app checks membership.
    return { _id: String(item._id), restricted: true };
  }
  return {
    _id: String(item._id),
    restricted: false,
    type: item.type,
    title: item.title || "",
    body: (item.body || "").slice(0, 280),
    image: item.images?.[0]?.url || "",
    author: item.author
      ? `${item.author.firstName || ""} ${item.author.lastName || ""}`.trim()
      : "",
    createdAt: item.createdAt,
  };
}

router.get("/api/v1/share/post/:id", async (req, res) => {
  try {
    const preview = await publicPreview(req.params.id);
    if (!preview) return res.status(404).json({ message: "Post not found" });
    res.json({ preview, url: `${BASE}/post/${req.params.id}` });
  } catch (err) {
    res.status(500).json({ message: "Failed to load preview" });
  }
});

router.get(["/post/:id", "/p/:id"], async (req, res) => {
  const id = String(req.params.id || "");
  let preview = null;
  try {
    preview = await publicPreview(id);
  } catch {
    preview = null;
  }
  const title = preview && !preview.restricted
    ? preview.title || `${preview.author || "Someone"} on Kokohor`
    : "A post on Kokohor";
  const desc = preview && !preview.restricted
    ? preview.body || "Open it in the Kokohor app."
    : "This post is shared within a Kokohor family circle. Open it in the app to view it.";
  const image = preview && !preview.restricted ? preview.image : "";
  const appUrl = `kokohor://post/${encodeURIComponent(id)}`;
  const intentUrl = `intent://post/${encodeURIComponent(id)}#Intent;scheme=kokohor;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;

  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${BASE}/post/${id}`)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="apple-itunes-app" content="app-argument=${esc(appUrl)}">
<style>
  body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f4;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:#fff;border-radius:20px;padding:28px;max-width:420px;width:88%;box-shadow:0 8px 30px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 8px} p{color:#475569;line-height:1.5;margin:0 0 20px}
  img{width:100%;border-radius:14px;margin-bottom:16px}
  a.btn{display:block;text-align:center;padding:14px;border-radius:12px;text-decoration:none;font-weight:700;margin-top:10px}
  .open{background:#FFC107;color:#0f172a}.store{background:#0f172a;color:#fff}
</style></head><body><div class="card">
${image ? `<img src="${esc(image)}" alt="">` : ""}
<h1>${esc(title)}</h1><p>${esc(desc)}</p>
<a class="btn open" id="open" href="${esc(appUrl)}">Open in Kokohor</a>
<a class="btn store" id="store" href="${esc(PLAY_STORE_URL)}">Get the app</a>
</div>
<script>
  var ua = navigator.userAgent || "";
  var isAndroid = /android/i.test(ua), isIOS = /iphone|ipad|ipod/i.test(ua);
  document.getElementById("store").href = isIOS ? ${JSON.stringify(APP_STORE_URL)} : ${JSON.stringify(PLAY_STORE_URL)};
  if (isAndroid) { document.getElementById("open").href = ${JSON.stringify(intentUrl)}; window.location.href = ${JSON.stringify(intentUrl)}; }
  else if (isIOS) { setTimeout(function(){ window.location.href = ${JSON.stringify(appUrl)}; }, 50); }
</script>
</body></html>`);
});

router.get("/.well-known/assetlinks.json", (req, res) => {
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  res.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: fingerprints },
    },
  ]);
});

router.get(["/.well-known/apple-app-site-association", "/apple-app-site-association"], (req, res) => {
  const team = process.env.APPLE_TEAM_ID || "TEAMID";
  res.set("Content-Type", "application/json").send(
    JSON.stringify({
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [`${team}.${IOS_BUNDLE_ID}`],
            appID: `${team}.${IOS_BUNDLE_ID}`,
            paths: ["/post/*", "/p/*"],
            components: [{ "/": "/post/*" }, { "/": "/p/*" }],
          },
        ],
      },
    })
  );
});

module.exports = router;
