// controllers/paymentController.js

const axios = require("axios");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Payment = require("../../models/padiman_route_models/Payment");
const { sendNotification } = require("../../utils/pr/pr_push");
const Wallet = require("../../models/padiman_route_models/Wallet");
const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");

const PAYSTACK_SECRET_KEY = "sk_test_14dce601e7eb9845ed6fcf46fd67e7c27e8070a8";

// 1. Initialize Paystack Transaction
exports.initializePayment = async (req, res) => {
  console.log("==================================================");
  console.log("🚀 [INITIALIZE_PAYMENT] Request received");

  try {
    const { negotiationId, serviceType, email } = req.body;
    const userId =
      (typeof req.user === "object"
        ? req.user?._id || req.user?.id
        : req.user) || req.body.userId;

    console.log(`ℹ️ [USER_ID resolved to]: ${userId}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User authentication identifier context missing.",
      });
    }

    const negotiation = await Negotiation.findById(negotiationId);
    if (!negotiation) {
      return res.status(404).json({ message: "Negotiation record missing" });
    }

    const agreedAmount = negotiation.agreedAmount || req.body.amount || 5000;
    const paystackAmount = agreedAmount * 100;
    const reference = `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const paystackPayload = {
      email,
      amount: paystackAmount,
      reference,
      metadata: { negotiationId, serviceType, userId },
    };

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
      const newPayment = await Payment.create({
        negotiationId,
        userId,
        amount: agreedAmount,
        reference,
        serviceType,
        status: "pending",
      });

      console.log("✅ [DB_RECORD_SAVED] Payment pending tracking logged.");

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

    if (req.body.userId || req.user) {
      const userId = req.body.userId || req.user?._id || req.user?.id;
      await sendNotification(userId, {
        title: "Payment Failed to Start",
        body: "We couldn't start your payment. Please try again.",
        type: "PAYMENT",
        router: "/(screens)/negotiation-chat",
        data: { error: "init_failed" },
      });
    }

    return res.status(500).json({ success: false, error: error.message });
  }
};
exports.verifyPayment = async (req, res) => {
  console.log("==================================================");
  console.log("🔍 [VERIFY_PAYMENT] Route reached");

  try {
    const { reference } = req.params;
    if (!reference || reference === ":reference" || reference === "undefined") {
      return res.status(400).json({
        success: false,
        message: "Valid transaction reference is required.",
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    const paystackData = response.data?.data;
    const { negotiationId, userId: metadataUserId } =
      paystackData.metadata || {};

    if (paystackData.status === "success") {
      // Update Payment Record
      const updatedPayment = await Payment.findOneAndUpdate(
        { reference },
        { status: "success", paystackRawResponse: paystackData },
        { new: true }
      );

      // Update Negotiation Record
      const updatedNegotiation = await Negotiation.findByIdAndUpdate(
        negotiationId,
        { status: "ride agreed", isPaid: true },
        { new: true }
      );

      // Determine who should receive the payout credit (e.g., the negotiator or specified target metadata user)
      const targetUserId = metadataUserId || updatedNegotiation?.negotiator;
      const amountCredited = paystackData.amount / 100; // Paystack converts Naira to Kobo values

      // Extract details cleanly for reuse across Wallet save and Push notification hooks
      const customerInfo = paystackData.customer || {};
      const payerEmailStr = customerInfo.email || "unknown@paystack.com";

      // Paystack safely fallback calculation strategy
      let payerNameStr = "External Payer";
      if (customerInfo.first_name || customerInfo.last_name) {
        payerNameStr = `${customerInfo.first_name || ""} ${
          customerInfo.last_name || ""
        }`.trim();
      } else if (customerInfo.fullName) {
        payerNameStr = customerInfo.fullName;
      } else if (customerInfo.email) {
        // --- DB FALLBACK INTEGRATION ENGINE ---
        // Query database via lowercased email string index to resolve registration metadata
        const dbUser = await Padiman_Route_User.findOne({
          email: customerInfo.email.toLowerCase(),
        });
        if (dbUser && dbUser.fullName) {
          payerNameStr = dbUser.fullName;
          console.log(
            `🎯 Payer profile matched via database lookup email trace: ${payerNameStr}`
          );
        }
      }

      const timeOfPayment = paystackData.paid_at || new Date().toISOString();
      const resolvedServiceId = updatedNegotiation?.service || null;
      const resolvedServiceType =
        updatedNegotiation?.serviceType || "ride_revenue_received";

      if (targetUserId) {
        console.log(
          `📡 Process Wallet sync for Target User ID: ${targetUserId}`
        );

        // 1. Fetch or initialize the destination wallet structure dynamically
        let wallet = await Wallet.findOne({ user: targetUserId });
        if (!wallet) {
          console.log(
            `⚠️ Wallet entry missing for user: ${targetUserId}. Instantiating new ledger.`
          );
          wallet = new Wallet({
            user: targetUserId,
            balance: 0,
            earnings: [],
            withdrawals: [],
          });
        }

        // 2. Idempotency Check: Guard against duplicate calls crediting accounts twice
        const alreadyCredited = wallet.earnings.some(
          (earning) => earning.reference === reference
        );

        if (!alreadyCredited) {
          console.log(
            `💰 Crediting ₦${amountCredited} to user balance account...`
          );

          wallet.balance += amountCredited;
          wallet.earnings.push({
            payment: updatedPayment?._id || null,
            negotiationId: negotiationId || null,
            serviceId: resolvedServiceId,
            payerName: payerNameStr,
            payerEmail: payerEmailStr,
            amount: amountCredited,
            reference: reference,
            source: resolvedServiceType,
            createdAt: new Date(timeOfPayment),
          });

          await wallet.save();
          console.log(
            `✅ Wallet transaction logged successfully. New running total: ₦${wallet.balance}`
          );
        } else {
          console.log(
            `⚠️ Reference "${reference}" has already been processed into earnings. Skipping ledger alteration.`
          );
        }
      } else {
        console.log(
          "❌ Target destination driver/user context could not be parsed. Wallet update skipped."
        );
      }

      // ====================== SEND SUCCESS NOTIFICATION ======================
      // Enriched with complete payer info, timestamps, and explicit service scopes
      await sendNotification(targetUserId, {
        title: "Payment Successful! 🎉",
        body: `Your payment of ₦${amountCredited} from ${payerNameStr} has been confirmed.`,
        type: "PAYMENT",
        router: "/(screens)/success",
        data: {
          reference,
          negotiationId,
          serviceId: resolvedServiceId ? resolvedServiceId.toString() : null,
          serviceType: resolvedServiceType,
          payerName: payerNameStr,
          payerEmail: payerEmailStr,
          timeOfPayment: timeOfPayment,
          amount: amountCredited,
          status: "success",
        },
      });
      // =====================================================================

      console.log(
        "✅ Payment verified, earnings saved to wallet, and notifications sent."
      );
      return res.status(200).json({
        success: true,
        message: "Payment captured successfully and wallet credited.",
        data: paystackData,
      });
    } else {
      // ====================== SEND FAILED NOTIFICATION ======================
      await Payment.findOneAndUpdate(
        { reference },
        { status: "failed", paystackRawResponse: paystackData }
      );

      await sendNotification(metadataUserId, {
        title: "Payment Failed",
        body: `Your payment could not be completed. Reason: ${
          paystackData.gateway_response || "Transaction declined"
        }.`,
        type: "PAYMENT",
        router: "/(screens)/payment-failed",
        data: {
          reference,
          status: "failed",
        },
      });
      // =====================================================================

      return res.status(400).json({
        success: false,
        message: "Transaction check failed.",
        status: paystackData.status,
      });
    }
  } catch (error) {
    console.error(
      "❌ [PAYSTACK_VERIFY_ERROR]:",
      error.response?.data || error.message
    );

    // Send error notification
    const userIdFromReq = req.body?.userId || req.user?._id;
    if (userIdFromReq) {
      await sendNotification(userIdFromReq, {
        title: "Payment Verification Error",
        body: "Something went wrong while verifying your payment. Please contact support.",
        type: "PAYMENT",
        router: "/(screens)/support",
        data: { error: "verify_error" },
      });
    }

    return res.status(500).json({ success: false, error: error.message });
  }
};
