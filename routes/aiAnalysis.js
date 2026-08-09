const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const mongoose = require("mongoose");

// MODELS
const Family = require("../models/Family");
const FamilyMember = require("../models/FamilyMember");
const FamilyContent = require("../models/FamilyContent");
const News = require("../models/News");
const Task = require("../models/Task");
const Poll = require("../models/Poll");
const Report = require("../models/Report");
const Suggestion = require("../models/Suggestion");
const DonationCampaign = require("../models/DonationCampaign");
const User = require("../models/User");
const AiUsage = require("../models/AiUsage");
const AiChat = require("../models/AiChat");

// OPENAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// CONFIG
const DAILY_LIMIT = 20;

// HELPERS
function getToday() {
  return new Date().toISOString().split("T")[0];
}

function compressArray(arr, limit = 20) {
  if (!arr) return [];
  return arr.slice(0, limit);
}

// CONTEXT BUILDER
async function buildStructuredContext(familyId) {
  console.log("🔵 Building context for:", familyId);

  const [
    family,
    members,
    contents,
    news,
    tasks,
    polls,
    reports,
    suggestions,
    donations,
  ] = await Promise.all([
    Family.findById(familyId)
      .populate("owner", "firstName lastName email")
      .lean(),

    FamilyMember.find({ family: familyId, status: "active" })
      .populate("user", "firstName lastName email")
      .lean(),

    FamilyContent.find({ familyId }).sort({ createdAt: -1 }).limit(50).lean(),

    News.find({ family: familyId }).sort({ createdAt: -1 }).limit(20).lean(),

    Task.find({ family: familyId })
      .populate("assignedTo", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),

    Poll.find({ familyId }).limit(10).lean(),
    Report.find({ familyId }).limit(10).lean(),
    Suggestion.find({ familyId }).limit(10).lean(),
    DonationCampaign.find({ family: familyId }).limit(10).lean(),
  ]);

  if (!family) {
    console.log("❌ No family found");
    return null;
  }

  const context = {
    family: {
      name: family.familyName,
      type: family.familyType,
    },
    members: compressArray(
      members.map((m) => ({
        name: `${m.user?.firstName} ${m.user?.lastName}`,
      }))
    ),
    tasks: compressArray(
      tasks.map((t) => ({
        title: t.title,
        status: t.status,
      }))
    ),
    news: compressArray(
      news.map((n) => ({
        title: n.title,
      }))
    ),
  };

  console.log("🟢 Context built:", context);

  return context;
}

// ROUTE
router.post("/analyze", async (req, res) => {
  try {
    const { familyId, question } = req.body;
    const userId = req.user._id;

    console.log("📩 Incoming request:", { familyId, question, userId });

    if (!familyId || !question) {
      console.log("❌ Missing params");
      return res.status(400).json({ success: false });
    }

    // DAILY LIMIT
    const today = getToday();
    let usage = await AiUsage.findOne({ user: userId, date: today });

    if (!usage) {
      usage = await AiUsage.create({
        user: userId,
        date: today,
        count: 0,
      });
      console.log("🆕 Created usage record");
    }

    console.log("📊 Current usage:", usage.count);

    if (usage.count >= DAILY_LIMIT) {
      console.log("🚫 LIMIT REACHED");
      return res.status(403).json({
        success: false,
        limitReached: true,
        remaining: 0,
        limit: DAILY_LIMIT,
      });
    }

    // CONTEXT
    const context = await buildStructuredContext(familyId);

    // CHAT HISTORY
    let chat = await AiChat.findOne({ user: userId, family: familyId });

    if (!chat) {
      chat = await AiChat.create({
        user: userId,
        family: familyId,
        messages: [],
      });
      console.log("🆕 Created chat");
    }

    const history = chat.messages.slice(-6);

    console.log("🧠 Sending to AI with history:", history.length);

    // AI CALL
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `
You are a smart assistant.

CONTEXT:
${JSON.stringify(context)}
`,
        },
        ...history,
        { role: "user", content: question },
      ],
    });

    const answer = completion.choices[0].message.content;

    console.log("🤖 AI Response:", answer);

    // SAVE CHAT
    chat.messages.push(
      { role: "user", content: question },
      { role: "assistant", content: answer }
    );

    if (chat.messages.length > 50) {
      chat.messages = chat.messages.slice(-50);
    }

    await chat.save();

    // UPDATE USAGE
    usage.count += 1;
    await usage.save();

    const remaining = DAILY_LIMIT - usage.count;

    console.log("✅ Updated usage:", usage.count);
    console.log("🔥 Remaining:", remaining);

    return res.json({
      success: true,
      answer,
      remaining,
      limit: DAILY_LIMIT,
    });
  } catch (err) {
    console.error("🔥 SERVER ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// CREDITS
router.get("/credits", async (req, res) => {
  try {
    const today = getToday();

    const usage = await AiUsage.findOne({
      user: req.user._id,
      date: today,
    });

    const used = usage?.count || 0;
    const remaining = DAILY_LIMIT - used;

    console.log("📊 Credits check:", { used, remaining });

    res.json({
      success: true,
      remaining,
      limit: DAILY_LIMIT,
    });
  } catch (err) {
    console.error("❌ Credits error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
