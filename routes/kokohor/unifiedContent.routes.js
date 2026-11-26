const express = require("express");
const router = express.Router();
const multer = require("multer");

const { protect, checkStatus } = require("../../middlewares/kokohor/authMiddleware");
const { requireFamilyRight } = require("../../middlewares/kokohor/familyAccess");
const controller = require("../../controllers/kokohor/unifiedContentController");

// Same memory-storage pattern as the legacy per-type routes (news.routes.js,
// suggestionRoutes.js, etc.) — kept so the news/poll/suggestion/task/report
// screens that post images/a voice note directly as multipart form data
// (instead of a pre-uploaded URL) keep working unchanged against this
// unified endpoint. A JSON request is untouched: multer only engages for
// an actual multipart/form-data body.
const upload = multer({ storage: multer.memoryStorage() });
const uploadContentMedia = upload.fields([
  { name: "images", maxCount: 5 },
  { name: "voiceNote", maxCount: 1 },
]);

router.use(protect, checkStatus);

// A handful of types gate creation behind an explicit FamilyMember.rights
// flag (matching the rights template in models/kokohor/FamilyMember.js);
// everything else just requires active membership, which `create` already
// checks itself.
const RIGHT_BY_TYPE = {
  news: "canPostNews",
  poll: "canCreatePolls",
  suggestion: "canPostSuggestions",
  donation: "canMakeDonations",
};

const requireRightForBody = (req, res, next) => {
  const right = RIGHT_BY_TYPE[req.body.type];
  if (!right) return next();
  // requireFamilyRight reads familyId from params or req.body.familyId;
  // the unified payload uses `family`, so bridge it.
  req.body.familyId = req.body.family;
  return requireFamilyRight(right)(req, res, next);
};

// ---- Feeds ----
router.get("/public", controller.getPublicFeed);
router.get("/family/:familyId", controller.getFeed);
router.get("/unread-counts", controller.getUnreadCounts);
router.post("/family/:familyId/read", controller.markFamilyRead);

// ---- CRUD ----
router.post("/", uploadContentMedia, requireRightForBody, controller.create);
router.get("/:id", controller.getOne);
router.put("/:id", uploadContentMedia, controller.update);
router.delete("/:id", controller.remove);

// ---- Social ----
router.post("/:id/comments", controller.addComment);
router.delete("/:id/comments/:commentId", controller.deleteComment);
router.post("/:id/reactions", controller.toggleReaction);
router.post("/:id/repost", controller.repost);

// ---- Type-specific actions ----
router.patch("/:id/poll/vote", controller.votePoll);
router.patch("/:id/task/status", controller.updateTaskStatus);
router.post("/:id/donation/contribute", controller.contribute);
router.patch("/:id/donation/contributions/:contributionId/verify", controller.verifyContribution);

module.exports = router;
