const DriverApplication = require("../../models/padiman_route_models/DriverApplication");
const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

exports.submitDriverApplication = async (req, res) => {
  // Normalizing request object payload to string ID cleanly
  const userId = req.user?.id || req.user;
  console.log(`🔍 [DRIVER_SUBMIT_START] User ID: ${userId}`);

  try {
    const { carDetails, driversLicenseNumber, driversLicense } = req.body;
    const files = req.files; // Expected structure: { driversLicenseImage?: [...], carImages?: [...] }

    // Safe debugging printout lines without breaking native evaluation contexts
    console.log(
      `📝 [BODY_DATA] Received Raw Body keys:`,
      Object.keys(req.body || {})
    );

    const licenseFilesArray =
      files && files["driversLicenseImage"] ? files["driversLicenseImage"] : [];
    const carFilesArray = files && files["carImages"] ? files["carImages"] : [];

    console.log(
      `📎 [FILE_DATA] License files: ${licenseFilesArray.length}, Car files: ${carFilesArray.length}`
    );

    // Validate structural components
    if (licenseFilesArray.length === 0 || carFilesArray.length === 0) {
      console.warn("⚠️ [DRIVER_SUBMIT_ERROR] Missing segmented field uploads.");
      return res.status(400).json({
        message:
          "Please provide both a drivers license image and at least one car image profile.",
      });
    }

    // 1. Upload Drivers License File to Cloud Storage Bucket
    console.log(`🚀 [UPLOADING] Sending driver license file to Backblaze...`);
    const targetLicenseFile = licenseFilesArray[0];
    const licenseUrl = await uploadToBackblaze(
      targetLicenseFile.buffer,
      targetLicenseFile.originalname,
      "driver-applications"
    );

    // 2. Upload Car Images Array to Cloud Storage Bucket via Parallel Map Requests
    console.log(`🚀 [UPLOADING] Processing car image arrays to Backblaze...`);
    const carUploadPromises = carFilesArray.map((file) =>
      uploadToBackblaze(file.buffer, file.originalname, "driver-applications")
    );
    const uploadedCarUrls = await Promise.all(carUploadPromises);

    // Structure the car images array to match your schema requirements: [ { url: "..." } ]
    const formattedCarImages = uploadedCarUrls.map((url) => ({
      url: url,
      description: "Vehicle Profile Image",
    }));

    // 3. Parse Car Details Safely handling either Form Objects or Raw JSON strings
    let parsedCarDetails = {};
    if (typeof carDetails === "string") {
      parsedCarDetails = JSON.parse(carDetails);
    } else if (carDetails && typeof carDetails === "object") {
      parsedCarDetails = carDetails;
    } else if (req.body["carDetails[model]"]) {
      // Fallback catch to gather values matching the React Native flat-append FormData structures
      parsedCarDetails = {
        model: req.body["carDetails[model]"],
        licensePlate: req.body["carDetails[licensePlate]"],
        year: Number(req.body["carDetails[year]"]),
      };
    }

    // Safe Extraction mapping for license strings fallback
    const exactLicenseNumber =
      driversLicenseNumber ||
      req.body["driversLicense[licenseNumber]"] ||
      driversLicense?.licenseNumber;

    console.log(
      `💾 [DB_PREP] Document matching profile maps for User: ${userId}`
    );

    // 4. Update or Upsert entry to prevent duplication errors
    const application = await DriverApplication.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        carDetails: parsedCarDetails,
        carImages: formattedCarImages,
        driversLicense: {
          licenseNumber: exactLicenseNumber,
          image: licenseUrl,
        },
        status: "submitted",
        updatedAt: new Date(),
      },
      { new: true, upsert: true } // Creates if missing, updates structural payload data if re-uploading
    );

    // 5. Update User Document Status Flags
    await Padiman_Route_User.findByIdAndUpdate(userId, {
      isDriverPending: true,
      isDriverRejected: false, // Reset rejection flags during re-submissions
    });

    console.log(
      `✅ [DRIVER_SUBMIT_COMPLETE] Application pipeline complete for User: ${userId}`
    );

    return res.status(201).json({
      message: "Application submitted successfully",
      application,
    });
  } catch (error) {
    console.error("💥 [DRIVER_SUBMIT_FATAL]:", error.message);
    return res.status(500).json({
      message: "Application processing failed",
      error: error.message,
    });
  }
};

// GET APPLICATION STATUS
exports.getDriverApplicationStatus = async (req, res) => {
  try {
    const userId = req.user?.id || req.user;
    const application = await DriverApplication.findOne({ user: userId });

    if (!application) {
      return res
        .status(404)
        .json({ message: "No application found for this user." });
    }

    return res
      .status(200)
      .json({ status: application.status, details: application });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching status", error: error.message });
  }
};
