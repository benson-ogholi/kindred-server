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
      idType,
      idNumber,
    } = req.body;

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
          "driverLicenseNumber, vehicleModel, plateNumber, vehicleType, idType, and idNumber are required",
      });
    }

    const existingUser = await PadimanRouteUser.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "PadimanRoute user not found" });
    }

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

    const selfieVerification = entityData.selfie_verification || {};
    const confidence = selfieVerification.confidence_value || 0;
    const isMatch = selfieVerification.match === true;

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

    const recordFirstName = (
      entityData.firstname ||
      entityData.first_name ||
      ""
    ).trim();
    const recordLastName = (
      entityData.surname ||
      entityData.last_name ||
      entityData.lastname ||
      ""
    ).trim();

    const updatePayload = {
      isDriver: true,
      isDriverApproved: true,
      isDriverRejected: false,
      driverLicenseNumber,
      ...(address && { address }),
      ...(selfieUrl && {
        profileImage: selfieUrl,
      }),
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
    };

    const updatedUser = await PadimanRouteUser.findByIdAndUpdate(
      userId,
      updatePayload,
      { new: true }
    );

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
        profileImage: updatedUser.profileImage,
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
    console.error("🔥 Server Error in submitDriverApplication:", error);
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
  try {
    const userId =
      typeof req.user === "string"
        ? req.user
        : req.user?.id || req.user?._id || req.body.userId;
    const { bvnVerified, ninNumber, isUserDocumented } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (!ninNumber) {
      return res
        .status(400)
        .json({ error: "NIN number is required to proceed with verification" });
    }

    const existingUser = await PadimanRouteUser.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "PadimanRoute user not found" });
    }

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

    if (!dojahResponse.ok || !dojahResult?.entity) {
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

      if (age < 18) {
        setTimeout(async () => {
          try {
            await PadimanRouteUser.findByIdAndDelete(userId);
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

    const userTokens = userFullName.split(/\s+/).filter(Boolean);

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

    const requiredMatches =
      userTokens.length === 1 ? 1 : Math.min(2, userTokens.length);

    if (matchCount < requiredMatches) {
      return res.status(400).json({
        error:
          "Verification failed: The name on your NIN does not match your registered account name.",
        registeredName: existingUser.fullName,
        dojahRecordName: `${dojahEntityData.first_name || ""} ${
          dojahEntityData.middle_name || ""
        } ${dojahEntityData.last_name || ""}`.trim(),
      });
    }

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
        dojahEntity: dojahEntityData,
      },
    };

    const updatedUser = await PadimanRouteUser.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true }
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

    return res.status(200).json({
      message: "Customer verification status fetched successfully",
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

/**
 * @desc    Manually upload utility bill to verify user address
 * @route   POST /api/v1/padiman_route/customer/upload-utility-bill
 * @access  Private
 */
exports.uploadUtilityBill = async (req, res) => {
  console.log("-----------------------------------------");
  console.log("📥 POST /api/v1/padiman_route/customer/upload-utility-bill hit");

  try {
    const userId =
      typeof req.user === "string"
        ? req.user
        : req.user?.id || req.user?._id || req.body.userId;

    const { address, billUrl: bodyBillUrl } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (!address) {
      return res.status(400).json({ error: "Residential address is required" });
    }

    const user = await PadimanRouteUser.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "PadimanRoute user not found" });
    }

    let uploadedBillUrl = bodyBillUrl || null;

    if (req.files?.utilityBill?.[0] || req.file) {
      const file = req.files?.utilityBill?.[0] || req.file;
      uploadedBillUrl = await uploadToBackblaze(
        file.buffer,
        file.originalname || `utility_bill_${userId}.jpg`,
        "utility-bills"
      );
    }

    if (!uploadedBillUrl) {
      return res.status(400).json({
        error: "Utility bill image document is required for verification",
      });
    }

    const currentMeta = user.verificationMeta || {};

    const updatedUser = await PadimanRouteUser.findByIdAndUpdate(
      userId,
      {
        address: address,
        isAddressVerified: false,
        isAddressPending: true,
        isAddressVerificationFailed: false,
        verificationMeta: {
          ...currentMeta,
          utilityBill: {
            billUrl: uploadedBillUrl,
            status: "pending",
            address: address,
            rejectionReason: null,
            submittedAt: new Date(),
            verifiedAt: null,
          },
        },
      },
      { new: true }
    );

    return res.status(200).json({
      message: "Utility bill uploaded and submitted for manual review",
      status: "pending",
      address: updatedUser.address,
      isAddressVerified: false,
      isAddressPending: true,
      isAddressVerificationFailed: false,
      utilityBill: updatedUser.verificationMeta.utilityBill,
    });
  } catch (error) {
    console.error("🔥 Server Error in uploadUtilityBill:", error);
    return res.status(500).json({
      error: "Server error while processing utility bill upload",
    });
  }
};

/**
 * @desc    Get current user's current address & address verification state
 * @route   GET /api/v1/padiman_route/customer/current-address
 * @access  Private
 */
exports.getCurrentAddress = async (req, res) => {
  console.log("-----------------------------------------");
  console.log("📥 GET /api/v1/padiman_route/customer/current-address hit");

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

    const utilityBillData = user.verificationMeta?.utilityBill || {
      billUrl: null,
      status: "none",
      address: user.address || null,
      rejectionReason: null,
      submittedAt: null,
      verifiedAt: null,
    };

    const isAddressVerified =
      user.isAddressVerified !== undefined
        ? user.isAddressVerified
        : utilityBillData.status === "approved";

    const isAddressPending =
      user.isAddressPending !== undefined
        ? user.isAddressPending
        : utilityBillData.status === "pending";

    const isAddressVerificationFailed =
      user.isAddressVerificationFailed !== undefined
        ? user.isAddressVerificationFailed
        : utilityBillData.status === "rejected";

    return res.status(200).json({
      message: "Current user address details fetched successfully",
      address: user.address || utilityBillData.address || null,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      isAddressVerified,
      isAddressPending,
      isAddressVerificationFailed,
      utilityBill: utilityBillData,
    });
  } catch (error) {
    console.error("🔥 Server Error in getCurrentAddress:", error);
    return res.status(500).json({
      error: "Server error while fetching address details",
    });
  }
};