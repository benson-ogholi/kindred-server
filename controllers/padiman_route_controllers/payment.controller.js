const axios = require("axios");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Payment = require("../../models/padiman_route_models/Payment");
const Request = require("../../models/padiman_route_models/Request");
const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");
const { sendNotification } = require("../../utils/pr/pr_push");

// ✅ FIX: Safely extract the Wallet model depending on how the new schema exports it
const WalletModule = require("../../models/padiman_route_models/Wallet");
const Wallet = WalletModule.Wallet || WalletModule.default || WalletModule;

const PAYSTACK_SECRET_KEY = "sk_test_14dce601e7eb9845ed6fcf46fd67e7c27e8070a8";

// =============================================================================
// 1. INITIALIZE PAYSTACK TRANSACTION
// =============================================================================
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

    // Updated to reflect new Negotiation Schema ('price' field instead of 'agreedAmount')
    const agreedAmount = negotiation.price || req.body.amount || 5000;
    const resolvedServiceType =
      negotiation.serviceType ||
      negotiation.negotiatorServiceType ||
      serviceType;

    const paystackAmount = agreedAmount * 100;
    const reference = `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const paystackPayload = {
      email,
      amount: paystackAmount,
      reference,
      metadata: {
        negotiationId,
        serviceType: resolvedServiceType,
        userId,
      },
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
      // Un-commented & saved pending record into Payment collection
      await Payment.create({
        negotiationId,
        userId,
        amount: agreedAmount,
        reference,
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

// =============================================================================
// 2. VERIFY PAYSTACK TRANSACTION
// =============================================================================
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
      // 1. Update Payment Record (uses upsert to guarantee write if initialize missing)
      const updatedPayment = await Payment.findOneAndUpdate(
        { reference },
        { status: "success", paystackRawResponse: paystackData },
        { new: true, upsert: true }
      );

      // 2. Fetch and update Negotiation record to mark as paid
      let negotiation = null;
      if (negotiationId) {
        negotiation = await Negotiation.findByIdAndUpdate(
          negotiationId,
          { isPaid: true },
          { new: true }
        );
      }

      // TARGET: Credit the serviceProvider defined in NegotiationSchema
      const targetUserId = negotiation?.serviceProvider;
      const amountCredited = paystackData.amount / 100; // Convert Kobo to Naira

      // Extract details cleanly
      const customerInfo = paystackData.customer || {};
      const payerEmailStr = customerInfo.email || "unknown@paystack.com";

      let payerNameStr = "External Payer";
      if (customerInfo.first_name || customerInfo.last_name) {
        payerNameStr = `${customerInfo.first_name || ""} ${
          customerInfo.last_name || ""
        }`.trim();
      } else if (customerInfo.fullName) {
        payerNameStr = customerInfo.fullName;
      } else if (customerInfo.email) {
        const dbUser = await Padiman_Route_User.findOne({
          email: customerInfo.email.toLowerCase(),
        });
        if (dbUser && dbUser.fullName) {
          payerNameStr = dbUser.fullName;
        }
      }

      const timeOfPayment = paystackData.paid_at || new Date().toISOString();

      // Adapted to support both service/negotiatorService references from new schema
      const resolvedServiceId =
        negotiation?.service || negotiation?.negotiatorService || null;
      const resolvedServiceType =
        negotiation?.serviceType ||
        negotiation?.negotiatorServiceType ||
        "ride_revenue_received";

      // 3. Find and update both Request documents associated with the negotiation
      let updatedRequest = null;
      let updatedNegotiatorRequest = null;

      if (negotiation) {
        const serviceRequestId = negotiation.service
          ? negotiation.service.toString()
          : null;
        const negotiatorRequestId = negotiation.negotiatorService
          ? negotiation.negotiatorService.toString()
          : null;

        const commonUpdateData = {
          isPaid: true,
          status: "assigned",
          inRideWith: negotiatorRequestId,
          assignedTo: serviceRequestId,
          agreedPrice:
            negotiation.price ||
            negotiation.agreedPrice ||
            negotiation.amount ||
            amountCredited,
          finalPrice: amountCredited,
        };

        // Update the primary request (e.g., service request)
        if (serviceRequestId) {
          updatedRequest = await Request.findByIdAndUpdate(
            serviceRequestId,
            commonUpdateData,
            { new: true }
          );
        }

        // Alternatively check negotiation reference if serviceRequestId wasn't found directly
        if (!updatedRequest) {
          updatedRequest = await Request.findOneAndUpdate(
            { negotiation: negotiation._id },
            commonUpdateData,
            { new: true }
          );
        }

        // Update the second request (negotiatorService request) if it exists separately
        if (negotiatorRequestId && negotiatorRequestId !== serviceRequestId) {
          updatedNegotiatorRequest = await Request.findByIdAndUpdate(
            negotiatorRequestId,
            commonUpdateData,
            { new: true }
          );
        }

        const targetRequestId =
          updatedRequest?._id || updatedNegotiatorRequest?._id;

        if (targetRequestId) {
          console.log(
            `✅ Request(s) successfully marked as paid and status updated to confirmed.`
          );

          if (targetUserId) {
            const requestIdsToUpdate = [
              serviceRequestId,
              negotiatorRequestId,
            ].filter(Boolean);
            if (requestIdsToUpdate.length > 0) {
              await Request.updateMany(
                {
                  _id: { $in: requestIdsToUpdate },
                  "serviceProviders.providerId": targetUserId,
                },
                { $set: { "serviceProviders.$.status": "accepted" } }
              );
            }
          }
        } else {
          console.log(
            `⚠️ No matching Requests found for negotiation ${negotiation._id} to assign.`
          );
        }
      }

      if (targetUserId) {
        console.log(
          `📡 Process Wallet sync for Service Provider User ID: ${targetUserId}`
        );

        let wallet = await Wallet.findOne({ user: targetUserId });
        if (!wallet) {
          console.log(
            `⚠️ Wallet entry missing for user: ${targetUserId}. Instantiating new ledger.`
          );
          wallet = new Wallet({
            user: targetUserId,
            balance: 0,
            withdrawableBalance: 0,
            earnings: [],
            withdrawals: [],
          });
        }

        // Idempotency Check
        const alreadyCredited = wallet.earnings.some(
          (earning) => earning.reference === reference
        );

        if (!alreadyCredited) {
          console.log(
            `💰 Crediting ₦${amountCredited} as SUCCESS earning to service provider...`
          );

          wallet.earnings.push({
            payment: updatedPayment?._id || null,
            negotiationId: negotiationId || null,
            serviceId: resolvedServiceId,
            payerName: payerNameStr,
            payerEmail: payerEmailStr,
            amount: amountCredited,
            reference: reference,
            source: resolvedServiceType,
            status: "success",
            createdAt: new Date(timeOfPayment),
          });

          wallet.balance += amountCredited;
          wallet.withdrawableBalance += amountCredited;

          await wallet.save();
          console.log(
            `✅ Wallet transaction successfully logged and balance updated. Balance: ₦${wallet.balance}`
          );
        } else {
          console.log(
            `⚠️ Reference "${reference}" has already been processed into earnings.`
          );
        }
      } else {
        console.log(
          "❌ Target serviceProvider context could not be parsed. Wallet update skipped."
        );
      }

      // Send Success Notification to Service Provider
      await sendNotification(targetUserId, {
        title: "Payment Successful & Ride Confirmed! 🎉",
        body: `Payment of ₦${amountCredited} from ${payerNameStr} confirmed. Request has been confirmed.`,
        type: "PAYMENT",
        router: "/(screens)/success",
        data: {
          reference,
          negotiationId,
          requestId: updatedRequest ? updatedRequest._id.toString() : null,
          serviceId: resolvedServiceId ? resolvedServiceId.toString() : null,
          serviceType: resolvedServiceType,
          payerName: payerNameStr,
          payerEmail: payerEmailStr,
          timeOfPayment: timeOfPayment,
          amount: amountCredited,
          status: "success",
        },
      });

      console.log(
        "✅ Payment verified, negotiation updated, requests confirmed, wallet logged, and notifications sent."
      );
      return res.status(200).json({
        success: true,
        message:
          "Payment captured, request schemas confirmed, and wallet successfully credited.",
        data: {
          paystackData,
          request: updatedRequest,
          negotiatorRequest: updatedNegotiatorRequest,
        },
      });
    } else {
      // Payment Failed
      await Payment.findOneAndUpdate(
        { reference },
        { status: "failed", paystackRawResponse: paystackData },
        { upsert: true }
      );

      if (metadataUserId) {
        await sendNotification(metadataUserId, {
          title: "Payment Failed",
          body: `Your payment could not be completed. Reason: ${
            paystackData.gateway_response || "Transaction declined"
          }.`,
          type: "PAYMENT",
          router: "/(screens)/payment-failed",
          data: { reference, status: "failed" },
        });
      }

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

// =============================================================================
// 3. RELEASE ESCROW EARNINGS
// =============================================================================
exports.releaseEscrowEarnings = async (req, res) => {
  console.log("==================================================");
  console.log(
    `🚀 [RELEASE_ESCROW_EARNINGS] Triggered for Negotiation ID: ${req.params.negotiationId}`
  );

  try {
    const { negotiationId } = req.params;

    if (!negotiationId) {
      return res.status(400).json({
        success: false,
        message: "Negotiation reference identifier parameter missing.",
      });
    }

    const wallet = await Wallet.findOne({
      "earnings.negotiationId": negotiationId,
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message:
          "No wallet ledger record contains an earnings line matching this negotiation identifier.",
      });
    }

    const earningIndex = wallet.earnings.findIndex(
      (earning) =>
        earning.negotiationId &&
        earning.negotiationId.toString() === negotiationId
    );

    if (earningIndex === -1) {
      return res.status(500).json({
        success: false,
        message:
          "Internal tracking mismatch relative to target earnings structural alignment.",
      });
    }

    const targetEarning = wallet.earnings[earningIndex];

    if (targetEarning.status === "failed") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot release funds. This transaction was previously flagged as a failed process.",
      });
    }

    // Transition earning state to success
    targetEarning.status = "success";

    // Credit balances
    wallet.balance += targetEarning.amount;

    if (typeof wallet.withdrawableBalance !== "number") {
      wallet.withdrawableBalance = 0;
    }
    wallet.withdrawableBalance += targetEarning.amount;

    await wallet.save();

    // Fetch negotiation details
    const negotiation = await Negotiation.findById(negotiationId);

    // Push notification to user
    try {
      await sendNotification(wallet.user.toString(), {
        title: "Funds Cleared! 💰",
        body: `₦${targetEarning.amount.toLocaleString()} has been moved from escrow to your spendable available balance.`,
        type: "PAYMENT",
        router: "/(screens)/withdrawal",
        data: {
          negotiationId,
          amount: targetEarning.amount,
          status: "success",
        },
      });
    } catch (notifErr) {
      console.error(
        "⚠️ Push notification failed post-escrow release:",
        notifErr.message
      );
    }

    return res.status(200).json({
      success: true,
      message:
        "Escrow funds released successfully and added directly into the live available balance ledger.",
      data: {
        negotiationId,
        amountReleased: targetEarning.amount,
        newSpendableBalance: wallet.balance,
        newWithdrawableBalance: wallet.withdrawableBalance,
        negotiation,
      },
    });
  } catch (error) {
    console.error("❌ [RELEASE_ESCROW_ERROR]:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
