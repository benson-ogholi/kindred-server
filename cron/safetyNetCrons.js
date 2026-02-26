// utils/safetyNetCrons.js
const cron = require("node-cron");
const SafetyNet = require("../models/SafetyNet");
const { createFamilyNotifications } = require("../utils/notificationHelper");

cron.schedule("* * * * *", async () => {
  const now = new Date();
  
  // Find all PENDING vaults where trigger date has passed
  const triggeredNets = await SafetyNet.find({
    triggerDate: { $lte: now },
    status: "PENDING"
  }).populate("assignedUsers createdBy");

  for (const net of triggeredNets) {
    // Notify each assigned user
    const notifications = net.assignedUsers.map(user => 
      createFamilyNotifications(user._id, net.family, {
        type: "SAFETY_NET_RELEASED",
        title: "🔒 A Safety Net Vault has opened",
        message: `${net.createdBy.firstName} shared a vault with you: "${net.title}"`,
        relatedId: net._id
      })
    );

    await Promise.all(notifications);
    
    // Mark as released
    net.status = "RELEASED";
    await net.save();
  }
});