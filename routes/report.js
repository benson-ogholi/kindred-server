const express = require("express");
const router = express.Router();
const Report = require("../models/Report");
const { protect } = require("../middlewares/authMiddleware"); // Assuming you have auth middleware
const { createFamilyNotifications } = require("../utils/notificationHelper");

router.post("/", protect, async (req, res) => {
  try {
    const {
      familyId,
      reportName,
      expectations,
      workDone,
      status,
      completionPercentage,
      proofLinks,
      sharedWith,
    } = req.body;

    const report = await Report.create({
      familyId,
      sender: req.user._id, // Set from auth middleware
      reportName,
      expectations,
      workDone,
      status,
      completionPercentage,
      proofLinks,
      sharedWith,
    });

    await createFamilyNotifications(familyId, req.user._id, {
      type: "REPORT_SUBMITTED",
      title: "Progress Report Update",
      message: `${req.user.firstName} submitted a report: ${reportName}`,
      relatedId: report._id,
    });

    res.status(201).json({ success: true, report });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Get all reports for a family (with isOwner toggle)
// @route   GET /api/reports/family/:familyId
router.get("/family/:familyId", protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const reports = await Report.find({ familyId: req.params.familyId })
      .populate("sender", "name profilePicture")
      .populate("sharedWith", "name")
      .sort({ createdAt: -1 });

    // Map through reports to add the 'isOwner' flag
    const enrichedReports = reports.map((report) => {
      const reportObj = report.toObject();
      return {
        ...reportObj,
        isOwner: report.sender._id.toString() === userId.toString(),
      };
    });

    res.json({ success: true, reports: enrichedReports });
  } catch (error) {
    res.status(500).json({ message: "Error fetching reports" });
  }
});

// @desc    Update a report
// @route   PUT /api/reports/:id
router.put("/:id", protect, async (req, res) => {
  try {
    let report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    // Security: Check if user is the one who sent the report
    if (report.sender.toString() !== req.user._id.toString()) {
      return res
        .status(401)
        .json({ message: "Not authorized to update this report" });
    }

    report = await Report.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, report });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Delete a report
// @route   DELETE /api/reports/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    // Security: Check if user is the owner
    if (report.sender.toString() !== req.user._id.toString()) {
      return res
        .status(401)
        .json({ message: "Not authorized to delete this report" });
    }

    await report.deleteOne();
    res.json({ success: true, message: "Report removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
