const PadimanRouteUser = require("../../models/padiman_route_models/Padiman_Route_User");
const { sendNotification } = require("../../utils/pr/pr_push");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");
const axios = require("axios");

// Dojah API Configuration
const DOJAH_BASE_URL = process.env.DOJAH_BASE_URL || "https://api.dojah.io";
const DOJAH_SECRET_KEY = process.env.DOJAH_SECRET_KEY || "";
const DOJAH_APP_ID = process.env.DOJAH_APP_ID || "";

/**
 * @desc    Submit driver application + live Dojah BVN/NIN + Selfie verification
 * @route   POST /api/v1/padiman_route/driver/apply
 * @access  Private
 */
exports.submitDriverApplication = async (req, res) => {
  console.log("-----------------------------------------");
  console.log("📥 POST /api/v1/padiman_route/driver/apply hit");
  console.log("📦 Request Body Fields:", Object.keys(req.body));
  console.log("📁 Request Files:", req.files ? Object.keys(req.files) : "None");

  try {
    const userId =
      typeof req.user === "string"
        ? req.user
        : req.user?.id || req.user?._id || req.body.userId;

    const {
      driverLicenseNumber,
      vehicleModel,
      vehicleYear,
      plateNumber,
      vehicleType,
      address,
      idType, // "bvn" or "nin"
      idNumber,
      firstName,
      lastName,
    } = req.body;

    // ---------- Basic validation ----------
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (
      !driverLicenseNumber ||
      !vehicleModel ||
      !plateNumber ||
      !vehicleType ||
      !idType ||
      !idNumber
    ) {
      return res.status(400).json({
        error:
          "driverLicenseNumber, vehicleModel, plateNumber, vehicleType, idType and idNumber are required",
      });
    }

    const existingUser = await PadimanRouteUser.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "PadimanRoute user not found" });
    }

    // ---------- File handling ----------
    let licenseDocumentUrl = null;
    let selfieUrl = null;
    let selfieBase64 = null;

    if (req.files) {
      if (req.files.licenseDocument?.[0]) {
        const file = req.files.licenseDocument[0];
        licenseDocumentUrl = await uploadToBackblaze(
          file.buffer,
          file.originalname || `license_${userId}.jpg`,
          "driver-licenses"
        );
      }

      if (req.files.selfie?.[0]) {
        const file = req.files.selfie[0];
        selfieBase64 = file.buffer.toString("base64");
        selfieUrl = await uploadToBackblaze(
          file.buffer,
          file.originalname || `selfie_${userId}.jpg`,
          "driver-selfies"
        );
      }
    }

    // Fallback if selfie came as base64 string in body
    if (!selfieBase64 && req.body.selfieImage) {
      selfieBase64 = req.body.selfieImage.replace(
        /^data:image\/[a-z]+;base64,/,
        ""
      );
    }

    if (!selfieBase64) {
      return res.status(400).json({
        error: "A clear selfie image is required for identity verification",
      });
    }

    // ---------- Dojah KYC (BVN or NIN + Selfie) ----------
    const normalizedIdType = idType.toLowerCase().trim();
    if (normalizedIdType !== "bvn" && normalizedIdType !== "nin") {
      return res
        .status(400)
        .json({ error: "idType must be either 'bvn' or 'nin'" });
    }

    const dojahEndpoint = `${DOJAH_BASE_URL}/api/v1/kyc/${normalizedIdType}/verify`;
    const dojahPayload = {
      [normalizedIdType]: idNumber,
      selfie_image: selfieBase64,
    };

    console.log(`🚀 Calling Dojah ${normalizedIdType.toUpperCase()} Verify...`);

    let dojahResponse;
    try {
      dojahResponse = await axios.post(dojahEndpoint, dojahPayload, {
        headers: {
          Authorization: DOJAH_SECRET_KEY,
          AppId: DOJAH_APP_ID,
          "Content-Type": "application/json",
        },
      });
    } catch (dojahErr) {
      console.error(
        "❌ Dojah API Error:",
        dojahErr.response?.data || dojahErr.message
      );

      // Mark as rejected
      await PadimanRouteUser.findByIdAndUpdate(userId, {
        isDriverApproved: false,
        isDriverRejected: true,
        isDriver: false,
      });

      return res.status(400).json({
        error:
          "Identity verification failed. Please check your details and try again.",
        details: dojahErr.response?.data || dojahErr.message,
        status: "failed",
      });
    }

    const entityData =
      dojahResponse.data?.entity || dojahResponse.data?.data?.entity;

    if (!entityData) {
      await PadimanRouteUser.findByIdAndUpdate(userId, {
        isDriverApproved: false,
        isDriverRejected: true,
        isDriver: false,
      });

      return res.status(400).json({
        error: "Could not retrieve identity record from Dojah",
        status: "failed",
      });
    }

    // ---------- Selfie match check ----------
    const selfieVerification = entityData.selfie_verification || {};
    const confidence = selfieVerification.confidence_value || 0;
    const isMatch = selfieVerification.match === true;

    console.log("🔍 Selfie Verification:", { match: isMatch, confidence });

    if (!isMatch || confidence < 70) {
      await PadimanRouteUser.findByIdAndUpdate(userId, {
        isDriverApproved: false,
        isDriverRejected: true,
        isDriver: false,
      });

      return res.status(400).json({
        error:
          "Selfie verification failed. The provided photo does not match your government record.",
        confidence,
        status: "failed",
      });
    }

    // ---------- Optional name soft-check ----------
    const recordFirstName = (
      entityData.firstname ||
      entityData.first_name ||
      ""
    )
      .trim()
      .toLowerCase();
    const recordLastName = (
      entityData.surname ||
      entityData.last_name ||
      entityData.lastname ||
      ""
    )
      .trim()
      .toLowerCase();

    // ---------- SUCCESS → APPROVE IMMEDIATELY ----------
    const updatedUser = await PadimanRouteUser.findByIdAndUpdate(
      userId,
      {
        isDriver: true,
        isDriverApproved: true,
        isDriverRejected: false,
        driverLicenseNumber,
        ...(address && { address }),
        verificationMeta: {
          ...(existingUser.verificationMeta || {}),
          driverVerification: {
            idType: normalizedIdType,
            idNumber,
            verifiedAt: new Date(),
            dojahRecord: {
              firstName: recordFirstName,
              lastName: recordLastName,
              birthdate: entityData.birthdate,
              gender: entityData.gender,
              selfieMatch: isMatch,
              confidenceValue: confidence,
            },
            documents: {
              licenseDocumentUrl,
              selfieUrl,
            },
            vehicleApplication: {
              vehicleModel,
              vehicleYear,
              plateNumber,
              vehicleType,
              appliedAt: new Date(),
            },
          },
        },
      },
      { new: true }
    );

    console.log("🎉 Driver approved successfully:", {
      id: updatedUser._id,
      email: updatedUser.email,
    });

    // Notification (non-blocking)
    sendNotification(updatedUser._id || userId, {
      title: "Driver Application Approved ✅",
      body: "Congratulations! Your identity has been verified and you are now an approved driver.",
      type: "DRIVER_APPLICATION_APPROVED",
      router: "/driver/application-status",
      data: {
        driverLicenseNumber: updatedUser.driverLicenseNumber,
        status: "approved",
      },
    }).catch((err) => {
      console.error("⚠️ Notification error:", err?.message || err);
    });

    return res.status(200).json({
      message: "Driver application approved successfully",
      status: "approved",
      application: {
        id: updatedUser._id,
        userId: updatedUser._id,
        status: "approved",
        isDriver: true,
        isDriverApproved: true,
        isDriverRejected: false,
        driverLicenseNumber: updatedUser.driverLicenseNumber,
        vehicleModel,
        plateNumber,
        verifiedIdentity: {
          firstName: recordFirstName,
          lastName: recordLastName,
          match: isMatch,
          confidence,
        },
        createdAt: new Date(),
      },
    });
  } catch (error) {
    console.error("🔥 Server Error in /apply:", error);
    return res.status(500).json({
      error: "Server error while processing driver application",
      status: "failed",
    });
  }
};

/**
 * @desc    Get current user's driver application status
 * @route   GET /api/v1/padiman_route/driver/application-status
 * @access  Private
 */
exports.getDriverApplicationStatus = async (req, res) => {
  console.log("-----------------------------------------");
  console.log("📥 GET /api/v1/padiman_route/driver/application-status hit");

  try {
    const userId =
      typeof req.user === "string"
        ? req.user
        : req.user?.id || req.user?._id || req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const user = await PadimanRouteUser.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Only two possible states
    let currentStatus = "not_submitted";
    if (user.isDriverApproved) {
      currentStatus = "approved";
    } else if (user.isDriverRejected) {
      currentStatus = "failed";
    }

    return res.status(200).json({
      message: "Application status fetched successfully",
      status: currentStatus,
      application: {
        isDriver: user.isDriver || false,
        isDriverApproved: user.isDriverApproved || false,
        isDriverRejected: user.isDriverRejected || false,
        driverLicenseNumber: user.driverLicenseNumber || null,
        meta:
          user.verificationMeta?.driverVerification?.vehicleApplication || null,
      },
    });
  } catch (error) {
    console.error("🔥 Server Error in /application-status:", error);
    return res.status(500).json({
      error: "Server error while fetching status",
    });
  }
};

/**
 * @desc    Verify customer documents (BVN/NIN) and update documentation status
 * @route   POST /api/v1/padiman_route/customer/verify-documents
 * @access  Private
 */
exports.verifyCustomerDocuments = async (req, res) => {
  console.log("-----------------------------------------");
  console.log(
    "📥 POST /api/v1/padiman_route/customer/verify-documents hit (PRODUCTION)"
  );
  console.log("📦 Request Body:", req.body);

  try {
    const userId =
      typeof req.user === "string"
        ? req.user
        : req.user?.id || req.user?._id || req.body.userId;
    const { bvnVerified, ninNumber, isUserDocumented } = req.body;

    if (!userId) {
      console.log("❌ Validation Error: User ID is missing");
      return res.status(400).json({ error: "User ID is required" });
    }

    if (!ninNumber) {
      console.log(
        "❌ Validation Error: NIN number is required for verification"
      );
      return res
        .status(400)
        .json({ error: "NIN number is required to proceed with verification" });
    }

    const existingUser = await PadimanRouteUser.findById(userId);
    if (!existingUser) {
      console.log(
        "❌ Database Error: PadimanRoute user not found with ID:",
        userId
      );
      return res.status(404).json({ error: "PadimanRoute user not found" });
    }

    // MANDATORY DOJAH PRODUCTION API VERIFICATION HIT
    console.log(
      `🔍 Hitting Dojah PRODUCTION API for NIN verification: ${ninNumber}`
    );

    const dojahUrl = `https://api.dojah.io/api/v1/kyc/nin?nin=${encodeURIComponent(
      ninNumber
    )}`;

    const dojahResponse = await fetch(dojahUrl, {
      method: "GET",
      headers: {
        Authorization: process.env.DOJAH_SECRET_KEY,
        AppId: process.env.DOJAH_APP_ID,
      },
    });

    const dojahResult = await dojahResponse.json();
    console.log(
      "📦 Dojah Production API Response Status:",
      dojahResponse.status
    );

    // Strict evaluation: Must hit Dojah production and receive entity data to proceed
    if (!dojahResponse.ok || !dojahResult?.entity) {
      console.log("❌ Dojah Production Verification Failed:", dojahResult);
      return res.status(400).json({
        error:
          "NIN verification failed via Dojah. Please check the NIN number and try again.",
        details:
          dojahResult?.error ||
          dojahResult?.message ||
          "No record found for supplied identifier",
      });
    }

    const dojahEntityData = dojahResult.entity;

    // --- AGE VALIDATION (MUST BE 18 OR OLDER) ---
    if (dojahEntityData.date_of_birth) {
      const dob = new Date(dojahEntityData.date_of_birth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < dob.getDate())
      ) {
        age--;
      }

      console.log(`🎂 Calculated User Age: ${age} years old`);

      if (age < 18) {
        console.log(
          `❌ Underage User Detected (${age} years old). Account scheduled for deletion in 20 seconds.`
        );

        // Schedule background deletion after 20 seconds (20,000 ms)
        setTimeout(async () => {
          try {
            await PadimanRouteUser.findByIdAndDelete(userId);
            console.log(
              `🗑️ Account successfully deleted for underage user: ${userId}`
            );
          } catch (deleteErr) {
            console.error("🔥 Error deleting underage account:", deleteErr);
          }
        }, 20000);

        return res.status(403).json({
          error:
            "Verification failed: You must be at least 18 years old to use this platform. Your account will be deleted in 20 seconds.",
          action: "ACCOUNT_SCHEDULED_FOR_DELETION",
          timeRemainingSeconds: 20,
        });
      }
    }

    // --- NAME MATCHING VALIDATION ---
    const userFullName = (existingUser.fullName || "").toLowerCase().trim();
    const dojahFirstName = (dojahEntityData.first_name || "")
      .toLowerCase()
      .trim();
    const dojahMiddleName = (dojahEntityData.middle_name || "")
      .toLowerCase()
      .trim();
    const dojahLastName = (dojahEntityData.last_name || "")
      .toLowerCase()
      .trim();

    console.log(
      "🔍 Comparing Names - User FullName:",
      userFullName,
      "| Dojah Record:",
      {
        firstName: dojahFirstName,
        middleName: dojahMiddleName,
        lastName: dojahLastName,
      }
    );

    // Split user full name into component tokens
    const userTokens = userFullName.split(/\s+/).filter(Boolean);

    // Count how many parts of the user's name match Dojah's entity record fields
    let matchCount = 0;
    userTokens.forEach((token) => {
      if (
        token === dojahFirstName ||
        token === dojahMiddleName ||
        token === dojahLastName
      ) {
        matchCount++;
      }
    });

    // Require at least 2 name components to match (or 1 if user only has a 1-word name registered)
    const requiredMatches =
      userTokens.length === 1 ? 1 : Math.min(2, userTokens.length);

    if (matchCount < requiredMatches) {
      console.log(
        `❌ Name Mismatch Error: User profile name '${existingUser.fullName}' does not match Dojah NIN record name.`
      );
      return res.status(400).json({
        error:
          "Verification failed: The name on your NIN does not match your registered account name.",
        registeredName: existingUser.fullName,
        dojahRecordName: `${dojahEntityData.first_name || ""} ${
          dojahEntityData.middle_name || ""
        } ${dojahEntityData.last_name || ""}`.trim(),
      });
    }

    console.log("✅ Name Validation Passed successfully.");

    const isNinSuccessfullyVerified = true;

    const documentedFlag =
      isUserDocumented !== undefined
        ? isUserDocumented
        : Boolean(bvnVerified || isNinSuccessfullyVerified);

    const bvnStatusText = bvnVerified
      ? "BVN number verified"
      : "BVN number not verified";

    const ninStatusText = "NIN number verified";

    const updateFields = {
      isUserDocumented: documentedFlag,
      ninNumber: ninNumber,
      verificationMeta: {
        ...(existingUser.verificationMeta || {}),
        verifiedDocuments: {
          bvnStatus: bvnStatusText,
          ninStatus: ninStatusText,
          verifiedAt: new Date(),
        },
        // Store Dojah entity response object inside verificationMeta
        dojahEntity: dojahEntityData,
      },
    };

    const updatedUser = await PadimanRouteUser.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true }
    );

    console.log(
      "🎉 Customer Documents Verified Successfully via Dojah Production for User:",
      {
        id: updatedUser._id,
        email: updatedUser.email,
        isUserDocumented: updatedUser.isUserDocumented,
        ninNumber: updatedUser.ninNumber,
      }
    );

    return res.status(200).json({
      message: "Customer documents verified successfully via Dojah Production",
      isUserDocumented: updatedUser.isUserDocumented,
      ninNumber: updatedUser.ninNumber || null,
      verifiedDocuments: updatedUser.verificationMeta.verifiedDocuments,
      entity: dojahEntityData,
    });
  } catch (error) {
    console.error("🔥 Server Error in /customer/verify-documents:", error);
    return res
      .status(500)
      .json({ error: "Server error while verifying customer documents" });
  }
};

/**
 * @desc    Get current customer's verification status
 * @route   GET /api/v1/padiman_route/customer/verification-status
 * @access  Private
 */
exports.getCustomerVerificationStatus = async (req, res) => {
  console.log("-----------------------------------------");
  console.log("📥 GET /api/v1/padiman_route/customer/verification-status hit");

  try {
    const userId =
      typeof req.user === "string"
        ? req.user
        : req.user?.id || req.user?._id || req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const user = await PadimanRouteUser.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if test mode is requested to clear all verification records
    const isTestMode = false;

    if (isTestMode) {
      console.log(
        `⚠️ Test mode active: Clearing verification records for user ${userId}`
      );

      user.isUserDocumented = false;
      user.ninNumber = null;
      user.bvnVerified = false;
      user.verificationMeta = {
        verifiedDocuments: {
          bvnStatus: "BVN number not verified",
          ninStatus: "NIN number not verified",
        },
      };

      await user.save();
    }

    return res.status(200).json({
      message: isTestMode
        ? "Test mode: All verification records cleared successfully"
        : "Customer verification status fetched successfully",
      isUserDocumented: user.isUserDocumented || false,
      ninNumber: user.ninNumber || null,
      verifiedDocuments: user.verificationMeta?.verifiedDocuments || {
        bvnStatus: "BVN number not verified",
        ninStatus: "NIN number not verified",
      },
    });
  } catch (error) {
    console.error("🔥 Server Error in /customer/verification-status:", error);
    return res.status(500).json({
      error: "Server error while fetching customer verification status",
    });
  }
};

