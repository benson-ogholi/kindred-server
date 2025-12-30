const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const { protect } = require("../middlewares/authMiddleware");
const { createFamilyNotifications } = require("../utils/notificationHelper");

router.post("/family/:familyId", protect, async (req, res) => {
  console.log("🟢 CREATE TASK HIT");
  console.log("➡️ Request params:", req.params);
  console.log("➡️ Request user:", req.user._id);
  console.log("➡️ Request body:", req.body);

  try {
    const { title, details, deadline, assignedTo } = req.body;
    const { familyId } = req.params;

    if (!title) {
      console.warn("⚠️ Task creation failed: Title missing");
      return res.status(400).json({ message: "Task title is required" });
    }

    console.log("⏳ Creating task...");

    const task = await Task.create({
      family: familyId,
      title,
      details,
      deadline,
      assignedTo,
      createdBy: req.user._id,
    });

    console.log("✅ Task created in DB:", task._id);

    // Populate assignedTo and createdBy
    await task.populate("assignedTo", "firstName lastName");
    await task.populate("createdBy", "firstName lastName");

    console.log("✅ Task populated with users:", {
      assignedTo: task.assignedTo,
      createdBy: task.createdBy,
    });

    await createFamilyNotifications(familyId, req.user._id, {
      type: "NEW_TASK",
      title: "📋 New Task Assigned",
      message: `${task.title} - assigned to ${
        task.assignedTo?.firstName || "the family"
      }`,
      relatedId: task._id,
    });

    res.status(201).json({ task });
    console.log("📤 Task sent in response");
  } catch (error) {
    console.error("🔥 Create task error:", error);
    res.status(500).json({ message: "Failed to create task" });
  }
});

router.get("/family/:familyId", protect, async (req, res) => {
  console.log("🟢 FETCH TASKS BY FAMILY HIT");
  console.log("➡️ Request params:", req.params);
  console.log("➡️ Request user:", req.user._id);

  try {
    const { familyId } = req.params;

    console.log("⏳ Fetching tasks from DB...");

    const tasks = await Task.find({ family: familyId })
      .populate("assignedTo", "firstName lastName")
      .populate("createdBy", "firstName lastName")
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${tasks.length} tasks for family ${familyId}`);
    tasks.forEach((task) => {
      console.log(
        "Task ID:",
        task._id,
        "Title:",
        task.title,
        "Status:",
        task.status
      );
    });

    res.status(200).json({ tasks });
    console.log("📤 Tasks sent in response");
  } catch (error) {
    console.error("🔥 Fetch tasks error:", error);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
});

router.put("/:taskId", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (
      task.createdBy.toString() !== req.user._id.toString() &&
      task.assignedTo?.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this task" });
    }

    const { title, details, deadline, assignedTo, status } = req.body;

    if (title !== undefined) task.title = title;
    if (details !== undefined) task.details = details;
    if (deadline !== undefined) task.deadline = deadline;
    if (assignedTo !== undefined) task.assignedTo = assignedTo;
    if (status !== undefined) task.status = status;

    await task.save();
    await task.populate("assignedTo", "firstName lastName");
    await task.populate("createdBy", "firstName lastName");

    res.status(200).json({ task });
  } catch (error) {
    console.error("🔥 Update task error:", error);
    res.status(500).json({ message: "Failed to update task" });
  }
});

router.delete("/:taskId", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.createdBy.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this task" });
    }

    await task.deleteOne();

    res.status(200).json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("🔥 Delete task error:", error);
    res.status(500).json({ message: "Failed to delete task" });
  }
});

router.get("/:taskId", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId)
      .populate("assignedTo", "firstName lastName")
      .populate("createdBy", "firstName lastName");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.status(200).json({ task });
  } catch (error) {
    console.error("🔥 Get task error:", error);
    res.status(500).json({ message: "Failed to fetch task" });
  }
});

module.exports = router;
