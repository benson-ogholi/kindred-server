const axios = require("axios");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Payment = require("../../models/padiman_route_models/Payment");

const PAYSTACK_SECRET_KEY = "sk_test_14dce601e7eb9845ed6fcf46fd67e7c27e8070a8";

// 1. Initialize Paystack Transaction
exports.initializePayment = async (req, res) => {
  console.log("==================================================");
  console.log("🚀 [INITIALIZE_PAYMENT] Request received");
  console.log("📥 [BODY]:", JSON.stringify(req.body, null, 2));

  try {
    const { negotiationId, serviceType, email } = req.body;

    const userId =
      (typeof req.user === "object"
        ? req.user?._id || req.user?.id
        : req.user) || req.body.userId;
    console.log(`ℹ️ [USER_ID resolved to]: ${userId}`);

    if (!userId) {
      console.log("❌ [ABORT] Payment processing stopped: Missing userId");
      return res.status(400).json({
        success: false,
        error: "User authentication identifier context missing.",
      });
    }

    const negotiation = await Negotiation.findById(negotiationId);
    if (!negotiation) {
      console.log(`❌ [ABORT] Negotiation ID ${negotiationId} not found in DB`);
      return res.status(404).json({ message: "Negotiation record missing" });
    }

    const agreedAmount = negotiation.agreedAmount || req.body.amount || 5000;
    console.log(`💰 [AMOUNT]: ₦${agreedAmount}`);

    const paystackAmount = agreedAmount * 100;
    const reference = `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    console.log(`🔑 [GENERATED_REFERENCE]: ${reference}`);

    const paystackPayload = {
      email,
      amount: paystackAmount,
      reference,
      metadata: { negotiationId, serviceType, userId },
    };

    console.log("📡 Sending payload initialization request to Paystack API...");

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      paystackPayload,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status) {
      console.log("💾 Creating entry in Payment database collection...");
      const newPayment = await Payment.create({
        negotiationId,
        userId,
        amount: agreedAmount,
        reference,
        serviceType,
        status: "pending",
      });
      console.log("✅ [DB_RECORD_SAVED]:", JSON.stringify(newPayment, null, 2));

      return res.status(200).json({
        success: true,
        checkoutUrl: response.data.data.authorization_url,
        reference,
      });
    }

    return res
      .status(400)
      .json({ success: false, message: "Paystack initialization rejected" });
  } catch (error) {
    console.error(
      "❌ [PAYSTACK_INIT_ERROR]:",
      error.response?.data || error.message
    );
    console.log("==================================================");
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 2. Verify Paystack Transaction & update Negotiation status to PAID
exports.verifyPayment = async (req, res) => {
  console.log("==================================================");
  console.log(
    "🔍 [VERIFY_PAYMENT] Route wrapper successfully reached backend!"
  );
  console.log(`🏷️ [INCOMING REFERENCE PARAM]: "${req.params.reference}"`);

  try {
    const { reference } = req.params;

    if (!reference || reference === ":reference" || reference === "undefined") {
      console.log(
        "❌ [ABORT] Verification halted: Invalid or undefined reference literal string caught."
      );
      return res
        .status(400)
        .json({
          success: false,
          message: "Valid transaction token reference parameters are required.",
        });
    }

    console.log(
      `📡 Fetching history from Paystack API for reference: ${reference}...`
    );
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    console.log("📥 [PAYSTACK_VERIFY_STATUS]:", response.data?.data?.status);

    if (response.data?.data?.status === "success") {
      const { negotiationId } = response.data.data.metadata;
      console.log(
        `🎉 Paystack confirmed a successful transaction for negotiationId: ${negotiationId}`
      );

      console.log(
        `💾 Updating Payment record state locally for reference: ${reference}...`
      );
      await Payment.findOneAndUpdate(
        { reference },
        { status: "success", paystackRawResponse: response.data.data }
      );
      console.log("✅ [DB_PAYMENT_RECORD_UPDATED]");

      console.log(
        `🔄 Updating Negotiation ID ${negotiationId}: Setting isPaid to true & status to 'ride agreed'...`
      );
      const updatedNegotiation = await Negotiation.findByIdAndUpdate(
        negotiationId,
        {
          status: "ride agreed",
          isPaid: true,
        },
        { new: true }
      );

      console.log(
        "✅ [DB_NEGOTIATION_RECORD_UPDATED]:",
        JSON.stringify(updatedNegotiation, null, 2)
      );
      console.log("==================================================");

      return res.status(200).json({
        success: true,
        message: "Payment captured successfully. Transaction declared PAID.",
        data: response.data.data,
      });
    }

    console.log(
      `⚠️ [VERIFICATION_FAILED] Paystack status: ${response.data?.data?.status}`
    );
    return res.status(400).json({
      success: false,
      message: "Transaction check failed validation steps.",
    });
  } catch (error) {
    console.error(
      "❌ [PAYSTACK_VERIFY_ERROR]:",
      error.response?.data || error.message
    );
    console.log("==================================================");
    return res.status(500).json({ success: false, error: error.message });
  }
};
