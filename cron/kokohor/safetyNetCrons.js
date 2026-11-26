// cron/kokohor/safetyNetCrons.js
//
// Releases Safety Net vaults whose trigger date has passed: marks them
// RELEASED, notifies each assigned user (in-app + push) and drops a card
// into the Family Chat that only the assigned users (and the creator) see.
//
// Started from index.js via `startSafetyNetCron(io)` once the database is
// connected.
const cron = require("node-cron");
const SafetyNet = require("../../models/kokohor/SafetyNet");
const Notification = require("../../models/kokohor/Notification");
const { sendPushNotificationToUser } = require("../../utils/notifyUser");
const { postFamilyActivity } = require("../../utils/kokohor/familyActivity");

let task = null;
let running = false;

async function releaseDueVaults(io) {
  if (running) return; // never overlap runs
  running = true;
  try {
    const now = new Date();
    const triggeredNets = await SafetyNet.find({
      triggerDate: { $lte: now },
      status: "PENDING",
    }).populate("assignedUsers createdBy", "firstName lastName");

    for (const net of triggeredNets) {
      // Mark first so a slow notification fan-out can't cause a double release.
      net.status = "RELEASED";
      await net.save();

      const creatorName = net.createdBy?.firstName || "A family member";
      const assigned = (net.assignedUsers || []).filter(Boolean);

      await Promise.all(
        assigned.map(async (user) => {
          try {
            await Notification.create({
              recipient: user._id,
              familyId: net.family,
              type: "SAFETY_NET_RELEASED",
              title: "🔒 A Safety Net Vault has opened",
              message: `${creatorName} shared a vault with you: "${net.title}"`,
              relatedId: net._id,
            });
            await sendPushNotificationToUser(user._id, {
              title: "🔒 A Safety Net Vault has opened",
              body: `${creatorName} shared a vault with you: "${net.title}"`,
            });
          } catch (e) {
            console.error("[safetyNetCron] notify failed:", e.message);
          }
        })
      );

      if (assigned.length) {
        await postFamilyActivity(io, {
          familyId: net.family,
          authorId: net.createdBy?._id || net.createdBy,
          sourceType: "safety_net",
          sourceId: net._id,
          action: "released",
          title: "A Safety Net vault has opened",
          body: `"${net.title}" from ${creatorName}`,
          audience: assigned.map((u) => String(u._id)),
          extra: { triggerDate: net.triggerDate },
        });
      }
    }
  } catch (err) {
    console.error("[safetyNetCron] run failed:", err.message);
  } finally {
    running = false;
  }
}

function startSafetyNetCron(io) {
  if (task) return task;
  task = cron.schedule("* * * * *", () => releaseDueVaults(io));
  return task;
}

module.exports = { startSafetyNetCron, releaseDueVaults };
